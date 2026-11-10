// Pure: the rules step of auto-tagging — "first the system checks from its
// title, description etc and then AI checks" (owner, 2026-11-10). No I/O;
// tested in test/tagMatch.test.mjs.
// Every value name and "also known as" word of the attributes in scope (the
// ones linked to the product's category) is looked for, as whole words in
// order after tagKey + stem (tagText.ts: "embroidery-work" contains
// "Embroidery", "Printed" matches "print", "Sequins" matches "Sequin"), in
// these sources, strongest first:
//   5 label   a "COLOUR :- 2 (Pink, Wine)" line whose label names the
//             attribute (Colour / Color, "FABRICS & WORK" → Fabric and Work):
//             only that attribute is looked for in the rest of the line
//   4 name    the product name
//   3 store   each store tag, and the facts the reader filled (fabric, colour,
//             work, occasion, pattern…)
//   1 text    the post / description text
// Within one source and attribute a longer phrase wins over a shorter one it
// covers ("Rani Pink" over "Pink"). A several-values attribute gets every
// value found (best first, at most 10); a one-value attribute only the best
// (strongest source, then earliest). Unmatched candidates for the
// suggestions queue: store tags that matched nothing (junk filtered by the
// caller) and, on a label line for ONE attribute, the listed items that are
// not values yet ("Wine" under COLOUR → a Colour suggestion).
import { displayName, editDistance, stemKey, tagKey, words } from './tagText.ts';

export interface MatchValue { id: string; name: string; key: string; aliases: string[] }
export interface MatchAttr { id: string; name: string; multi: boolean; values: MatchValue[] }
export interface MatchInput { name?: string | null; storeTags?: string[]; facts?: (string | null | undefined)[]; text?: string | null }
export interface Candidate { phrase: string; key: string; attribute_id: string | null; source: 'store' | 'text' }
export interface MatchResult {
  /** attribute id → chosen value ids, best first */
  chosen: Record<string, string[]>;
  candidates: Candidate[];
}

interface Src { w: number; tokens: string[]; only?: Set<string>; tag?: string }
const LABEL = /^\s*([\p{L}][\p{L} &/]{1,30}?)\s*(?::-|:|=>|=|–|-\s)\s*(.+)$/u;
const MAX_MULTI = 10;

/** Attributes a label line names ("FABRICS & WORK" → Fabric, Work; "COLOR" → Colour). */
export function labelAttrs(label: string, attrs: MatchAttr[]): string[] {
  const lw = words(label);
  return attrs.filter(a => {
    const aw = words(a.name);
    if (!aw.length) return false;
    for (let i = 0; i + aw.length <= lw.length; i++) if (aw.every((w, j) => lw[i + j] === w)) return true;
    return aw.length === 1 && aw[0].length >= 4 && lw.some(w => w.length >= 4 && editDistance(w, aw[0]) <= 1);
  }).map(a => a.id);
}

const at = (tokens: string[], ph: string[], i: number) => ph.every((w, j) => tokens[i + j] === w);

export function matchProduct(input: MatchInput, attrs: MatchAttr[]): MatchResult {
  const srcs: Src[] = [];
  const cands: Candidate[] = [];
  const lines = String(input.text ?? '').split(/\r?\n/);
  for (const line of lines) {
    const m = LABEL.exec(line);
    if (!m) continue;
    const ids = labelAttrs(m[1], attrs);
    if (!ids.length) continue;
    srcs.push({ w: 5, tokens: words(m[2]), only: new Set(ids) });
    if (ids.length === 1) {
      for (const item of m[2].split(/[,/&+()]|\band\b|\bwith\b/i)) {
        const k = tagKey(item).replace(/^\d+\s*/, '').trim();
        if (k.length < 2 || /^\d+$/.test(k) || k.split(' ').length > 4) continue;
        cands.push({ phrase: displayName(k), key: k, attribute_id: ids[0], source: 'text' });
      }
    }
  }
  if (input.name) srcs.push({ w: 4, tokens: words(input.name) });
  for (const t of input.storeTags ?? []) srcs.push({ w: 3, tokens: words(t), tag: t });
  for (const f of input.facts ?? []) if (f && String(f).trim()) srcs.push({ w: 3, tokens: words(f) });
  if (input.text) srcs.push({ w: 1, tokens: words(input.text) });

  const phrases = attrs.map(a => ({ a, vs: a.values.map(v => ({ v, ph: [v.name, ...v.aliases].map(words).filter(p => p.length) })) }));
  const best: Record<string, Map<string, { w: number; order: number }>> = {};
  const tagHit = new Set<string>();
  const hitKeys = new Set<string>();
  srcs.forEach((s, si) => {
    for (const { a, vs } of phrases) {
      if (s.only && !s.only.has(a.id)) continue;
      const found: { id: string; i: number; len: number }[] = [];
      for (const { v, ph } of vs) for (const p of ph) for (let i = 0; i + p.length <= s.tokens.length; i++) if (at(s.tokens, p, i)) found.push({ id: v.id, i, len: p.length });
      found.sort((x, y) => y.len - x.len || x.i - y.i);
      const used: boolean[] = [];
      for (const f of found) {
        if (used.slice(f.i, f.i + f.len).some(Boolean)) continue;
        for (let k = f.i; k < f.i + f.len; k++) used[k] = true;
        const map = (best[a.id] ||= new Map());
        const order = si * 100_000 + f.i;
        const cur = map.get(f.id);
        if (!cur || s.w > cur.w || (s.w === cur.w && order < cur.order)) map.set(f.id, { w: s.w, order });
        if (s.tag) tagHit.add(s.tag);
        hitKeys.add(`${a.id}:${stemKey(s.tokens.slice(f.i, f.i + f.len).join(' '))}`);
      }
    }
  });

  const chosen: Record<string, string[]> = {};
  for (const a of attrs) {
    const m = best[a.id];
    if (!m?.size) continue;
    const ids = [...m.entries()].sort((x, y) => y[1].w - x[1].w || x[1].order - y[1].order).map(([id]) => id);
    chosen[a.id] = a.multi ? ids.slice(0, MAX_MULTI) : ids.slice(0, 1);
  }
  const out: Candidate[] = cands.filter(c => !hitKeys.has(`${c.attribute_id}:${stemKey(c.key)}`));
  for (const t of input.storeTags ?? []) {
    if (tagHit.has(t)) continue;
    const k = tagKey(t);
    if (k.length >= 2) out.push({ phrase: displayName(t), key: k, attribute_id: null, source: 'store' });
  }
  const seen = new Set<string>();
  return { chosen, candidates: out.filter(c => { const id = `${c.key}|${c.attribute_id}`; if (seen.has(id)) return false; seen.add(id); return true; }) };
}
