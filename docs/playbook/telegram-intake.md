# Playbook · Telegram intake — architecture, data flow, ops

Owner request (2026-11-07): products posted in vendor Telegram channels flow
into the Product Directory by themselves, with the **vendor taken from the
channel** (the post text never names the vendor).

Schema: `supabase/migrations/20261107090000_pb_telegram_intake.sql`.
Server: `supabase/functions/pb-telegram/` (deploy with `verify_jwt = false`).
Crawler: `tools/pb-telegram-crawler/` (its own README).
Product pipeline after intake: `docs/playbook/product-directory-spec.md`.

## Why this shape
A Telegram **bot cannot read other people's channels**. So:

```
vendor channels ──(crawler: a staff Telegram USER account, MTProto, 24/7 on a small cloud server)──┐
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

## Setup (Settings → Telegram, 3 steps)
1. **Bot** — make a bot with @BotFather, paste its token → `save_bot_token`
   checks it (getMe), stores it with a new webhook secret and points the bot
   at `…/functions/v1/pb-telegram` (setWebhook, `allowed_updates: ['message']`).
2. **Admin group** — add the bot to the owner's private group **as an admin**
   (so it sees every message), tap "Get link code" (`link_code`, admin /
   manager only, 6 digits, 30 minutes) and send `/link 123456` in the group.
   The bot answers "Linked to Playbook ✓". `pb_tg_link_try()` checks and
   applies the code in one locked step: 5 wrong codes (from any group) void it
   ("Too many wrong codes"); while no code is live the bot does not answer at
   all. After linking: BotFather `/setjoingroups` → Disable, and the staff
   account's privacy "Groups & Channels → My Contacts". If the group is later upgraded to a supergroup
   (its id changes), the new id is picked up automatically.
3. **Crawler** — "Create crawler key" (`crawler_key`, shown once, replaces the
   old one) → set it as `PB_CRAWLER_KEY` on the crawler server. Vendors get a
   Telegram channel in the vendor sheet (`pb_vendors.tg_username`); the
   crawler reads those channels (the staff account must have joined them).

## Data flow
1. **Crawler** polls `crawler_config` (group id + channels of ACTIVE vendors
   with a username or channel id, each with its `last_id` cursor), forwards
   new posts oldest first (albums in one call), reports `crawler_progress`
   (version, error, per-channel last id / error, and the `forwarded` mapping)
   every 5 s while forwarding, every cycle, and on shutdown. A username it
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
   - per channel, in `origin_message_id` order;
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
   - a product is final when its newest message is 3 minutes old, or — closed
     by the next product's messages — once those are 60 s old (a delayed
     album still finds it); photos with no description become a product
     after 60 minutes (note "No description arrived from Telegram"); a
     description-only group FIRST in the batch is a late description: it goes
     onto the product before it if that one has no text, the note, is under a
     day old and on no website (read again); otherwise text with no photos is
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
  `kind`), then `pb-products`, then `pb-telegram` (`verify_jwt = false`).
- Health: Settings → Telegram shows webhook status (`test_bot`), crawler last
  seen / version / per-channel errors, messages waiting, last message time.
- Stuck messages: `select state, count(*) from pb_tg_messages group by 1;`
  `select id, note from pb_tg_messages where state = 'failed' order by id desc limit 20;`
- Re-run a failed group: set its messages back to `pending` with `note = null`.
- Known limits: a description arriving more than a day after its photos,
  or a vendor who posts without separators and whose earlier text came late,
  can still mix products; a post edited in the channel after it was copied is
  not copied again; anyone in the admin group can forward posts in (keep it
  to staff).
