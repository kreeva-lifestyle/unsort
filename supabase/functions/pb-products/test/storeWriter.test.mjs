// node --test --experimental-strip-types supabase/functions/pb-products/test/
// One store, one voice (owner, 2026-11-12): the writer's prompt for a store
// (genPrompt.ts), the clean handle and the brand ending (content.ts), the
// custom fields sent to Shopify (fields.ts) and the write → check → one
// rewrite step (genWrite.ts) against a fake AI (fetch is replaced).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { cleanHandle, cleanHtml, withBrand } = await import('../content.ts');
const { detailFields, faqHtml, faqRichText, fieldInputs } = await import('../fields.ts');
const { factValues, fixAsk, genFacts, genSchema, genSystem, limitsOf } = await import('../genPrompt.ts');
const { tidyOut, writeCopy } = await import('../genWrite.ts');
const { profileOf } = await import('../profile.ts');

const P = { id: 'p1', name: 'Zari Kurta Set', category: 'Kurta Set', fabric: 'Georgette', color: 'Maroon', sizes: ['M', 'L'], sku: 'RG-1042', source: 'telegram',
  raw_text: 'RG-1042 rate 899 call 9876543210', attributes: { work: 'Zari', occasion: 'Festive', set_contents: 'Kurta, Pant and Dupatta', sku: 'X9', seo_title: 'Their title', wash_care: '' } };
const SITE = { name: 'Kreeva India', content: { profile: { brand_name: 'Kreeva', market: 'India', audience: 'Women 25 to 40', angle: 'Festive wear that is easy to carry', delivery: 'Ships in 5 to 7 days', returns: '7 day returns' }, title_formula: 'Colour, fabric, type, then the work' } };
const FAQ = [{ q: 'Is the dupatta included?', a: 'Yes <it> is.' }];

test('prompt: the store profile, the ten rules and the output shape', () => {
  const profile = profileOf(SITE);
  const sys = genSystem({ c: SITE.content, profile, extraMax: 3, allowed: ['Festive', 'Wedding Guest'], photos: 4, imported: true });
  for (const part of ['"Kreeva"', '- Market: India', '- Audience: Women 25 to 40', '- Angle (what this store leads with): Festive wear that is easy to carry',
    '- Title formula: Colour, fabric, type, then the work', '- Delivery time: Ships in 5 to 7 days', '- Returns: 7 day returns', 'British / Indian (colour, jewellery)', 'Measurements in inches',
    '2. Never copy any run of 5 or more words', '5. PRIMARY KEYWORD', '8. No vendor or supplier names', 'ending with "| Kreeva"', '140 to 155 characters',
    '<h3>Ordering from Kreeva</h3>', 'image_alts: exactly 4', 'only from the allowed list', 'copied from another online store']) assert.ok(sys.includes(part), part);
  assert.ok(!sys.includes('Stitching options')); // not given → not mentioned
  // Owner, 2026-11-12: the photos overrule the facts for what can be seen; the fabric is never reworded.
  for (const part of ['9. Check the facts against the photos', 'write what the photos show', 'seo_title, seo_description, image_alts and faq alike',
    '10. The fabric is the one thing a photo cannot tell', 'word for word as PRODUCT FACTS gives it', 'leave the fabric out instead of shortening it']) assert.ok(sys.includes(part), part);
  const bare = genSystem({ c: {}, profile: profileOf({ name: 'Arya', content: {} }), extraMax: 0, allowed: [], photos: 0, imported: false });
  assert.ok(!bare.includes('Check the facts against the photos') && bare.includes('9. The fabric is the one thing a photo cannot tell')); // no photos: nothing to check against
  assert.ok(bare.includes('no ordering section') && bare.includes('image_alts: [].') && bare.includes('extra_tags: [].') && !bare.includes('Ordering from Arya'));
  assert.deepEqual(limitsOf({}), { titleMax: 70, metaTitleMax: 60, metaDescMax: 155, metaDescMin: 140, wordsMax: 200, wordsMin: 130 });
});

test('schema: extra tags are held to the allowed list when one is given', () => {
  assert.deepEqual(genSchema(['Festive']).properties.extra_tags.items, { type: 'string', enum: ['Festive'] });
  assert.deepEqual(genSchema().properties.extra_tags.items, { type: 'string' });
  assert.ok(genSchema().required.includes('faq') && genSchema().required.includes('missing_facts'));
});

test('facts: keyword, facts, source text and the other versions; no codes, supplier or the other store\'s SEO', () => {
  const others = [{ title: 'Other title', description_html: '<p>Their opening line. More.</p>', seo_title: 'Other | Arya', seo_description: 'Other meta', image_alts: ['Alt A'] }];
  const t = genFacts(P, { keyword: 'Maroon Georgette Kurta Set', photos: 3, others, tags: ['Maroon', 'Zari'] });
  for (const part of ['PRIMARY KEYWORD: Maroon Georgette Kurta Set', 'IMAGE COUNT: 3', '- colour: Maroon', '- set contents: Kurta, Pant and Dupatta', '- tagged as: Maroon, Zari',
    'SOURCE TEXT (facts reference only', 'Version 1', '- opens with: Their opening line', '- image alts: Alt A']) assert.ok(t.includes(part), part);
  assert.ok(!t.includes('design code') && !t.includes('- sku') && !t.includes('Their title') && !t.includes('wash care'));
  assert.ok(genFacts({ ...P, raw_text: null, sizes: [] }, { keyword: '', photos: 0, others: [] }).includes('(none yet: this is the first store)'));
  assert.deepEqual(factValues(P, ['Zari']), ['Zari Kurta Set', 'Kurta Set', 'Georgette', 'Maroon', 'M', 'L', 'Zari', 'Festive', 'Kurta, Pant and Dupatta', 'Zari']);
});

test('handle: 3 to 6 clean words, no codes; the keyword stands in for a thin one', () => {
  assert.equal(cleanHandle('maroon-georgette-kurta-set-zari-work-festive-wear', 'x', null), 'maroon-georgette-kurta-set-zari-work');
  assert.equal(cleanHandle('Maroon Kurta Set RG-1042', 'x', 'RG-1042'), 'maroon-kurta-set'); // the design code goes
  assert.equal(cleanHandle('rg-kurta-1042-set-maroon', 'x', 'RG-1042'), 'rg-kurta-set-maroon'); // and its numbered part on its own
  assert.equal(cleanHandle('kurta', 'Maroon Georgette Kurta Set', null), 'maroon-georgette-kurta-set');
  assert.equal(cleanHandle('3-piece-kurta-set', 'x', 'D-77'), '3-piece-kurta-set');
  assert.equal(cleanHandle('', '', null), '');
});

test('SEO title: always ends with the brand, inside the limit', () => {
  assert.equal(withBrand('Maroon Georgette Kurta Set', 'Kreeva', 60), 'Maroon Georgette Kurta Set | Kreeva');
  assert.equal(withBrand('Maroon Georgette Kurta Set | Kreeva', 'Kreeva', 60), 'Maroon Georgette Kurta Set | Kreeva');
  assert.equal(withBrand('Maroon Georgette Kurta Set - kreeva', 'Kreeva', 60), 'Maroon Georgette Kurta Set | Kreeva');
  const long = withBrand('Maroon Georgette Kurta Set with Zari Work and Matching Dupatta for Festive Wear', 'Kreeva Lifestyle', 60);
  assert.ok(long.length <= 60 && long.endsWith(' | Kreeva Lifestyle'), long);
  assert.equal(withBrand('Maroon Kurta', '', 60), 'Maroon Kurta');
});

test('description HTML: h3 headings survive, everything else as before', () => {
  assert.equal(cleanHtml('<h2 class="x">How to wear it</h2><p onclick="x">Pair it.</p><a href="x">link</a><script>x</script>'), '<h3>How to wear it</h3><p>Pair it.</p>link');
});

test('custom fields: five details from the facts and the FAQ as rich text; empty ones are not sent', () => {
  assert.deepEqual(detailFields(P), { fabric: 'Georgette', work: 'Zari', colour: 'Maroon', occasion: 'Festive', set_contents: 'Kurta, Pant and Dupatta' });
  assert.deepEqual(detailFields({ fabric: null, color: ' ', attributes: {} }), {});
  const f = fieldInputs('gid://shopify/Product/1', P, FAQ);
  assert.deepEqual(f.map(x => `${x.namespace}.${x.key}:${x.type}`), ['custom.fabric:single_line_text_field', 'custom.work:single_line_text_field', 'custom.colour:single_line_text_field',
    'custom.occasion:single_line_text_field', 'custom.set_contents:single_line_text_field', 'custom.faq:rich_text_field']);
  assert.ok(f.every(x => x.ownerId === 'gid://shopify/Product/1'));
  assert.deepEqual(JSON.parse(faqRichText(FAQ)), { type: 'root', children: [
    { type: 'paragraph', children: [{ type: 'text', value: 'Is the dupatta included?', bold: true }] }, { type: 'paragraph', children: [{ type: 'text', value: 'Yes <it> is.' }] }] });
  assert.equal(fieldInputs('x', { fabric: null, color: null, attributes: {} }, []).length, 0);
  assert.equal(faqHtml(FAQ), '<h3>Questions</h3><p><strong>Is the dupatta included?</strong><br>Yes &lt;it&gt; is.</p>');
  assert.equal(faqHtml([]), '');
});

// ── write → check → one rewrite ──
const DRAFT = { title: 'T', description_html: '<p>D — more</p>', seo_title: 'S', seo_description: 'M', handle: 'h', extra_tags: [], image_alts: ['a1', 'a2'],
  faq: [{ q: 'Q1', a: 'A1' }, { q: '', a: 'x' }, { q: 'Q3', a: 'A3' }, { q: 'Q4', a: 'A4' }], missing_facts: ['wash care', ''] };
function ai(replies) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('app_secrets')) return new Response(JSON.stringify([{ value: 'sk-test' }]));
    if (!u.startsWith('https://api.anthropic.com/')) throw new Error(`unexpected ${u}`);
    calls.push(JSON.parse(init.body));
    const r = replies[calls.length - 1];
    return r ? new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 1000, output_tokens: 1000 } })) : new Response('{}', { status: 500 });
  };
  return calls;
}
const ask = (check, hardMs = 120_000) => writeCopy({ model: 'claude-haiku-5-5', effort: '', system: 'SYS', photos: [{ type: 'image', source: { type: 'url', url: 'https://x/1.jpg' } }], facts: 'FACTS',
  schema: genSchema(), check, budget: { soft: Date.now() + 60_000, hard: Date.now() + hardMs } });
const problem = (code, hard) => ({ code, hard, say: `say ${code}`, fix: `fix ${code}` });

test('tidyOut: safe fixes only: no long dashes, at most two questions, empty entries dropped', () => {
  const t = tidyOut(DRAFT);
  assert.equal(t.description_html, '<p>D, more</p>');
  assert.deepEqual(t.faq, [{ q: 'Q1', a: 'A1' }, { q: 'Q3', a: 'A3' }]);
  assert.deepEqual(t.missing_facts, ['wash care']);
});

test('a clean draft is not rewritten', async () => {
  const calls = ai([DRAFT]);
  const w = await ask(g => ({ g, problems: [] }));
  assert.deepEqual([calls.length, w.rewrote, w.problems.length], [1, false, 0]);
  assert.equal(calls[0].messages[0].content[0].type, 'image');
});

test('problems → one rewrite with the draft and the fixes, text only; both calls are paid for', async () => {
  const calls = ai([DRAFT, { ...DRAFT, title: 'Better' }]);
  const w = await ask(g => ({ g, problems: g.title === 'Better' ? [] : [problem('copied', true)] }));
  assert.deepEqual([calls.length, w.rewrote, w.g.title, w.problems.length], [2, true, 'Better', 0]);
  const second = calls[1].messages[0].content;
  assert.ok(second.every(b => b.type === 'text') && second[1].text.includes('1. fix copied') && second[1].text.includes('"title":"T"'));
  const one = (await (ai([DRAFT]), ask(g => ({ g, problems: [] })))).usd;
  assert.ok(Math.abs(w.usd - 2 * one) < 1e-9 && one > 0);
});

test('a rewrite that is worse, fails or has no time left keeps the first draft and its problems', async () => {
  ai([DRAFT, { ...DRAFT, title: 'Worse' }]);
  const worse = await ask(g => ({ g, problems: g.title === 'Worse' ? [problem('copied', true), problem('names', true)] : [problem('copied', true)] }));
  assert.deepEqual([worse.g.title, worse.problems.map(p => p.code), worse.rewrote], ['T', ['copied'], true]);
  ai([DRAFT]); // the second call answers 500
  const failed = await ask(g => ({ g, problems: [problem('tells', false)] }));
  assert.deepEqual([failed.g.title, failed.problems.length, failed.rewrote], ['T', 1, false]);
  const calls = ai([DRAFT, DRAFT]);
  const late = await ask(g => ({ g, problems: [problem('copied', true)] }), 30_000);
  assert.deepEqual([calls.length, late.rewrote, late.problems.length], [1, false, 1]);
});

test('a rewrite never changes how many photos are described', async () => {
  ai([DRAFT, { ...DRAFT, title: 'Better', image_alts: ['only one'] }]);
  const w = await ask(g => ({ g, problems: g.title === 'Better' ? [] : [problem('tells', false)] }));
  assert.deepEqual(w.g.image_alts, ['a1', 'a2']);
});

test('fixAsk lists the fixes in order', () => {
  assert.ok(fixAsk(tidyOut(DRAFT), [problem('a', true), problem('b', false)]).includes('1. fix a\n2. fix b'));
});
