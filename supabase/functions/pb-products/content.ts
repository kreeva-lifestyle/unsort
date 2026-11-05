// Pure text helpers for listings: length cuts, the title template, the URL
// handle and the description HTML whitelist (p, ul, li, strong, em, br).

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

const KEEP: Record<string, string> = {
  p: 'p', ul: 'ul', ol: 'ul', li: 'li', strong: 'strong', b: 'strong', em: 'em', i: 'em', br: 'br',
  h1: 'p', h2: 'p', h3: 'p', h4: 'p', h5: 'p', h6: 'p',
};

/** Only p, ul, li, strong, em, br survive — no attributes, no scripts, no links. */
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
  h = h.replace(/<(?!\/?(?:p|ul|li|strong|em|br)>)/g, '&lt;');
  return h.replace(/\n{3,}/g, '\n\n').trim();
}

export const stripTags = (html: string) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
