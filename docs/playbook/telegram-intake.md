# Playbook · Telegram intake — architecture, data flow, ops

Owner request (2026-11-07): products posted in vendor Telegram channels flow
into the Product Directory by themselves, with the **vendor taken from the
channel** (the post text never names the vendor). Each channel is checked
**once a day**, overnight, at its own time, so the vendors never arrive all at
once (owner, same day: "auto-set once a day for each vendor's channel … not
clash with others … don't dump all vendors at once").

Schema: `supabase/migrations/20261107090000_pb_telegram_intake.sql`.
Server: `supabase/functions/pb-telegram/` (deploy with `verify_jwt = false`).
Crawler: `tools/pb-telegram-crawler/` (its own README).
Staff setup guide: Playbook → Guide → **Connect Telegram**
(`src/playbook/components/guide/content/telegram.ts`, `telegramUse.ts`).
Product pipeline after intake: `docs/playbook/product-directory-spec.md`.

## Why this shape
A Telegram **bot cannot read other people's channels**. So:

```
vendor channels ──(crawler: a staff Telegram USER account, MTProto, on a small cloud server;
                    each channel once a day at its own time, one channel at a time)──────────────┐
                                                                                                  │ forwardMessages
                                                                                                  ▼
                          owner's private ADMIN GROUP  ──(Playbook bot is an admin here)──► Telegram webhook
                                                                                                  │
                                    pb-telegram ── pb_tg_messages ── every minute: assemble ──► pb_products
                                                                                                  │
                                                     pb-products worker: read → route → write → publish
```

Forwarded messages carry `forward_origin` (type `channel`: chat id, title,
username, message id) — that is how the vendor is known. A vendor's REPOST of
another channel's post keeps the original channel there, so the crawler also
reports `{group message id → vendor channel, post id}` (`crawler_progress.forwarded`
→ `pb_tg_forwards`, applied by `pb_tg_map_forwards()` and an insert trigger,
whichever arrives second). That mapping wins over the header; posts forwarded
from a person get their origin only from it (no mapping after 10 minutes →
ignored).

## Setup (the guide's steps; Settings → Telegram has 3 cards)
1. **Create the bot in @BotFather** — `/newbot`, copy the token.
2. **Save the token in Playbook** (card **1 · Playbook bot**) → `save_bot_token`
   checks it (getMe), stores it with a new webhook secret and points the bot
   at `…/functions/v1/pb-telegram` (setWebhook, `allowed_updates: ['message']`).
3. **Add the bot to your admin group as admin, and link it** (card **2 · Admin
   group**): **Get link code** (`link_code`, admin / manager only, 6 digits, 30
   minutes), send `/link 123456` in the group; the bot answers "Linked to
   Playbook ✓". `pb_tg_link_try()` checks and applies the code in one locked
   step: 5 wrong codes (from any group) void it; while no code is live the bot
   does not answer at all. Then BotFather `/setjoingroups` → **Disable**. A
   group upgraded to a supergroup (new id) is picked up automatically.
4. **Staff account keys** at my.telegram.org → API development tools →
   `api_id`, `api_hash`; the staff account joins every vendor channel and the
   admin group (privacy "Groups & Channels → My Contacts").
5. **Create crawler key** (card **3 · Crawler**; `crawler_key`, shown once,
   replaces the old one) → `PB_CRAWLER_KEY`.
6. **Start the crawler on Railway** — `TG_SESSION` from `npm run login` on a
   laptop; Root Directory `tools/pb-telegram-crawler`, Variables `TG_API_ID`,
   `TG_API_HASH`, `TG_SESSION`, `PB_URL`, `PB_CRAWLER_KEY`; Restart Policy
   Always, region Singapore, about US$5/month (README has every click).
7. **Vendor channels** — **Telegram channel** in the vendor sheet
   (`pb_vendors.tg_username`, `@name` or a t.me link); the daily time is set by
   itself (below).

## Daily schedule (one channel at a time)
- `pb_vendors.tg_slot_minute` — the channel's daily check time (IST minute of
  day); `tg_slot_set_at` — when it was given; `tg_checked_at` — when its last
  daily check finished; `tg_cursor_ready` — the crawler has noted the
  channel's newest post id. `pb_tg_config.crawl_window_start / _end` — the
  window (default 1380 → 420 = 11:00 PM → 7:00 AM IST, may cross midnight).
- **Picking a time** (trigger `pb_vendors_tg_slot` → `pb_tg_pick_slot`): when an
  active vendor gets a channel and has no time, the other channels' times are
  laid on the window (window start and end are edges) and the new one takes the
  middle of the **largest gap** (ties → the earliest; an advisory lock keeps
  two at once apart). So the first channel gets the window's middle. 10
  channels added one by one, 23:00–07:00: 03:00, 01:00, 05:00, 00:00, 02:00,
  04:00, 06:00, 23:30, 00:30, 01:30. Clearing the channel or switching the
  vendor off clears the time and the cursor; a different channel (new username
  or id) needs a new cursor; switched back on, it gets a new time.
- **Spread evenly** (`respread`, admin / manager → `pb_tg_respread_slots()`):
  channel i of n (in the current time order) gets start + window × (2i+1)/2n:
  10 channels → 23:24, 00:12, 01:00, 01:48, 02:36, 03:24, 04:12, 05:00, 05:48,
  06:36. **Edit window** (`save_window {start, end}`, admin / manager, 0–1439,
  ≥ 60 min → `pb_tg_set_window()`) saves the window and respreads in one step.
- **Due** (`schedule.ts`, sent by `crawler_config`; the UI mirrors it in
  `src/playbook/data/tgSchedule.ts`): occurrence = the latest instant ≤ now at
  the slot's IST minute; due when the cursor is ready, occurrence is after
  `tg_checked_at` and after `tg_slot_set_at` (a vendor added, or a respread, in
  the daytime waits for its next night), and occurrence is under 20 hours old
  (a crawler off for days catches up once). IST = UTC+05:30, no DST.
- `pb_tg_pick_slot` / `pb_tg_respread_slots` have pure twins (`pickSlot`,
  `spread`) tested against the SQL in `test/schedule.sql.test.mjs`.

## Data flow
1. **Crawler** calls `crawler_config` every 60 s (a Playbook call only — no
   Telegram traffic unless something is due): group id, window and the
   channels of ACTIVE vendors with a username or channel id, each with its
   `last_id`, `slot_minute`, `due`, `next_check_at`, `checked_at`,
   `cursor_ready` (the vendor is ready and its cursor is stored) and
   `vendor_ready` (`tg_cursor_ready`). Per cycle it does at most **one cursor
   setup** (a channel with no cursor — new, or `vendor_ready: false` after the
   trigger reset it, which drops any cursor the crawler still holds: resolve
   it, note its newest post id as `last_id`, forward nothing, report
   `cursor_ready` once) and at most **one daily check** (the due
   channel overdue longest: forward every post after `last_id` oldest first,
   albums in one call, ≥ 1.5 s apart (`FORWARD_GAP_SECONDS`), up to 500 per
   cycle, then report `checked` → `tg_checked_at = now` and `sent`). A check
   cut short is not marked checked and resumes from `last_id`; a channel whose
   check failed waits 5 minutes so others go ahead. `crawler_progress`
   (version, error, per-channel last id / error, the `forwarded` mapping) is
   sent every 5 s while forwarding, every cycle, and on shutdown. Cursors are
   never lost by a report: one sent before the crawler's first channel list
   (signed out at start, stopped early) has no `channels` and only marks it
   alive; `last_id: null` keeps the stored cursor; a channel left out keeps
   its stored entry; a cursor Playbook lost while the vendor stayed ready is
   reported again by the crawler, not set up again. A username it
   resolves fills that vendor's `tg_channel_id` and `tg_title`.
2. **Webhook** (header `X-Telegram-Bot-Api-Secret-Token`): a message in the
   linked group with a channel origin → one `pb_tg_messages` row (`photo` =
   largest size; `video`; image / video documents count as photo / video;
   text or caption; stickers etc. `other`). Duplicates are ignored
   (`update_id`, `(chat_id, message_id)`); the same channel post forwarded
   twice is dropped at assemble (`group.ts` keeps one per post; `adopt.ts`
   drops a copy of a post already in a product). Anything else is ignored. A failed
   database write answers 500 so Telegram sends the update again.
3. **Assemble** (`trigger_pb_telegram_assemble()` via pg_cron job
   `pb-telegram-assemble`, only while messages are pending or a failed group
   is under 3 tries) first runs `adopt.ts` (`straggle.ts`, pure, tested): a
   photo / video that arrives after its product was made (its album, or the
   used messages either side, belong to one product) is copied onto that
   product. Then it groups the waiting messages (`group.ts`, pure, tested):
   - per channel, in `origin_message_id` order (a whole day's posts arrive in
     one burst; the waits below count from arrival, so a burst groups the
     same as posts spread out);
   - DESCRIPTION = text / caption ≥ 40 chars with letters, or naming rate /
     code / price / ₹ / INR / Rs 1600 / 1600/-; LESS = short "200 Less",
     "Less: Rs 200", "Less - 200.50" (a text naming another number, e.g. "Rate
     1600 less 200", is a description whose less is read from that line; "10%
     less" is not a less); anything else short (👉, a row of 👉, a sticker) =
     separator;
   - photos + videos, then one text description (KUMARI_ART style); the
     description as a photo caption (a new captioned album starts the next
     product once the current one has a description); or the description
     FIRST, then its photos;
   - a product is final when its newest message is 3 minutes old (a
     description still waiting for its photos: 20 minutes, so a daily check
     paused by a flood wait or a retried read keeps "description first, then
     photos" together), or — closed
     by the next product's messages — once those are 60 s old (a delayed
     album still finds it); photos with no description become a product
     after 60 minutes (note "No description arrived from Telegram"); a
     description-only group FIRST in the batch is a late description: it goes
     onto the product before it if that one has no text, the note, is under 2
     days old (checks are daily) and on no website (read again); otherwise text with no photos is
     a product only when it names a rate / code / price;
   - when the batch (3000 rows) is full, the last channel's last group waits
     for the next run; products are made oldest first;
   - a LESS attaches to the current product until the next product's photos;
     a product with no less is kept from the reader until 10 minutes after
     its description (`claimed_at`), so a less sent a little later is in the
     cost before it is read and priced; a late one (product already made) sets `less_amount`, adds "Less: N" to
     `raw_text` and, when the cost is not typed in by staff and the product is
     on no website yet, clears the cost and reads the product again (a
     listing being written / published right now: it waits). Otherwise
     an intake note asks staff to check the cost.
4. **Product** (`create.ts`): deduped on `source='telegram'`,
   `source_ref='<origin_chat_id>:<first origin_message_id>'`; vendor by channel
   id → username → a vendor made from the channel title (ids saved; a vendor
   with the same name and no channel is linked instead). Up to 20 photos and
   5 videos are copied from Telegram (getFile, ≤ 20 MB) into
   `playbook-products/<product>/tg-<message row id>.<ext>` (a retry skips
   what is there); `pb_product_images.kind` =
   `image` | `video`, photos first. A bigger video → note
   "Video (N MB) too big to copy — add it by hand". `source_url` =
   `https://t.me/<username>/<first id>` for public channels. The product is
   held (`claimed_at`) while files copy, like `ingest`; then the pb-products
   worker reads it.
5. **Reader** (pb-products `reader.ts`): with `less_amount` set, the AI is
   asked for the RATE as written and the code sets
   `cost_price = rate − less_amount` (never ≤ 0: then the cost stays empty and
   the product needs info). Every less phrase is hidden from the AI
   (`stripLess`) so it is never taken off twice. Videos never go to the AI or
   Shopify (every image query filters `kind = 'image'`).

## Failures and retries
- A group that fails (database, network, Telegram busy) → its messages
  `failed`, note "… (attempt N of 3)"; retried on later runs (a held product is
  taken over after 160 s and only missing files are copied). After the 3rd try
  the files still missing become notes on the product, or — when the product
  could not be made — the messages stay `failed` and a `pb_activity` row
  (`action 'failed'`, `details.step 'telegram'`) records it; a product made
  but not finished is released to the reader with a "Telegram copy failed"
  note. Running out of the run's time is not a failed try. Settings shows
  "being tried again" (attempts 1–2) apart from "could not be used", with a
  "See which posts" list.
- Files that can never be copied (too big, wrong format) are notes at once.

## Security
- `pb_tg_secrets` (bot token, webhook secret, crawler key hash): RLS on, no
  policies, revoked from anon / authenticated — service role only.
- The bot token is in every Bot API and file URL: no URL or raw fetch error is
  logged, stored or returned (`tg.ts` rewrites and scrubs errors).
- Webhook secret and crawler key are compared in constant time; only the
  sha-256 of the crawler key is stored. Both must be 64 hex characters before
  anything is read; a wrong one re-reads the secrets at most every 5 s.
- The `/link` code cannot be brute-forced (5 tries, see Setup).
- `pb_tg_config` and `pb_tg_messages`: staff read only; only the function writes.

## Ops notes
- Deploy order: migration first (pb-products now selects `less_amount` and
  `kind`), then `pb-products`, then `pb-telegram` (`verify_jwt = false`), then
  the crawler (1.1.0 understands `due`; 1.0.0 would forward every channel
  every minute — do not run it against this backend).
- Health: Settings → Telegram shows webhook status (`test_bot`), crawler last
  seen / version, the daily-check list (time, next check, last checked, last
  result / error per channel), messages waiting, last message time.
- Schedule: `select name, tg_username, tg_slot_minute / 60 || ':' || lpad((tg_slot_minute % 60)::text, 2, '0') as ist, tg_checked_at, tg_cursor_ready from pb_vendors where tg_slot_minute is not null order by (tg_slot_minute - 1380 + 1440) % 1440;`
- Stuck messages: `select state, count(*) from pb_tg_messages group by 1;`
  `select id, note from pb_tg_messages where state = 'failed' order by id desc limit 20;`
- Re-run a failed group: set its messages back to `pending` with `note = null`.
- Known limits: a pause of more than 20 minutes in the middle of a check
  (a very long Telegram flood wait) can still split a "description first,
  then photos" post across the pause; Spread evenly or a new window saved
  during the night moves times at once, so a channel whose new time has
  already passed is checked the next night (nothing is lost); with more
  channels than minutes in the window, two channels can share a minute (they
  are still checked one after the other);
  a description arriving more than 2 days after its photos,
  or a vendor who posts without separators and whose earlier text came late,
  can still mix products; a post edited in the channel after it was copied is
  not copied again; anyone in the admin group can forward posts in (keep it
  to staff).
