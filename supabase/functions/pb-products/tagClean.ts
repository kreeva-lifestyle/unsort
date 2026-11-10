// Pure: the junk filter for a store's own tags before they reach the tag
// matcher and the suggestions queue (tagMatch.ts, tagStore.ts). A store tag
// never becomes a value by itself any more — the taxonomy is built by hand
// on the Tags page — so this only keeps the noise out of the suggestions.
// Hidden: an internal marker (_altnew_KBSUIT25, _label_BUY 1 GET 1 FREE),
// SIZE_CHART, label_… , short codes (kb261, nkb55: letters + digits with no
// vowel; KBSUIT25: letters then a number; > 60 % digits), anything shorter
// than 2 letters, and a tag that is just a category name ("Lehenga" — the
// category already says it). Sizes such as XL / 3XL are words, not codes.
// No I/O — tested in test/tagClean.test.mjs.
import { tagKey } from './tagText.ts';

export const HIDE_PATTERNS = [/^_/, /^size[_ ]?chart$/i, /^label[_ ]/i, /^[a-z]{1,3}\d{2,}$/i];
export const MAX_TAG_LEN = 255;

/** A size (S, M, L, XL, XXL, 3XL…), not a code. */
const SIZE = /^\d?x{0,4}[sml]$/i;

/** A raw tag as text: control / zero-width characters off, commas → spaces, quotes and # off, one space. */
export function normalizeTag(raw: unknown): string {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f​-‍⁠﻿]/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^["'“”‘’#]+/, '').replace(/["'“”‘’]+$/, '').trim().slice(0, MAX_TAG_LEN).trim();
}

/** A store's internal code rather than a word: _prefix, letters+digits with no vowel or space (kb261, nkb55), or mostly digits. */
export function looksLikeCode(tag: string): boolean {
  const s = tag.trim();
  if (!s) return false;
  if (s.startsWith('_')) return true;
  if (SIZE.test(s)) return false;
  const digits = (s.match(/\d/g) || []).length;
  if (digits / s.length > 0.6) return true;
  if (/^[a-z]+\d{2,}$/i.test(s)) return true;
  return /^[a-z0-9_-]+$/i.test(s) && digits > 0 && !/[aeiou]/i.test(s);
}

/** Why a store tag is junk (null = keep it as a candidate). */
export function junkReason(tag: string, categories: string[] = []): 'empty' | 'short' | 'pattern' | 'code' | 'category' | null {
  const t = normalizeTag(tag);
  if (!t) return 'empty';
  if (tagKey(t).replace(/ /g, '').length < 2) return 'short';
  if (HIDE_PATTERNS.some(re => re.test(t))) return 'pattern';
  if (looksLikeCode(t)) return 'code';
  if (categories.some(c => tagKey(c) === tagKey(t))) return 'category';
  return null;
}

/** A store's comma-joined tag string ("a, b, c") as a list. */
export const splitStoreTags = (s: unknown) => (Array.isArray(s) ? s.map(String) : String(s ?? '').split(',')).map(x => x.trim()).filter(Boolean);

/** The store tags worth matching and suggesting: junk off, repeats off (by key). */
export function cleanStoreTags(raw: unknown, categories: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of splitStoreTags(raw)) {
    const n = normalizeTag(t);
    const k = tagKey(n);
    if (junkReason(n, categories) || seen.has(k)) continue;
    seen.add(k); out.push(n);
  }
  return out;
}
