// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestBody, istDate } from '../import/body.ts';

const found = {
  ref: '7001', name: 'Banarasi Silk Saree', url: 'https://kumari.example/products/banarasi', sku: 'KA-5070', description: 'Pure silk.\nDry clean only',
  price: 2299, compare_at: 3999, currency: null, in_stock: true, sizes: ['Free Size'], color: 'Maroon', images: ['https://cdn.example/a.jpg'],
};

test('price copied: sell_price, note, and the selling-price line in raw_text', () => {
  const b = ingestBody(found, { host: 'kumari.example', use_their_price: true }, 'Kumari Art', '8 Nov 2026');
  assert.equal(b.source, 'import');
  assert.equal(b.source_ref, 'kumari.example:7001');
  assert.equal(b.vendor_name, 'Kumari Art');
  assert.equal(b.source_url, found.url);
  assert.deepEqual(b.image_urls, found.images);
  assert.equal(b.sell_price, 2299);
  assert.equal(b.price_note, 'Price copied from kumari.example on 8 Nov 2026 (shown there as reduced from ₹3999)');
  assert.equal(b.raw_text, 'Banarasi Silk Saree\nPure silk.\nDry clean only\nSKU: KA-5070\nSizes: Free Size\nColour: Maroon\nSelling price on kumari.example: ₹2299 (shown as reduced from ₹3999)');
});

test('switch off: no sell_price and no price line (the AI must not read it as cost); the note keeps the fact', () => {
  const b = ingestBody(found, { host: 'kumari.example', use_their_price: false }, 'Kumari Art', '8 Nov 2026');
  assert.equal('sell_price' in b, false);
  assert.doesNotMatch(b.raw_text, /price/i);
  assert.equal(b.price_note, 'kumari.example sells it for ₹2299 (seen 8 Nov 2026); the price was not copied.');
});

test('foreign currency or no / zero price: never copied', () => {
  const usd = ingestBody({ ...found, currency: 'USD', compare_at: null }, { host: 'h.example', use_their_price: true }, 'V', '8 Nov 2026');
  assert.equal('sell_price' in usd, false);
  assert.equal(usd.price_note, 'h.example sells it for USD 2299 (seen 8 Nov 2026); the price was not copied.');
  const none = ingestBody({ ...found, price: null, compare_at: null }, { host: 'h.example', use_their_price: true }, 'V');
  assert.equal('sell_price' in none, false); assert.equal('price_note' in none, false);
  const zero = ingestBody({ ...found, price: 0, compare_at: null }, { host: 'h.example', use_their_price: true }, 'V');
  assert.equal('sell_price' in zero, false); assert.equal('price_note' in zero, false);
  assert.match(istDate(new Date('2026-11-08T20:30:00Z')), /^9 Nov 2026$/); // IST is +5:30
});

test('the same site under its other address: www and bare host are one store', async () => {
  const { hostTwin, refTwin, refList } = await import('../import/body.ts');
  assert.equal(hostTwin('www.bahu.example'), 'bahu.example');
  assert.equal(hostTwin('bahu.example'), 'www.bahu.example');
  assert.equal(refTwin('www.bahu.example:7001'), 'bahu.example:7001');
  assert.equal(refTwin('bahu.example:/products/kb-302'), 'www.bahu.example:/products/kb-302');
  assert.equal(refTwin('no-host-part'), '');
  assert.equal(refList('import', 'www.bahu.example:7001'), '"www.bahu.example:7001","bahu.example:7001"');
  assert.equal(refList('telegram', '-100123:45'), '"-100123:45"'); // only an imported product has a second address
  assert.equal(refList('manual', 'a"b\\c'), '"a\\"b\\\\c"');
});
