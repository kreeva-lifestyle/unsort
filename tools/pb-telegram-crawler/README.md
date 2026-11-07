# Playbook Telegram crawler

Copies new posts from the vendor Telegram channels into Playbook's Product
Directory. It runs all day on a small cloud server, signed in as one of your
**staff Telegram accounts** (a normal Telegram user, not a bot: bots cannot read
other people's channels).

```
vendor channels ──read──▶ crawler (staff account) ──forward──▶ your admin group
                                                                    │
                     Playbook bot (admin in the group) ◀────────────┘
                                    │
                                    ▼
                    Playbook builds the product, vendor taken from the channel
```

* Every minute it asks Playbook which channels to read (the **Telegram channel**
  field of each active vendor) and forwards each new post into the admin group,
  in order. Photo albums are forwarded together, so they stay albums.
* The first time it sees a channel it starts **after the newest post**: old
  posts are not copied (unless you set `BACKFILL_POSTS`).
* It remembers where it got to in each channel and tells Playbook, so a restart
  carries on from the same place. Playbook → Settings → Telegram shows when the
  crawler was last seen and any problem per channel.
* It never posts anything of its own, never joins channels by itself and never
  deletes anything.

## What you need

0. This folder is on the **main** branch of `kreeva-lifestyle/unsort` on GitHub
   (Railway builds from there).
1. Playbook → Settings → Telegram, steps 1 and 2 done: the bot is saved and the
   admin group is linked.
2. The staff account is a **member of the admin group** and can send messages
   there.
3. The staff account has **joined every private vendor channel** (public
   channels work without joining).
4. Each vendor in Playbook has its Telegram channel filled in (e.g. `kumari_art`).

### Lock it down (after the group is linked)
* In Telegram, open **@BotFather** → `/setjoingroups` → pick the Playbook bot →
  **Disable**, so nobody can add the bot to other groups (turn it back on for a
  moment if you ever link a different group).
* In the staff account: Settings → Privacy and Security → **Groups & Channels**
  → "My Contacts", so strangers cannot pull it into their groups.

## Setup (once)

### 1. Get api_id and api_hash
1. On a laptop open <https://my.telegram.org> and sign in with the **staff
   account's** phone number (the code arrives in that account's Telegram app).
2. Open **API development tools**, create an app (any name, e.g. "Playbook
   crawler", platform "Other").
3. Copy **api_id** (a number) and **api_hash**.

### 2. Create the crawler key
Playbook → Settings → Telegram → step 3 → **Create crawler key** → Copy. It is
shown once. Creating a new key stops the old one working.

### 3. Sign in once on a laptop (makes TG_SESSION)
Needs Node.js 22 (<https://nodejs.org>).

1. On GitHub open **kreeva-lifestyle/unsort** → green **Code** button →
   **Download ZIP** → unzip it.
2. Open the folder `unsort-main/tools/pb-telegram-crawler` in a terminal:
   Windows — right-click the folder → **Open in Terminal**; Mac — open
   Terminal, type `cd ` (with a space) and drag the folder into the window,
   then press Enter.
3. Type:

```
npm ci
npm run login
```

Type the api_id, api_hash, the staff phone number (with +91), the code Telegram
sends and the two-step password if the account has one. Nothing appears while
you paste the api_hash or type the password — that is normal. It prints
**TG_SESSION** once.

> **Keep TG_SESSION secret.** Anyone who has it can read and send messages as the
> staff account. Paste it only into the server's variables. To cancel it later:
> Telegram → Settings → Devices → end the session.

### 4. Put it on Railway (about US$5 a month)
1. <https://railway.com> → sign in with GitHub → **New Project** → **Deploy from
   GitHub repo**. When Railway asks, allow its GitHub app access to the
   **kreeva-lifestyle** organisation, repository **unsort**, then pick it.
2. Open the new service → **Settings**:
   * **Root Directory**: `tools/pb-telegram-crawler` (Railway then builds the
     `Dockerfile` in it).
   * **Watch Paths**: `tools/pb-telegram-crawler/**` (so it only redeploys when
     the crawler changes).
   * No public domain or port is needed.
   * **Region**: Southeast Asia (Singapore) — close to where the staff account
     signs in, so Telegram is less likely to question the session.
   * **Deploy → Restart Policy**: **Always** (the crawler restarts itself if it
     ever gets stuck, and needs the host to start it again).
   * **Replicas**: 1.
3. **Variables** → add:

   | Variable | Value |
   |---|---|
   | `TG_API_ID` | api_id from step 1 |
   | `TG_API_HASH` | api_hash from step 1 |
   | `TG_SESSION` | from step 3 |
   | `PB_URL` | `https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-telegram` |
   | `PB_CRAWLER_KEY` | key from step 2 |
   | `POLL_SECONDS` | optional, default `60` (15–3600) |
   | `BACKFILL_POSTS` | optional, default `0`: how many recent channel messages to copy the first time a channel is seen (each photo, video or text counts as one) |
   | `START_DELAY_SECONDS` | optional, default `20`: wait this long before signing in, so an older copy has stopped |
   | `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` | `0` — Railway must stop the old copy before the new one starts |
   | `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `15` — time for the old copy to save where it got to |

4. **Deploy**. In **Deploy Logs** you should see `Connected to Telegram`, and in
   Playbook → Settings → Telegram the crawler shows as seen a moment ago.
5. Railway's Hobby plan (US$5/month, usage included) is enough for this.

### Or: any Linux server with Docker
```
cd tools/pb-telegram-crawler
docker build -t pb-telegram-crawler .
# ~/pb-crawler.env holds the variables above, one NAME=value per line.
# Keep it OUTSIDE the repository folder and chmod 600 it.
docker run -d --name pb-telegram-crawler --restart always \
  --env-file ~/pb-crawler.env pb-telegram-crawler
docker logs -f pb-telegram-crawler
```
Without Docker: Node 22, `npm ci --omit=dev`, set the variables, `npm start`
(under systemd or pm2 so it restarts).

**Run only one crawler at a time.** Two copies with the same TG_SESSION can
make Telegram end the session for good (then you sign in again on a laptop),
and would forward every post twice. Never run `npm start` on the laptop with
the TG_SESSION the server uses.

## What the messages in Settings mean

| Message | What to do |
|---|---|
| Waiting for the admin group — link it… | Do Settings → Telegram step 2. The crawler waits and copies nothing. |
| The staff account is not in the admin group | Add the staff account to the admin group. |
| The staff account can't post in the admin group | Group settings → Permissions: let members send messages and media. |
| Join this channel from the staff account | The channel is private (or the account was removed): join it from the staff account. |
| No Telegram channel called @… | Fix the channel name on the vendor in Playbook. |
| … is a group, not a channel | Only channels can be read; ask the vendor for their channel. |
| This channel blocks forwarding | The vendor turned on "Restrict saving content". Its posts are skipped until they turn it off (checked every 30 min); add those products by hand. |
| Could not forward — check the staff account is still in the admin group | The staff account was removed from the group (or the group changed). Add it back; nothing is skipped meanwhile. |
| Telegram asked us to slow down for … | Telegram's speed limit. It waits and carries on by itself. |
| Telegram signed the staff account out | Run `npm run login` again and replace TG_SESSION. |
| Skipped message N after 10 failed tries | That one message could not be forwarded for over 6 hours; add it by hand if it mattered. |

Other behaviour: forwards are at least 1.2 s apart and silent (no
notification in the group); every Telegram call gives up after 60–90 s and a
stuck connection is rebuilt; a dropped connection is retried with a growing
wait (5 s up to 5 min); if nothing moves for 15 minutes the crawler exits and
the host restarts it; if Playbook cannot be reached it retries the same way and
copies nothing until it can. It tells Playbook which vendor channel each
forwarded post came from, so a vendor's repost of a supplier's post still goes
to the vendor. Logs go to the screen / host logs only and never contain
TG_SESSION or the crawler key.

**Not covered:** a post the vendor edits after it was copied (for example a
corrected RATE) is not copied again — fix the product in Playbook.

## Tests
```
npm test
```
Runs the album/cursor planning and a full crawl against a fake Telegram (no
login needed).
