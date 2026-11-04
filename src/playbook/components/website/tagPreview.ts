// The SAME tag rules as supabase/functions/pb-products/tags.ts (copied exactly,
// like the price preview) — so the example on the Tags tab is what Shopify gets.
// Change both together.
import type { PbTagRules } from '../../types';

export interface TagFacts {
  category: string; fabric: string; color: string; vendor: string; vendor_code: string; sku: string;
  sizes: string[]; attributes: Record<string, string>;
}

const PH = /\{\s*(attr:[^}]+|[a-z_]+)\s*\}/gi;

/** Fill one template; null when any placeholder in it is empty (the tag is dropped). */
export function fillTemplate(tpl: string, f: TagFacts, size = ''): string | null {
  let empty = false;
  const out = tpl.replace(PH, (_m, key: string) => {
    const k = key.trim().toLowerCase();
    let v = '';
    if (k.startsWith('attr:')) {
      const want = k.slice(5).trim();
      const hit = Object.keys(f.attributes || {}).find(a => a.toLowerCase() === want);
      v = hit ? String(f.attributes[hit] ?? '') : '';
    } else if (k === 'size') v = size;
    else if (k in f && k !== 'sizes' && k !== 'attributes') v = String((f as unknown as Record<string, unknown>)[k] ?? '');
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

export function buildTags(rules: Partial<PbTagRules>, f: TagFacts, aiExtra: string[]): string[] {
  const raw: string[] = [];
  for (const tpl of Array.isArray(rules.templates) ? rules.templates : []) {
    if (!String(tpl || '').trim()) continue;
    if (/\{\s*size\s*\}/i.test(tpl)) {
      for (const s of f.sizes || []) { const t = fillTemplate(tpl, f, s); if (t) raw.push(t); }
    } else {
      const t = fillTemplate(tpl, f);
      if (t) raw.push(t);
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
  return out;
}
