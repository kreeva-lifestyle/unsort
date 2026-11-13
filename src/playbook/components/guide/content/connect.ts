// Guide step 1: add a website and connect its Shopify store (legacy shpat_
// token or a Dev Dashboard app with client ID + secret), test, switch on.
import { type GuideSection, h, list, p, steps, table, tip, warn } from '../types';

const SCOPES = '`write_products`, `read_products`, `write_publications`, `read_publications`, `write_inventory`';

export const CONNECT: GuideSection[] = [
  {
    id: 'connect',
    short: 'Step 1 · Connect a store',
    title: 'Step 1 — Add and connect each Shopify store',
    lead: 'Do this once for every website. You need the store\'s myshopify.com address and a Shopify login that is allowed to install apps (the store owner, or staff with that permission).',
    blocks: [
      h('Add the website'),
      steps(
        'Open **Websites → + Add website**.',
        '**Name**: how you call it, e.g. `Indya Ethnic`.',
        '**Store domain**: the myshopify.com address, e.g. `indya-ethnic.myshopify.com` — find it in Shopify admin → Settings → Domains. Not your own .in / .com domain.',
        'Tap **Add website**. The website opens on its **Connection** tab.',
      ),
      p('A new website starts **Off** with the routing set to **Do not list it**, so nothing is sent until you have finished setting it up.'),
      h('Which way to connect?'),
      table(['Your situation', 'What you use', 'In the app pick'],
        ['The store already has an older custom app made inside the Shopify admin, with an Admin API access token that starts `shpat_`', 'That app\'s access token', '**Access token**'],
        ['Anything else — a new store, or no such app', 'A new app from the Shopify Dev Dashboard', '**Client ID + secret**'],
      ),
      warn('Shopify stopped letting anyone create new "legacy" custom apps in the store admin on 1 January 2026. Old ones keep working. Every new connection is made in the Shopify Dev Dashboard (Way B).'),
      h('Way A — an existing custom app (token starting shpat_)'),
      steps(
        'In the Shopify admin open Settings → Apps and sales channels → Develop apps, and open the app.',
        `Check its Admin API scopes include ${SCOPES}. If you add any, save and reinstall the app when Shopify asks.`,
        'Copy the **Admin API access token** (it starts with `shpat_`). Shopify shows it only once — if nobody saved it, use Way B instead.',
        'In the app: **Websites →** your website **→ Connection**. Under **How the app signs in** pick **Access token**, paste it into **Admin API access token**, tap **Save credentials**.',
      ),
      h('Way B — a new app from the Shopify Dev Dashboard'),
      p('Do this part on a computer: Shopify\'s app screens are made for a desktop browser. Sign in to Shopify as the store owner (or staff allowed to develop apps).'),
      steps(
        'Open the Dev Dashboard from the store\'s Shopify admin: click the **store name** (top right) → **View Dev Dashboard**. Not there? **Settings → Apps → Develop apps → Build apps in Dev Dashboard**. An app made this way belongs to your store\'s organisation, which is what lets it connect.',
        'Click **Apps** (left) → **Create app** (top right) → **Start from Dev Dashboard**. The **Create an app** form opens.',
        `Fill it in: **App name** e.g. \`Playbook\`; leave **Version name**, **App URL** (https://example.com) and **Allowed redirection URL(s)** as they are; **untick Embed app in Shopify admin** (Playbook does not open inside Shopify); leave **Use legacy install flow** unticked. In **Scopes** paste \`write_products,read_products,write_publications,read_publications,write_inventory\`. Leave **Webhooks API version** as it is. Click **Create app** (top right) — and **Release** if Shopify asks to release the version.`,
        'Open the app again and click **Install app** (top of the **Installs** card). Choose the store, check the permissions it asks for, and click **Install**.',
        'In the app open **Settings**. On the **Credentials** card copy the **Client ID** and the **Client secret** (the eye or copy icon shows the secret).',
        'In this app: **Websites →** your website **→ Connection**. Under **How the app signs in** pick **Client ID + secret**, paste both, tap **Save credentials**.',
      ),
      tip('Shopify renames its screens now and then. If a label above looks different, follow the same idea: create app → give permissions (scopes) → release → install on the store → copy client ID and secret.'),
      h('Test, then switch on'),
      steps(
        'Tap **Test connection**.',
        'Green **Connected to <store name>** — done: every permission is there, the store sells in rupees and it has an Online Store channel.',
        'Yellow **Reached <store name>, but it cannot be used yet** — it lists what is missing. Permissions: add the scope on a new version in the Dev Dashboard and **Release** it, then approve the new permissions in the store\'s Shopify admin (Shopify does not apply them by itself). Not in rupees: set the store currency to Indian rupees (Shopify admin → Settings). No Online Store channel: add the Online Store sales channel. Then **Test connection** again. The website cannot be switched on until the test is green.',
        'Red **Last problem: …** — the details are wrong or the app was removed. Copy them again, **Save credentials**, test again.',
        'Finish Steps 2 to 6 below for this website. Then come back to **Connection** and switch **Active** on.',
      ),
      list(
        '**Active** can only be switched on after a successful connection. Switching it on also sends the Ready products already in the directory that match this website\'s rules. Off = nothing new is sent to this store; products already there stay.',
        'Credentials are kept on the server only and are never shown again — the boxes stay empty. Leave them empty to keep what is saved; type only to replace.',
        'With **Client ID + secret** the app renews its Shopify access by itself. Nothing to do.',
        'Moving a website to a different Shopify store: change **Store domain**, enter that store\'s credentials and tap **Save credentials**. The website is switched off, the old store\'s keys are deleted, and its products are queued to be sent again to the new store. Products already on the old store stay there.',
      ),
    ],
  },
];
