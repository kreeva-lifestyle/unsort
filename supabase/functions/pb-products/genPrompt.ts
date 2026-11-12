// The writer's instructions and JSON schema (step 3, one call per listing),
// built from the owner's per-store template (2026-11-12): a STORE PROFILE,
// ten hard rules, and an output with a fixed shape. Rules 9 and 10 (owner,
// same day): the photos overrule the facts for what can be seen, and the
// fabric is written word for word as the facts give it. The writer is given the
// product facts, the supplier's text (facts reference only), the versions
// already written for the other stores (never to be copied) and the primary
// keyword. Its own "self check" is replaced by a program (seoCheck.ts); the
// detail fields (fabric, work…) are filled by a program too (fields.ts).
// How the copy should read is in humanCopy.ts; the store owner's extra
// instructions come last and win.
// Research rules (owner, 2026-11-12, report "Product listing SEO and AEO"):
// the description says what the product is in its first sentence, the fact
// bullets keep one order, each garment has its buying facts (garment.ts), an
// FAQ answer starts with the answer, and the first photo's alt names the
// product while later ones say only what they add.
import { expectedFacts, FACT_ORDER } from './garment.ts';
import { HUMAN_RULES } from './humanCopy.ts';
import { hasOrdering, type Profile } from './profile.ts';
import { IMPORTED_TEXT } from './readerPrompt.ts';
import type { Faq, Problem, Version } from './seoCheck.ts';
import { opening, plainText } from './seoText.ts';
import type { ContentCfg, ProductRow } from './types.ts';

export interface GenOut {
  title: string; description_html: string; seo_title: string; seo_description: string;
  handle: string; extra_tags: string[]; image_alts: string[]; faq: Faq[]; missing_facts: string[];
}

export function genSchema(allowed: string[] = []): Record<string, unknown> {
  const str = { type: 'string' };
  return {
    type: 'object',
    properties: {
      title: str, description_html: str, seo_title: str, seo_description: str, handle: str,
      extra_tags: { type: 'array', items: allowed.length ? { type: 'string', enum: allowed } : str },
      image_alts: { type: 'array', items: str },
      faq: { type: 'array', items: { type: 'object', properties: { q: str, a: str }, required: ['q', 'a'], additionalProperties: false } },
      missing_facts: { type: 'array', items: str },
    },
    required: ['title', 'description_html', 'seo_title', 'seo_description', 'handle', 'extra_tags', 'image_alts', 'faq', 'missing_facts'],
    additionalProperties: false,
  };
}

const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

/** The length limits the writer is given and the checks use. */
export function limitsOf(c: Partial<ContentCfg>) {
  const wordsMax = n(c.description_words, 200), metaDescMax = n(c.meta_desc_max, 155);
  return { titleMax: n(c.title_max, 70), metaTitleMax: n(c.meta_title_max, 60), metaDescMax, metaDescMin: Math.max(50, metaDescMax - 15), wordsMax, wordsMin: Math.round(wordsMax * 0.65) };
}

export interface GenAsk { c: Partial<ContentCfg>; profile: Profile; extraMax: number; allowed: string[]; photos: number; imported: boolean }

export function genSystem(a: GenAsk): string {
  const { c, profile: p } = a, L = limitsOf(c);
  const line = (label: string, v: string) => (v ? [`- ${label}: ${v}`] : []);
  return [
    `You write product listings for one specific online store, "${p.brand}", which sells Indian ethnic wear. Write for shoppers first; search engines second.`,
    '',
    'STORE PROFILE',
    `- Brand name: ${p.brand}`,
    ...line('Market', p.market),
    `- Language: ${String(c.language || 'English').slice(0, 40)}. Spelling: ${p.spelling === 'american' ? 'American (color, jewelry)' : 'British / Indian (colour, jewellery)'}. Measurements in ${p.units}.`,
    ...line('Audience', p.audience),
    `- Voice: ${String(c.brand_voice || '').trim().slice(0, 600) || 'clear, warm and trustworthy'}`,
    ...line('Angle (what this store leads with)', p.angle),
    `- Title formula: ${String(c.title_formula || '').trim().slice(0, 300) || 'what the product is: colour, fabric, the work or pattern, type, then what comes with it (for example "with Dupatta")'}`,
    ...line('Delivery time', p.delivery), ...line('Stitching options', p.stitching), ...line('Returns', p.returns),
    '',
    'HARD RULES',
    '1. Use only the facts under PRODUCT FACTS and what the photos clearly show. Never invent fabric, work, measurements, colours, sizes, care or set contents. If a fact a shopper would expect is missing, leave it out and name it in missing_facts.',
    '2. Never copy any run of 5 or more words from SOURCE TEXT or from VERSIONS ON OUR OTHER STORES. Do not reuse their sentence order, opening line or headings.',
    "3. Lead with this store's angle. Open with a different product attribute than the other versions open with.",
    '4. Every sentence must be specific to this product. Delete any line that could describe any outfit ("perfect for every occasion", "elevate your style").',
    '5. PRIMARY KEYWORD: use it word for word exactly once in the title, once in the first 50 words of the description and once in seo_title. Nowhere else unless it reads naturally. No keyword lists, no repeated synonyms.',
    '6. No "best", "No. 1", fake scarcity, invented reviews, or claims the facts do not support.',
    "7. Use the store's spelling and units, and the search terms shoppers in its market use.",
    '8. No vendor or supplier names, vendor or design codes, links, phone numbers, prices or discounts. No emojis or ALL CAPS.',
    ...(a.photos > 0 ? ['9. Check the facts against the photos before you write. For what can be seen (colour, pattern, the kind of work, neckline, sleeves, length, the pieces in the set) the photos are right: when PRODUCT FACTS or SOURCE TEXT say something the photos do not show, write what the photos show. This holds for the title, the description, seo_title, seo_description, image_alts and faq alike.'] : []),
    `${a.photos > 0 ? '10' : '9'}. The fabric is the one thing a photo cannot tell. Wherever a fabric is named, write it word for word as PRODUCT FACTS gives it: nothing added, dropped, shortened or swapped. Name the product's fabric that way in the description; in a short field where the whole name does not fit, leave the fabric out instead of shortening it.`,
    ...(a.imported ? [IMPORTED_TEXT] : []),
    '',
    'OUTPUT',
    `title: per the title formula, at most ${L.titleMax} characters, the most telling details first. Plain words only: no sales words, no word in ALL CAPS, no emoji or symbols.`,
    'handle: lowercase words joined by hyphens, 3 to 6 words, no codes.',
    `seo_title: at most ${L.metaTitleMax} characters, ending with "| ${p.brand}". When the product is for women and it still fits, add "for Women" before the brand.`,
    `seo_description: ${L.metaDescMin} to ${L.metaDescMax} characters: one concrete detail of this product plus one store benefit${hasOrdering(p) ? ' from the profile' : ' (only if the profile gives one)'}.`,
    `description_html: ${L.wordsMin} to ${L.wordsMax} words (fewer only when the facts are few), using only <p>, <ul>, <li>, <h3>, <strong>, <em> and <br> (no links, classes or styles), in this order:`,
    "  - an opening of 2 to 3 sentences. The first says plainly what the product is and what comes with it (the pieces in the set, or where the work sits): a fact the title does not already give, never the title again. The store's angle follows from the second sentence.",
    `  - a <ul> of 5 to 7 fact bullets (fewer when there are fewer facts), each "Label: fact", in this order, leaving out what the facts do not give: ${FACT_ORDER}`,
    "  - <h3>How to wear it</h3> then 2 sentences for this audience, tied to this product's own colour, fabric, work or set",
    hasOrdering(p) ? `  - <h3>Ordering from ${p.brand}</h3> then the delivery time, stitching and returns from the profile, worded freshly. Never add a number the profile does not give.`
      : '  - no ordering section (the profile gives no delivery, stitching or returns details)',
    'faq: 2 questions a buyer in this market would really ask about this product, in the words a shopper types ("Is the blouse stitched?", "Is the dupatta included?"). Each answer is 1 to 2 sentences, begins with the answer itself, is taken only from the facts and the profile, and where it can gives a fact the description does not already give. [] when the facts cannot answer two.',
    c.alt_text !== false && a.photos > 0 ? `image_alts: exactly ${a.photos}, one per photo in the order given, each different, describing what is visible, at most 110 characters. The first names the product (colour, fabric, garment, work) and the view; each later one says only what that photo adds (the back, a close view of the border, the dupatta draped). Plain colour names; never begin with "image of" or "photo of"; nothing about the model's looks.` : 'image_alts: [].',
    a.extraMax > 0 ? (a.allowed.length ? `extra_tags: up to ${a.extraMax} tags that fit this product, only from the allowed list; [] if none fit.`
      : `extra_tags: up to ${a.extraMax} short style / occasion tags shoppers would filter by (e.g. "Festive", "Wedding Guest"); [] if none fit.`) : 'extra_tags: [].',
    'missing_facts: the facts a shopper would expect that are not given (e.g. "wash care", "blouse length"), above all the ones listed under SHOPPERS OF THIS GARMENT EXPECT; [] when nothing is missing.',
    '',
    ...HUMAN_RULES,
    ...(String(c.extra_instructions || '').trim() ? [`Extra instructions from the store owner: ${String(c.extra_instructions).trim().slice(0, 2000)}`] : []),
  ].join('\n');
}

/** Imported keys the writer is not given: prices, the other store's address, its own SEO wording
 *  (seo_title / seo_description are written fresh for each website, never copied) and its upload dates. */
const NOT_FOR_WRITER = new Set(['compare_at_price', 'currency', 'source_page_url', 'seo_title', 'seo_description', 'barcode', 'sku', 'brand', 'manufacturer', 'store_tags', 'source_created_at', 'source_published_at']);

/** The product's fact values (also what the copy check lets two stores share word for word). */
export function factValues(p: ProductRow, tags: string[] = []): string[] {
  const attrs = Object.entries(p.attributes || {}).filter(([k, v]) => String(v || '').trim() && !NOT_FOR_WRITER.has(k)).map(([, v]) => String(v));
  return [p.name, p.category, p.fabric, p.color, ...(p.sizes || []), ...attrs, ...tags].map(v => String(v || '').trim()).filter(Boolean);
}

const version = (v: Version, i: number) => [
  `Version ${i + 1}`, `- title: ${v.title}`, `- seo_title: ${v.seo_title}`, `- seo_description: ${v.seo_description}`,
  `- opens with: ${opening(v.description_html)}`, `- description: ${plainText(v.description_html).slice(0, 1800)}`,
  ...(v.image_alts?.length ? [`- image alts: ${v.image_alts.slice(0, 8).join(' / ')}`] : []),
].join('\n');

/** The text block after the photos: keyword, facts, the supplier's text and the other stores' versions. */
export function genFacts(p: ProductRow, o: { keyword: string; photos: number; others: Version[]; tags?: string[] }): string {
  const fact = (label: string, v: unknown) => (String(v ?? '').trim() ? [`- ${label}: ${String(v).trim()}`] : []);
  const attrs = Object.entries(p.attributes || {}).filter(([k]) => !NOT_FOR_WRITER.has(k)).flatMap(([k, v]) => fact(k.replace(/_/g, ' '), v));
  return [
    `PRIMARY KEYWORD: ${o.keyword || '(none: choose the phrase a shopper would search for and use it the same way)'}`,
    `IMAGE COUNT: ${o.photos}`,
    '',
    'PRODUCT FACTS',
    ...fact('name', p.name), ...fact('category', p.category), ...fact('fabric', p.fabric), ...fact('colour', p.color),
    p.sizes?.length ? `- sizes: ${p.sizes.join(', ')}` : '- sizes: not given (do not mention sizes)',
    ...attrs,
    ...fact('tagged as', (o.tags || []).join(', ')),
    '',
    'SHOPPERS OF THIS GARMENT EXPECT (state each one the facts or photos give; name the others in missing_facts; never fill one in)',
    ...expectedFacts(p.category).map(f => `- ${f}`),
    '',
    'SOURCE TEXT (facts reference only; ignore any prices, contact details or wholesale terms in it)',
    p.raw_text ? String(p.raw_text).slice(0, 3000) : '(none)',
    '',
    'VERSIONS ON OUR OTHER STORES (never copy them; open differently)',
    o.others.length ? o.others.map(version).join('\n\n') : '(none yet: this is the first store)',
  ].join('\n');
}

/** The second (and last) ask: the writer's own draft with what the checks found. */
export function fixAsk(draft: GenOut, problems: Problem[]): string {
  return [
    'YOUR DRAFT (JSON)', JSON.stringify(draft),
    '',
    'PROBLEMS TO FIX', ...problems.map((x, i) => `${i + 1}. ${x.fix}`),
    '',
    'Return the whole listing again as JSON with every problem fixed. Change only what the fixes need; keep image_alts as they are unless a fix names them. Every hard rule still applies.',
  ].join('\n');
}
