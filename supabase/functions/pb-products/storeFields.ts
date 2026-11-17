// Pure: what Playbook sets up on a Shopify store (owner, 2026-11-17: "make all collections as per categories in
// playbook" and "Product Specifications & Custom Attributes (Metafields) as per playbook"; storeSetup.ts does it).
//   Product fields (metafields, namespace `custom`): one per Playbook attribute — its key in snake case (Colour →
//   colour, Product Type → product_type); an attribute that takes several values (Work, Occasion) is a list — plus
//   the two Playbook always sent: set_contents and faq (the questions). Publishing fills them (fields.ts).
//   Collections: one per Playbook category, filled by Shopify itself from the product type Playbook sends (the
//   category: productInput.ts), handle from the name ("Pre-Stitched Saree" → pre-stitched-saree).
// No I/O — tested in test/storeSetup.test.mjs.

export interface AttrDef { key: string; name: string; multi: boolean }
export interface FieldDef { key: string; name: string; type: string; description: string }

export const TEXT = 'single_line_text_field';
export const LIST = 'list.single_line_text_field';
export const RICH = 'rich_text_field';

/** "product type" → "product_type" (Shopify keys: letters, digits, _ and -, 2 to 64 long). */
export const fieldKey = (k: string) => String(k ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);

const OWN = ['set_contents', 'faq'];

/** The product fields for these attributes (in their order), then set_contents and faq. */
export function fieldDefs(attrs: AttrDef[]): FieldDef[] {
  const out: FieldDef[] = [], seen = new Set(OWN);
  for (const a of attrs) {
    const key = fieldKey(a.key || a.name);
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: a.name.slice(0, 255), type: a.multi ? LIST : TEXT, description: `${a.name} from Playbook: the product's ${a.name} tags.`.slice(0, 255) });
  }
  out.push({ key: 'set_contents', name: 'Set contents', type: TEXT, description: 'What the set includes, from Playbook.' });
  out.push({ key: 'faq', name: 'Questions', type: RICH, description: 'Questions and answers about the product, written by Playbook.' });
  return out;
}

/** "Pre-Stitched Saree" → "pre-stitched-saree"; accents dropped; other scripts give "" (no handle sent: Shopify makes one). */
export const collectionHandle = (c: string) => String(c ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 255);

/** collectionCreate's input (API 2026-07 and later: sources, not the old ruleSet): every product whose product type
 *  is exactly the category. */
export const collectionInput = (category: string) => {
  const handle = collectionHandle(category);
  return {
    title: category, ...(handle ? { handle } : {}),
    sources: [{ source: { title: `Product type ${category}`.slice(0, 255), targetType: 'PRODUCTS', inclusion: { matchType: 'ALL', conditions: [{ productType: { relation: 'EQUALS', values: [category], matchType: 'ANY' } }] } } }],
  };
};

export interface Have { id: string; handle: string; title: string }
/** The store's collection for this category already: same handle, or same title (any case). */
export const sameCollection = (have: Have[], category: string) => {
  const h = collectionHandle(category), t = category.trim().toLowerCase();
  return have.find(c => (h && c.handle === h) || c.title.trim().toLowerCase() === t) ?? null;
};
