// Guide: "Tags" — the owner's own lists (Category → Attributes → Values),
// how auto-tagging works (text first, then the AI), required attributes and
// Needs info, "Let AI decide", new words filed by themselves and the look-alike guard, editing
// a product's tags, values that depend on the category (Product Type), and
// websites. Labels match Settings → Tags, the product
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
      p('Under **Categories**, tap a category (this is the same list the AI picks a category from — it used to sit on Settings) and add the attributes it uses, in the order you like. An attribute is a **Must have** (the switch in its settings, on by default): a product without a value for one waits in **Needs info** and is not sent to websites. Turn **Must have** off for one that does not suit every product — it becomes **only if it fits**: the AI chooses a value only when one of yours truly fits, and a product without it still goes to websites (Playbook has done this for **Product Type**). A category you take off the list holds its products in **Needs info** with "Missing: Category" until you choose another one for them.'),
      list(
        '**Rename** a category in its sheet: the new name follows everywhere — its products, the tags it needs, Product Type ticks and website rules.',
        '**Remove category** with products in it first asks where they go: pick a category and tap **Move to …**. They move, the old name leaves the list, and the word rules then the AI choose the tags the new category needs and they lack (Product Type…). **Remove without moving** leaves them waiting with "Missing: Category".',
        'Names no longer on the list that still have products show under **Waiting for a category** (for example Anarkali after you made it a Product Type of Salwar Suit): tap one to move its products.',
        'A move or a rename of two products or more can be taken back for 7 days on **Settings → Bulk changes**: each product that is still where the move put it goes back.',
      ),
      p('Before linking, Playbook counts the products that lack it — "12 products will need a Colour" — and offers **Link and let AI decide** (links it and asks the AI to choose a Colour for those 12), **Link only** or **Cancel**. Unlinking frees them again.'),
      h('3 · Values that depend on the category (Product Type)'),
      p('Some values only fit one kind of product: **Bridal Lehenga** is a Lehenga, **Banarasi Saree** a Saree, **Anarkali** a Salwar Suit. Edit the attribute (Playbook has made **Product Type** for this) and turn on **Values depend on the category**. Then tap each value and tick the categories under **Offered for**: the value is offered only to products of those categories — by the word rules, the AI and you — so a saree can never be tagged Bridal Lehenga.'),
      list(
        'On the Tags page the values show grouped under their categories. A value with **no category ticked is offered nowhere** until you tick one; the page marks it.',
        'Link **Product Type** to a category like any attribute. It is **only if it fits**: the AI picks a type only when one of the category\'s values truly fits the product (a plain lehenga is not made a Bridal Lehenga), else leaves it empty — and the product still goes to websites. Turn **Must have** on in its settings if every product should have one.',
        'Turning the switch on for an attribute that already has values ticks each of them for the categories that use the attribute now, so nothing changes until you untick. Turning it off offers every value everywhere again; the ticks are kept.',
        'A value left on a product from another category (say the product moved from Lehenga to Saree) no longer counts and is not sent as a tag: choose again, or tap **Let AI decide** on the product (a must-have one the AI chooses again by itself). The Shopify **Product type** field still gets the category.',
      ),
      h('4 · How products get their tags'),
      table(['Step', 'What happens'],
        ['**From the text**', 'When a product comes in (Telegram, Import from website) and again after the AI reads it, Playbook looks for your values and their "also known as" words in the name, the store\'s tags, the post and the facts. `COLOUR :- 2 (Pink, Wine)` gives Colour: Pink and Wine; `embroidery-work` gives Work: Embroidery; `Printed` and `print` count as the same word, and so do `Digitally` and `digital`. `Silk Chanderi` counts as Chanderi Silk (and beats plain Silk); `Mehendi Green` is a colour, not the Mehendi occasion. **Plain** under Work counts only when no other work is found — an embroidered lehenga with a plain blouse is Embroidery — and "a plain blouse" in the running text leaves Work to the AI, which looks at the photo.'],
        ['**Then the AI**', 'In the same read, the AI chooses from your lists for the attributes the text left empty. A must-have one gets its best judgement from the photos and text — rani pink → Pink, and the **Occasion** from the look of the product (a heavy bridal lehenga → Wedding) — never a word outside the list. An "only if it fits" one (Product Type) only when a value truly fits.'],
        ['**Still empty?**', 'No need to tap anything: within minutes of the read Playbook runs **Let AI decide** by itself, once per read — your words again first (free), then the AI, which must choose a value for every must-have attribute. The product then goes to **Ready**. You can still choose a tag yourself, or tap **Let AI decide** on a product to ask again. When automation is paused or today\'s AI limit is used up, they wait. **Products → Needs info → Let AI decide for N products** and **Tags → Tag existing products** (done of total, time left, why it waits) are still there for a batch you start yourself.'],
      ),
      h('5 · New words and the look-alike guard'),
      list(
        'A word seen on products that is not in your lists yet — a store tag such as `Kurtas & Suits`, a word in a post, something the AI noticed — is filed by itself, in batches: about 15 minutes after it is first seen (sooner when 20 come together), later while many products are being read. Nothing waits for you. Store codes like `_altnew_KBSUIT25` and `SIZE_CHART` are left out.',
        'A word that is surely the same as a value — another spelling or form, the Hindi word, a shade (`kala` → Black, `Rani Pink` → Pink) — becomes **also known as** that value at once. For the rest the AI chooses, using your lists and what they already hold: the same thing, or a kind of that value (`Kora Silk` → Art Silk, `Heavy Zari Work` → Embroidery), is filed there; a word only loosely related or not a product detail (`Red Border`, `Premium`, a store collection name), or one that names two of your values (`Sequins Embroidery` — each is found on its own), is ignored. An ignored word is not looked at again: if you later add a value for it, put the word in that value\'s "also known as". This counts towards the day\'s AI limit; when the limit is used up, automation is paused, or the AI is busy, new words wait and are tried later.',
        'Up to five of the products the word came from are tagged again straight away, so they pick up the value; **Retag all products** brings it to the rest. Each pass is one entry in **Settings → Bulk changes** ("Filed 40 new words by itself: …"): **Revert** takes it back for 7 days, and a word taken back is not filed again.',
        'New values come only from you, with **Add a value**. As you type, the closest existing value shows under the field, and when the new one looks like it — `Embroided` and `Embroidery`, `Sequin` and `Sequins` — Playbook asks first: **Same thing — add as also known as** or **It\'s different — add as new**. A word that already belongs to another attribute (`Silk` under Work) gets "This looks like a Fabric value".',
      ),
      h('6 · On a product'),
      p('In **Facts → Tags** the values show by attribute: "Colour: Black · Work: Embroidery". Tap an attribute to change it; a tag shows **Auto** (found in the text), **AI** or **You**. What you choose is kept — the text rules and the AI never change it again. Choosing the last missing value makes the product **Ready** and sends it to its websites.'),
      h('7 · On websites'),
      p('A website\'s **Tags** section sends the values with `{tags}`: **Plain** (`Black`) or **Prefixed** (`Colour_Black`, using each attribute\'s Shopify prefix). New websites start with `{tags}` in their templates; **At most, per product** caps the list.'),
      tip('After adding values or "also known as" words, tap **Retag all products** on the Tags page: it first says how many products would change and how many would move between Ready and Needs info, then asks.'),
    ],
  },
];
