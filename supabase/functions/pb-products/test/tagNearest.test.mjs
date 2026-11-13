// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The nearest value for a suggestion (tagNearest.ts): the word rules, the AI's kept answer, the prompt and its reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestByRules, nearestOf, nearestPrompt, readNearest } from '../tagNearest.ts';

const V = (id, attribute_id, attribute, name, aliases = []) => ({ id, attribute_id, attribute, name, key: name.toLowerCase(), aliases });
const VALUES = [
  V('c-pink', 'col', 'Colour', 'Pink'), V('c-green', 'col', 'Colour', 'Green', ['mehendi green']),
  V('f-silk', 'fab', 'Fabric', 'Silk'), V('f-art', 'fab', 'Fabric', 'Art Silk', ['crunchy silk', 'vichitra silk']), V('f-net', 'fab', 'Fabric', 'Net'),
  V('w-emb', 'work', 'Work', 'Embroidery', ['zari work', 'sequence']), V('w-lace', 'work', 'Work', 'Lace'),
  V('o-meh', 'occ', 'Occasion', 'Mehendi'),
];

test('rules: a look-alike first, as the card showed it', () => {
  const t = nearestByRules('Embroided', 'work', VALUES);
  assert.deepEqual([t.value, t.attribute, t.by, t.why], ['Embroidery', 'Work', 'rules', 'Most likely a typo of it.']);
  assert.equal(nearestByRules('Rani Pink', 'col', VALUES).value, 'Pink');
  assert.equal(nearestByRules('Rani Pink', 'col', VALUES).why, 'A shade of it.');
  const via = nearestByRules('Vichitra Silks', 'fab', VALUES);
  assert.deepEqual([via.value, via.why], ['Art Silk', 'The same word in another form. It matches “Vichitra Silk”.']);
  assert.equal(nearestByRules('Silk', 'work', VALUES).value, 'Silk'); // a Fabric value seen under Work
});

test('rules: a name or "also known as" word of two words or more inside the phrase, the longest, own attribute first', () => {
  const zari = nearestByRules('Heavy Zari Work', 'work', VALUES);
  assert.deepEqual([zari.value, zari.why], ['Embroidery', 'It contains “Zari Work”, filed under Embroidery.']);
  assert.deepEqual(['value', 'why'].map(k => nearestByRules('Pure Crunchy Silk', 'fab', VALUES)[k]), ['Art Silk', 'It contains “Crunchy Silk”, filed under Art Silk.']);
  assert.equal(nearestByRules('Mehendi Green Silk', 'col', VALUES).value, 'Green'); // its own attribute (Colour) first
  assert.equal(nearestByRules('Mehendi Green Silk', 'occ', VALUES).value, 'Green'); // nothing in Occasion: every attribute
  // one word is not enough (13 Nov replay: "contains Silk" was wrong for five silks): the AI decides
  assert.equal(nearestByRules('Kora Silk', 'fab', VALUES), null);
  assert.equal(nearestByRules('Net Embroidery', 'work', VALUES), null);
  assert.equal(nearestByRules('Lace Work', 'work', VALUES), null);
  const two = [...VALUES, V('w-gota', 'work', 'Work', 'Gota Patti')];
  assert.equal(nearestByRules('Zari Work Gota Patti', 'work', two), null); // two values as long: the AI decides
  // a look-alike still comes first, as the card always showed it
  assert.equal(nearestByRules('Sequence Lace', 'work', VALUES).why, 'Spelled almost the same. It matches “Sequence”.');
  assert.equal(nearestByRules('Ideal Collection', null, VALUES), null);
  assert.equal(nearestByRules('Kurtas & Suits', null, VALUES), null);
});

test('the AI answer kept on a suggestion: its value, none close, or a value deleted since (ask again)', () => {
  const at = '2026-11-13T19:00:00Z';
  const ai = nearestOf({ phrase: 'Kurta Fabric Blend', attribute_id: 'fab', nearest: { value_id: 'f-art', why: 'A blended silk', at } }, VALUES);
  assert.deepEqual(ai, { value_id: 'f-art', value: 'Art Silk', attribute_id: 'fab', attribute: 'Fabric', why: 'A blended silk', by: 'ai' });
  assert.deepEqual(nearestOf({ phrase: 'Ideal Collection', attribute_id: null, nearest: { value_id: null, why: 'A store collection name', at } }, VALUES),
    { value_id: null, value: null, attribute_id: null, attribute: null, why: 'A store collection name', by: 'ai' });
  assert.equal(nearestOf({ phrase: 'Ideal Collection', attribute_id: null, nearest: { value_id: 'gone', why: 'x', at } }, VALUES), null);
  assert.equal(nearestOf({ phrase: 'Ideal Collection', attribute_id: null, nearest: null }, VALUES), null);
  assert.equal(nearestOf({ phrase: 'Pure Crunchy Silk', attribute_id: 'fab', nearest: { value_id: 'f-net', why: 'old', at } }, VALUES).value, 'Art Silk'); // rules first
});

test('the prompt: the lists with what was filed under each value, the words ignored before, the phrases', () => {
  const p = nearestPrompt(VALUES, ['Colour', 'Fabric', 'Work', 'Occasion'], [
    { phrase: 'Ideal Collection', attribute: null, source: 'store', examples: ['Black Organza Suit', 'Wine Lehenga'] },
    { phrase: 'Kora', attribute: 'Fabric', source: 'ai', examples: [] },
  ], ['Men', 'Plus Size']);
  assert.match(p.system, /Fabric: Silk; Art Silk \[crunchy silk, vichitra silk\]; Net/);
  assert.match(p.system, /ignored before \(not product details\): Men, Plus Size/);
  assert.equal(p.text, '1. "Ideal Collection" (a store tag) e.g. Black Organza Suit · Wine Lehenga\n2. "Kora" (noticed by the AI, seen as Fabric)');
  const value = p.schema.properties.picks.items.properties.value;
  assert.ok(value.enum.includes('Fabric: Art Silk') && value.enum.includes('none') && value.enum.length === VALUES.length + 1);
  assert.equal(nearestPrompt(VALUES, [], [], []).system.includes('ignored before'), false);
  const many = Array.from({ length: 320 }, (_, i) => V(`x${i}`, 'col', 'Colour', `Shade ${i}`));
  assert.deepEqual(nearestPrompt(many, ['Colour'], [], []).schema.properties.picks.items.properties.value, { type: 'string' });
});

test('reading the answer: listed labels only, none, numbers in range, first answer per phrase, short why', () => {
  const got = readNearest({ picks: [
    { n: 1, value: 'fabric: art silk', why: '  A kind of\nsilk  ' },
    { n: 2, value: 'none', why: 'A store collection name' },
    { n: 3, value: 'Fabric: Raw Silk', why: 'made up' },
    { n: 1, value: 'Colour: Pink', why: 'a second answer' },
    { n: 9, value: 'Colour: Pink', why: 'out of range' },
    { n: 'x', value: 'Colour: Pink', why: '' },
    { n: 4, value: 'Work: Lace', why: 'w'.repeat(300) },
  ] }, 4, VALUES);
  assert.deepEqual(Object.fromEntries(got), {
    1: { value_id: 'f-art', why: 'A kind of silk' }, 2: { value_id: null, why: 'A store collection name' },
    3: { value_id: null, why: 'made up' }, 4: { value_id: 'w-lace', why: 'w'.repeat(140) },
  });
  assert.equal(readNearest(null, 3, VALUES).size, 0);
  assert.equal(readNearest({ picks: 'no' }, 3, VALUES).size, 0);
});
