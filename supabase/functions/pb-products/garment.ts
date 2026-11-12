// Pure: what Playbook knows about each kind of garment (owner, 2026-11-12,
// from the research report "Product listing SEO and AEO").
//   shopCategory   Shopify's standard category for a product, so Shopify, the
//                  Google channel and AI shopping assistants file it in the
//                  right place. The ids were read from Shopify's taxonomy on
//                  2026-11-12; a category Playbook cannot place sends none.
//   expectedFacts  the buying facts a shopper of that garment looks for (what
//                  is in the set and whether it is stitched, lengths, lining,
//                  care). The writer states the ones the product has and names
//                  the rest in missing_facts; nothing is ever filled in.
//   FACT_ORDER     the order of the fact bullets in every description.
// No I/O; tested in test/garment.test.mjs.

type Kind = 'saree' | 'lehenga' | 'dupatta' | 'blouse' | 'kurta' | 'anarkali' | 'suit' | 'gown' | 'coord';

const KINDS: [Kind, RegExp][] = [
  ['saree', /\b(?:sarees?|saris?)\b/i],
  ['lehenga', /\b(?:lehengas?|lehngas?|lenghas?|ghagras?|chaniya)\b/i],
  ['dupatta', /\b(?:dupattas?|chunnis?|stoles?)\b/i],
  ['blouse', /\bblouses?\b/i],
  ['anarkali', /\banarkalis?\b/i],
  ['kurta', /\b(?:kurtas?|kurtis?)\b/i],
  ['suit', /\b(?:salwar|shalwar|suits?)\b/i],
  ['gown', /\b(?:gowns?|dress(?:es)?)\b/i],
  ['coord', /\bco-?ords?\b/i],
];

/** The kind of garment a Playbook category names ("Kurta Set" → kurta); null when it names none we know. */
export const garmentKind = (category: unknown): Kind | null => KINDS.find(([, re]) => re.test(String(category ?? '')))?.[0] ?? null;

const TAXONOMY: Record<Exclude<Kind, 'anarkali'>, string> = {
  saree: 'aa-1-23-2-1',   // Saris
  lehenga: 'aa-1-23-2-2', // Lehengas
  dupatta: 'aa-2-31-4',   // Dupattas
  blouse: 'aa-1-13-1',    // Clothing Tops > Blouses
  kurta: 'aa-1-23-7',     // Kurtas & Kurta Sets
  suit: 'aa-1-23-10',     // Salwar Kameez & Suit Sets
  gown: 'aa-1-4',         // Dresses
  coord: 'aa-1-11',       // Outfit Sets
};
const WITH_BOTTOM = /dupatta|pant|bottom|palazzo|churidar|salwar|legging|sharara|trouser|plazo/i;

/** The Shopify standard category id for a product, or null. Shopify has no place for an anarkali:
 *  sold with a bottom or a dupatta it is a suit set, sold alone a dress. */
export function shopCategory(category: unknown, setContents: unknown = ''): string | null {
  const kind = garmentKind(category);
  if (!kind) return null;
  const id = kind === 'anarkali' ? (WITH_BOTTOM.test(String(setContents ?? '')) ? TAXONOMY.suit : TAXONOMY.gown) : TAXONOMY[kind];
  return `gid://shopify/TaxonomyCategory/${id}`;
}

const SET = 'each piece in the set and whether it is stitched, semi-stitched or unstitched';
const FACTS: Record<Kind, string[]> = {
  saree: ['the saree length', 'whether a blouse piece is included, its length and whether it is stitched', 'the fabric', 'the work and where it sits', 'care'],
  lehenga: [SET, 'the waist or size range', 'the lehenga length and flare', 'whether a can-can is attached', 'the dupatta fabric and length', 'care'],
  dupatta: ['the length and width', 'the fabric', 'the work or border', 'care'],
  blouse: ['whether it is stitched', 'the sizes', 'the sleeve length', 'the fabric and lining', 'care'],
  anarkali: [SET, 'the length and flare', 'the sleeve length', 'the lining', 'the dupatta fabric and length', 'the bottom type', 'care'],
  kurta: [SET, 'the kurta length', 'the sleeve length', 'the bottom type', 'the dupatta fabric and length when one is included', 'care'],
  suit: [SET, 'the top length', 'the sleeve length', 'the bottom type', 'the dupatta fabric and length', 'care'],
  gown: ['the length', 'the sleeve length', 'the lining', 'whether it is stitched', 'care'],
  coord: [SET, 'the top length', 'the bottom type and length', 'the lining', 'care'],
};
const ANY = ['what is in the set', 'the sizes', 'the fabric', 'care'];

/** What a shopper of this garment expects to be told (for the writer's fact bullets and its missing_facts). */
export const expectedFacts = (category: unknown): string[] => { const k = garmentKind(category); return k ? FACTS[k] : ANY; };

/** The order of the fact bullets, the same on every listing. */
export const FACT_ORDER = 'what is in the set (each piece, stitched or unstitched), fabric and lining, measurements, the work and where it sits, pattern, sizes, care';
