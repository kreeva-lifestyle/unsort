// Pure: one tag's clean form and the cleaning rules (pb_settings 'tags').
// No I/O — tested with node --test (test/tagClean.test.mjs). The SQL backfill
// in 20261110090000_pb_tags.sql mirrors the DEFAULT rules for existing rows.
//   normalizeTag  trim, one space between words, surrounding quotes / # off,
//                 Title Case when the input is all lower or all upper (mixed
//                 case such as "iPhone" is kept; in an all-upper tag the short
//                 words XL, UK, 3XL, USA stay as they are), '&' kept.
//   tagKey        the library key: lower, trimmed, single spaces (= pb_tag_key).
//   cleanTags     drops empties, too-short tags, hide patterns (case-
//                 insensitive), exact hides, codes (_prefix, letters+digits
//                 with no vowel like kb261 / nkb55, letters then a number like
//                 KBSUIT25, or > 60 % digits — sizes like 3XL are words), repeats; a tag staff reviewed and
//                 kept in the library (`allow`) passes the rules;
//                 caps at max_per_product; says why each one was hidden.

export interface TagSettings {
  hide_patterns: string[]; hide_exact: string[]; max_per_product: number; min_len: number;
  title_case: boolean; auto_hide_codes: boolean;
}

export const DEFAULT_TAG_SETTINGS: TagSettings = {
  hide_patterns: ['^_', '^size[_ ]?chart$', '^label[_ ]', '^[a-z]{1,3}\\d{2,}$'],
  hide_exact: [], max_per_product: 25, min_len: 2, title_case: true, auto_hide_codes: true,
};

export const MAX_PATTERNS = 50;
export const MAX_PATTERN_LEN = 80;
export const MAX_TAG_LEN = 255;

export type HideReason = 'empty' | 'short' | 'pattern' | 'exact' | 'code' | 'duplicate' | 'cap';
export interface Hidden { tag: string; reason: HideReason; pattern?: string }

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

/** Settings as stored, with every field sane (unknown / bad values fall back to the defaults). */
export function tagSettings(v: unknown): TagSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof TagSettings, unknown>>;
  const strs = (x: unknown, max: number) => (Array.isArray(x) ? x.map(s => String(s ?? '').trim()).filter(Boolean).slice(0, max) : []);
  const num = (x: unknown, d: number, lo: number, hi: number) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const d = DEFAULT_TAG_SETTINGS;
  return {
    hide_patterns: Array.isArray(o.hide_patterns) ? strs(o.hide_patterns, MAX_PATTERNS).filter(p => !patternProblem(p)) : [...d.hide_patterns],
    hide_exact: strs(o.hide_exact, 500).map(tagKey),
    max_per_product: num(o.max_per_product, d.max_per_product, 1, 100),
    min_len: num(o.min_len, d.min_len, 1, 20),
    title_case: typeof o.title_case === 'boolean' ? o.title_case : d.title_case,
    auto_hide_codes: typeof o.auto_hide_codes === 'boolean' ? o.auto_hide_codes : d.auto_hide_codes,
  };
}

const compile = (ps: string[]) => ps.map(p => { try { return { p, re: new RegExp(p, 'iu') }; } catch { return null; } }).filter(Boolean) as { p: string; re: RegExp }[];

/** Why one normalized tag is hidden by the rules (null = kept); `allow` = keys staff reviewed and kept. */
export function hideReason(tag: string, rules: TagSettings, res = compile(rules.hide_patterns), allow?: Set<string>): Hidden | null {
  if (!tag) return { tag, reason: 'empty' };
  if (allow?.has(tagKey(tag))) return null;
  if (tag.length < rules.min_len) return { tag, reason: 'short' };
  const hit = res.find(r => r.re.test(tag));
  if (hit) return { tag, reason: 'pattern', pattern: hit.p };
  if (rules.hide_exact.includes(tagKey(tag))) return { tag, reason: 'exact' };
  if (rules.auto_hide_codes && looksLikeCode(tag)) return { tag, reason: 'code' };
  return null;
}

/** Clean a list of raw tags with the rules. `skipRules` keeps every non-empty tag (what staff typed): only
 *  normalizing, de-duplicating and the cap apply. */
export function cleanTags(list: unknown[], rules: TagSettings, skipRules = false, allow?: Set<string>): { kept: string[]; hidden: Hidden[] } {
  const res = compile(rules.hide_patterns);
  const kept: string[] = []; const hidden: Hidden[] = []; const seen = new Set<string>();
  for (const raw of Array.isArray(list) ? list : []) {
    const tag = normalizeTag(raw, rules.title_case);
    const why = skipRules ? (tag ? null : { tag, reason: 'empty' as const }) : hideReason(tag, rules, res, allow);
    if (why) { if (why.reason !== 'empty' || String(raw ?? '').trim()) hidden.push({ ...why, tag: tag || String(raw ?? '').trim() }); continue; }
    const k = tagKey(tag);
    if (seen.has(k)) { hidden.push({ tag, reason: 'duplicate' }); continue; }
    if (kept.length >= rules.max_per_product) { hidden.push({ tag, reason: 'cap' }); continue; }
    seen.add(k); kept.push(tag);
  }
  return { kept, hidden };
}

/** A store's comma-joined tag string ("a, b, c") as a list. */
export const splitStoreTags = (s: unknown) => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean);
