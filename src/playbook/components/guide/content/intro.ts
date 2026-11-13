// Guide part 1: what the Product Directory does, where things are, and the
// one-time groundwork (categories, AI reader, vendors). Plain data — see ../types.ts.
import { type GuideSection, h, list, p, steps, table, tip } from '../types';

export const INTRO: GuideSection[] = [
  {
    id: 'what',
    short: 'What it does',
    title: 'What the Product Directory does',
    lead: 'One place for every product your vendors send — and a robot that puts each one on the right Shopify websites, at the right price, in the right words.',
    blocks: [
      p('Every product a vendor sends lands in **Products**. From there the app works on its own, every minute: it reads the photos and the vendor\'s text, decides which of your Shopify websites the product belongs on, works out the selling price for each website, writes a title, description and Google (SEO) text in that website\'s own style, adds that website\'s tags, and puts the product on the store.'),
      h('How one product travels'),
      steps(
        '**Lands** — a product comes in. It comes straight from the vendor\'s Telegram channel (see **Connect Telegram**), or you add it in **Products → + Add product**. Status: **New**.',
        '**Read** — the AI looks at the first 4 photos and the vendor\'s post and fills in name, category, fabric, colour, sizes, cost price and other details (work, pattern, wash care…). The photos decide what can be seen: when the post says orange and the photos show pink, the colour is Pink, and a trade name such as "Rama" becomes Teal Blue. The fabric is kept as the post writes it; only a spelling mistake is corrected. Status: **Reading**, then **Ready** — or **Needs info** when the cost price or the category is missing.',
        '**Sorted** — each website\'s **Routing rules** decide whether the product goes there. Every "yes" becomes a *listing*: one product on one website.',
        '**Priced and written** — for each listing the price is worked out from the cost with that website\'s formula, and that website\'s AI writer writes the title, description, SEO text, tags and photo descriptions.',
        '**Published** — the listing is sent to Shopify: live, as a draft, or held until someone approves it — whatever that website\'s **Publishing mode** says.',
      ),
      tip('One product can be on several websites, each with its own price, title, description and tags. Changing one website never changes another.'),
      h('Where things are'),
      table(['Page', 'What it is for'],
        ['**Dashboard**', 'What needs a person today, products by status, and each website\'s numbers (in progress, needs review, published, failed). Tap any tile to see those products.'],
        ['**Products**', 'Every product. Add new ones, search and filter, open one to see its facts and its listing on each website.'],
        ['**Websites**', 'Your Shopify stores. Each has six tabs: **Connection**, **Publishing**, **Routing rules**, **Pricing**, **Tags**, **Content & AI**.'],
        ['**Vendors**', 'The people you buy from — name, short names and their Telegram channel.'],
        ['**Settings**', 'The AI that reads products, the category list, **Telegram** (bot, admin group, crawler), and the switch that pauses all automation (plus **Run now**).'],
        ['**Guide**', 'This guide, with **Download PDF**.'],
      ),
      h('Who can do what'),
      list(
        'Admins, managers and operators can use every page: add and edit products, approve, publish, change website settings.',
        'Only an **admin or manager** can save a store\'s credentials (the Shopify keys), the Telegram bot token and the crawler key.',
      ),
    ],
  },
  {
    id: 'before',
    short: 'Before you start',
    title: 'Before you start: categories, the AI reader and vendors',
    lead: 'Ten minutes, once. Everything after this depends on it.',
    blocks: [
      h('Categories'),
      steps(
        'Open **Settings → Categories & tags**.',
        'Under **Categories**, type each category you sell and tap **Add** — for example `Saree`, `Kurta Set`, `Lehenga`, `Dupatta`, `Co-ord Set`.',
        'Tap a category to choose the attributes it needs (Colour, Work…) — see **Tags: your own lists**.',
      ),
      p('The AI must pick one of these for every product. A product without a category, with one no longer on this list ("Missing: Category"), or without a value for one of its category\'s attributes waits in **Needs info**. Routing rules, tags and the Shopify product type all use the category, so spell each one exactly the way you want it to appear on your websites.'),
      p('**Playbook remembers how you file.** When you change a product\'s category, the AI sees it the next time it reads a product from the same website (or the same Telegram vendor), and files the ones that look like it the same way. So if one website calls its salwar suits "Dresses", correct two or three of them and the next ones follow.'),
      h('The AI that reads products'),
      steps(
        'In **Settings → AI that reads products**, pick a **Model** and an **Effort**. `Haiku 5.5` with `Model default` is enough for reading.',
        'Tap **Save reader**.',
      ),
      p('This AI only reads (fills in the facts). Each website chooses its own writer later, under **Websites → Content & AI**.'),
      h('Vendors'),
      steps(
        'Open **Vendors → + Add vendor**.',
        '**Name**: the vendor as you know them, e.g. `Rangoli Creations`.',
        '**Short names** (optional): the letters this vendor\'s design codes start with, e.g. `RG`. More than one? Put a comma between them: `KB, NKB`. Tags can use it as `{vendor_code}`: each product gets the short name its own code starts with.',
        'Tap **Save vendor**. Repeat for each vendor.',
      ),
      tip('Stopped buying from someone? Tap **Deactivate** instead of deleting. Their old products stay; they just stop showing up as a choice for new ones.'),
    ],
  },
];
