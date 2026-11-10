// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The look-alike detector (tagLook.ts) on the owner's sample taxonomy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareKeys, exactIn, lookAlikes } from '../tagLook.ts';

const V = (id, attribute_id, attribute, name, aliases = []) => ({ id, attribute_id, attribute, name, key: name.toLowerCase(), aliases });
const VALUES = [
  V('c1', 'col', 'Colour', 'Black'), V('c2', 'col', 'Colour', 'Pink'), V('c3', 'col', 'Colour', 'Wine'), V('c4', 'col', 'Colour', 'White'), V('c5', 'col', 'Colour', 'Yellow'),
  V('w1', 'work', 'Work', 'Embroidery'), V('w2', 'work', 'Work', 'Printed'), V('w3', 'work', 'Work', 'Sequins'), V('w4', 'work', 'Work', 'Gota Patti'),
  V('f1', 'fab', 'Fabric', 'Organza'), V('f2', 'fab', 'Fabric', 'Chiffon'), V('f3', 'fab', 'Fabric', 'Silk', ['reshmi']),
];
const top = (p, o) => lookAlikes(p, VALUES, o)[0];

test('reasons, strongest first', () => {
  assert.deepEqual([top('black').value, top('black').reason], ['Black', 'same']);
  assert.deepEqual([top('Embroidered').value, top('Embroidered').reason], ['Embroidery', 'same_word']);
  assert.deepEqual([top('Sequin').value, top('Sequin').reason], ['Sequins', 'same_word']);
  assert.deepEqual([top('Patti Gota').value, top('Patti Gota').reason], ['Gota Patti', 'word_order']);
  assert.deepEqual([top('Kala').value, top('Kala').reason], ['Black', 'translation']);
  assert.deepEqual([top('peela').value, top('peela').reason], ['Yellow', 'translation']);
  assert.deepEqual([top('Kadhai').value, top('Kadhai').reason], ['Embroidery', 'translation']);
  assert.deepEqual([top('Rani Pink').value, top('Rani Pink').reason], ['Pink', 'shade']);
  assert.deepEqual([top('Baby Pink').value, top('Baby Pink').reason], ['Pink', 'shade']);
  assert.deepEqual([top('Embroided').value, top('Embroided').reason], ['Embroidery', 'typo']);
  assert.deepEqual([top('Chifon').value, top('Chifon').reason], ['Chiffon', 'typo']);
  assert.deepEqual([top('Organzza').value, top('Organzza').reason].map(String)[0], 'Organza');
});

test('an "also known as" word counts, and says which one matched', () => {
  const m = top('Reshmi');
  assert.equal(m.value, 'Silk'); assert.equal(m.via, 'reshmi'); assert.equal(m.reason, 'same');
});

test('cross-attribute: "Silk" added under Work is a Fabric value', () => {
  const m = top('Silk', { attributeId: 'work' });
  assert.equal(m.attribute, 'Fabric'); assert.equal(m.other_attribute, true);
  assert.equal(top('Silk', { attributeId: 'fab' }).other_attribute, false);
});

test('no false friends: short words, different colours, unrelated words', () => {
  assert.equal(compareKeys('red', 'rod'), null);
  assert.equal(lookAlikes('Maroon', VALUES).length, 0);
  assert.equal(lookAlikes('Festive', VALUES).length, 0);
  assert.equal(lookAlikes('Wine', VALUES, { excludeId: 'c3' }).some(m => m.value === 'Wine'), false);
});

test('exactIn: already a value or alias of that attribute', () => {
  assert.equal(exactIn('PINK', VALUES, 'col')?.id, 'c2');
  assert.equal(exactIn('reshmi', VALUES, 'fab')?.id, 'f3');
  assert.equal(exactIn('pink', VALUES, 'work'), null);
});
