// suggestions_nearest { ids[≤20] } (admin|manager, from the Tags page): the nearest value already in the lists for
// pending suggestions (owner, 2026-11-13). The word rules answer first (tagNearest.ts); what they leave goes to the AI
// in ONE call, with the lists, the words the owner filed under each value and the words ignored before, and its
// answer is kept on the suggestion (pb_tag_suggestions.nearest), so a phrase is paid for once. Asked for by a person's
// page, so the daily AI limit does not hold it back (brake.ts); the cost is logged as 'tags_matched', which
// pb_ai_cost_since counts (20261113190000_pb_tag_nearest.sql), and a paid failure as 'failed' (step tags_match).
import { uuid, type Body } from './actions.ts';
import { askClaude } from './ai.ts';
import { enc, getSettings, logActivity, nowIso, patch, sel } from './db.ts';
import { HttpError, plain, usdOf } from './http.ts';
import { type AskPhrase, type Nearest, type StoredNearest, nearestOf, nearestPrompt, readNearest } from './tagNearest.ts';
import { loadTaxonomy, taxValues } from './taxonomy.ts';

interface Row { id: string; phrase: string; attribute_id: string | null; source: string; examples: string[]; nearest: StoredNearest | null }

export async function suggestionsNearest(b: Body, userId: string | null) {
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(v => uuid(v, 'A suggestion')))].slice(0, 20);
  if (!ids.length) return { ok: true, nearest: {} };
  const [rows, tax] = await Promise.all([
    sel<Row>(`pb_tag_suggestions?id=in.(${ids.map(enc).join(',')})&status=eq.pending&select=id,phrase,attribute_id,source,examples,nearest`),
    loadTaxonomy(),
  ]);
  const values = taxValues(tax);
  const out: Record<string, Nearest> = {};
  const ask: Row[] = [];
  for (const r of rows) {
    const n = nearestOf(r, values);
    if (n) out[r.id] = n; else ask.push(r);
  }
  if (!ask.length || !values.length) return { ok: true, nearest: out };

  const pids = [...new Set(ask.flatMap(r => r.examples.slice(0, 2)))];
  const [products, ignored, s] = await Promise.all([
    pids.length ? sel<{ id: string; name: string | null }>(`pb_products?id=in.(${pids.map(enc).join(',')})&select=id,name`) : Promise.resolve([]),
    sel<{ phrase: string }>('pb_tag_suggestions?status=eq.ignored&select=phrase&order=updated_at.desc&limit=40'),
    getSettings(),
  ]);
  const names = new Map(products.map(p => [p.id, p.name || '']));
  const attrName = new Map(tax.attrs.map(a => [a.id, a.name]));
  const phrases: AskPhrase[] = ask.map(r => ({
    phrase: r.phrase, source: r.source, attribute: r.attribute_id ? attrName.get(r.attribute_id) ?? null : null,
    examples: r.examples.slice(0, 2).map(id => names.get(id) ?? '').filter(Boolean),
  }));
  const p = nearestPrompt(values, tax.attrs.map(a => a.name), phrases, ignored.map(x => x.phrase));
  let ai: Awaited<ReturnType<typeof askClaude<unknown>>>;
  try {
    ai = await askClaude<unknown>({ model: s.reader.model, effort: s.reader.effort, system: p.system, content: [{ type: 'text', text: p.text }], schema: p.schema, maxTokens: 3000, timeoutMs: 45_000 });
  } catch (e) {
    if (usdOf(e)) await logActivity({ action: 'failed', details: { step: 'tags_match', error: plain(e), usd: usdOf(e) }, user_id: userId });
    // ai.ts says "— it will be tried again" for the worker; here nothing retries until the page asks again.
    throw new HttpError(e instanceof HttpError ? e.status : 502, plain(e).replace(/\s*—\s*it will be tried again[^.]*\./, '.'));
  }
  const got = readNearest(ai.data, ask.length, values);
  const at = nowIso();
  let matched = 0;
  await Promise.all(ask.map(async (r, i) => {
    const g = got.get(i + 1);
    if (!g) return; // not answered: asked again next time
    const kept: StoredNearest = { value_id: g.value_id, why: g.why, at };
    await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}&status=eq.pending`, { nearest: kept }, 'id');
    const n = nearestOf({ ...r, nearest: kept }, values);
    if (n) { out[r.id] = n; if (n.value_id) matched++; }
  }));
  await logActivity({ action: 'tags_matched', details: { model: ai.model, usd: ai.usd, phrases: ask.length, matched }, user_id: userId });
  return { ok: true, nearest: out };
}
