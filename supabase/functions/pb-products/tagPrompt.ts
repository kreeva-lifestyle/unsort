// Pure: the AI step of auto-tagging. The reader's ONE call (readerPrompt.ts)
// and the cheaper values-only pass (tagFill.ts) get, per attribute, the list
// of allowed value names as a JSON-schema enum, so the AI can only choose
// from the owner's taxonomy; anything it saw that fits no list comes back as
// short "other" phrases for the suggestions queue. Required attributes:
// "pick the closest value when the evidence reasonably supports it, never
// invent one". No I/O — tested in test/tagPrompt.test.mjs.
import { tagKey } from './tagText.ts';

/** `byCategory`: the attribute's values depend on the category (Product Type) — each value carries the categories it is
 *  ticked for, and the prompt lists them per category (the reader settles the category in the same call). */
export interface PromptAttr { id: string; name: string; multi: boolean; byCategory?: boolean; values: { id: string; name: string; categories?: string[] }[] }
export interface TagSpec { attrs: (PromptAttr & { pk: string })[]; byCategory: Record<string, string[]> }
export interface TagOut { tags?: Record<string, { values?: unknown; other?: unknown }>; tag_other?: unknown }
export interface ReadTags { chosen: Record<string, string[]>; other: { attribute_id: string | null; phrase: string }[] }

const ENUM_MAX = 300; // a longer list is sent as plain text (still checked against the list in code)
const MAX_OTHER = 5;

/** Attributes as the prompt and schema see them (`pk` = a safe JSON property name). */
export function tagSpec(attrs: PromptAttr[], byCategory: Record<string, string[]> = {}): TagSpec {
  const used = new Set<string>();
  return {
    attrs: attrs.filter(a => a.values.length).map((a, i) => {
      let pk = tagKey(a.name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `attr_${i + 1}`;
      while (used.has(pk) || pk === 'tag_other') pk = `${pk}_${i + 1}`;
      used.add(pk);
      return { ...a, pk };
    }),
    byCategory,
  };
}

export function tagPromptLines(spec: TagSpec, o: { fillOnly?: boolean } = {}): string[] {
  if (!spec.attrs.length) return [];
  const cats = Object.entries(spec.byCategory).filter(([, ids]) => ids.length)
    .map(([c, ids]) => `${c} → ${ids.map(id => spec.attrs.find(a => a.id === id)?.name).filter(Boolean).join(', ')}`);
  return [
    o.fillOnly ? 'Choose the product\'s values for the attributes below.' : 'tags: for each attribute, the values that describe this product, chosen ONLY from its list (copy the spelling exactly).',
    ...(cats.length && !o.fillOnly ? [`Which attributes apply depends on the category: ${cats.join('; ')}. Leave values [] for attributes of other categories.`] : []),
    'Every attribute of the product\'s category needs at least one value: when the photos or text reasonably support one, pick the CLOSEST value in the list (e.g. "rani pink" → Pink, "embroidered" → Embroidery). Never invent a value that is not in the list. If truly nothing fits, leave values [] and put the word you saw in "other".',
    'An attribute marked "one value" takes at most one. other: up to 3 short phrases (1–3 words) for that attribute that are not in its list, or [].',
    ...(o.fillOnly ? [] : ['tag_other: up to 5 short phrases (1–3 words) that describe the product but fit no attribute, or [].']),
    ...spec.attrs.map(a => (a.byCategory ? scopedLine(a) : `${a.name} (${a.multi ? 'one or several' : 'one value'}): ${a.values.map(v => v.name).join(', ')}`)),
  ];
}

/** "Product Type (one value; depends on the category — choose only from the product's category): Lehenga: Bridal
 *  Lehenga, Lehenga Choli; Salwar Suit: Anarkali" — a value ticked for several categories is listed under each. */
function scopedLine(a: PromptAttr): string {
  const by = new Map<string, string[]>();
  for (const v of a.values) for (const c of v.categories ?? []) by.set(c, [...(by.get(c) ?? []), v.name]);
  const groups = [...by].map(([c, names]) => `${c}: ${names.join(', ')}`).join('; ');
  return `${a.name} (${a.multi ? 'one or several' : 'one value'}; depends on the category — choose only from the product's category, none if it has none): ${groups}`;
}

/** The schema's "tags" property (+ "tag_other" unless fillOnly); null when there is nothing to choose. */
export function tagSchema(spec: TagSpec, o: { fillOnly?: boolean } = {}): Record<string, unknown> | null {
  if (!spec.attrs.length) return null;
  const str = { type: 'string' };
  const props = Object.fromEntries(spec.attrs.map(a => [a.pk, {
    type: 'object',
    properties: {
      values: { type: 'array', items: a.values.length <= ENUM_MAX ? { type: 'string', enum: a.values.map(v => v.name) } : str },
      other: { type: 'array', items: str },
    },
    required: ['values', 'other'], additionalProperties: false,
  }]));
  const tags = { type: 'object', properties: props, required: spec.attrs.map(a => a.pk), additionalProperties: false };
  return o.fillOnly ? { tags } : { tags, tag_other: { type: 'array', items: str } };
}

const phrase = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 40 && s.split(' ').length <= 4 ? s : '';
};

/** The AI's answer → value ids per attribute (only names in the list; one-value attributes keep the first)
 *  and the "other" phrases. `only` limits which attributes are read (the rest are ignored). */
export function readTags(spec: TagSpec, out: TagOut | null | undefined, only?: Set<string>): ReadTags {
  const chosen: ReadTags['chosen'] = {};
  const other: ReadTags['other'] = [];
  for (const a of spec.attrs) {
    if (only && !only.has(a.id)) continue;
    const got = out?.tags?.[a.pk];
    const byKey = new Map(a.values.map(v => [tagKey(v.name), v.id]));
    const ids = [...new Set((Array.isArray(got?.values) ? got.values : []).map(n => byKey.get(tagKey(n))).filter((x): x is string => !!x))];
    if (ids.length) chosen[a.id] = a.multi ? ids.slice(0, 10) : ids.slice(0, 1);
    for (const p of (Array.isArray(got?.other) ? got.other : []).map(phrase).filter(Boolean).slice(0, 3)) {
      if (!byKey.has(tagKey(p))) other.push({ attribute_id: a.id, phrase: p });
    }
  }
  for (const p of (Array.isArray(out?.tag_other) ? out.tag_other : []).map(phrase).filter(Boolean).slice(0, MAX_OTHER)) other.push({ attribute_id: null, phrase: p });
  return { chosen, other };
}
