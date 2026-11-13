// Guide: "Tags" — the owner's own lists (Category → Attributes → Values),
// how auto-tagging works (text first, then the AI), required attributes and
// Needs info, "Let AI decide", suggestions and the look-alike guard, editing
// a product's tags, and websites. Labels match Settings → Tags, the product
// page and the website editor's Tags section exactly. Plain data — ../types.ts.
import { type GuideSection, h, list, p, steps, table, tip } from '../types';

export const TAGS: GuideSection[] = [
  {
    id: 'product-tags',
    short: 'Tags',
    title: 'Tags: your own lists',
    lead: 'You build the tags by hand, once, on **Settings → Tags**: each **category** uses some **attributes** (Colour, Work, Fabric…), and each attribute has its **values** (Black, Yellow, White…). Playbook only ever picks from your lists — it never invents a tag — so the tags stay tidy however many products arrive.',
    blocks: [
      h('1 · Create attributes and values'),
      steps(
        'Open **Settings → Categories & tags**. Tap **New attribute**, name it (e.g. `Colour`) and choose **Several** (a product can be Pink and Wine) or **One only** (one Fabric).',
        'Under the attribute, type a value in **Add a value** and tap **Add** — `Black`, `Yellow`, `White`. Add **Work** (`Embroidery`, `Printed`, `Sequins`) and **Fabric** (`Organza`, `Chiffon`, `Silk`) the same way.',
        'Tap a value to rename it, add the words it is **also known as** (`kala`, `kaala` for Black), **merge** it into another value, or delete it. The number on each value is how many products carry it.',
      ),
      h('2 · Link attributes to categories'),
      p('Under **Categories**, tap a category (this is the same list the AI picks a category from — it used to sit on Settings) and add the attributes it uses, in the order you like. **Every attribute of a category is a must**: a product without a value for one of them waits in **Needs info** and is not sent to websites. A category you take off the list holds its products in **Needs info** with "Missing: Category" until you choose another one for them.'),
      p('Before linking, Playbook counts the products that lack it — "12 products will need a Colour" — and offers **Link and let AI decide** (links it and asks the AI to choose a Colour for those 12), **Link only** or **Cancel**. Unlinking frees them again.'),
      h('3 · How products get their tags'),
      table(['Step', 'What happens'],
        ['**From the text**', 'When a product comes in (Telegram, Import from website) and again after the AI reads it, Playbook looks for your values and their "also known as" words in the name, the store\'s tags, the post and the facts. `COLOUR :- 2 (Pink, Wine)` gives Colour: Pink and Wine; `embroidery-work` gives Work: Embroidery; `Printed` and `print` count as the same word, and so do `Digitally` and `digital`. `Silk Chanderi` counts as Chanderi Silk (and beats plain Silk); `Mehendi Green` is a colour, not the Mehendi occasion.'],
        ['**Then the AI**', 'In the same read, the AI chooses from your lists only for the attributes the text left empty — the closest value when the photos or text support it (rani pink → Pink), never a word outside the list.'],
        ['**Still empty?**', 'The product stays in **Needs info** with "Missing: Colour". Tap **Let AI decide** on it, or choose yourself: it first looks for your words again (free, and the same answer every time), then asks the AI only for what is still empty. On **Products → Needs info**, **Let AI decide for N products** does them all in the background.'],
      ),
      h('4 · Suggestions and the look-alike guard'),
      list(
        '**Suggestions** collects words seen on products that are not in your lists yet — store tags such as `Kurtas & Suits`, words in posts, things the AI noticed — most seen first, with three example products each. Store codes like `_altnew_KBSUIT25` and `SIZE_CHART` never show up there.',
        'Each card shows its **Nearest match**: the closest value already in your lists. Shades, Hindi words and other spellings are found by the word rules (`Rani Pink` → Pink, `Jari Work` → Embroidery); for the rest the AI looks once, using what you filed before, and says why (`Kora Silk` → Art Silk, or "No close value: a store collection name"). Tap **Same as Art Silk** to file the word there in one tap.',
        '**+ Add to Colour** makes it a value in one tap; **Also known as…** files it under a value you choose; **Ignore** hides it for good. Tick several to add or ignore them together.',
        'Whenever a new word looks like an existing value — `Embroided` and `Embroidery`, `Sequin` and `Sequins`, `kala` and Black, `Rani Pink` and Pink — Playbook asks first: **Same thing — add as also known as** or **It\'s different — add as new**. A word that already belongs to another attribute (`Silk` under Work) gets "This looks like a Fabric value".',
        'The same check runs as you type in **Add a value**: the closest match shows under the field.',
      ),
      h('5 · On a product'),
      p('In **Facts → Tags** the values show by attribute: "Colour: Black · Work: Embroidery". Tap an attribute to change it; a tag shows **Auto** (found in the text), **AI** or **You**. What you choose is kept — the text rules and the AI never change it again. Choosing the last missing value makes the product **Ready** and sends it to its websites.'),
      h('6 · On websites'),
      p('A website\'s **Tags** section sends the values with `{tags}`: **Plain** (`Black`) or **Prefixed** (`Colour_Black`, using each attribute\'s Shopify prefix). New websites start with `{tags}` in their templates; **At most, per product** caps the list.'),
      tip('After adding values or "also known as" words, tap **Retag all products** on the Tags page: it first says how many products would change and how many would move between Ready and Needs info, then asks.'),
    ],
  },
];
