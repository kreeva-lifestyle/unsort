// Pure: one product's automatic values = the rules step (tagMatch.ts) for the
// attributes of its category, then the AI's choices (tagPrompt.ts readTags)
// only for the attributes the rules left empty. Attributes that already hold
// a value staff chose ('manual') are left out entirely. Also the phrases for
// the suggestions queue: unmatched store tags (junk filtered first,
// tagClean.ts), unmatched label-line items, and the AI's "other" phrases —
// minus anything that already IS a value or "also known as" word somewhere;
// a phrase with no attribute gets the attribute of its closest look-alike.
// Only a "none" value (Work: Plain) from the words does not settle an attribute (owner, 18 Nov 2026: "add Plain to Work
// values"): "Blouse Work : Plain" or "a plain blouse" describes one piece, and the AI's choice — it saw the photo — wins
// when it is a value; the words' Plain stands when the AI has none. `weak`: attributes settled that way with no AI
// answer given, for "Let AI decide" to ask (tagFill.ts).
// No I/O — tested in test/tagAuto.test.mjs.
import { cleanStoreTags } from './tagClean.ts';
import { lookAlikes, type TaxValue } from './tagLook.ts';
import { matchProduct, type MatchAttr, type MatchValue } from './tagMatch.ts';
import type { ReadTags } from './tagPrompt.ts';
import { displayName, isNoneValue, tagKey } from './tagText.ts';

export interface AutoProduct {
  name?: string | null; raw_text?: string | null; fabric?: string | null; color?: string | null;
  attributes?: Record<string, string> | null;
}
export interface ValueSet { value_id: string; source: 'rules' | 'ai' }
export interface Suggest { phrase: string; key: string; attribute_id: string | null; source: 'store' | 'ai' | 'text' }

const FACT_ATTRS = ['work', 'occasion', 'pattern', 'type', 'product_type'];
const TEXT_ATTRS = ['notes', 'seo_description'];

export function autoValues(p: AutoProduct, attrs: MatchAttr[], o: { manualAttrIds?: Set<string>; ai?: ReadTags | null; categories?: string[]; shades?: MatchValue[] } = {}) {
  const a = p.attributes || {};
  const scope = attrs.filter(x => !o.manualAttrIds?.has(x.id));
  const m = matchProduct({
    name: p.name, storeTags: cleanStoreTags(a.store_tags, o.categories),
    facts: [p.fabric, p.color, ...FACT_ATTRS.map(k => a[k])],
    text: [p.raw_text, ...TEXT_ATTRS.map(k => a[k])].filter(Boolean).join('\n'),
  }, scope, { shades: o.shades });
  const rows: ValueSet[] = [];
  const filled = new Set<string>(), weak = new Set<string>();
  for (const x of scope) {
    const rules = m.chosen[x.id] ?? [];
    const none = new Set(x.values.filter(v => isNoneValue(v.name)).map(v => v.id));
    // Only the values this attribute offers here: the reader's list holds every Product Type value with its categories,
    // and the AI may still pick one ticked for another category (owner, 13 Nov 2026: "so no mistake can happen").
    const ai = o.ai?.chosen[x.id]?.filter(id => x.values.some(v => v.id === id)) ?? [];
    const plainOnly = rules.length > 0 && rules.every(id => none.has(id));
    const useAi = !rules.length || (plainOnly && ai.some(id => !none.has(id)));
    const ids = useAi ? ai : rules;
    for (const id of ids) rows.push({ value_id: id, source: useAi ? 'ai' : 'rules' });
    if (ids.length) filled.add(x.id);
    if (plainOnly && !useAi && !o.ai) weak.add(x.id);
  }
  const suggest: Suggest[] = [
    ...m.candidates.map(c => ({ phrase: c.phrase, key: c.key, attribute_id: c.attribute_id, source: c.source })),
    ...(o.ai?.other ?? []).map(x => ({ phrase: displayName(x.phrase), key: tagKey(x.phrase), attribute_id: x.attribute_id, source: 'ai' as const })),
  ];
  return { rows, filled, suggest, weak };
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
