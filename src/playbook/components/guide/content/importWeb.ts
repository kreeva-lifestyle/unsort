// Guide: "Import products from a website" — copying another store's in-stock
// products into Products (Shopify / WooCommerce fully, other stores best
// effort), what the two switches do, cancelling, re-running, and the legal
// note on photos and text. Labels match the Import from website sheet and the
// run tile on Products exactly. Plain data — ../types.ts.
import { type GuideSection, h, list, p, steps, table, tip, warn } from '../types';

export const IMPORT_WEB: GuideSection[] = [
  {
    id: 'import-website',
    short: 'Import from a website',
    title: 'Import products from a website',
    lead: 'Paste another store\'s web address and Playbook copies its in-stock products into **Products**. From there the usual steps run: the AI reads each one, the website rules decide where it goes, and the listing is written and published.',
    blocks: [
      h('How to do it'),
      steps(
        'Open **Products**. On a computer tap **Import from website** next to **+ Add product**; on a phone tap the **Import from website** row at the top of the list.',
        'Paste the store\'s address (for example `https://example.com`) and tap **Check website**. Playbook looks at the store for a few seconds.',
        'Read the preview: what kind of store it is, about how many products it has, three sample products with their prices, and anything to know (in the yellow box).',
        '**Vendor name** is filled in from the store\'s name — change it if you like. Every imported product gets this vendor.',
        'Leave **Only in-stock products** on unless you also want sold-out items.',
        'Leave **Sell at their price** on to use the store\'s price as our selling price (see below).',
        'Tap **Import about 980 products** (the number is the estimate). A tile at the top of **Products** shows the progress; you can leave the page, it keeps going on the server.',
      ),
      h('What Playbook can read'),
      table(['Kind of store', 'What you see', 'What is copied'],
        ['**Shopify store**', 'Green dot', 'Every product: name, description, photos (up to 10), sizes, colour, price, whether it is in stock'],
        ['**WooCommerce store**', 'Green dot', 'The same, from the store\'s own product list'],
        ['**Other store — best effort**', 'Yellow dot', 'Only the pages that carry product data, found through the site map. Some products may be missed, and it is slower (about 25 pages a minute)'],
        ['**Unknown store**', 'Red box', 'Nothing was found — check the address or try the store\'s home page'],
      ),
      p('"In stock" means the store itself says the product (any of its sizes) can be bought right now. A product whose every size is sold out is left out while **Only in-stock products** is on.'),
      h('The details it copies'),
      p('Besides the name, description, photos, sizes and price, Playbook keeps every detail the other store shows about a product. They appear on the product page in the **From the website** tile (text only — they are never sent back to that store), and the AI reader leaves them as they are.'),
      table(['On the product page', 'Where it comes from', 'Use it in a tag template as'],
        ['**Brand**', 'The store\'s brand or vendor field', '`{attr:brand}`'],
        ['**Manufacturer**', 'Only when the store names a maker separately from the brand', '`{attr:manufacturer}`'],
        ['**Product type**', 'The store\'s product type or categories', '`{attr:product_type}`'],
        ['**Store tags**', 'The store\'s own tags, comma-separated', '`{attr:store_tags}` (all of them in one tag)'],
        ['**SKU**, **Barcode**, **Weight**', 'The first size\'s codes and weight. The SKU also fills the product\'s SKU when that is empty', '`{attr:sku}`, `{attr:barcode}`'],
        ['**Was price**, **Currency**', 'The crossed-out "was" price and the store\'s currency', '—'],
        ['**Page title**, **Page description**', 'The product page\'s own title and description, as search engines see it', '—'],
      ),
      p('A detail the store does not show is simply left out — nothing is guessed. **Open original page** on the tile opens the product on the other store. To tag every imported product with its brand, add the template `Brand_{attr:brand}` under **Websites → Tags**; a product without a brand just gets no brand tag.'),
      h('The price'),
      p('With **Sell at their price** on, the price shown on the other store becomes **our selling price on every website**. The websites\' pricing rules (markup, rounding, minimum) are skipped for these products, and the product\'s **Facts** say "Sells at ₹… on every website (price copied from …)". A cost price is optional for them — they become **Ready** without one. Switch it off and no price is copied: each product waits in **Needs info** until you type a cost price, and the websites\' pricing rules apply as usual.'),
      h('While it runs'),
      list(
        'The tile on **Products** shows what it found so far: **found · added · already here · out of stock · failed**. It refreshes by itself.',
        '**Cancel import** stops it between pages; products already added stay.',
        'Running the same store again skips every product that is **already here**, so it is safe to repeat (for example to pick up new arrivals).',
        'An import stops by itself at **5,000** products, and after three pages in a row fail — the tile then says why, with **Try again**.',
        '**Settings → Imports from websites** lists the last 20 imports.',
      ),
      tip('Sites that ask automated visitors to stay away (a `robots.txt` rule) are refused with a plain message. Playbook never works around that.'),
      warn('Photos and text on another store are that store\'s copyright. Playbook writes new titles and descriptions with the AI for each of your websites, but the **photos are copied as they are**. Use this only on stores whose content you are allowed to reuse (your own other stores, a brand that supplies you, a store with written permission), or replace the photos before publishing.'),
    ],
  },
];
