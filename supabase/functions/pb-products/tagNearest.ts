// Pure: the nearest value already in the lists for a suggestion (owner, 2026-11-13: "AI suggestion needed which
// suggest us to select existing which is the nearest match"). The word rules first, free and the same every time:
//   1. its best look-alike (tagLook.ts: the same word, another form, Hindi, a shade, a typo…), as the card showed;
//   2. else a name or "also known as" word of TWO words or more that sits inside it, whole words in order ("Heavy Zari
//      Work" → Embroidery via "zari work", "Pure Crunchy Silk" → Art Silk): the longest, from the suggestion's own
//      attribute when it has one, else from every attribute; two different values as long → no pick. One word is not
//      enough: replaying the owner's 57 choices of 13 Nov, "contains Silk" said Silk for Crunchy, Vichitra, Dola,
//      Roman and Fendy Silk, which the owner filed under Art Silk, Cotton Silk and Organza.
// What the rules leave is asked of the AI once (tagsNearest.ts, with nearestPrompt / readNearest below) and kept on
// the suggestion (pb_tag_suggestions.nearest), so a phrase is never paid for twice. No I/O; test/tagNearest.test.mjs.
import { lookAlikes, type LookReason, type TaxValue } from './tagLook.ts';
import { displayName, tagKey, words } from './tagText.ts';

export interface Nearest { value_id: string | null; value: string | null; attribute_id: string | null; attribute: string | null; why: string; by: 'rules' | 'ai' }
/** The AI's answer as kept on the suggestion: value_id null = it found nothing close. */
export interface StoredNearest { value_id: string | null; why: string; at: string }

const WHY: Record<LookReason, string> = {
  same: 'The same word.', same_word: 'The same word in another form.', word_order: 'The same words in another order.',
  translation: 'The Hindi or Hinglish word for it.', shade: 'A shade of it.', typo: 'Most likely a typo of it.', similar: 'Spelled almost the same.',
};
const ENUM_MAX = 300; // as tagPrompt.ts: a longer list goes as plain text, still checked in code

const pick = (v: TaxValue, why: string, by: Nearest['by']): Nearest => ({ value_id: v.id, value: v.name, attribute_id: v.attribute_id, attribute: v.attribute, why, by });
const other = (via: string, v: TaxValue) => tagKey(via) !== tagKey(v.name);
const inside = (hay: string[], ph: string[]) => {
  for (let i = 0; i + ph.length <= hay.length; i++) if (ph.every((w, j) => hay[i + j] === w)) return true;
  return false;
};

/** The word rules' pick, or null. */
export function nearestByRules(phrase: string, attributeId: string | null, values: TaxValue[]): Nearest | null {
  const top = lookAlikes(phrase, values, { attributeId, max: 1 })[0];
  const hit = top && values.find(v => v.id === top.value_id);
  if (top && hit) return pick(hit, `${WHY[top.reason]}${other(top.via, hit) ? ` It matches “${displayName(top.via)}”.` : ''}`, 'rules');
  const pw = words(phrase);
  const own = attributeId ? values.filter(v => v.attribute_id === attributeId) : [];
  for (const pool of own.length ? [own, values] : [values]) {
    let best: { v: TaxValue; len: number; via: string } | null = null, tie = false;
    for (const v of pool) for (const via of [v.name, ...v.aliases]) {
      const w = words(via);
      if (w.length < 2 || w.length >= pw.length || !inside(pw, w)) continue;
      if (!best || w.length > best.len) { best = { v, len: w.length, via }; tie = false; }
      else if (w.length === best.len && best.v.id !== v.id) tie = true;
    }
    if (best && !tie) return pick(best.v, `It contains “${displayName(best.via)}”${other(best.via, best.v) ? `, filed under ${best.v.name}` : ''}.`, 'rules');
    if (tie) return null;
  }
  return null;
}

/** What a suggestion card shows: the rules' pick, else the AI's kept answer (one whose value was deleted since → null, ask again). */
export function nearestOf(r: { phrase: string; attribute_id: string | null; nearest?: StoredNearest | null }, values: TaxValue[]): Nearest | null {
  const rule = nearestByRules(r.phrase, r.attribute_id, values);
  if (rule) return rule;
  const s = r.nearest;
  if (!s) return null;
  if (!s.value_id) return { value_id: null, value: null, attribute_id: null, attribute: null, why: s.why, by: 'ai' };
  const v = values.find(x => x.id === s.value_id);
  return v ? pick(v, s.why, 'ai') : null;
}

export interface AskPhrase { phrase: string; attribute: string | null; source: string; examples: string[] }
const FROM: Record<string, string> = { store: 'a store tag', ai: 'noticed by the AI', text: 'in a post' };
const labelOf = (v: TaxValue) => `${v.attribute}: ${v.name}`;

/** One AI call for up to 20 phrases: the lists (with the words already filed under each value), the words ignored
 *  before, and the phrases with where they came from and example products. The answer can only name a listed value. */
export function nearestPrompt(values: TaxValue[], attrOrder: string[], phrases: AskPhrase[], ignored: string[]) {
  const labels = values.map(labelOf);
  const lists = attrOrder.map(a => `${a}: ${values.filter(v => v.attribute === a)
    .map(v => (v.aliases.length ? `${v.name} [${v.aliases.slice(0, 15).join(', ')}]` : v.name)).join('; ')}`);
  const system = [
    'You keep the tag lists of an Indian ethnic-wear shop tidy. Each phrase below was seen on products but is not in the lists yet.',
    'For each phrase choose the ONE listed value that means the same thing, or the closest broader value it is a kind of, the way the owner filed similar words before (the words in brackets were filed under that value). Copy the label exactly, as "Attribute: Value".',
    'Answer "none" when no value is close: a store collection or sale name, a gender, a size, a product type or category name, a marketing word, or a detail the lists do not cover.',
    'why: at most 14 plain words for the owner, e.g. "A kind of silk; Vichitra Silk is filed under Art Silk" or "A store collection name, not a product detail".',
    'The lists:', ...lists,
    ...(ignored.length ? [`Words the owner ignored before (not product details): ${ignored.join(', ')}`] : []),
  ].join('\n');
  const text = phrases.map((p, i) => `${i + 1}. "${p.phrase}" (${FROM[p.source] ?? 'seen on products'}${p.attribute ? `, seen as ${p.attribute}` : ''})${p.examples.length ? ` e.g. ${p.examples.join(' · ')}` : ''}`).join('\n');
  const value = labels.length + 1 <= ENUM_MAX ? { type: 'string', enum: [...labels, 'none'] } : { type: 'string' };
  const schema = {
    type: 'object', additionalProperties: false, required: ['picks'],
    properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'value', 'why'], properties: { n: { type: 'integer' }, value, why: { type: 'string' } } } } },
  };
  return { system, text, schema };
}

/** The AI's answer → phrase number (1-based) → value id (null = none close) and why. Unknown labels count as none;
 *  numbers out of range and repeats are dropped (an unanswered phrase is asked again next time). */
export function readNearest(out: unknown, count: number, values: TaxValue[]): Map<number, { value_id: string | null; why: string }> {
  const byLabel = new Map(values.map(v => [tagKey(labelOf(v)), v.id]));
  const picks = (out as { picks?: unknown } | null)?.picks;
  const got = new Map<number, { value_id: string | null; why: string }>();
  for (const x of Array.isArray(picks) ? picks : []) {
    const p = (x ?? {}) as { n?: unknown; value?: unknown; why?: unknown };
    const n = Number(p.n);
    if (!Number.isInteger(n) || n < 1 || n > count || got.has(n)) continue;
    const why = String(p.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    got.set(n, { value_id: byLabel.get(tagKey(p.value)) ?? null, why });
  }
  return got;
}
