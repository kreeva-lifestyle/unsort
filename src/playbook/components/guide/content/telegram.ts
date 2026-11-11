// Guide: "Connect Telegram" — the whole setup for a shop owner, in the order
// it is done (bot → Playbook → admin group → staff account → crawler key →
// Railway), then telegramUse.ts (vendor channels, how to tell it works,
// troubleshooting). Labels match Settings → Telegram and the vendor sheet
// exactly; matches tools/pb-telegram-crawler/README.md. Plain data — ../types.ts.
import { type GuideSection, h, list, p, steps, table, tip, warn } from '../types';
import { TELEGRAM_USE } from './telegramUse';

const PB_URL = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-telegram';

export const TELEGRAM: GuideSection[] = [
  {
    id: 'telegram',
    short: 'Connect Telegram',
    title: 'Connect Telegram — vendor posts become products by themselves',
    lead: 'Do this once (about an hour). After it, every product a vendor posts in their Telegram channel is in Products the next morning, with the vendor already filled in — taken from the channel, because the post itself never names the vendor.',
    blocks: [
      h('How it works'),
      steps(
        'A **crawler** — one of your staff Telegram accounts, running on a small cloud server — looks at each vendor channel **once a day**, overnight, each channel at its own time.',
        'It **forwards** that channel\'s new posts into your private **admin group**, one channel at a time, so the group is never flooded.',
        'The **Playbook bot** is an admin in that group. It passes every forwarded message to Playbook.',
        'Playbook joins the photos, videos and text of one post into one product and sets the vendor from the channel. Then the usual steps run: read by the AI, sorted, priced, written, published.',
      ),
      p('You need: your own Telegram account (to make the bot), a **staff Telegram account** for the crawler (a normal account with a phone number, not a bot — bots cannot read other people\'s channels), a laptop for one sign-in, a GitHub account that can see **kreeva-lifestyle/unsort** (an owner of that organisation approves Railway\'s access), and a card for Railway\'s **Hobby** plan (about US$5 a month).'),

      h('1 · Create the bot in @BotFather'),
      steps(
        'In Telegram search for **@BotFather** (blue tick) and open it.',
        'Send `/newbot`. Give it a name, e.g. `DailyOffice Playbook`, then a username that ends in `bot`, e.g. `dailyoffice_playbook_bot`.',
        'BotFather sends a **token** — numbers, a colon, then letters, e.g. `123456789:AAH…`. Tap it to copy it. Keep it private.',
      ),
      tip('Come back to @BotFather after step 3 (once the bot is in your group): send `/setjoingroups`, pick your bot and choose **Disable**. Then nobody can add the bot to other groups.'),

      h('2 · Save the token in Playbook'),
      steps(
        'In Playbook open **Settings → Telegram**. Under **1 · Playbook bot**, paste the token into **Bot token** and tap **Save token**.',
        'You see the bot\'s @name and **Connected**. If it says **Telegram can’t reach Playbook**, tap **Check bot**; if it stays red, tap **Change token** and save the same token again.',
      ),
      list('Only an **admin or manager** can save the token. Everyone else sees the status.', 'The token is kept on the server and never shown again.'),

      h('3 · Add the bot to your admin group and link it'),
      steps(
        'In Telegram make a **private group**, e.g. `Vendor posts`, with you and the **staff account** (step 4). Keep it just for this.',
        'Open the group, tap its name → **Edit** (pencil) → **Chat history for new members** → **Visible** → save. This turns it into a supergroup, the only kind Playbook can use. If you skip it, the bot tells you so when you send the link code.',
        'Open the group, tap its name → **Add members** → add your bot. Then tap **Edit** (pencil) → **Administrators** → **Add Admin** → pick the bot → tap ✓ to save. The bot must be an **admin** to see the forwarded posts.',
        'In Playbook, under **2 · Admin group**, tap **Get link code**. A 6-digit code appears, valid for 30 minutes.',
        'In the group send `/link 123456` (your code instead of 123456) — or tap **Copy /link …** in Playbook and paste it.',
        'The bot answers **Linked to Playbook ✓**, and Settings shows **Linked** with the group\'s name within a few seconds.',
        'Now go back to **@BotFather** → `/setjoingroups` → your bot → **Disable** (see the tip in step 1).',
      ),
      tip('Messages people type in the group are ignored; only forwarded vendor posts become products. 5 wrong codes and the code stops working — tap **New code**.'),

      h('4 · The staff account: its keys, and join every vendor channel'),
      steps(
        'On a laptop open **my.telegram.org** and sign in with the **staff account\'s** phone number (the code arrives in that account\'s Telegram app).',
        'Open **API development tools**. Create an app — any name, e.g. `Playbook crawler`, platform **Other**.',
        'Copy the **api_id** (a number) and the **api_hash** (letters and numbers). You need both in step 6.',
        'From the staff account, **join every vendor channel** you want to read, and make sure it is a member of the admin group and can send messages there.',
      ),
      tip('In the staff account: **Settings → Privacy and Security → Groups & Channels → My Contacts**, so strangers cannot pull it into their groups.'),

      h('5 · Create the crawler key'),
      steps(
        'In Playbook, under **3 · Crawler**, tap **Create crawler key** (admins and managers only).',
        'Tap **Copy key** and paste it into Railway (step 6). It is **shown only once** — when it is saved, tap **I saved it — hide**.',
      ),
      tip('Best done when Railway\'s **Variables** page is open (step 6), so you paste the key straight in. Lost it? Tap **Replace crawler key** — nothing uses it until the crawler runs.'),
      p('**Replace crawler key** makes a new key and stops the old one at once — paste the new one into `PB_CRAWLER_KEY` on Railway straight away.'),

      h('6 · Start the crawler on Railway'),
      p('First make **TG_SESSION** — the staff account\'s sign-in for the crawler. Do this once, on a laptop:'),
      steps(
        'Install **Node.js** from **nodejs.org** — the big **LTS** button (the one for most users) — and click through the installer.',
        'Download the crawler: on GitHub (signed in) open **kreeva-lifestyle/unsort** → green **Code** button → **Download ZIP**, and unzip it.',
        'Open the folder `unsort-main/tools/pb-telegram-crawler` in a terminal. Windows: right-click the folder → **Open in Terminal**. Mac: open **Terminal**, type `cd ` (with a space), drag the folder into the window, press Enter.',
        'Type `npm install` and press Enter. Wait until it finishes. Windows: if it says *running scripts is disabled*, type `npm.cmd install` instead (and `npm.cmd run login` below).',
        'Type `npm run login` and press Enter. Type the **api_id**, the **api_hash**, the **staff phone number** with +91, then the **code Telegram sends in the app**, and the two-step password if the account has one. Nothing shows while you paste the api_hash or type the password — that is normal.',
        'It prints **TG_SESSION** once — a long line of letters. Copy it for the Variables below.',
      ),
      warn('**TG_SESSION is a login.** Anyone who has it can read and send messages as the staff account. Paste it only into Railway\'s Variables — never into a chat, email or WhatsApp. To cancel it: Telegram on the staff phone → **Settings → Devices** → end that session, then run `npm run login` again.'),
      p('Then put the crawler on Railway:'),
      steps(
        'Open **railway.com** → **Sign up** with GitHub → choose the **Hobby** plan and add a card.',
        '**New Project → Deploy from GitHub repo**. When Railway asks, allow it to see the **kreeva-lifestyle** organisation, repository **unsort** — then pick **unsort**.',
        'Railway starts a first build straight away — it fails (red). That is expected; it works once the Root Directory is set below.',
        'Open the new service → **Settings**. Set **Root Directory** to `tools/pb-telegram-crawler`.',
        'In the same **Settings**: **Region** → **Southeast Asia (Singapore)**; **Restart Policy** → **Always**; **Replicas** → 1.',
        'Open **Variables** → **+ New Variable**. Type the name exactly as below, paste the value, tap **Add**. Do it for each line:',
      ),
      table(['Name', 'Value'],
        ['`TG_API_ID`', 'api_id (step 4)'],
        ['`TG_API_HASH`', 'api_hash (step 4)'],
        ['`TG_SESSION`', 'the long line from the laptop'],
        ['`PB_URL`', `\`${PB_URL}\``],
        ['`PB_CRAWLER_KEY`', 'the key from step 5'],
        ['`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS`', '`0`'],
        ['`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`', '`15`'],
      ),
      steps(
        'Tap **Deploy**. In **Deploy Logs** you see `Connected to Telegram`.',
        'Within a minute, Playbook **Settings → Telegram → 3 · Crawler** shows **Running** and **Last seen just now**.',
      ),
      list(
        'Railway\'s **Hobby** plan, about **US$5 a month**, is enough. The crawler runs all day but only reads Telegram at each channel\'s time.',
        'Run only **one** crawler. Two copies at once can make Telegram end the staff account\'s session and would forward posts twice. Never run `npm start` on the laptop.',
        'Any Linux server with Docker works instead of Railway — the steps are in the crawler\'s README.',
      ),
      ...TELEGRAM_USE,
    ],
  },
];
