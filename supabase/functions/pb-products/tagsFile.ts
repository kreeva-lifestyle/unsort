// The worker step that files new tag words (worker.ts; owner, 2026-11-17: "revamp this tag thing. The whole purpose was
// to automate tag and not complicate the work of user. It should be merged automatic with the best possible AI
// suggestion rest should be automatically ignore."). There is no review screen. A word seen on products that is not in
// the lists (pb_tag_suggestions, written by ingest, the reader and "Let AI decide") is filed by itself:
//   1. take up to 40 waiting words (pb_tag_file_claim: pending, never filed by Playbook, < 3 unanswered AI tries, not
//      taken in the last 10 minutes; only when 20 wait or one has waited 15 minutes, so words go in batches and
//      Settings → Bulk changes gets a few rows an hour, not one a minute; overlapping runs never take the same word);
//   2. the word rules file a word only when they are sure: the same word, another form or order, the Hindi word, a
//      shade (tagLook.ts). A typo or "spelled almost the same" match is NOT trusted — it made wrong aliases (Back →
//      Black, Brunches → Art Silk, Koti → Khatli Work) — so those words go to the AI;
//   3. the rest goes to the AI, 20 at a time (tagFilePrompt.ts), while the clock and the day's AI limit allow: same or
//      kind → "also known as" that value; related or none → ignored. A word the AI answered around is asked again
//      later and ignored after 3 tries. A call that FAILED (no key, no credit, the AI busy or down) uses no try: the
//      words wait 30 minutes, so an outage never ignores the backlog. The day's AI limit used up → the words wait for
//      the next day (they do not wake the worker meanwhile). Cost is logged as 'tags_matched' (pb_ai_cost_since);
//   4. a word that names two values of one attribute ("Sequins Embroidery") is never filed under one of them: the
//      matcher takes the longest phrase first, so the products would lose the other value. It is ignored — the text
//      already gives both;
//   5. each word in one transaction (pb_tag_file: the alias appended in place); a whole pass is ONE bulk change, so
//      Settings → Bulk changes takes it back for 7 days, and a word taken back stays marked and is not filed again;
//   6. the products: the example products of each filed word (up to 5) are tagged again by the rules; a word the AI
//      read from a product (it may not be in the product's text) also gives that value to those products that have
//      none for it. "Retag all products" brings it to the rest.
import { askClaude } from './ai.ts';
import { istDayStart } from './brake.ts';
import { asBulk } from './bulkLog.ts';
import { enc, logActivity, patch, rpc, sel } from './db.ts';
import { plain, usdOf } from './http.ts';
import { type FileAnswer, decide, filePrompt, readFile } from './tagFilePrompt.ts';
import { type LookReason, lookAlikes } from './tagLook.ts';
import { matchProduct } from './tagMatch.ts';
import { tagsLocked, writeValues } from './tagStore.ts';
import { retagProducts } from './tagsProduct.ts';
import { type Taxonomy, loadTaxonomy, shadesOf, taxValues } from './taxonomy.ts';
import type { Budget } from './types.ts';

/** The model that files words (owner: "the best possible AI suggestion"); about 2 US cents for 20 words. */
export const FILE_MODEL = 'claude-sonnet-5-5';
/** Time a pass needs left before it starts: one AI answer and the writes. */
export const FILE_NEEDS_MS = 50_000;
const TAKE = 40, ASK = 20, TRIES = 3, FAILED_WAIT_MS = 30 * 60_000;
const SURE: Partial<Record<LookReason, string>> = {
  same: 'The same word.', same_word: 'The same word in another form.', word_order: 'The same words in another order.',
  translation: 'The Hindi or Hinglish word for it.', shade: 'A shade of it.',
};
const TWO = 'It names two values; each is found on its own.';

export interface Word { id: string; phrase: string; key: string; attribute_id: string | null; source: string; examples: string[]; tries: number }
interface Choice { w: Word; value_id: string | null; why: string; match: string }
export interface FileResult { aliased: number; ignored: number; retagged: number; waiting: number }
/** The AI's answer: picks by word number; `failed` = no answer at all ('paid' = it answered but unusably, e.g. cut off). */
type Asked = { got: Map<number, FileAnswer> } | { failed: 'paid' | 'free' };

/** The word rules' sure answer, or null (then the AI decides). */
export function surely(w: Pick<Word, 'phrase' | 'attribute_id'>, values: Parameters<typeof lookAlikes>[1]): { value_id: string; why: string } | null {
  const top = lookAlikes(w.phrase, values, { attributeId: w.attribute_id, max: 1 })[0];
  const why = top ? SURE[top.reason] : undefined;
  return top && why ? { value_id: top.value_id, why } : null;
}

/** Does the phrase already name another value of the chosen value's attribute ("Sequins Embroidery" → Embroidery)? */
export function namesTwo(phrase: string, valueId: string, tax: Taxonomy): boolean {
  const v = tax.values.find(x => x.id === valueId), a = v && tax.attrs.find(x => x.id === v.attribute_id);
  if (!a) return false;
  const values = tax.values.filter(x => x.attribute_id === a.id).map(x => ({ id: x.id, name: x.name, key: x.key, aliases: x.aliases }));
  const r = matchProduct({ name: phrase }, [{ id: a.id, name: a.name, multi: true, values }], { shades: shadesOf(tax) });
  return (r.chosen[a.id] ?? []).some(id => id !== valueId);
}

/** The words a PERSON ignored (never the worker's own, so it does not learn from its guesses), less those merged into a
 *  twin of the same word by the old "Move" (ignored as a duplicate, not as junk). */
async function personIgnored(): Promise<string[]> {
  const rows = await sel<{ phrase: string; key: string }>('pb_tag_suggestions?status=eq.ignored&filed_by=is.null&select=phrase,key&order=updated_at.desc&limit=60');
  if (!rows.length) return [];
  const list = [...new Set(rows.map(r => r.key))].map(k => `"${k.replace(/["\\]/g, '\\$&')}"`).join(',');
  const kept = new Set((await sel<{ key: string }>(`pb_tag_suggestions?key=in.(${enc(list)})&status=neq.ignored&select=key`)).map(r => r.key));
  return rows.filter(r => !kept.has(r.key)).slice(0, 40).map(r => r.phrase);
}

async function askAi(part: Word[], tax: Taxonomy, budget: Budget): Promise<Asked> {
  const values = taxValues(tax);
  const pids = [...new Set(part.flatMap(w => w.examples.slice(0, 2)))];
  const [products, ignored] = await Promise.all([
    pids.length ? sel<{ id: string; name: string | null }>(`pb_products?id=in.(${pids.map(enc).join(',')})&select=id,name`) : Promise.resolve([]),
    personIgnored(),
  ]);
  const names = new Map(products.map(p => [p.id, p.name || '']));
  const attrName = new Map(tax.attrs.map(a => [a.id, a.name]));
  const p = filePrompt(values, tax.attrs.map(a => a.name), part.map(w => ({
    phrase: w.phrase, source: w.source, attribute: w.attribute_id ? attrName.get(w.attribute_id) ?? null : null,
    examples: w.examples.slice(0, 2).map(id => names.get(id) ?? '').filter(Boolean),
  })), ignored);
  try {
    // Thinking shares max_tokens: 16k leaves room (only what is used is billed).
    const ai = await askClaude<unknown>({ model: FILE_MODEL, effort: 'medium', system: p.system, content: [{ type: 'text', text: p.text }], schema: p.schema,
      maxTokens: 16_000, timeoutMs: Math.max(10_000, Math.min(45_000, budget.hard - Date.now() - 5_000)) });
    const got = readFile(ai.data, part.length, values);
    await logActivity({ action: 'tags_matched', details: { model: ai.model, usd: ai.usd, phrases: part.length, matched: [...got.values()].filter(a => decide(a)).length } });
    return { got };
  } catch (e) {
    const usd = usdOf(e);
    await logActivity({ action: 'failed', details: { step: 'tags_file', error: plain(e), ...(usd ? { usd } : {}) } });
    return { failed: usd ? 'paid' : 'free' };
  }
}

const n = (k: number, one: string) => `${k} ${k === 1 ? one : `${one}s`}`;
const labelOf = (c: Choice[]) => {
  const a = c.filter(x => x.value_id).length, sample = c.slice(0, 3).map(x => x.w.phrase).join(', ');
  return `Filed ${n(c.length, 'new word')} by itself: ${a} also known as ${a === 1 ? 'its nearest value' : 'their nearest values'}, ${c.length - a} ignored (${sample}${c.length > 3 ? ` and ${c.length - 3} more` : ''})`;
};
/** Words left for later: taken again once tried_at is 10 minutes old (`at` moves that). */
const holdUntil = (ws: Word[], at: number) => (ws.length
  ? patch('pb_tag_suggestions', `id=in.(${ws.map(w => enc(w.id)).join(',')})&status=eq.pending`, { tried_at: new Date(at - 10 * 60_000).toISOString() })
  : Promise.resolve([]));

export async function fileWords(o: { budget: Budget; left: (ms: number) => boolean; capped: () => Promise<boolean>; stopped: () => Promise<boolean> }): Promise<FileResult | null> {
  const words = await rpc<Word[]>('pb_tag_file_claim', { p_limit: TAKE });
  if (!words?.length) return null;
  const tax = await loadTaxonomy();
  const values = taxValues(tax);
  if (!values.length) return { aliased: 0, ignored: 0, retagged: 0, waiting: words.length }; // no lists yet: the words wait
  const choices: Choice[] = [], ask: Word[] = [];
  for (const w of words) {
    const s = surely(w, values);
    if (s) choices.push({ w, value_id: s.value_id, why: s.why, match: 'same' }); else ask.push(w);
  }
  let waiting = 0;
  for (let i = 0; i < ask.length; i += ASK) {
    const part = ask.slice(i, i + ASK), rest = ask.slice(i);
    if (await o.capped()) { waiting += rest.length; await holdUntil(rest, Date.parse(istDayStart()) + 86_400_000); break; } // the next day
    if (!o.left(FILE_NEEDS_MS) || await o.stopped()) { waiting += rest.length; break; } // taken again in 10 minutes
    const r = await askAi(part, tax, o.budget);
    if ('failed' in r && r.failed === 'free') { waiting += rest.length; await holdUntil(rest, Date.now() + FAILED_WAIT_MS); break; }
    const got = 'got' in r ? r.got : new Map<number, FileAnswer>();
    for (const [j, w] of part.entries()) {
      const a = got.get(j + 1);
      if (a) { choices.push({ w, value_id: decide(a), why: a.why, match: a.match }); continue; }
      if (w.tries + 1 >= TRIES) { choices.push({ w, value_id: null, why: 'No answer from the AI after three tries.', match: 'none' }); continue; }
      waiting++;
      await patch('pb_tag_suggestions', `id=eq.${enc(w.id)}&status=eq.pending&tries=eq.${w.tries}`, { tries: w.tries + 1 });
    }
  }
  for (const c of choices) if (c.value_id && namesTwo(c.w.phrase, c.value_id, tax)) Object.assign(c, { value_id: null, why: TWO, match: 'related' });
  if (!choices.length) return { aliased: 0, ignored: 0, retagged: 0, waiting };
  return { ...await asBulk('suggestions', labelOf(choices), null, run => apply(choices, run)), waiting };
}

/** Write the choices (one transaction each) and bring the products up to date, all in the bulk change `run`. */
async function apply(choices: Choice[], run: string): Promise<Omit<FileResult, 'waiting'>> {
  let aliased = 0, ignored = 0;
  const filed: { w: Word; value_id: string; attribute_id: string }[] = [];
  for (const c of choices) {
    const r = await rpc<{ filed: boolean; status?: string; value_id?: string; attribute_id?: string }>('pb_tag_file', { p_id: c.w.id, p_value: c.value_id, p_why: c.why, p_match: c.match }, run);
    if (!r?.filed) continue; // answered meanwhile, or its value was deleted: left as it is
    if (r.status === 'aliased' && r.value_id && r.attribute_id) { aliased++; filed.push({ w: c.w, value_id: r.value_id, attribute_id: r.attribute_id }); } else ignored++;
  }
  const ids = [...new Set(filed.flatMap(f => f.w.examples))];
  let retagged = 0;
  for (let i = 0; i < ids.length; i += 50) retagged += await retagProducts(ids.slice(i, i + 50), run);
  // A word the AI read from the product for one attribute: the product gets that value where it has none for it.
  const direct = filed.filter(f => f.w.source === 'ai' && f.w.attribute_id === f.attribute_id);
  const pids = [...new Set(direct.flatMap(f => f.w.examples))];
  const open = new Set((pids.length ? await sel<{ id: string; locked: string[] | null }>(`pb_products?id=in.(${pids.map(enc).join(',')})&status=in.(ready,needs_info)&select=id,locked`) : [])
    .filter(p => !tagsLocked(p)).map(p => p.id));
  for (const f of direct) for (const pid of f.w.examples) if (open.has(pid)) await writeValues(pid, [{ value_id: f.value_id, source: 'ai' }], 'add', [f.attribute_id], run);
  await logActivity({ action: 'tags_edited', details: { what: 'auto_file', aliased, ignored, retagged, run_id: run } });
  return { aliased, ignored, retagged };
}
