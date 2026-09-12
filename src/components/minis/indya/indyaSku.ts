// Indya Import — the key rules, pure so the harness can drive them against
// the real report. Indya's master carries our design code as VendorSKU,
// sometimes with a size glued on by mistake ("TF-343-XL" listed for size
// S), and the size in its own column. The vendor stock sheets are keyed
// "CODE-SIZE" (Odette's world). So the lookup key is
//   strip-size(VendorSKU) + '-' + Size, or the bare code for Unstitched.
//
// Facts from the real file that shaped these rules (all verified):
//  - only a trailing DASH-separated token is a size; "-MAROON", "-PUPLE",
//    "-136" are not, and a code ending in a bare "M" is a word, not a size
//    (owner's rule) — except when a digit precedes it ("TF353M"), which can
//    never be a word. A glued size after digits is ambiguous ("TF3052XL" is
//    TF305+2XL or TF3052+XL), so the row's own Size column decides when it
//    can, else the shortest token (longest base) wins;
//  - some suffixed codes are GENUINE listings ("43002", "43002-M" and
//    "43002-XL" each have a full size run), so the raw code + size is tried
//    BEFORE the stripped code + size — the raw form cannot collide with
//    another design's sized key;
//  - Indya writes 2XL…10XL, suppliers write XXL…, so both spellings are
//    tried; the exported Size cell is never changed;
//  - dashes are unreliable on both sides ("TF345XL" and "TF-345-XL" are the
//    same code; a supplier may write "TF356L"), but simply deleting them
//    collides: "DRS5-2XL" and "DRS52-XL" both become DRS52XL. The SHAPE key
//    keeps every letter/digit run and every separator as a boundary
//    (DRS|5|2|XL vs DRS|52|XL), so two spellings of one code share a shape
//    and two different codes never do.

const BASE_TOKENS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'FREE', 'FREESIZE'];
/** n → ['2XL', 'XXL'] for n = 2..10 — the two spellings of the same size. */
const NXL: [string, string][] = Array.from({ length: 9 }, (_, i) => [`${i + 2}XL`, 'X'.repeat(i + 2) + 'L']);
export const SIZE_TOKENS: ReadonlySet<string> = new Set([...BASE_TOKENS, ...NXL.flat()]);
/** Shortest first, so a glued strip leaves the longest base ("TF345XL" → TF345, not TF34). */
const TOKENS_SHORT_FIRST = [...SIZE_TOKENS].sort((a, b) => a.length - b.length || a.localeCompare(b));
const NO_SIZE = new Set(['UNSTITCHED', 'SEMISTITCHED', 'FREESIZE', 'STANDARD']);
const SEP = /[-_\s./]+/;

export const normKey = (s: unknown): string => String(s ?? '').trim().toUpperCase();
/** Letter/digit runs with separators as boundaries: "TF-345-XL" and "TF345XL" → "TF|345|XL";
 *  "DRS5-2XL" → "DRS|5|2|XL" but "DRS52-XL" → "DRS|52|XL". */
export const shapeKey = (s: unknown): string =>
  normKey(s).split(SEP).filter(Boolean).flatMap(t => t.match(/[A-Z]+|[0-9]+|[^A-Z0-9]+/g) || []).join('|');
export const decodeEntities = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

/** "Unstitched", "Semi-Stitched", "Free Size" … — sizes that are not sizes. */
export const isNoSize = (size: string): boolean => NO_SIZE.has(normKey(size).replace(/[^A-Z]/g, ''));

/** 3XL and up, either spelling (3XL / XXXL … 10XL). Owner: vendors do not
 *  make anything above XXL — these rows are left out of the SKU sheet and
 *  their stock is written as 0 without any lookup. */
export const isAboveXXL = (size: string): boolean => {
  const s = normKey(size);
  const m = /^(\d{1,2})XL$/.exec(s);
  if (m) return Number(m[1]) >= 3;
  return /^X{3,}L$/.test(s);
};

/** Both spellings of a size, the given one first: 2XL ↔ XXL … 10XL ↔ XXXXXXXXXXL. */
export function sizeSpellings(size: string): string[] {
  const s = normKey(size);
  for (const [n, x] of NXL) {
    if (s === n) return [n, x];
    if (s === x) return [x, n];
  }
  return [s];
}

const gluedAfterDigit = (c: string, token: string) => c.length > token.length && c.endsWith(token) && /\d/.test(c[c.length - token.length - 1]);

/** Drop a trailing size token. Dash-separated: "KB-272-GREEN-S" → "KB-272-GREEN".
 *  Glued after a digit: "TF353M" → "TF353". With the row's size given, a glued
 *  token spelled like that size is preferred ("TF3052XL" + 2XL → "TF305").
 *  Anything else — colours, numbers, words — is left alone. */
export function stripSize(code: string, size?: string): string {
  const c = normKey(code);
  const dash = c.lastIndexOf('-');
  if (dash >= 0) {
    const tail = c.slice(dash + 1).trim();
    if (SIZE_TOKENS.has(tail)) return c.slice(0, dash).trim();
    return c;
  }
  if (size) for (const t of sizeSpellings(size)) if (gluedAfterDigit(c, t)) return c.slice(0, -t.length);
  for (const t of TOKENS_SHORT_FIRST) if (gluedAfterDigit(c, t)) return c.slice(0, -t.length);
  return c;
}

export const baseOf = (vendorSku: string, size?: string): string => stripSize(vendorSku, size);

/** A design code with no size on it — what the SKU map accepts on both sides. */
export const isCodeOnly = (v: string): boolean => { const n = normKey(v); return !!n && stripSize(n) === n; };

/** The code a master row is looked up under, after the SKU map. The map
 *  holds codes only, so the row's VendorSKU is tried as sent, then with its
 *  stuck-on size dropped, each strictly and then by shape. A correction
 *  sheet may also map an Indya SKU directly (bySku). */
export function resolveCode(vendorSku: string, size: string, indyaSku: string,
  c?: { bySku: Map<string, string>; byVendor: Map<string, string>; byShape?: Map<string, string> } | null): { code: string; corrected: string | null } {
  if (!c) return { code: vendorSku, corrected: null };
  const raw = normKey(vendorSku), base = stripSize(raw, size);
  const hit = c.bySku.get(normKey(indyaSku)) ?? c.byVendor.get(raw) ?? c.byVendor.get(base)
    ?? c.byShape?.get(shapeKey(raw)) ?? c.byShape?.get(shapeKey(base)) ?? null;
  return hit ? { code: hit, corrected: hit } : { code: vendorSku, corrected: null };
}

/** Every key worth trying for one master row, best first, no duplicates. */
export function lookupKeys(vendorSku: string, size: string): string[] {
  const raw = normKey(vendorSku);
  const base = stripSize(raw, size);
  if (isNoSize(size)) return [base];
  const out: string[] = [];
  for (const s of sizeSpellings(size)) {
    out.push(`${raw}-${s}`);
    if (base !== raw) out.push(`${base}-${s}`);
  }
  return [...new Set(out)];
}
