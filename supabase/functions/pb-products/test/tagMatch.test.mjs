// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The rules step (tagMatch.ts) and the combine step (tagAuto.ts) on real-looking posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelAttrs, matchProduct } from '../tagMatch.ts';
import { autoValues, suggestable } from '../tagAuto.ts';

const v = (id, name, aliases = []) => ({ id, name, key: name.toLowerCase(), aliases });
const COLOUR = { id: 'col', name: 'Colour', multi: true, values: [v('black', 'Black', ['kala']), v('pink', 'Pink'), v('wine', 'Wine'), v('white', 'White'), v('yellow', 'Yellow')] };
const WORK = { id: 'work', name: 'Work', multi: true, values: [v('emb', 'Embroidery'), v('print', 'Printed'), v('seq', 'Sequins')] };
const FABRIC = { id: 'fab', name: 'Fabric', multi: false, values: [v('org', 'Organza'), v('chif', 'Chiffon'), v('silk', 'Silk')] };
const ATTRS = [COLOUR, WORK, FABRIC];
const TG = 'LEHENGA CHOLI 💃\nFABRICS & WORK :- Cosmos With Beads embroidery-work\nCOLOUR :- 2 (Pink, Wine)\nRATE :- 1650/-';

test('Telegram post: label lines pick Colour Pink + Wine and Work Embroidery', () => {
  const r = matchProduct({ text: TG }, ATTRS);
  assert.deepEqual(r.chosen.col, ['pink', 'wine']);
  assert.deepEqual(r.chosen.work, ['emb']);
  assert.equal(r.chosen.fab, undefined);
});

test('labels: FABRICS & WORK names two attributes, COLOR matches Colour', () => {
  assert.deepEqual(labelAttrs('FABRICS & WORK', ATTRS), ['work', 'fab']);
  assert.deepEqual(labelAttrs('COLOR', ATTRS), ['col']);
  assert.deepEqual(labelAttrs('RATE', ATTRS), []);
});

test('label items that are not values yet become suggestions for that attribute', () => {
  const r = matchProduct({ text: 'COLOUR :- 3 (Pink, Wine, Rani)' }, ATTRS);
  assert.deepEqual(r.candidates.map(c => [c.phrase, c.attribute_id, c.source]), [['Rani', 'col', 'text']]);
});

test('one-value attribute keeps only the strongest: name beats text', () => {
  const r = matchProduct({ name: 'Silk saree', text: 'soft chiffon lining' }, ATTRS);
  assert.deepEqual(r.chosen.fab, ['silk']);
  const both = matchProduct({ text: 'organza dupatta with chiffon lining' }, ATTRS);
  assert.deepEqual(both.chosen.fab, ['org']); // earliest in the same source
});

test('stems, aliases and word boundaries', () => {
  const r = matchProduct({ name: 'Printed kurta with sequin work', facts: ['Kala'], text: 'blackberry print' }, ATTRS);
  assert.deepEqual(r.chosen.work.sort(), ['print', 'seq']);
  assert.deepEqual(r.chosen.col, ['black']); // the alias "kala"; "blackberry" is not "black"
});

test('store tags: matched ones are used, the rest are candidates (junk filtered by autoValues)', () => {
  const r = autoValues({ name: 'Wine Lehenga', attributes: { store_tags: '_altnew_KBSUIT25, _label_BUY 1 GET 1 FREE, Ideal Collection, Lehenga, SIZE_CHART, Kurtas & Suits, Organza' } }, ATTRS, { categories: ['Lehenga'] });
  assert.deepEqual(r.rows.map(x => x.value_id).sort(), ['org', 'wine']);
  assert.deepEqual(r.suggest.map(s => s.phrase), ['Ideal Collection', 'Kurtas & Suits']);
});

test('autoValues: manual attributes are left out; AI fills only what the rules left empty', () => {
  const ai = { chosen: { col: ['black'], fab: ['chif'], work: ['seq'] }, other: [{ attribute_id: 'work', phrase: 'mirror work' }] };
  const r = autoValues({ raw_text: TG }, ATTRS, { manualAttrIds: new Set(['col']), ai });
  assert.deepEqual(r.rows, [{ value_id: 'emb', source: 'rules' }, { value_id: 'chif', source: 'ai' }]);
  assert.deepEqual([...r.filled].sort(), ['fab', 'work']);
  assert.ok(r.suggest.some(s => s.phrase === 'Mirror Work' && s.source === 'ai'));
});

test('suggestable: known words dropped, an unassigned phrase takes its look-alike attribute', () => {
  const values = ATTRS.flatMap(a => a.values.map(x => ({ ...x, attribute_id: a.id, attribute: a.name })));
  const out = suggestable([
    { phrase: 'Kala', key: 'kala', attribute_id: null, source: 'store' },
    { phrase: 'Embroided', key: 'embroided', attribute_id: null, source: 'store' },
    { phrase: 'Ideal Collection', key: 'ideal collection', attribute_id: null, source: 'store' },
  ], values);
  assert.deepEqual(out.map(s => [s.phrase, s.attribute_id]), [['Embroided', 'work'], ['Ideal Collection', null]]);
});
