// One house format for a product's size labels (owner, 20 Nov 2026: "Sizes: they are named six different ways …
// solve these biggest issues with permanent fixes"). Before, a label was kept as its source wrote it, so one store
// showed "M (38)", "M", "38\"", "40 Size", "2XL" and "L Size, 40 Inch Stitched" side by side. Pure: no I/O.
//   LETTER | LETTER (N) | N | Free Size        anything else comes back as it is written, spaces tidied.
//   LETTER = XXS XS S M L XL XXL 3XL 4XL 5XL 6XL    (2XL -> XXL, XXXL -> 3XL, XXXXL -> 4XL), in capitals
//   N      = the whole number 20..60 the source gave (inches): no unit, no quote mark, no "Size" / "Inch" word
// Nothing is ever added (owner's writer rule: "Never invent a … size, measurement"): "M" stays "M", because a
// supplier's M is not always 38 (one imported product's own chart says M = 30), and a bare number stays a number,
// because 34 can be a bust or a waist. "M (38)" keeps the inches its supplier gave (owner, 12 Nov 2026: the
// measurement written with a size is kept).
// Used at every write of pb_products.sizes (import/body.ts, reader.ts; the app's copy src/playbook/data/sizes.ts for
// the product page and Add product, held equal by test/sizesMirror.test.mjs), and again at the send
// (productInput.ts), so a store can never show another format whatever a row still holds.
export const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'];
interface Parsed { kind: 'letter' | 'number' | 'free'; letter: string; n: number | null }

const tidy = (v: unknown) => String(v ?? '').normalize('NFKC').replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201c\u201d\u2033]/g, '"').replace(/\s+/g, ' ').trim();

function letterOf(w: string): string {
  const s = w.toUpperCase();
  if (/^(XXS|XS|S|M|L|XL|XXL)$/.test(s)) return s;
  if (s === '2XL') return 'XXL';
  if (s === 'XXXL') return '3XL';
  if (s === 'XXXXL') return '4XL';
  return /^[3-6]XL$/.test(s) ? s : '';
}

/** Words that do not say WHICH size it is. */
const FILLER = new Set(['size', 'sizes', 'inch', 'inches', 'in', 'bust', 'chest', 'stitched']);
const FREE = new Set(['free size', 'freesize', 'free', 'fs']);

function parseSize(text: unknown): Parsed | null {
  const t = tidy(text);
  if (!t) return null;
  if (FREE.has(t.toLowerCase().replace(/[.\-_]+/g, ' ').replace(/\s+/g, ' ').trim())) return { kind: 'free', letter: '', n: null };
  // 38" / 38'' / 38in / 40Size: the number and its unit word apart. Letters glued to a number otherwise ("S20", "M38",
  // "KB302") are left alone: that is a code, not a shape this knows.
  const words = t.replace(/(\d)\s*(?:"|'')/g, '$1 inch ').replace(/(\d)(?=(?:in|inch|inches|size)\b)/gi, '$1 ').replace(/\b(size)(?=\d)/gi, '$1 ')
    .split(/[\s()[\],/:;|\-\u2013\u2014_.]+/).filter(Boolean); // "+" and "&" stay: "XL+" is not "XL"
  const joined: string[] = [];
  for (let i = 0; i < words.length; i++) { // "2 XL" is the one word "2XL"
    if (/^[2-6]$/.test(words[i]) && /^xl$/i.test(words[i + 1] || '')) { joined.push(words[i] + words[i + 1]); i++; } else joined.push(words[i]);
  }
  let letter = '', n: number | null = null;
  for (const w of joined) {
    if (FILLER.has(w.toLowerCase())) continue;
    const l = letterOf(w);
    if (l) { if (letter) return null; letter = l; continue; }      // "M/L" is not one size
    if (/^\d{2}$/.test(w) && Number(w) >= 20 && Number(w) <= 60) { if (n !== null) return null; n = Number(w); continue; }
    return null;                                                    // any other word: a shape this does not know
  }
  return letter ? { kind: 'letter', letter, n } : n !== null ? { kind: 'number', letter: '', n } : null;
}

/** One label in the house format; a shape it does not know comes back as it is written (spaces tidied). */
export function normalizeSize(text: unknown): string {
  const p = parseSize(text);
  if (!p) return String(text ?? '').replace(/\s+/g, ' ').trim(); // as written: "5½ Mtr" stays "5½ Mtr"
  if (p.kind === 'free') return 'Free Size';
  if (p.kind === 'letter') return p.n === null ? p.letter : `${p.letter} (${p.n})`;
  return String(p.n);
}

/** What two labels of ONE size share (for giving a renamed size its own Shopify variant back): [the letter, else the
 *  number, else the label without its bracket part; the number alone when it has one]. Lower-case. */
export function sizeKeys(text: unknown): [string, string] {
  const p = parseSize(text);
  if (!p) return [tidy(text).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(), ''];
  if (p.kind === 'free') return ['free size', ''];
  return [p.kind === 'letter' ? p.letter.toLowerCase() : String(p.n), p.n === null ? '' : String(p.n)];
}

const rank = (label: string): [number, number] => {
  const p = parseSize(label);
  if (!p) return /^\d{1,3}$/.test(label) ? [1, Number(label)] : [3, 0]; // a bare number outside 20..60 ("16", "62") sorts with the numbers
  return p.kind === 'letter' ? [0, LETTERS.indexOf(p.letter) * 100 + (p.n ?? 0)] : p.kind === 'number' ? [1, p.n as number] : [2, 0];
};

/** A product's sizes in the house format: each label normalised, the same label kept once (case ignored), in a fixed
 *  order: letters XXS to 6XL, numbers rising, Free Size, then the shapes it does not know in the order they came. */
export function normalizeSizes(list: unknown): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const s = normalizeSize(raw).slice(0, 40).trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase()); out.push(s);
  }
  return out.map((s, i) => ({ s, i, r: rank(s) })).sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i).map(x => x.s).slice(0, 30);
}
