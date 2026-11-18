// node --test --experimental-strip-types supabase/functions/pb-products/test/
// New tag words filed by themselves (owner, 17 Nov 2026: "merged automatic with the best possible AI suggestion rest
// should be automatically ignore"): tagFilePrompt.ts (the AI's question and how its answer is read) and tagsFile.ts
// (one worker pass) over a fake database and a fake AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { decide, filePrompt, readFile } = await import('../tagFilePrompt.ts');
const { FILE_MODEL, fileWords, surely } = await import('../tagsFile.ts');

const V = (id, attribute_id, attribute, name, aliases = []) => ({ id, attribute_id, attribute, name, key: name.toLowerCase(), aliases });
const VALUES = [V('black', 'col', 'Colour', 'Black', ['kala']), V('pink', 'col', 'Colour', 'Pink'), V('emb', 'work', 'Work', 'Embroidery', ['zari work']),
  V('silk', 'fab', 'Fabric', 'Art Silk', ['crunchy silk'])];

test('the question: every listed value and "none" are the only answers, with how close; the words a person ignored', () => {
  const p = filePrompt(VALUES, ['Colour', 'Work', 'Fabric'], [{ phrase: 'Rani Pink', attribute: 'Colour', source: 'ai', examples: ['Pink lehenga'] }], ['Sale']);
  const item = p.schema.properties.picks.items;
  assert.deepEqual(item.properties.value.enum, ['Colour: Black', 'Colour: Pink', 'Work: Embroidery', 'Fabric: Art Silk', 'none']);
  assert.deepEqual(item.properties.match.enum, ['same', 'kind', 'related', 'none']);
  assert.deepEqual(item.required, ['n', 'value', 'match', 'why']);
  assert.match(p.system, /Colour: Black \[kala\]; Pink/);
  assert.match(p.system, /Work: Embroidery \[zari work\]/);
  assert.match(p.system, /Words the owner ignored before \(not product details\): Sale/);
  assert.equal(p.text, '1. "Rani Pink" (noticed by the AI, seen as Colour) e.g. Pink lehenga');
});

test('the answer: same or kind files the word, related or none ignores it; a value not on the lists is no answer', () => {
  const got = readFile({ picks: [
    { n: 1, value: 'Colour: Pink', match: 'kind', why: 'A shade of pink' },
    { n: 2, value: 'Colour: Black', match: 'same', why: 'Hindi for black' },
    { n: 3, value: 'Colour: Black', match: 'related', why: 'Only the border is black' },
    { n: 4, value: 'none', match: 'none', why: 'A sale word' },
    { n: 5, value: 'Colour: Mauve', match: 'same', why: 'x' }, // not on the lists: asked again, never read as none
    { n: 6, value: 'Work: Embroidery', match: 'none', why: 'x' }, // a value but no match: none
    { n: 1, value: 'Colour: Black', match: 'same', why: 'a repeat' }, { n: 9, value: 'none', match: 'none', why: 'out of range' },
  ] }, 6, VALUES);
  assert.deepEqual([...got.keys()].sort(), [1, 2, 3, 4, 6]);
  assert.deepEqual([1, 2, 3, 4, 6].map(n => decide(got.get(n))), ['pink', 'black', null, null, null]);
  assert.equal(got.get(1).why, 'A shade of pink');
  assert.equal(readFile(null, 3, VALUES).size, 0);
});

test('the word rules file only what they are sure of; a typo or a near spelling goes to the AI', () => {
  assert.equal(surely({ phrase: 'Kala', attribute_id: 'col' }, VALUES)?.value_id, 'black'); // a word already filed under it
  assert.equal(surely({ phrase: 'Blacks', attribute_id: 'col' }, VALUES)?.value_id, 'black'); // the same word in another form
  assert.equal(surely({ phrase: 'Back', attribute_id: null }, VALUES), null); // a typo of Black: not trusted (it made Back → Black)
  assert.equal(surely({ phrase: 'Brunchy Silk', attribute_id: 'fab' }, VALUES), null); // close to "crunchy silk": not trusted
  assert.equal(surely({ phrase: 'Premium Finishing', attribute_id: null }, VALUES), null);
});

/** A fake database and AI for one pass: `words` are what the claim returns; `ai` the AI's picks (or a status). */
function world({ words, ai = { picks: [] }, aiStatus = 200, products = [] } = {}) {
  const calls = { ai: [], filed: [], patches: [], add: [], activity: [], runs: [], tagged: [] };
  const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    if (u.startsWith('https://api.anthropic.com/')) { calls.ai.push(body); return aiStatus === 200 ? ok({ content: [{ type: 'text', text: JSON.stringify(ai) }], usage: { input_tokens: 1000, output_tokens: 100 } }) : ok({ error: { message: 'busy' } }, aiStatus); }
    const path = u.replace('https://sb.example/rest/v1/', '');
    const run = Object.entries(init.headers || {}).find(([k]) => k.toLowerCase() === 'x-pb-bulk')?.[1];
    if (run) calls.tagged.push(path.split('?')[0]);
    if (path === 'rpc/pb_tag_file_claim') return ok(words);
    if (path === 'rpc/pb_tag_file') {
      calls.filed.push(body);
      const v = VALUES.find(x => x.id === body.p_value);
      return ok(body.p_value ? { filed: true, status: 'aliased', value_id: v.id, attribute_id: v.attribute_id } : { filed: true, status: 'ignored' });
    }
    if (path.startsWith('pb_attributes?')) return ok([{ id: 'col', name: 'Colour', key: 'colour', multi: false, position: 1 }, { id: 'work', name: 'Work', key: 'work', multi: true, position: 2 }, { id: 'fab', name: 'Fabric', key: 'fabric', multi: false, position: 3 }]);
    if (path.startsWith('pb_attribute_values?')) return ok(VALUES.map((v, i) => ({ ...v, position: i, categories: [] })));
    if (path.startsWith('pb_category_attributes?')) return ok([]);
    if (path.startsWith('pb_settings?')) return ok([{ key: 'categories', value: ['Saree'] }]);
    if (path.startsWith('app_secrets?')) return ok([{ value: 'sk-test' }]);
    if (path.startsWith('pb_tag_suggestions?') && method === 'GET') return ok([{ phrase: 'Sale' }]);
    if (path.startsWith('pb_tag_suggestions?') && method === 'PATCH') { calls.patches.push([path, body]); return ok([{ id: 'x' }]); }
    if (path.startsWith('pb_products?')) return ok(products);
    if (path === 'rpc/pb_product_values_set') { calls.add.push(body); return ok([{ id: body.p_product, status: 'ready', was: 'needs_info', missing: [] }]); }
    if (path.startsWith('pb_activity')) { calls.activity.push(body?.[0]); return ok([{}], 201); }
    if (path.startsWith('pb_bulk_runs') && method === 'POST') { calls.runs.push(body[0]); return ok([{ id: 'run1' }], 201); }
    if (path.startsWith('pb_bulk_items?') && method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/4' } });
    if (path === 'rpc/pb_bulk_products') return ok(2);
    if (path === 'rpc/pb_product_values_bulk') return ok([]);
    return ok(method === 'GET' ? [] : [{}]);
  };
  return calls;
}
const W = (id, phrase, attribute_id = null, source = 'store', examples = [], tries = 0) => ({ id, phrase, key: phrase.toLowerCase(), attribute_id, source, examples, tries });
const opts = (over = {}) => ({ budget: { soft: Date.now() + 100_000, hard: Date.now() + 140_000 }, left: () => true, capped: async () => false, stopped: async () => false, ...over });

test('a pass: sure words by the rules, the rest by the AI (same/kind filed, related/none ignored), one bulk change, products tagged', async () => {
  const words = [W('w1', 'Kala', 'col'), W('w2', 'Kora Silk', 'fab', 'ai', ['p1', 'p2']), W('w3', 'Red Border', null), W('w4', 'Premium', null), W('w5', 'Wine Tone', 'col', 'ai', [], 1)];
  const calls = world({ words, products: [{ id: 'p1', locked: [] }, { id: 'p2', locked: ['tags'] }], ai: { picks: [
    { n: 1, value: 'Fabric: Art Silk', match: 'kind', why: 'A kind of silk' }, { n: 2, value: 'Colour: Black', match: 'related', why: 'Only the border' },
    { n: 3, value: 'none', match: 'none', why: 'A marketing word' }] } }); // word 4 (Wine Tone) left unanswered
  const r = await fileWords(opts());
  assert.deepEqual(r, { aliased: 2, ignored: 2, retagged: 0, run_id: 'run1', waiting: 1 });
  assert.equal(calls.ai.length, 1); assert.equal(calls.ai[0].model, FILE_MODEL);
  assert.deepEqual(calls.filed.map(f => [f.p_id, f.p_value, f.p_match]), [['w1', 'black', 'same'], ['w2', 'silk', 'kind'], ['w3', null, 'related'], ['w4', null, 'none']]);
  assert.deepEqual(calls.filed.map(f => f.p_why), ['The same word.', 'A kind of silk', 'Only the border', 'A marketing word']);
  assert.match(calls.runs[0].label, /^Filed 4 new words by itself: 2 also known as their nearest values, 2 ignored \(Kala, Kora Silk, Red Border and 1 more\)$/);
  assert.equal(calls.runs[0].kind, 'suggestions'); assert.equal(calls.runs[0].created_by, null);
  assert.ok(calls.tagged.includes('rpc/pb_tag_file'), 'the filing is part of the bulk change');
  // the AI read "Kora Silk" from p1 and p2 as a Fabric: p1 gets Art Silk where it has no Fabric; p2's tags are locked
  assert.deepEqual(calls.add.map(a => [a.p_product, a.p_rows[0].value_id, a.p_mode, a.p_attributes]), [['p1', 'silk', 'add', ['fab']]]);
  // unanswered: one more try counted (guarded by the old count), not filed
  assert.deepEqual(calls.patches.map(([p, b]) => [p.includes('id=eq.w5') && p.includes('tries=eq.1'), b]), [[true, { tries: 2 }]]);
  const cost = calls.activity.find(a => a.action === 'tags_matched');
  assert.equal(cost.details.phrases, 4); assert.equal(cost.details.matched, 1); assert.ok(cost.details.usd > 0);
});

test('a pass: a word the AI never answers is ignored at its third try; an AI failure is logged and the words wait', async () => {
  let calls = world({ words: [W('w1', 'Odd Word', null, 'store', [], 2)], ai: { picks: [] } });
  let r = await fileWords(opts());
  assert.deepEqual(calls.filed.map(f => [f.p_value, f.p_why]), [[null, 'No answer from the AI after three tries.']]);
  assert.equal(r.ignored, 1);
  calls = world({ words: [W('w1', 'Odd Word')], aiStatus: 529 });
  r = await fileWords(opts());
  assert.deepEqual(r, { aliased: 0, ignored: 0, retagged: 0, waiting: 1 });
  assert.equal(calls.filed.length, 0); assert.equal(calls.runs.length, 0);
  assert.equal(calls.activity.find(a => a.action === 'failed').details.step, 'tags_file');
});

test('a pass: the day\'s AI limit, a pause or the clock leave the AI words waiting (no try used); the rules still file', async () => {
  for (const o of [{ capped: async () => true }, { stopped: async () => true }, { left: () => false }]) {
    const calls = world({ words: [W('w1', 'Kala', 'col'), W('w2', 'Odd Word')] });
    const r = await fileWords(opts(o));
    assert.deepEqual(r, { aliased: 1, ignored: 0, retagged: 0, run_id: 'run1', waiting: 1 });
    assert.equal(calls.ai.length, 0); assert.equal(calls.patches.length, 0);
    assert.deepEqual(calls.filed.map(f => f.p_id), ['w1']);
  }
  const calls = world({ words: [] });
  assert.equal(await fileWords(opts()), null);
  assert.equal(calls.runs.length, 0);
});
