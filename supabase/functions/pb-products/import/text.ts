// Pure helpers shared by the normalisers (normalize.ts, jsonld.ts, meta.ts). No I/O.
// Hostile input is expected (the page belongs to another site): every input is
// bounded first, every pattern is linear (tags matched as [^<>]*, blocks found
// with indexOf), and a bad character code becomes a space instead of throwing.
import { checkUrl } from './urlCheck.ts';

export const MAX_IMAGES = 10;
/** HTML read per page or description; anything after it is ignored. */
export const MAX_HTML = 200_000;

/** A character code as text; ' ' for one that is not a real character (`&#99999999;` must not throw). */
export const cp = (n: number) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : ' ');
/** Trimmed one-line text ≤ max, without NUL (Postgres refuses it). */
export const txt = (v: unknown, max = 500) => String(v ?? '').slice(0, max * 4).replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
/** A price: 2299, "2,299.00", "Rs. 1,299" → 1299; null when there is no number. */
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const m = typeof v === 'number' ? null : /\d[\d,]*(?:\.\d+)?/.exec(String(v).slice(0, 100));
  const n = typeof v === 'number' ? v : m ? Number(m[0].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
export const uniq = (a: string[]) => [...new Set(a.map(s => txt(s, 40)).filter(Boolean))].slice(0, 30);
export const min = (a: (number | null)[]) => { const v = a.filter((x): x is number => x !== null); return v.length ? Math.min(...v) : null; };
export const max = (a: (number | null)[]) => { const v = a.filter((x): x is number => x !== null); return v.length ? Math.max(...v) : null; };
export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
export const isSize = (n: unknown) => /\bsizes?\b/i.test(String(n || '').slice(0, 100));
export const isColor = (n: unknown) => /\bcolou?rs?\b/i.test(String(n || '').slice(0, 100));

/** An absolute https URL, or null. */
export const abs = (src: unknown, base: string): string | null => {
  const s = String(src ?? '').trim().slice(0, 2000);
  if (!s) return null;
  try { const u = new URL(s.startsWith('//') ? `https:${s}` : s, base); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
};
/** Photo URLs to download: https on a public host only (never localhost / a private address), at most MAX_IMAGES. */
export const imgs = (list: unknown[], base: string) => list.map(x => abs(x, base)).filter((x): x is string => !!x && checkUrl(x).ok).slice(0, MAX_IMAGES);

/** A page's address as its id on that site: the path without a trailing slash. */
export function pathRef(url: string): string {
  try { const p = new URL(url).pathname; let e = p.length; while (e > 1 && p[e - 1] === '/') e--; return p.slice(0, e).slice(0, 180) || '/'; } catch { return url.slice(0, 180); }
}

/** `s` without its <script> / <style> blocks (indexOf, linear; an unclosed block drops the rest). */
function dropBlocks(s: string): string {
  const low = s.toLowerCase();
  let out = '', at = 0, a = low.indexOf('<script'), b = low.indexOf('<style');
  for (;;) {
    if (a >= 0 && a < at) a = low.indexOf('<script', at);
    if (b >= 0 && b < at) b = low.indexOf('<style', at);
    const i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
    if (i < 0) return out + s.slice(at);
    out += `${s.slice(at, i)} `;
    const end = low.indexOf(i === a ? '</script' : '</style', i);
    const close = end < 0 ? -1 : low.indexOf('>', end);
    if (close < 0) return out;
    at = close + 1;
  }
}

/** Decode the common entities (numeric ones safely); `&amp;` last so "&amp;lt;" stays "&lt;". */
export const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]{1,8});/gi, (_m, h: string) => cp(parseInt(h, 16)))
  .replace(/&#(\d{1,9});/g, (_m, d: string) => cp(Number(d))).replace(/&amp;/g, '&');

/** HTML → plain text with paragraph breaks (for raw_text; the AI rewrites it anyway). */
export function htmlToText(html: unknown): string {
  return decode(dropBlocks(String(html ?? '').slice(0, MAX_HTML))
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^<>]*>/g, ' '))
    .replace(/\u0000/g, '')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 6000);
}

/** `f` over a list, leaving out (and logging) an item it throws on: one broken product must not sink its page. */
export function mapSafe<T, R>(list: T[], f: (x: T) => R): R[] {
  const out: R[] = [];
  for (const x of list) {
    try { out.push(f(x)); } catch (e) { console.error(`pb-products import: a product was left out (${e instanceof Error ? e.message.slice(0, 120) : 'unreadable'})`); }
  }
  return out;
}
