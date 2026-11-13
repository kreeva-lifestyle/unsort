// Pure text helpers for the tag taxonomy (no I/O; test/tagText.test.mjs).
//   tagKey   the stored key of a value name or alias: lower case, accents off
//            (é → e; Devanagari vowel signs are KEPT — only the Latin combining
//            accents U+0300–036F are dropped), punctuation → space, one space
//            between words. "Embroidery-Work!" → "embroidery work".
//   stem     a small English stemmer for one Latin word, enough to treat
//            plurals and -ed / -ing / -ery forms as the same word:
//            sequins → sequin, printed / printing / prints → print,
//            embroidered / embroidery / embroideries → embroider, patches → patch,
//            digitally → digital.
//            Words of 3 letters or fewer and non-Latin words are left alone.
//   stemKey  tagKey + stem on every word ("Embroidered Sarees" → "embroider saree").
//   words    stemmed words of a text, in order (the matcher's token stream).

export const tagKey = (s: unknown): string =>
  String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const VOWEL = /[aeiou]/;
// Words that only look like an -ing form: cut down they become another everyday word, and a value such as
// "Evening" or "Wedding" would then be found in "even for daily wear" or "we wed tradition with style".
const WHOLE = new Set(['evening', 'wedding', 'shirting', 'suiting', 'lining', 'morning', 'legging', 'clothing', 'bedding', 'stocking']);

export function stem(w: string): string {
  let s = w;
  if (s.length <= 3 || !/^[a-z]+$/.test(s)) return s;
  if (WHOLE.has(s)) return s;
  if (s.endsWith('s') && WHOLE.has(s.slice(0, -1))) return s.slice(0, -1); // evenings, leggings
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (/(ches|shes|xes|sses)$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith('ing') && s.length > 5 && VOWEL.test(s.slice(0, -3))) s = undouble(s.slice(0, -3));
  else if (s.endsWith('ed') && s.length > 4 && VOWEL.test(s.slice(0, -2))) s = undouble(s.slice(0, -2));
  if (s.endsWith('ery') && s.length > 5) s = s.slice(0, -1);
  if (s.endsWith('ally') && s.length > 6) s = s.slice(0, -2); // digitally → digital ("Digitally Printed" is Digital Print)
  return s;
}
/** wedd → wed, stopp → stop (but not "dress" / "fill": ss / ll stay). */
const undouble = (s: string) => (/([^aeioulsz])\1$/.test(s) ? s.slice(0, -1) : s);

export const words = (s: unknown): string[] => tagKey(s).split(' ').filter(Boolean).map(stem);
export const stemKey = (s: unknown): string => words(s).join(' ');

/** Display form of a name staff typed: trimmed, one space, Title Case when typed all lower or all upper. */
export function displayName(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  if (!s || !/\p{L}/u.test(s)) return s;
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Damerau–Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Jaro–Winkler similarity, 0..1 (prefix scale 0.1, up to 4 letters). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const win = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - win); j < Math.min(b.length, i + win + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0;
  while (p < 4 && p < a.length && p < b.length && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}
