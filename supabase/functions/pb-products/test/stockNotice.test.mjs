// node --test --experimental-strip-types supabase/functions/pb-products/test/
// A vendor's "stock out" picture (stockNotice.ts): which products each line
// means. The cases are the owner's nine examples of 2026-11-12.
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { byColour, noticeLine, pick } = await import('../stockNotice.ts');
const { readerPrompt, readerSchema } = await import('../readerPrompt.ts');

// One candidate as pb_stock_candidates returns it. key = the product's own design code, nk = the notice's.
const c = (sku, colours, o = {}) => ({ id: sku, name: null, sku, in_stock: true, status: 'ready', code_key: o.key ?? '#5081', colour_keys: colours, same_vendor: o.other ? false : true, notice_key: o.nk ?? '#5081' });
const it = (code, colours = [], note = '') => ({ code, colours, note });
const skus = (r) => r.apply.map(x => x.sku);

test('"Permanent stock Out D no 5081" (four colours, none named): every colour of the design', () => {
  const r = pick(it('5081'), [c('5081 PURPLE', ['purple']), c('5081 BLACK', ['black']), c('5081 GREEN', ['green']), c('5081 PINK', ['pink'])]);
  assert.deepEqual(skus(r), ['5081 PURPLE', '5081 BLACK', '5081 GREEN', '5081 PINK']);
  assert.equal(r.left, '');
});

test('"D no 5073 Offwhite / Pur / Rama" beside other designs: only the named colours, trade names understood', () => {
  const set = [c('5073 A', ['offwhite']), c('5073 B', ['purple']), c('5073 C', ['tealblue']), c('5073 D', ['yellow'])];
  assert.deepEqual(skus(pick(it('5073', ['Off White', 'Purple', 'Rama']), set)), ['5073 A', '5073 B', '5073 C']); // Rama is the reader's Teal Blue
  assert.deepEqual(skus(pick(it('1144', ['Maroon']), [c('1144 MRN', ['maroon']), c('1144 RED', ['red'])])), ['1144 MRN']);
  assert.deepEqual(skus(pick(it('7179', ['Parrot Green']), [c('7179', ['limegreen'])])), ['7179']);
});

test('a colour the design does not have here is left for a person, the rest is still marked', () => {
  const r = pick(it('1260', ['Peach', 'Sky Blue']), [c('1260 PEACH', ['peach']), c('1260 PINK', ['pink'])]);
  assert.deepEqual(skus(r), ['1260 PEACH']);
  assert.match(r.left, /no product of this design in Sky Blue/);
  assert.match(noticeLine(it('1260', ['Peach', 'Sky Blue']), r), /^1260 Peach, Sky Blue — out of stock: 1260 PEACH\. CHECK: /);
});

test('"7185 All Colour Only Lehenga Stock out": about a part of the product, never marked by itself', () => {
  const r = pick(it('7185', [], 'Only Lehenga'), [c('7185 WHITE', ['white'])]);
  assert.deepEqual(r.apply, []);
  assert.match(r.left, /part only \("Only Lehenga"\)/);
});

test('"KB:-273 WINE" and "Kb-302 Temporary stock out": the colour named, or both colours', () => {
  const kb273 = [c('KB 273 WINE XS', ['wine'], { key: 'KB273', nk: 'KB273' }), c('KB 273 XS', ['maroon'], { key: 'KB273', nk: 'KB273' })];
  assert.deepEqual(skus(pick(it('KB 273', ['Wine']), kb273)), ['KB 273 WINE XS']);
  const kb302 = [c('KB 302 DUSTYPINK XS', ['dustypink'], { key: 'KB302', nk: 'KB302' }), c('KB 302 SEAGREEN XS', ['seagreen'], { key: 'KB302', nk: 'KB302' })];
  assert.deepEqual(skus(pick(it('KB 302'), kb302)), ['KB 302 DUSTYPINK XS', 'KB 302 SEAGREEN XS']);
});

test('nothing is guessed: another vendor, letters that differ, a number two designs share', () => {
  const other = pick(it('KB 273', ['Wine']), [c('KB 273 WINE XS', ['wine'], { key: 'KB273', nk: 'KB273', other: true })]);
  assert.deepEqual(other.apply, []);
  assert.match(other.left, /only known at another vendor \(KB 273 WINE XS\)/);
  const two = [c('KB 250 RED', ['red'], { key: 'KB250', nk: '#250' }), c('NKB 250 RED', ['red'], { key: 'NKB250', nk: '#250' })];
  assert.match(pick(it('250'), two).left, /several designs share this number \(KB250, NKB250\)/);
  const lettered = two.map(x => ({ ...x, notice_key: 'KB250' }));
  assert.deepEqual(skus(pick(it('KB 250'), lettered)), ['KB 250 RED']);                    // KB 250 is not NKB 250
  assert.match(pick(it('KB 250'), [lettered[1]]).left, /under other letters/);
  const none = pick(it('9352'), []);
  assert.deepEqual([none.apply, none.left], [[], '']);                                    // not in Playbook: nothing to do
  assert.equal(noticeLine(it('9352'), none), '9352 — not in Playbook, nothing to do');
});

test('colours: the exact name wins; a looser one only when it points at one product', () => {
  const pink = c('A', ['pink']), dusty = c('B', ['dustypink']), rani = c('C', ['ranipink']);
  assert.deepEqual(byColour('Pink', [pink, dusty]).map(x => x.sku), ['A']);
  assert.deepEqual(byColour('Pink', [dusty, rani]), []);                                  // which pink? a person decides
  assert.deepEqual(byColour('Pink', [dusty]).map(x => x.sku), ['B']);
  assert.deepEqual(byColour('', [pink]), []);
  assert.deepEqual(byColour('Wine', [c('D', [])]), []);                                   // a product with no colour on record
});

test('the reader is asked about notices for vendor posts only, never for a product copied from a website', () => {
  assert.ok(readerPrompt(['Kurta Set']).includes('stock_notice:'));
  assert.ok(!readerPrompt(['Kurta Set'], true).includes('stock_notice:'));
  const s = readerSchema(['Kurta Set']);
  assert.ok(s.required.includes('stock_notice') && s.properties.stock_notice.anyOf[0].type === 'null');
  assert.ok(!('stock_notice' in readerSchema(['Kurta Set'], undefined, true).properties));
});
