// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName, editDistance, isNoneValue, jaroWinkler, stem, stemKey, tagKey, withoutNone, words } from '../tagText.ts';

test('tagKey: lower, accents off, punctuation to spaces, Devanagari kept', () => {
  assert.equal(tagKey('Embroidery-Work!'), 'embroidery work');
  assert.equal(tagKey('  Crêpe   Silk '), 'crepe silk');
  assert.equal(tagKey('बनारसी साड़ी'), 'बनारसी साड़ी');
  assert.equal(tagKey('Kurtas & Suits'), 'kurtas suits');
});

test('stem: plurals, -ed, -ing, -ery share one form', () => {
  for (const [a, b] of [['embroidered', 'embroidery'], ['embroideries', 'embroidery'], ['printed', 'print'], ['printing', 'prints'], ['sequins', 'sequin'], ['patches', 'patch'], ['kurtis', 'kurti'], ['beaded', 'bead']]) {
    assert.equal(stem(a), stem(b), `${a} vs ${b}`);
  }
  for (const w of ['red', 'silk', 'dress', 'string', 'need', 'status']) assert.equal(stem(w), w, w);
  assert.equal(stem('stopping'), 'stop');
  // Not -ing forms of another word: cut down they would match "even", "wed", "shirt", "leg"… in ordinary text.
  for (const w of ['evening', 'wedding', 'shirting', 'lining', 'legging']) assert.equal(stem(w), w);
  assert.equal(stem('evenings'), 'evening');
  assert.equal(stem('leggings'), 'legging');
  assert.equal(stem('even'), 'even');
  assert.equal(stem('digitally'), 'digital'); // "Digitally Printed" is Digital Print (13 Nov 2026)
  assert.equal(stemKey('Digitally Printed'), stemKey('Digital Print'));
});

test('words / stemKey', () => {
  assert.deepEqual(words('Cosmos With Beads embroidery-work'), ['cosmo', 'with', 'bead', 'embroider', 'work']);
  assert.equal(stemKey('Embroidered Sarees'), 'embroider saree');
});

test('displayName: Title Case only for all-lower / all-upper input', () => {
  assert.equal(displayName('rani pink'), 'Rani Pink');
  assert.equal(displayName('GOTA PATTI'), 'Gota Patti');
  assert.equal(displayName('iPhone Blue'), 'iPhone Blue');
});

test('distances', () => {
  assert.equal(editDistance('chiffon', 'chifon'), 1);
  assert.equal(editDistance('silk', 'slik'), 1); // a swap counts once
  assert.ok(jaroWinkler('organza', 'organzza') > 0.95);
  assert.ok(jaroWinkler('black', 'white') < 0.8);
});

test('a "none of the others" value (Plain): found by name, kept only when nothing else is chosen', () => {
  for (const n of ['Plain', 'plain work', 'None', 'Solid', 'No Work', 'No Embroidery']) assert.equal(isNoneValue(n), true, n);
  for (const n of ['Plain Georgette', 'Embroidery', 'Nonet', 'Solid Silk Border', 'Noor']) assert.equal(isNoneValue(n), false, n);
  const vals = [{ id: 'emb', name: 'Embroidery' }, { id: 'plain', name: 'Plain' }];
  assert.deepEqual(withoutNone(['plain', 'emb'], vals), ['emb']);
  assert.deepEqual(withoutNone(['plain'], vals), ['plain']);
  assert.deepEqual(withoutNone([], vals), []);
});
