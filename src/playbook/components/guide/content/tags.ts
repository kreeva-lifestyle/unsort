// Guide: "Tags" — what a product's own tags are, where they come from, the
// review queue, hiding junk, merging duplicates, how websites use {tags}, and
// the caps. Labels match Settings → Tags, the product page and the website
// editor's Tags section exactly. Plain data — ../types.ts.
import { type GuideSection, h, list, p, steps, table, tip } from '../types';

export const TAGS: GuideSection[] = [
  {
    id: 'product-tags',
    short: 'Tags',
    title: 'Tags: one clean list per product',
    lead: 'Every product carries its own list of tags, cleaned once, and every website builds its Shopify tags from that list. A store you import from may bring hundreds of tags, most of them internal codes — **Settings → Tags** is where you keep the real ones, hide the junk and merge two spellings of the same thing.',
    blocks: [
      h('Where a product\'s tags come from'),
      p('Open any product: the **Tags** field sits in **Facts**, with the count next to it. The list is built in this order, and repeats are dropped:'),
      table(['Source', 'What goes in'],
        ['**Facts**', 'The category, fabric and colour, plus the occasion, work and pattern the AI read'],
        ['**The other store**', 'Its own tags (Import from website), after cleaning — see the rules below'],
        ['**You**', 'Anything you type on the product page. Those are marked **Kept**: the AI adds to them but never replaces them'],
        ['**The AI writer**', 'The style and occasion tags it adds when a website has **AI extra tags** on — last, so they only fill the room left under the cap'],
      ),
      p('The raw store tags still show in the **From the website** tile, as text, so you can see what was cleaned away.'),
      h('The rules that clean them (Settings → Tags → Rules)'),
      list(
        '**Hide patterns**: a tag matching any pattern is dropped. The defaults hide anything starting with `_` (such as `_altnew_KBSUIT25`), `SIZE_CHART`, `label_…` markers and short codes such as `kb261`.',
        '**Always hide these tags**: exact tags you never want, any letter case.',
        '**Tags per product, at most** (25 to begin with) and **Shortest tag** (2 characters).',
        '**Title Case**: `ideal collection` becomes `Ideal Collection`; mixed case such as `iPhone` is left alone, and so are short all-caps words such as `XL`, `3XL` or `UK 10`.',
        '**Hide tags that look like codes**: letters and digits with no vowel, mostly digits, or an underscore in front.',
        'Type any tag under **Try a tag** to see what the rules would do with it, as you edit them.',
        '**Re-clean all products** runs the saved rules over every product again. It first says how many products would change, then asks before it changes anything. Tags you typed by hand are kept.',
      ),
      h('Reviewing new tags'),
      steps(
        'Open **Settings → Tags**. The top tile says how many new tags wait — every tag Playbook has not seen before lands there, after an import, an AI read or a hand edit.',
        'For each tag you see how many products carry it, where it came from and three example products. Tap **Keep** for a real tag, **Hide** for junk, or **Edit** to rename it, set its kind (collection, fabric, occasion…) or merge it into another tag.',
        'Tick several and use **Keep**, **Hide** or **Merge into…** on all of them at once. **Hide all that look like codes** clears the obvious junk in one tap.',
        'A hidden tag is never sent to any website, but it stays on the products: **Unhide** brings it back everywhere. Merging `Kurta Sets` into `Kurtas & Suits` renames it on every product, and new arrivals get the kept name by themselves.',
      ),
      h('How websites use them'),
      p('In a website\'s **Tags** section, the placeholder `{tags}` sends the product\'s own tags, one Shopify tag each — new websites start with it. The other placeholders still work, and `{attr:store_tags}` sends the other store\'s tags raw. **At most, per product** (30 to begin with) caps the final list after the templates, fixed tags and AI extras. Changing a product\'s tags reaches a website the next time its listing is written or published.'),
      tip('The **Library** on the Tags page lists every tag most used first. Search it, filter by kind, or show only the hidden ones to check nothing real was hidden by a pattern — a tag the rules hid is listed there too, with 0 products, and **Unhide** lets it through from then on.'),
    ],
  },
];
