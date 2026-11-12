// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The reader's instructions (readerPrompt.ts) and what a fresh read changed
// (readChanges.ts). Owner, 2026-11-12: the photos decide what can be seen —
// the colour above all — the text decides the rest, and the fabric stays as
// the post writes it, spelling mistakes apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // readerPrompt.ts → db.ts reads Deno.env
const { ATTRS, COLOURS, READ_PHOTOS, readerPrompt, readerSchema } = await import('../readerPrompt.ts');
const { readChanges } = await import('../readChanges.ts');

test('reader prompt: photos first, a plain colour, the fabric as written', () => {
  const sys = readerPrompt(['Anarkali', 'Kurta Set', 'anarkali']);
  for (const part of ['PHOTOS FIRST', 'the photos are right', 'With no photos, use the text',
    'is not a fact: never turn it into a pattern',
    'name: a plain product name in this order: the colour you return, the fabric you return, what the product is', 'never the post\'s trade name for the colour, never a shortened fabric',
    'fabric: exactly as the post writes it', 'correct only an obvious spelling mistake', 'A fabric listed under "Already known" stays as it is',
    'color: the main colour of the product as the photos show it', 'a trade name (Rama, Liril, Sky, Mehendi) becomes the plain colour', 'the photos win',
    'no disclaimers such as "colour may vary"', 'category: exactly one of: Anarkali, Kurta Set —']) assert.ok(sys.includes(part), part);
  assert.ok(!sys.includes('fabric and color: as written')); // the old rule let the text win
  assert.ok(sys.includes(`Prefer one of: ${COLOURS.join(', ')}.`));
  assert.equal(new Set(COLOURS.map(c => c.toLowerCase())).size, COLOURS.length);
  assert.ok(['Teal Blue', 'Lime Green', 'Sky Blue', 'Mehendi Green', 'Multicolour'].every(c => COLOURS.includes(c)));
  assert.equal(READ_PHOTOS, 4);
  assert.ok(readerPrompt([], true).includes('copied from another online store'));
  assert.deepEqual(readerSchema(['Anarkali']).properties.attributes.required, ATTRS);
});

test('what a fresh read changed: only fields that had a value, with what they were', () => {
  const p = { name: 'Rama Pure Chinon Silk Kurta Set', fabric: 'Pure Chinon Silk', color: 'Rama', category: 'Kurta Set', sku: 'KB 9 RAMA',
    attributes: { pattern: 'Vintage design with rich border', work: 'Embroidery', notes: 'Colour may vary', brand: 'BAHU PALACE' } };
  const set = { name: 'Teal Blue Pure Chinon Silk Kurta Set', fabric: 'Pure Chinon Silk', color: 'Teal Blue',
    attributes: { work: 'Embroidery', notes: 'Flair 9 metres', brand: 'BAHU PALACE', occasion: 'Festive' } };
  assert.deepEqual(readChanges(p, set), {
    name: ['Rama Pure Chinon Silk Kurta Set', 'Teal Blue Pure Chinon Silk Kurta Set'],
    color: ['Rama', 'Teal Blue'],
    pattern: ['Vintage design with rich border', ''],   // dropped: it was only a sales line
    notes: ['Colour may vary', 'Flair 9 metres'],
  }); // fabric the same, category and sku not in `set`, occasion a first fill, brand not the reader's key
  assert.deepEqual(readChanges({ name: '', color: null, attributes: null }, { name: 'A', color: 'Red', attributes: { work: 'Zari' } }), {});
  assert.deepEqual(readChanges(p, {}), {});
  assert.equal(readChanges({ name: 'x'.repeat(400) }, { name: 'y' }).name[0].length, 200);
});
