// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromJsonLd, fromShopify, fromWoo, htmlToText, jsonLdBlocks } from '../import/normalize.ts';

const here = new URL('.', import.meta.url);
const read = (f) => readFileSync(new URL(f, here), 'utf8');
const shopify = JSON.parse(read('shopify.products.json')).products;
const woo = JSON.parse(read('woo.products.json'));
const page = read('jsonld.page.html');

test('Shopify: one product per listing, price and compare-at from the variants on sale, any variant available', () => {
  const f = fromShopify(shopify[0], 'https://kumari.example');
  assert.equal(f.ref, '7001');
  assert.equal(f.name, 'Banarasi Silk Saree - Maroon');
  assert.equal(f.url, 'https://kumari.example/products/banarasi-silk-saree-maroon');
  assert.equal(f.sku, 'KA-5070');
  assert.equal(f.price, 2499); // lowest AVAILABLE variant: the sold-out gift pack at 2299 is not what the store sells at
  assert.equal(f.compare_at, 3999);
  assert.equal(f.in_stock, true);
  assert.deepEqual(f.sizes, ['Free Size']);
  assert.equal(f.color, 'Maroon');
  assert.match(f.description, /Pure Banarasi silk saree with zari border\./);
  assert.match(f.description, /Blouse piece included\nDry clean only/);
  assert.doesNotMatch(f.description, /alert/);
});

test('Shopify: images in position order, protocol-relative fixed, http dropped, capped at 10', () => {
  const a = fromShopify(shopify[0], 'https://kumari.example');
  assert.deepEqual(a.images, ['https://cdn.shopify.com/s/files/1/a.jpg', 'https://cdn.shopify.com/s/files/1/b.jpg']);
  const b = fromShopify(shopify[1], 'https://kumari.example');
  assert.equal(b.images.length, 10);
  assert.equal(b.images[9], 'https://cdn.shopify.com/s/files/1/k10.jpg');
});

test('Shopify: sizes from variants, colour only when single, sold out when no variant is available', () => {
  const b = fromShopify(shopify[1], 'https://kumari.example');
  assert.deepEqual(b.sizes, ['S', 'M', 'L']);
  assert.equal(b.color, null); // Blue and Green
  assert.equal(b.in_stock, false);
  assert.equal(b.price, 899);
  assert.equal(b.compare_at, null);
  assert.equal(b.sku, null);
  assert.equal(b.description, '');
});

test('Shopify: the SKU comes from a size that is on sale, so it ends in one of the product\'s sizes', () => {
  const v = (sku, size, available) => ({ id: 1, sku, price: '999.00', available, option1: size });
  const p = { id: 9, title: 'Kurta', handle: 'kurta', options: [{ name: 'Size', position: 1, values: ['XS', 'S', 'M'] }], images: [] };
  assert.equal(fromShopify({ ...p, variants: [v('KB 9 XS', 'XS', false), v('KB 9 S', 'S', true), v('KB 9 M', 'M', true)] }, 'https://x.example').sku, 'KB 9 S');
  assert.equal(fromShopify({ ...p, variants: [v('KB 9 XS', 'XS', false), v('', 'S', true)] }, 'https://x.example').sku, 'KB 9 XS'); // none on sale has one: any
  assert.equal(fromShopify({ ...p, variants: [v('KB 9 XS', 'XS', false), v('KB 9 S', 'S', false)] }, 'https://x.example').sku, 'KB 9 XS'); // all sold out
});

test('WooCommerce: minor units → rupees, regular price as compare-at, attributes as sizes / colour', () => {
  const f = fromWoo(woo[0], 'https://example-store.in');
  assert.equal(f.ref, '31');
  assert.equal(f.price, 1899);
  assert.equal(f.compare_at, 2499);
  assert.equal(f.currency, 'INR');
  assert.equal(f.in_stock, true);
  assert.deepEqual(f.sizes, ['M', 'L', 'XL']);
  assert.equal(f.color, 'Pink');
  assert.equal(f.url, 'https://example-store.in/product/chanderi-suit-set/');
  assert.deepEqual(f.images, ['https://example-store.in/wp-content/uploads/ch1.jpg', 'https://example-store.in/wp-content/uploads/ch2.jpg']);
  assert.match(f.description, /Chanderi silk kurta with dupatta\.\nSet of 3/);
});

test('WooCommerce: price range min, relative permalink, foreign currency, out of stock', () => {
  const f = fromWoo(woo[1], 'https://example-store.in');
  assert.equal(f.price, 1100);
  assert.equal(f.compare_at, 1200); // regular price above the lowest price of the range
  assert.equal(f.currency, 'USD');
  assert.equal(f.in_stock, false);
  assert.equal(f.color, null);
  assert.deepEqual(f.sizes, []);
  assert.equal(f.url, 'https://example-store.in/product/linen-shirt/');
});

test('JSON-LD: Product inside @graph, nested offers, InStock when any offer is, lowest price, images, bad block skipped', () => {
  assert.equal(jsonLdBlocks(page).length, 2);
  const f = fromJsonLd(page, 'https://meera.example/product/georgette-anarkali/');
  assert.ok(f);
  assert.equal(f.ref, '/product/georgette-anarkali');
  assert.equal(f.name, 'Georgette Anarkali Gown');
  assert.equal(f.sku, 'MB-220');
  assert.equal(f.price, 3450);
  assert.equal(f.currency, 'INR');
  assert.equal(f.in_stock, true);
  assert.equal(f.color, 'Teal');
  assert.deepEqual(f.sizes, ['S', 'M']);
  assert.deepEqual(f.images, ['https://cdn.meera-boutique.in/img/a1.jpg', 'https://cdn.meera-boutique.in/img/a2.jpg']);
  assert.equal(f.description, 'Floor length georgette anarkali with embroidery.');
  assert.equal(fromJsonLd('<html><body>no data</body></html>', 'https://x.example/p/1'), null);
});

test('htmlToText: entities, line breaks, scripts out, length cap', () => {
  assert.equal(htmlToText('<p>A &amp; B&nbsp;&#8377;5</p><br><div>Next</div><style>p{}</style>'), 'A & B ₹5\nNext');
  assert.equal(htmlToText('x'.repeat(7000)).length, 6000);
});
