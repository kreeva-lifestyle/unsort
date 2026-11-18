// Pure: the AI's half of filing new tag words (tagsFile.ts; owner, 2026-11-17: "merged automatic with the best possible
// AI suggestion rest should be automatically ignore"). One call files up to 20 words. It sees the lists with the words
// already filed under each value, the words a PERSON ignored (never the worker's own, so it does not learn from its
// guesses), and each new word with where it was seen and example products. For every word it names a listed value (or
// none) and how close it is:
//   same    — the same thing in other words, spelling or language (Rani Pink is not "same" as Pink)
//   kind    — a specific kind of that value (Rani Pink → Pink, Heavy Zari Work → Embroidery, Kora Silk → Art Silk)
//   related — only loosely connected (Red Border → Red, Gold Accents → Golden), or none — nothing close
// Only same and kind are filed; related and none are ignored. An answer that names no listed value is left unanswered
// (asked again), never read as "none". No I/O — tested in test/tagFile.test.mjs.
import type { TaxValue } from './tagLook.ts';
import { tagKey } from './tagText.ts';

export type Match = 'same' | 'kind' | 'related' | 'none';
export const MATCHES: Match[] = ['same', 'kind', 'related', 'none'];
/** The answers that file a word as "also known as". */
export const MERGES: Match[] = ['same', 'kind'];
export interface FilePhrase { phrase: string; attribute: string | null; source: string; examples: string[] }
export interface FileAnswer { value_id: string | null; match: Match; why: string }

/** Above this many values the label is checked here instead of by the schema's enum. */
const ENUM_MAX = 300;
/** Words shown per value: enough for every list today (the most is ~150), short enough for one call. */
const ALIASES_MAX = 120;
const FROM: Record<string, string> = { store: 'a store tag', ai: 'noticed by the AI', text: 'in a post' };
const labelOf = (v: TaxValue) => `${v.attribute}: ${v.name}`;

export function filePrompt(values: TaxValue[], attrOrder: string[], phrases: FilePhrase[], ignored: string[]) {
  const lists = attrOrder.map(a => `${a}: ${values.filter(v => v.attribute === a)
    .map(v => (v.aliases.length ? `${v.name} [${v.aliases.slice(0, ALIASES_MAX).join(', ')}]` : v.name)).join('; ')}`);
  const system = [
    'You keep the tag lists of an Indian ethnic-wear shop. Each phrase below was seen on products but is not in the lists yet.',
    'For each phrase choose the ONE listed value it belongs under, copying the label exactly as "Attribute: Value" (the words in brackets were filed under that value before), and say how close it is:',
    '- same: the same thing in other words, another spelling or another language ("Kaala" → Black, "Embroided" → Embroidery).',
    '- kind: a specific kind of that value, so a shopper filtering by the value wants it ("Rani Pink" → Pink, "Heavy Zari Work" → Embroidery, "Kora Silk" → Art Silk).',
    '- related: only loosely connected, not the same detail ("Red Border" → Red, "Gold Accents" → Golden, "Pearl Buttons" → a work).',
    '- none: nothing close. Use it for store collection or sale names, marketing words ("Premium", "Designer"), sizes, genders, brand names, and details the lists do not cover (sleeve or neck styles, linings).',
    'A garment type ("Long Gown", "Anarkali Suit") belongs only under a listed value of that type, never under a colour, fabric or work; a broad category name ("Sarees", "Ethnic Wear") is none.',
    'A phrase seen as one attribute may belong under another attribute\'s value. Be strict: when unsure between kind and related, answer related.',
    'why: at most 14 plain words for the owner.',
    'The lists:', ...lists,
    ...(ignored.length ? [`Words the owner ignored before (not product details): ${ignored.join(', ')}`] : []),
  ].join('\n');
  const text = phrases.map((p, i) => `${i + 1}. "${p.phrase}" (${FROM[p.source] ?? 'seen on products'}${p.attribute ? `, seen as ${p.attribute}` : ''})${p.examples.length ? ` e.g. ${p.examples.join(' · ')}` : ''}`).join('\n');
  const labels = values.map(labelOf);
  const value = labels.length + 1 <= ENUM_MAX ? { type: 'string', enum: [...labels, 'none'] } : { type: 'string' };
  const schema = {
    type: 'object', additionalProperties: false, required: ['picks'],
    properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'value', 'match', 'why'],
      properties: { n: { type: 'integer' }, value, match: { type: 'string', enum: MATCHES }, why: { type: 'string' } } } } },
  };
  return { system, text, schema };
}

/** The answer → word number (1-based) → value (null = none) and how close. Numbers out of range, repeats and a label
 *  that is not on the lists are dropped (that word is asked again); "none" always means no value. */
export function readFile(out: unknown, count: number, values: TaxValue[]): Map<number, FileAnswer> {
  const byLabel = new Map(values.map(v => [tagKey(labelOf(v)), v.id]));
  const picks = (out as { picks?: unknown } | null)?.picks;
  const got = new Map<number, FileAnswer>();
  for (const x of Array.isArray(picks) ? picks : []) {
    const p = (x ?? {}) as { n?: unknown; value?: unknown; match?: unknown; why?: unknown };
    const n = Number(p.n);
    if (!Number.isInteger(n) || n < 1 || n > count || got.has(n)) continue;
    const why = String(p.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const label = tagKey(p.value);
    const match = MATCHES.includes(p.match as Match) ? p.match as Match : 'none';
    if (label === 'none' || match === 'none') { got.set(n, { value_id: null, match: 'none', why }); continue; }
    const id = byLabel.get(label);
    if (!id) continue; // a value that is not on the lists: not an answer
    got.set(n, { value_id: id, match, why });
  }
  return got;
}

/** File under the value, or ignore. */
export const decide = (a: FileAnswer) => (a.value_id && MERGES.includes(a.match) ? a.value_id : null);
