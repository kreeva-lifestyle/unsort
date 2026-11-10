// The SAME tag-cleaning rules as supabase/functions/pb-products/tagClean.ts
// (normalizeTag, tagKey, looksLikeCode, patternProblem and hideReason copied
// word for word, like tagPreview.ts mirrors tags.ts) — so the live tester on
// Settings → Tags ("Would this tag be hidden?") and the pattern check on the
// rules form answer what the server does. Change both together.
import type { PbHidden, PbTagSettings } from '../../tagTypes';

export const MAX_PATTERN_LEN = 80;
const MAX_TAG_LEN = 255;

/** A size (S, M, L, XL, XXL, 3XL…), not a code. */
const SIZE = /^\d?x{0,4}[sml]$/i;
/** In an all-upper tag: a word of 1–2 letters (UK, XL), one with a digit (3XL), a size (XXL) or a 3-letter tag on its own (USA) stays upper. */
const keepUpper = (w: string, whole: boolean) => /^[A-Z]{1,2}$/.test(w) || /\d/.test(w) || /^X{0,4}[SML]$/.test(w) || (whole && /^[A-Z]{1,3}$/.test(w));
const titleWord = (w: string) => w.toLowerCase().replace(/(^|[\-_/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
const titleCase = (s: string) => {
  const upper = s === s.toUpperCase(); const words = s.split(' ');
  return words.map(w => (upper && keepUpper(w, words.length === 1) ? w : titleWord(w))).join(' ');
};

/** Display form of a raw tag ('' when nothing is left). */
export function normalizeTag(raw: unknown, titleCaseOn = true): string {
  // control and zero-width characters never reach a website's tags
  let s = String(raw ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'“”‘’#]+/, '').replace(/["'“”‘’]+$/, '').trim().slice(0, MAX_TAG_LEN).trim();
  if (!s) return '';
  const lower = s.toLowerCase(), upper = s.toUpperCase();
  if (titleCaseOn && (s === lower || s === upper) && /\p{L}/u.test(s)) return titleCase(s);
  return s;
}

/** The library key (pb_tag_key in SQL does the same). */
export const tagKey = (name: string) => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** A store's internal code rather than a word: _prefix, letters+digits with no vowel or space (kb261, nkb55), or mostly digits. */
export function looksLikeCode(tag: string): boolean {
  const s = tag.trim();
  if (!s) return false;
  if (s.startsWith('_')) return true;
  if (SIZE.test(s)) return false; // 3XL, XS: a size, not a code
  const digits = (s.match(/\d/g) || []).length;
  if (digits / s.length > 0.6) return true;
  if (/^[a-z]+\d{2,}$/i.test(s)) return true; // KBSUIT25, abc123: one token of letters then a number
  return /^[a-z0-9_-]+$/i.test(s) && digits > 0 && !/[aeiou]/i.test(s);
}

/** A pattern staff may save: short, compiles, and cannot hang on a long tag — no repeated group
 *  ((x+)+ and (a|aa)+ alike), no stacked quantifiers, no backreferences or lookbehind, at most 3 repeats. */
export function patternProblem(p: string): string | null {
  if (typeof p !== 'string' || !p.trim()) return 'A pattern cannot be empty.';
  if (p.length > MAX_PATTERN_LEN) return `A pattern can be at most ${MAX_PATTERN_LEN} characters.`;
  const flat = p.replace(/\\./g, 'x').replace(/\[[^\]]*\]/g, 'c'); // an escape or a class is one plain atom
  if (/\\[1-9]/.test(p) || /\(\?<[=!]/.test(flat)) return `"${p}" is too complex to be safe — keep patterns simple.`;
  if (/\)[+*{]/.test(flat) || /[+*?}][+*{]/.test(flat)) return `"${p}" is too complex to be safe — a group cannot be repeated.`;
  if ((flat.match(/[*+]|\{\d*,\}/g) || []).length > 3) return `"${p}" is too complex to be safe — at most 3 repeats.`;
  try { new RegExp(p, 'iu'); } catch { return `"${p}" is not a valid pattern.`; }
  return null;
}

const compile = (ps: string[]) => ps.map(p => { try { return { p, re: new RegExp(p, 'iu') }; } catch { return null; } }).filter(Boolean) as { p: string; re: RegExp }[];

/** Why one normalized tag is hidden by the rules (null = kept); `allow` = keys staff reviewed and kept. */
export function hideReason(tag: string, rules: PbTagSettings, res = compile(rules.hide_patterns), allow?: Set<string>): PbHidden | null {
  if (!tag) return { tag, reason: 'empty' };
  if (allow?.has(tagKey(tag))) return null;
  if (tag.length < rules.min_len) return { tag, reason: 'short' };
  const hit = res.find(r => r.re.test(tag));
  if (hit) return { tag, reason: 'pattern', pattern: hit.p };
  if (rules.hide_exact.map(tagKey).includes(tagKey(tag))) return { tag, reason: 'exact' };
  if (rules.auto_hide_codes && looksLikeCode(tag)) return { tag, reason: 'code' };
  return null;
}

/** The tester: what the rules do to one typed tag. */
export function testTag(raw: string, rules: PbTagSettings): { tag: string; hidden: PbHidden | null } {
  const tag = normalizeTag(raw, rules.title_case);
  return { tag, hidden: hideReason(tag, rules) };
}
