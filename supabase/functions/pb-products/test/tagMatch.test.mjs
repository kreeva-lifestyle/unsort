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

test('"Evening" and "Wedding" are not found in "even" and "wed"', () => {
  const OCCASION = { id: 'occ', name: 'Occasion', multi: true, values: [v('eve', 'Evening'), v('wedd', 'Wedding'), v('cas', 'Casual')] };
  assert.equal(matchProduct({ text: 'Comfortable even for daily wear. We wed tradition with style.' }, [OCCASION]).chosen.occ, undefined);
  assert.deepEqual(matchProduct({ text: 'An evening gown for weddings' }, [OCCASION]).chosen.occ, ['eve', 'wedd']);
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

// The word rules of 13 Nov 2026 (the tags research report: what the supplier's words already say).
const FAB2 = { id: 'fab', name: 'Fabric', multi: false, values: [v('silk', 'Silk'), v('chs', 'Chanderi Silk'), v('art', 'Art Silk'), v('geo', 'Georgette')] };
const OCC = { id: 'occ', name: 'Occasion', multi: true, values: [v('meh', 'Mehendi'), v('haldi', 'Haldi'), v('party', 'Party')] };
const COL1 = { id: 'col', name: 'Colour', multi: false, values: [v('green', 'Green'), v('yellow', 'Yellow'), v('pink', 'Pink'), v('blue', 'Blue')] };
const WORK2 = { id: 'work', name: 'Work', multi: true, values: [v('dp', 'Digital Print'), v('emb', 'Embroidery'), v('mir', 'Mirror Work')] };

test('a two-word value that refines another is found with its words turned round ("Pure Roman Silk Chanderi")', () => {
  assert.deepEqual(matchProduct({ text: 'Pure Roman Silk Chanderi with zari' }, [FAB2]).chosen.fab, ['chs']);
  assert.deepEqual(matchProduct({ text: 'Fabric: Silk Art blend' }, [FAB2]).chosen.fab, ['art']);
  // only for a refinement: "Work" is not a value, so "work mirror" is not Mirror Work
  assert.equal(matchProduct({ text: 'heavy embroidery work mirror finish' }, [WORK2]).chosen.work.includes('mir'), false);
});

test('a one-value attribute takes the value that refines the best one: Chanderi Silk over Silk', () => {
  assert.deepEqual(matchProduct({ name: 'Silk Anarkali', text: 'pure chanderi silk with zari' }, [FAB2]).chosen.fab, ['chs']);
  assert.deepEqual(matchProduct({ name: 'Silk Anarkali', text: 'georgette dupatta' }, [FAB2]).chosen.fab, ['silk']); // not a refinement: the name wins
});

test('a word that is part of a colour\'s name counts for Colour only ("Mehendi Green" is not the Mehendi occasion)', () => {
  const r = matchProduct({ name: 'Mehendi Green Anarkali Suit' }, [COL1, OCC]);
  assert.deepEqual(r.chosen.col, ['green']);
  assert.equal(r.chosen.occ, undefined);
  assert.equal(matchProduct({ text: 'Haldi Yellow sharara set' }, [COL1, OCC]).chosen.occ, undefined);
  // the guard works when only Occasion is looked for (Let AI decide with Colour already filled)
  assert.equal(matchProduct({ facts: ['Mehendi Green'] }, [OCC], { shades: COL1.values }).chosen.occ, undefined);
  // a Colour alias of two words covers its first word too
  const withAlias = { ...COL1, values: [...COL1.values, v('mg', 'Mehndi', ['mehendi green'])] };
  assert.equal(matchProduct({ text: 'mehendi green' }, [OCC], { shades: withAlias.values }).chosen.occ, undefined);
  // still the occasion when it is one
  assert.deepEqual(matchProduct({ text: 'Perfect for mehendi and haldi functions. Colour: green' }, [COL1, OCC]).chosen.occ, ['meh', 'haldi']);
});

test('a fabric or a work before a colour keeps both ("Georgette Pink", "Embroidered Blue")', () => {
  const r = matchProduct({ name: 'Georgette Pink Anarkali', text: 'Embroidered Blue dupatta' }, [COL1, FAB2, WORK2]);
  assert.deepEqual(r.chosen.fab, ['geo']);
  assert.deepEqual(r.chosen.work, ['emb']);
});

test('"Digitally Printed" is Digital Print', () => {
  assert.deepEqual(matchProduct({ text: 'Digitally Printed georgette kurta' }, [WORK2]).chosen.work, ['dp']);
});
