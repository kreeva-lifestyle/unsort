// Pure text helpers for listings: length cuts, the title template, the URL
// handle, the meta title's brand ending and the description HTML whitelist
// (p, ul, li, h3, strong, em, br).

/** Cut to `max` characters, at a word boundary when one is near. */
export function cut(s: string, max: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!max || t.length <= max) return t;
  const hard = t.slice(0, max);
  const sp = hard.lastIndexOf(' ');
  return (sp > max * 0.6 ? hard.slice(0, sp) : hard).replace(/[\s,;:\-–|]+$/, '');
}

/** title_template: "{ai_title}" → the AI title; otherwise fill the placeholders
 *  {category} {fabric} {color} {vendor} {sku} {name} {ai_title}, collapse spaces, cut. */
export function fillTitle(template: string, vars: Record<string, string>, aiTitle: string, max: number): string {
  const tpl = String(template || '').trim() || '{ai_title}';
  const all: Record<string, string> = { ...vars, ai_title: aiTitle };
  const out = tpl.replace(/\{\s*([a-z_]+)\s*\}/gi, (_m, k: string) => String(all[k.toLowerCase()] ?? '').trim());
  const tidy = out.replace(/\s+/g, ' ').replace(/([,|\-–])(\s*[,|\-–])+/g, '$1').replace(/^[\s,|\-–]+|[\s,|\-–]+$/g, '');
  return cut(tidy, max);
}

export function slugify(s: string): string {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Lowercase a-z0-9 and '-', max 80, made unique-ish with -<sku> or 6 chars of the product id. */
export function makeHandle(base: string, sku: string | null, productId: string): string {
  const suffix = slugify(sku || '') || productId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
  const b = slugify(base);
  if (!b) return `product-${suffix}`.slice(0, 80);
  if (b === suffix || b.endsWith(`-${suffix}`)) return b.slice(0, 80).replace(/-$/, '');
  const room = 80 - suffix.length - 1;
  if (room < 8) return `${b.slice(0, 73).replace(/-$/, '')}-${suffix.slice(0, 6)}`;
  return `${b.slice(0, room).replace(/-$/, '')}-${suffix}`;
}

/** A clean handle for a new listing: the writer's 3 to 6 words with no codes ("no codes", owner 2026-11-12);
 *  `fallback` (the keyword or title) when it gave fewer than 3. A handle already taken gets its short
 *  suffix in generate.ts (this website) or publish.ts (the store itself). */
export function cleanHandle(raw: string, fallback: string, sku: string | null): string {
  const code = slugify(sku || ''), codes = new Set(code.split('-').filter(w => /\d/.test(w)));
  // The whole code goes where it appears in one piece ("…-rg-1042"), and any numbered part of it on its own.
  const strip = (s: string) => (code && /\d/.test(code) ? `-${slugify(s)}-`.split(`-${code}-`).join('-') : slugify(s));
  const words = (s: string) => strip(s).split('-').filter(w => w && !codes.has(w));
  let w = words(raw);
  if (w.length < 3) w = words(fallback).length > w.length ? words(fallback) : w;
  return w.slice(0, 6).join('-').slice(0, 80).replace(/-$/, '');
}

/** "… | Brand": the meta title always ends with the brand, inside `max` (the text gives way, never the brand). */
export function withBrand(title: string, brand: string, max: number): string {
  const b = String(brand || '').replace(/\s+/g, ' ').trim();
  const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!b) return cut(t, max);
  if (flat(t).endsWith(flat(b))) t = t.slice(0, t.toLowerCase().lastIndexOf(b.toLowerCase().split(' ')[0])); // strip the brand it already ends with
  t = t.replace(/[\s|\-–:,]+$/, '');
  const room = max - b.length - 3;
  if (room < 12 || !t) return cut(t ? `${t} | ${b}` : b, max);
  return `${cut(t, room)} | ${b}`;
}

const KEEP: Record<string, string> = {
  p: 'p', ul: 'ul', ol: 'ul', li: 'li', strong: 'strong', b: 'strong', em: 'em', i: 'em', br: 'br',
  h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3',
};

/** Only p, ul, li, h3, strong, em, br survive — no attributes, no scripts, no links. */
export function cleanHtml(html: string): string {
  let h = String(html || '');
  h = h.replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '');
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>/gi, (_m, slash: string, tag: string) => {
    const t = KEEP[tag.toLowerCase()];
    if (!t) return '';
    if (t === 'br') return slash ? '' : '<br>';
    return `<${slash}${t}>`;
  });
  h = h.replace(/<(?!\/?(?:p|ul|li|h3|strong|em|br)>)/g, '&lt;');
  return h.replace(/\n{3,}/g, '\n\n').trim();
}

export const stripTags = (html: string) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
