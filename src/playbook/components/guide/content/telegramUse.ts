// Guide "Connect Telegram", second half (telegram.ts holds steps 1–6): give
// each vendor their channel and its automatic daily time, how to tell it
// works, what happens to a post, and troubleshooting. Labels match Settings →
// Telegram, the vendor sheet and the vendor row. Plain data — ../types.ts.
import { type GuideBlock, h, list, p, steps, table, tip } from '../types';

export const TELEGRAM_USE: GuideBlock[] = [
  h('7 · Add each vendor\'s channel'),
  steps(
    'Open **Vendors → Edit** on a vendor (or **Add vendor** — the **+** at the top on a phone).',
    'In **Telegram channel** type the channel name — `@kumari_art`, `kumari_art` or a link like `t.me/kumari_art` all work. Tap **Save vendor**.',
    'Playbook gives the channel its **own daily time** by itself. The vendor row shows it, e.g. `@kumari_art · checked daily at 1:12 AM`, and **Not checked yet** until its first night.',
    'Within a few minutes the crawler notes the channel\'s newest post (Settings shows **Getting ready** meanwhile). Older posts are never copied — only what is posted from then on.',
  ),
  p('How the times are picked: channels are checked once a day inside the **window**, 11:00 PM to 7:00 AM unless you change it. The first channel gets the middle of the window (3:00 AM). Each new channel gets the middle of the **biggest free gap** between the others, so no two channels are checked at the same time and the admin group never gets every vendor at once.'),
  list(
    '**Settings → Telegram → 3 · Crawler → Daily checks** lists every channel in time order: vendor, time, **Next check** and the last result.',
    '**Edit window** (admins and managers) changes the start and end — at least 1 hour; it may run past midnight. Saving spreads every channel evenly over the new window.',
    '**Spread evenly** (admins and managers) gives every channel a new time, evenly spaced, in the same order. Use it after adding or removing many vendors. Nothing is copied twice. Best done in the daytime: done at night, a channel whose new time has already passed is checked the next night.',
    'A vendor added in the daytime is first checked at its time that night. Clearing the channel, or **Deactivate** on the vendor, stops its checks.',
    'A post from a channel that no vendor has yet still comes in (if someone forwards it): Playbook makes a new vendor named after the channel. When a vendor reposts another channel\'s post, it still goes to the vendor whose channel it came from.',
  ),

  h('8 · How to tell it works'),
  steps(
    'In **Settings → Telegram**: **1 · Playbook bot** says **Connected**, **2 · Admin group** says **Linked**, **3 · Crawler** says **Running** with **Last seen** a minute or two ago — all day, even though it reads Telegram only at night.',
    'The next morning, in **Daily checks**, each channel shows **Last checked** a few hours ago and its **Next check** tonight.',
    'In the admin group you see the night\'s posts, one vendor after another.',
    'In **Products** the new products are there, each marked **From Telegram · <channel> · Open post** under its name, with the vendor filled in. **Messages waiting** in Settings goes back to 0 a few minutes after a channel\'s check ends.',
  ),
  tip('Want to test it the same day? Wait until the channel no longer says **Getting ready**, ask the vendor to post, then **Edit window**: Start = a few minutes from now, End = 1 hour later, **Save window**. **Daily checks** shows each channel\'s new time. Afterwards set it back to **11:00 PM** and **7:00 AM** and save again.'),

  h('What happens to a vendor post'),
  table(['In the channel', 'In Playbook'],
    ['Albums of photos (up to 10 each)', 'Up to 20 photos on one product, in the order posted'],
    ['A video up to 20 MB', 'Copied next to the photos (with a play button). Videos never go to Shopify or the AI'],
    ['A bigger video', 'Skipped, with a note on the product: "Video (91 MB) too big to copy — add it by hand"'],
    ['The long text (CODE, SIZE, COLOUR, RATE…), or a photo caption', 'The product\'s **Details** — the AI reads it'],
    ['A short message like `200 Less` after the rate (also `Less: 200`, `Less Rs 200`, or `RATE 1600 LESS 200` on one line)', 'Kept as the **Less**: cost = rate − less (₹1,600 − ₹200 = ₹1,400), shown in **Facts**'],
    ['A pointing-hand sticker or emoji between products', 'Treated as a separator and ignored'],
    ['Photos with no text', 'A product with a note "No description arrived from Telegram". If the text comes later (within 2 days), it is added and the product is read again'],
    ['The text first, then its photos', 'Also one product — each text goes with the photos after it'],
    ['A whole day of posts at once', 'Split into products by the order they were posted, exactly as if they had come one by one'],
    ['The same post copied twice', 'Counted once'],
  ),
  p('Anything to check shows in a yellow **Notes from Telegram** tile on the product. A post the vendor edits after it was copied (for example a corrected RATE) is not copied again — fix the product in Playbook.'),

  h('9 · When something is wrong'),
  table(['Settings shows', 'What to do'],
    ['**Telegram can’t reach Playbook** on the bot', 'Tap **Check bot**. Still red: **Change token** and save the same token again'],
    ['**Waiting for /link** does not change', 'The bot must be an **admin** in the group, and the code under 30 minutes old — tap **New code** and send it again'],
    ['Crawler **Stopped** / "No report for more than 5 minutes"', 'The crawler is not seen. Open Railway → the service → **Deploy Logs**, then **Restart**. Check the five Variables are there and Restart Policy is **Always**'],
    ['"Waiting for the admin group — link it…"', 'Do **2 · Admin group** first. The crawler waits and copies nothing'],
    ['"The staff account is not in the admin group"', 'Add the staff account to the group (step 3)'],
    ['"The staff account can\'t post in the admin group"', 'In the group: its name → **Edit** → **Permissions** → turn on **Send messages** and **Send media**'],
    ['"Join this channel from the staff account"', 'Open the channel in the **staff account** and tap **Join**. Done the same night, it is picked up within a few minutes; otherwise at its next time'],
    ['"@… is a group, not a channel"', 'Only channels can be read — ask the vendor for their channel name'],
    ['"No Telegram channel called @…"', 'Fix the channel name on the vendor (**Vendors → Edit**)'],
    ['"This channel blocks forwarding"', 'The vendor turned on "Restrict saving content". Those posts are skipped; ask them to turn it off, and add those products by hand'],
    ['"Could not forward — check the staff account is still in the admin group"', 'Add the staff account back to the group. Nothing is skipped — the check carries on from the same post next time'],
    ['"Telegram asked us to slow down for N min"', 'Telegram\'s speed limit. Nothing to do — the crawler waits N minutes and carries on where it stopped'],
    ['"Lost the connection to Telegram — reconnecting"', 'Nothing to do — it reconnects by itself. Still there after an hour: **Restart** on Railway'],
    ['"Telegram error: …"', '**Restart** on Railway; if it comes back, tell the developer and send the exact text'],
    ['A channel was not checked on the night you changed the window or tapped **Spread evenly**', 'Nothing is lost — its posts come at its new time the next night'],
    ['"Telegram signed the staff account out"', 'Run `npm run login` again on the laptop (step 6) and replace **TG_SESSION** on Railway'],
    ['The staff account is **limited** (it cannot message, or Telegram says it is restricted)', 'Stop the crawler on Railway. Email **recover@telegram.org** from any address: say it is your staff account reading your suppliers\' channels for your shop, with its phone number. Start it again once the limit is lifted'],
    ['"… being tried again" next to Messages waiting', 'Nothing to do — Playbook tries those messages again by itself (up to 3 times)'],
    ['"… could not be used" next to Messages waiting', 'Open **See which posts**, tap **Open post** and add that product by hand; tell the developer if it keeps happening'],
  ),
];
