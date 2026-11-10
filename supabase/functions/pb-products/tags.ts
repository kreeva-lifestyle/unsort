// Pure: a website's Shopify tags for one product.
// Templates (one tag each) with placeholders {category} {fabric} {color} {vendor}
// {vendor_code} {size} {sku} {tags} {attr:<key>}; a template with {size} gives one tag per
// size, {tags} (the product's own cleaned tags, pb_products.tags minus the library's
// hidden ones — tagEngine.ts) gives one tag per product tag, and {attr:store_tags} (an
// imported store's own tags, comma-joined, RAW) gives one tag per store tag; a template
// whose placeholder is empty is dropped. Then the static tags, then the AI's extra tags
// (at most ai_extra_max, only when ai_extra). Apply case, trim, drop empties, dedupe
// case-insensitively, each ≤ 255 chars (commas would split a Shopify tag, so they become
// spaces), and at most max_tags (default MAX_SITE_TAGS) in all.
import { MAX_SITE_TAGS, type TagRules } from './types.ts';

export interface TagFacts {
  category: string; fabric: string; color: string; vendor: string; vendor_code: string; sku: string;
  sizes: string[]; attributes: Record<string, string>;
  /** The product's own tags a website may use (visibleTags in tagEngine.ts). */
  tags?: string[];
}

const PH = /\{\s*(attr:[^}]+|[a-z_]+)\s*\}/gi;
const STORE_TAGS = /\{\s*attr:\s*store_tags\s*\}/i;
const TAGS = /\{\s*tags\s*\}/i;

/** Fill one template; null when any placeholder in it is empty (the tag is dropped). */
export function fillTemplate(tpl: string, f: TagFacts, size = '', tag = ''): string | null {
  let empty = false;
  const out = tpl.replace(PH, (_m, key: string) => {
    const k = key.trim().toLowerCase();
    let v = '';
    if (k.startsWith('attr:')) {
      const want = k.slice(5).trim();
      const hit = Object.keys(f.attributes || {}).find(a => a.toLowerCase() === want);
      v = hit ? String(f.attributes[hit] ?? '') : '';
    } else if (k === 'size') v = size;
    else if (k === 'tags') v = tag;
    else if (k in f && k !== 'sizes' && k !== 'attributes' && k !== 'tags') v = String((f as unknown as Record<string, unknown>)[k] ?? '');
    if (!v.trim()) empty = true;
    return v.trim();
  });
  return empty ? null : out;
}

const clean = (t: string) => t.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 255).trim();

function applyCase(t: string, c: string): string {
  if (c === 'lower') return t.toLowerCase();
  if (c === 'title') return t.toLowerCase().replace(/(^|[\s\-_/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  return t;
}

/** The facts once — or, for a template with {attr:store_tags}, once per store tag (none when it has none). */
function perStoreTag(tpl: string, f: TagFacts): TagFacts[] {
  if (!STORE_TAGS.test(tpl)) return [f];
  const key = Object.keys(f.attributes || {}).find(k => k.toLowerCase() === 'store_tags');
  const items = key ? String(f.attributes[key] ?? '').split(',').map(s => s.trim()).filter(Boolean) : [];
  return items.map(item => ({ ...f, attributes: { ...f.attributes, [key as string]: item } }));
}

/** The per-site cap (older tag_rules rows have no max_tags). */
export const maxSiteTags = (rules: Partial<TagRules>) => {
  const n = Math.floor(Number(rules.max_tags));
  return Number.isFinite(n) && n > 0 ? Math.min(250, n) : MAX_SITE_TAGS;
};

export function buildTags(rules: Partial<TagRules>, f: TagFacts, aiExtra: string[]): string[] {
  const raw: string[] = [];
  for (const tpl of Array.isArray(rules.templates) ? rules.templates : []) {
    if (!String(tpl || '').trim()) continue;
    // {tags}: once per product tag (none when the product has none); {size}: once per size — both: per tag × size.
    const perTag = TAGS.test(tpl) ? (f.tags || []).map(String).filter(t => t.trim()) : [''];
    for (const facts of perStoreTag(tpl, f)) {
      for (const tag of perTag) {
        if (/\{\s*size\s*\}/i.test(tpl)) {
          for (const s of f.sizes || []) { const t = fillTemplate(tpl, facts, s, tag); if (t) raw.push(t); }
        } else {
          const t = fillTemplate(tpl, facts, '', tag);
          if (t) raw.push(t);
        }
      }
    }
  }
  for (const s of Array.isArray(rules.static) ? rules.static : []) raw.push(String(s || ''));
  if (rules.ai_extra) {
    const max = Math.max(0, Math.floor(Number(rules.ai_extra_max) || 0));
    raw.push(...(aiExtra || []).map(String).slice(0, max));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = applyCase(clean(r), String(rules.case || 'as_is'));
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, maxSiteTags(rules));
}
