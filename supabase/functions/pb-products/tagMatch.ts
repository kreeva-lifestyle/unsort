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
// covers ("Rani Pink" over "Pink"); a two-word value that refines another
// value is also found with its words turned round ("Silk Chanderi" is
// Chanderi Silk). A several-values attribute gets every value found (best
// first, at most 10); a one-value attribute only the best (strongest source,
// then earliest) — or a value that refines it ("Chanderi Silk" over "Silk").
// A word that is part of a colour's name ("Mehendi Green") counts for Colour
// only, never for another attribute (13 Nov 2026). Unmatched candidates for the
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

/** A one-value attribute: the best hit, unless another hit refines it — every word of the best one and more ("Chanderi
 *  Silk" over "Silk", "Rani Pink" over "Pink"): the more specific value says the same, and more. */
function mostSpecific(a: MatchAttr, ids: string[]): string {
  const ws = new Map(a.values.map(v => [v.id, new Set(words(v.name))]));
  let top = ids[0];
  for (const id of ids.slice(1)) {
    const t = ws.get(top) ?? new Set<string>(), o = ws.get(id) ?? new Set<string>();
    if (o.size > t.size && [...t].every(w => o.has(w))) top = id;
  }
  return top;
}

export const isColour = (a: { name: string }) => ['colour', 'color'].includes(stemKey(a.name));
/** Words that name a shade when a colour follows ("Mehendi Green", "Haldi Yellow", "Rani Pink"). Only these: "Georgette
 *  Pink" or "Embroidered Blue" are a fabric or a work and a colour, and keep both. */
const SHADE_WORDS = new Set(['mehendi', 'mehndi', 'mehandi', 'haldi', 'rani', 'bottle', 'peacock', 'onion', 'mango', 'parrot', 'lemon', 'mint', 'baby', 'dusty', 'navy', 'royal', 'sky', 'sea', 'olive']);

/** A value's phrases as word lists: its name and aliases, plus — for a two-word value that refines another value of
 *  the same attribute ("Chanderi Silk" of "Silk", "Rani Pink" of "Pink") — the two words in the other order, as
 *  suppliers write "Pure Roman Silk Chanderi" (owner, 13 Nov 2026). */
function phrasesOf(a: MatchAttr) {
  const singles = new Set(a.values.flatMap(v => [v.name, ...v.aliases].map(words).filter(p => p.length === 1).map(p => p[0])));
  return a.values.map(v => {
    const ph = [v.name, ...v.aliases].map(words).filter(p => p.length);
    const turned = ph.filter(p => p.length === 2 && singles.has(p[1])).map(p => [p[1], p[0]]);
    return { v, ph: [...ph, ...turned] };
  });
}

/** `shades`: the Colour values of the whole list (also when Colour is not being looked for), so a word that is part of
 *  a colour's name ("Mehendi Green", "Haldi Yellow") is not taken for another attribute (the Mehendi occasion). */
export function matchProduct(input: MatchInput, attrs: MatchAttr[], o: { shades?: MatchValue[] } = {}): MatchResult {
  const shadePh = (o.shades ?? attrs.find(isColour)?.values ?? []).flatMap(v => [v.name, ...v.aliases].map(words).filter(p => p.length));
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

  const phrases = attrs.map(a => ({ a, vs: phrasesOf(a), colour: isColour(a) }));
  const best: Record<string, Map<string, { w: number; order: number }>> = {};
  const tagHit = new Set<string>();
  const hitKeys = new Set<string>();
  srcs.forEach((s, si) => {
    // Where a colour's name starts, and the words inside a colour name of two words or more.
    const shadeAt = new Set<number>(), inShade = new Set<number>();
    for (const p of shadePh) for (let i = 0; i + p.length <= s.tokens.length; i++) if (at(s.tokens, p, i)) {
      shadeAt.add(i);
      if (p.length > 1) for (let k = i; k < i + p.length; k++) inShade.add(k);
    }
    for (const { a, vs, colour } of phrases) {
      if (s.only && !s.only.has(a.id)) continue;
      const found: { id: string; i: number; len: number }[] = [];
      for (const { v, ph } of vs) for (const p of ph) for (let i = 0; i + p.length <= s.tokens.length; i++) {
        if (!at(s.tokens, p, i)) continue;
        // Part of a colour's name, not this attribute: a word inside a colour name the list knows ("Mehendi Green" as
        // a Colour alias), or a shade word right before a colour ("Mehendi Green" with only Green on the list).
        if (!colour && p.length === 1 && (inShade.has(i) || (SHADE_WORDS.has(p[0]) && shadeAt.has(i + 1)))) continue;
        found.push({ id: v.id, i, len: p.length });
      }
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
    chosen[a.id] = a.multi ? ids.slice(0, MAX_MULTI) : [mostSpecific(a, ids)];
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
