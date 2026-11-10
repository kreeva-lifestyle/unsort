// Pure: one product's automatic values = the rules step (tagMatch.ts) for the
// attributes of its category, then the AI's choices (tagPrompt.ts readTags)
// only for the attributes the rules left empty. Attributes that already hold
// a value staff chose ('manual') are left out entirely. Also the phrases for
// the suggestions queue: unmatched store tags (junk filtered first,
// tagClean.ts), unmatched label-line items, and the AI's "other" phrases —
// minus anything that already IS a value or "also known as" word somewhere;
// a phrase with no attribute gets the attribute of its closest look-alike.
// No I/O — tested in test/tagAuto.test.mjs.
import { cleanStoreTags } from './tagClean.ts';
import { lookAlikes, type TaxValue } from './tagLook.ts';
import { matchProduct, type MatchAttr } from './tagMatch.ts';
import type { ReadTags } from './tagPrompt.ts';
import { displayName, tagKey } from './tagText.ts';

export interface AutoProduct {
  name?: string | null; raw_text?: string | null; fabric?: string | null; color?: string | null;
  attributes?: Record<string, string> | null;
}
export interface ValueSet { value_id: string; source: 'rules' | 'ai' }
export interface Suggest { phrase: string; key: string; attribute_id: string | null; source: 'store' | 'ai' | 'text' }

const FACT_ATTRS = ['work', 'occasion', 'pattern', 'type', 'product_type'];
const TEXT_ATTRS = ['notes', 'seo_description'];

export function autoValues(p: AutoProduct, attrs: MatchAttr[], o: { manualAttrIds?: Set<string>; ai?: ReadTags | null; categories?: string[] } = {}) {
  const a = p.attributes || {};
  const scope = attrs.filter(x => !o.manualAttrIds?.has(x.id));
  const m = matchProduct({
    name: p.name, storeTags: cleanStoreTags(a.store_tags, o.categories),
    facts: [p.fabric, p.color, ...FACT_ATTRS.map(k => a[k])],
    text: [p.raw_text, ...TEXT_ATTRS.map(k => a[k])].filter(Boolean).join('\n'),
  }, scope);
  const rows: ValueSet[] = [];
  const filled = new Set<string>();
  for (const x of scope) {
    const rules = m.chosen[x.id];
    const ai = rules?.length ? null : o.ai?.chosen[x.id];
    for (const id of rules ?? ai ?? []) rows.push({ value_id: id, source: rules?.length ? 'rules' : 'ai' });
    if (rules?.length || ai?.length) filled.add(x.id);
  }
  const suggest: Suggest[] = [
    ...m.candidates.map(c => ({ phrase: c.phrase, key: c.key, attribute_id: c.attribute_id, source: c.source })),
    ...(o.ai?.other ?? []).map(x => ({ phrase: displayName(x.phrase), key: tagKey(x.phrase), attribute_id: x.attribute_id, source: 'ai' as const })),
  ];
  return { rows, filled, suggest };
}

/** Suggestions worth keeping: not already a value / "also known as" word anywhere; an unassigned one
 *  takes the attribute of its closest look-alike (so "Embroided" lands under Work). */
export function suggestable(list: Suggest[], values: TaxValue[]): Suggest[] {
  const known = new Set(values.flatMap(v => [v.key, ...v.aliases.map(tagKey)]));
  const seen = new Set<string>();
  const out: Suggest[] = [];
  for (const s of list) {
    if (!s.key || known.has(s.key)) continue;
    let attr = s.attribute_id;
    if (!attr) attr = lookAlikes(s.phrase, values, { max: 1 })[0]?.attribute_id ?? null;
    const id = `${s.key}|${attr}`;
    if (seen.has(id)) continue;
    seen.add(id); out.push({ ...s, attribute_id: attr });
  }
  return out.slice(0, 30);
}
