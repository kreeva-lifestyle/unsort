// Guide: "Already added?" — how Playbook notices a product that is already
// here (design code + colour, and the same photo saved again), what the three
// answers do, clearing many copies together, and the source label / Source
// filter on Products.
import { type GuideSection, h, list, p, table, tip } from '../types';

export const COPIES: GuideSection[] = [
  {
    id: 'copies',
    short: 'Already added?',
    title: 'Already added? — copies, colours and where a product came from',
    lead: 'The same design often arrives twice: in a vendor\'s Telegram post and again from a website, or in two posts. Playbook compares every product with the ones already here — by its design code, and by its photos — so one design is not listed twice.',
    blocks: [
      h('What it does by itself'),
      table(['It finds', 'What happens', 'What you do'],
        ['The very same post or page again (the same Telegram message, the same page of a website, typed with or without "www")', 'It is not added a second time. An import counts it as **already here**', 'Nothing'],
        ['The same design code from the **same vendor**, in the same colour or with no colour given (`KB 302` and `KB 302 XS Blue`)', 'The later one waits in **Needs info · Already here as KB 302 XS Blue**. Nothing is written for the websites', 'Open it and answer (below)'],
        ['The same code from the same vendor in a **different colour** (`KB 264 Wine` and `KB 264 Royal Blue`)', 'Nothing waits: each colour is its own product. The product page lists the other colours under **Same design**', 'Nothing'],
        ['A near match: the same code at **another vendor**, the same number with other letters (`KB 25` and `NKB 25`), or a code that is only a number (`D no 5081` twice)', 'Nothing waits. The product page asks **Could this be already added?**, and its row in Products says **May be a copy of …**', 'Answer when you see it'],
        ['The **same photo** on two products — saved again at another size or quality — when their codes say nothing (no code, or different codes)', 'Nothing waits. The product page asks **Could this be already added?** and shows the photo that matched, marked **Same photo**; its row in Products says **May be a copy of … · same photo**', 'Answer when you see it'],
        ['A vendor\'s new post that brings a **sold-out product back in stock** (also when the code is only a number)', 'The earlier product is on sale again, and the new post waits in **Needs info · Already here as …** like any copy', 'Open it and answer (below)'],
      ),
      h('How the code is read'),
      list(
        'From the **SKU**: letters, then numbers. `KB 302`, `KB-302`, `kb302` and `KB 302 XS Blue` are all the design **KB 302** — spaces, dashes and capitals do not matter, and size or colour words after the code are not part of it.',
        'The colour is the words after the code (`KB 264 ROYAL BLUE XS` → royal blue); when there are none, the product\'s **Colour**.',
        'A product without a SKU is never held back.',
      ),
      h('How photos are compared'),
      list(
        'Each photo is checked once, in the background, a few minutes after the product arrives. No AI is used and it costs nothing.',
        'It recognises the **same picture** saved again: smaller, larger, more compressed, a little brighter, or turned upright from a phone. A different photo of the same dress is **not** matched, and neither is a cropped or mirrored copy.',
        'It does not look at colour, so the same pose in another colour can match — that is why a photo match only asks, and never holds a product by itself.',
        'A picture that is on many products (a size chart, a banner) is ignored. JPEG photos only; PNG and WEBP photos are not compared.',
      ),
      h('Answering'),
      p('A product that waits shows **This looks already added** with the earlier product (photo, code, colour, where it came from). Tap the earlier product to open it and compare, then answer:'),
      table(['Button', 'What it does'],
        ['**It is a copy**', 'Archives this product; the earlier one stays. **Restore** brings it back.'],
        ['**Another colour**', 'Keeps both as separate products. This one becomes Ready and goes to the websites.'],
        ['**Different product**', 'Keeps both — for two designs that happen to share a code. This one becomes Ready and goes to the websites.'],
      ),
      list(
        'An answer is remembered: the same two products are never asked about again.',
        'Nothing is merged or deleted, on either product.',
        'Tapped the wrong answer? **Archive** the copy yourself.',
      ),
      h('Many copies at once'),
      list(
        '**Products → Needs info** says how many products are waiting as copies. **Show only these** lists them alone (also under **More statuses → Waiting as copies**).',
        '**Archive the copies** first tells you what it would do, and does nothing until you confirm. It then does exactly that: it archives the copies that have nothing of their own.',
        'It leaves three kinds for you to open: a copy that came with a **different price** from the product you have (the vendor may have changed the rate — type the new cost on the earlier product first), a copy that is **already on a website**, and copies that are **tied to another waiting copy** (one waits as a copy of the other — it happens when a post came without its colour; open the earlier of the two and answer it first).',
        'Nothing is deleted and nothing changes on your websites. **Settings → Bulk changes → Revert** brings them back to Needs info for 7 days, where they wait as copies again; **Restore** on one product reads it again and treats it as its own product.',
      ),
      h('Where a product came from'),
      list(
        'Each product on **Products** says where it came from: "from Telegram" or "from bahupalace.com". A product you typed in shows nothing.',
        'The **Source** filter lists only the products from Telegram, typed in, or copied from one website.',
      ),
      tip('Give vendors\' products their design code as the SKU (the AI reads it from the post). Without a code only the photos can be compared.'),
    ],
  },
];
