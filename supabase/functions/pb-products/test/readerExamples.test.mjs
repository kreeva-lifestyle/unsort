// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The owner's own filing as the reader's examples (readerExamples.ts; owner, 13 Nov 2026: remember the mapping, no word
// cards): products a person filed by hand, from the same website (either address) or the same vendor, closest first.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { ownerExamples, pickExamples, samePlace } = await import('../readerExamples.ts');

const CATS = ['Anarkali', 'Salwar Suit', 'Kurta Set', 'Gown'];

test('the same place: a website under either address, or a Telegram vendor', () => {
  const imp = decodeURIComponent(samePlace({ source: 'import', source_ref: 'www.shop.com:123', vendor_id: 'v1' }));
  assert.match(imp, /^source=eq\.import&or=\(source_ref\.like\."www\.shop\.com:\*",source_ref\.like\."shop\.com:\*"\)$/);
  assert.equal(samePlace({ source: 'telegram', source_ref: '-100:55', vendor_id: 'v1' }), 'vendor_id=eq.v1');
  assert.equal(samePlace({ source: 'import', source_ref: 'no-host', vendor_id: null }), '');
  assert.equal(samePlace({ source: 'manual', source_ref: null, vendor_id: null }), '');
});

test('the closest examples first; categories no longer on the list are left out; the list\'s spelling', () => {
  const rows = [
    { name: 'Blue Cotton Kurta Set', category: 'kurta set', ptype: 'Kurtas & Suits' },
    { name: 'Pink Georgette Salwar Suit with Dupatta', category: 'Salwar Suit', ptype: 'Dresses' },
    { name: 'Red Silk Indo Western', category: 'Indo-Western', ptype: 'Dresses' }, // removed from the list
    { name: '', category: 'Gown', ptype: null },
  ];
  const got = pickExamples({ name: 'Peach Georgette Suit with Dupatta', raw_text: 'Salwar and dupatta' }, rows, CATS);
  assert.deepEqual(got.map(e => e.category), ['Salwar Suit', 'Kurta Set']);
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `Gown ${i}`, category: 'Gown', ptype: null }));
  assert.equal(pickExamples({ name: 'Gown', raw_text: '' }, many, CATS).length, 8);
});

test('the reader\'s lines: the owner\'s choices for this website, with the store\'s own type word', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url)); urls.push(u);
    return new Response(JSON.stringify([{ name: 'Pink Cotton Suit Set', category: 'Salwar Suit', ptype: 'Dresses' }]), { status: 200 });
  };
  const text = await ownerExamples({ id: 'p1', source: 'import', source_ref: 'shop.com:9', vendor_id: null, name: 'Yellow Cotton Suit Set', raw_text: '' }, CATS);
  assert.match(urls[0], /locked=cs\.\{category\}/);
  assert.match(urls[0], /id=neq\.p1/);
  assert.match(urls[0], /status=neq\.archived/);
  assert.match(text, /same website by hand/);
  assert.match(text, /"Pink Cotton Suit Set" \(the store's own type: Dresses\) → Salwar Suit/);
  // nothing filed by hand yet, or no place: no lines, and no question asked without a place
  globalThis.fetch = async () => new Response('[]', { status: 200 });
  assert.equal(await ownerExamples({ id: 'p1', source: 'import', source_ref: 'shop.com:9', vendor_id: null, name: 'x', raw_text: '' }, CATS), '');
  let asked = false; globalThis.fetch = async () => { asked = true; return new Response('[]'); };
  assert.equal(await ownerExamples({ id: 'p1', source: 'manual', source_ref: null, vendor_id: null, name: 'x', raw_text: '' }, CATS), '');
  assert.equal(asked, false);
});
