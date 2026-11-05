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
        '**Lands** — a product comes in. Today you add it in **Products → + Add product**; soon it will come straight from the Telegram channel. Status: **New**.',
        '**Read** — the AI looks at the photos and the vendor\'s post and fills in name, category, fabric, colour, sizes, cost price and other details (work, occasion, wash care…). Status: **Reading**, then **Ready** — or **Needs info** when the cost price or the category is missing.',
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
        ['**Vendors**', 'The people you buy from — name and a short code.'],
        ['**Settings**', 'The AI that reads products, the category list, and the switch that pauses all automation (plus **Run now**).'],
        ['**Guide**', 'This guide, with **Download PDF**.'],
      ),
      h('Who can do what'),
      list(
        'Admins, managers and operators can use every page: add and edit products, approve, publish, change website settings.',
        'Only an **admin or manager** can save a store\'s credentials (the Shopify keys).',
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
        'Open **Settings → Categories**.',
        'Type each category you sell and press Enter — for example `Saree`, `Kurta Set`, `Lehenga`, `Dupatta`, `Co-ord Set`. You can paste several at once, separated by commas.',
        'Tap **Save categories**.',
      ),
      p('The AI must pick one of these for every product. A product without a category waits in **Needs info**. Routing rules, tags and the Shopify product type all use the category, so spell each one exactly the way you want it to appear on your websites.'),
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
        '**Short code** (optional): two or three letters, e.g. `RG`. Tags can use it as `{vendor_code}`.',
        'Tap **Save vendor**. Repeat for each vendor.',
      ),
      tip('Stopped buying from someone? Tap **Deactivate** instead of deleting. Their old products stay; they just stop showing up as a choice for new ones.'),
    ],
  },
];
