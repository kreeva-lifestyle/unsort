// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The store's extra facts (import/meta.ts) → attributes, and where they go next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromJsonLd, fromShopify, fromWoo, withPage } from '../import/normalize.ts';
import { IMPORT_ATTRS, gramsText, mergeReadAttrs, money, pageMeta } from '../import/meta.ts';
import { ingestBody } from '../import/body.ts';
import { buildTags } from '../tags.ts';

const here = new URL('.', import.meta.url);
const read = (f) => readFileSync(new URL(f, here), 'utf8');
const shopify = JSON.parse(read('shopify.products.json')).products;
const woo = JSON.parse(read('woo.products.json'));
const origin = 'https://kumari.example';

test('Shopify: vendor, type, tags, first barcode, grams, compare-at, url; nothing invented', () => {
  const f = fromShopify(shopify[0], origin);
  assert.deepEqual(f.meta, {
    sku: 'KA-5070', source_page_url: 'https://kumari.example/products/banarasi-silk-saree-maroon', compare_at_price: '₹3,999',
    brand: 'Kumari Art', product_type: 'Saree', store_tags: 'Silk, Festive, Wedding', barcode: '8901234567890', weight: '750 g', colour: 'Maroon',
  });
  assert.equal('manufacturer' in f.meta, false); // brand is never copied into manufacturer
  const b = fromShopify(shopify[1], origin);
  assert.equal(b.meta.material, 'Cotton');
  assert.equal(b.meta.colour, 'Blue, Green'); // every colour in meta, though `color` stays null
  assert.equal(b.meta.weight, '1.5 kg');
  assert.equal('store_tags' in b.meta, false); // [] → no key
  assert.equal('compare_at_price' in b.meta, false);
  assert.ok(Object.keys(f.meta).every(k => IMPORT_ATTRS.includes(k)));
});

test('WooCommerce: brands[], categories, tags, weight + unit, regular vs sale, Brand attribute fallback', () => {
  const a = fromWoo(woo[0], 'https://example-store.in');
  assert.deepEqual(a.meta, {
    sku: 'CH-31', currency: 'INR', source_page_url: 'https://example-store.in/product/chanderi-suit-set/', compare_at_price: '₹2,499',
    brand: 'Chanderi House', product_type: 'Suits, Festive Wear', store_tags: 'chanderi, silk', weight: '0.5 kg', material: 'Chanderi Silk', colour: 'Pink',
  });
  const b = fromWoo(woo[1], 'https://example-store.in');
  assert.equal(b.meta.brand, 'Linen Co');
  assert.equal('weight' in b.meta, false); // "450" with no unit: the unit would be a guess
  assert.equal(b.meta.currency, 'USD');
});

test('JSON-LD page: brand and manufacturer apart, gtin13, category, weight, SEO from the same page', () => {
  const f = fromJsonLd(read('jsonld.page.html'), 'https://meera.example/products/georgette-anarkali');
  assert.equal(f.meta.brand, 'Meera');
  assert.equal(f.meta.manufacturer, 'Meera Textiles Pvt Ltd');
  assert.equal(f.meta.barcode, '8909876543210');
  assert.equal(f.meta.product_type, 'Gowns');
  assert.equal(f.meta.material, 'Georgette');
  assert.equal(f.meta.weight, '0.8 kg');
  assert.equal(f.meta.currency, 'INR');
  assert.equal(f.meta.seo_title, 'Georgette Anarkali | Meera Boutique');
  assert.equal(f.meta.seo_description, 'Teal georgette anarkali gown with embroidery & dupatta.');
  assert.equal(f.meta.source_page_url, 'https://meera.example/products/georgette-anarkali');
  assert.equal(f.description, 'Floor length georgette anarkali with embroidery.'); // stripped text stays for raw_text
});

test('product page: SEO title / description, currency, JSON-LD facts the list lacks; the list wins', () => {
  const f = withPage(fromShopify(shopify[0], origin), read('shopify.page.html'));
  assert.equal(f.meta.seo_title, 'Banarasi Silk Saree – Maroon | Kumari Art');
  assert.equal(f.meta.seo_description, 'Pure Banarasi silk saree with zari border & blouse piece. Free shipping across India.');
  assert.equal(f.currency, 'INR');
  assert.equal(f.meta.currency, 'INR');
  assert.equal(f.meta.manufacturer, 'Varanasi Weavers Co-op');
  assert.equal(f.meta.brand, 'Kumari Art'); // list's vendor, not the page's brand
  assert.equal(f.meta.barcode, '8901234567890');
  assert.deepEqual(pageMeta('<head><meta content="Only OG" property="og:title"><meta property=\'og:description\' content=\'OG desc\'></head>'), { seo_title: 'Only OG', seo_description: 'OG desc' });
  assert.deepEqual(pageMeta(''), {});
  // A page that shows the same price in dollars: currency set, compare-at relabelled, and the price is not copied.
  const usd = withPage(fromShopify(shopify[0], origin), '<head><meta property="og:price:amount" content="2,499.00"><meta property="og:price:currency" content="usd"></head>');
  assert.equal(usd.meta.compare_at_price, 'USD 3,999');
  assert.equal('sell_price' in ingestBody(usd, { host: 'kumari.example', use_their_price: true }, 'V', '8 Nov 2026'), false);
  // A page converted for the visitor's country (another amount): its currency is not taken.
  const geo = withPage(fromShopify(shopify[0], origin), '<head><meta property="og:price:amount" content="29.99"><meta property="og:price:currency" content="USD"></head>');
  assert.equal(geo.currency, null);
  // Shopify with no known currency: never copied as rupees; with the store's own INR (meta.json) it is.
  const shop = { host: 'kumari.example', use_their_price: true, platform: 'shopify' };
  const unknown = ingestBody(geo, shop, 'V', '8 Nov 2026');
  assert.equal('sell_price' in unknown, false);
  assert.match(unknown.price_note, /does not say in which currency/);
  assert.equal(ingestBody(fromShopify(shopify[0], origin, 'INR'), shop, 'V', '8 Nov 2026').sell_price, 2499);
});

test('ingest body: attributes + sku, product type and material in raw_text, description kept', () => {
  const f = fromShopify(shopify[1], origin);
  const b = ingestBody({ ...f, in_stock: true }, { host: 'kumari.example', use_their_price: true }, 'V', '8 Nov 2026');
  assert.equal(b.attributes, f.meta);
  assert.equal('sku' in b, false); // this product has no SKU
  assert.match(b.raw_text, /\nMaterial: Cotton/);
  const a = ingestBody(withPage(fromShopify(shopify[0], origin), read('shopify.page.html')), { host: 'kumari.example', use_their_price: true }, 'V', '8 Nov 2026');
  assert.equal(a.sku, 'KA-5070');
  assert.equal(a.attributes.seo_title, 'Banarasi Silk Saree – Maroon | Kumari Art');
  assert.match(a.raw_text, /Pure Banarasi silk saree with zari border\.\nBlouse piece included/);
  assert.match(a.raw_text, /\nProduct type: Saree/);
});

test('formatting: rupees en-IN, grams', () => {
  assert.equal(money(129999, null), '₹1,29,999');
  assert.equal(money(2999.5, 'INR'), '₹2,999.5');
  assert.equal(money(0, 'INR'), '');
  assert.equal(gramsText(750), '750 g');
  assert.equal(gramsText(1250), '1.25 kg');
  assert.equal(gramsText(0), '');
});

test('reader merge: imported keys survive a read and a manual "Read again"; others behave as before', () => {
  const cur = { brand: 'Kumari Art', seo_title: 'Store title', work: '' };
  const ai = { brand: 'AI brand', seo_title: 'AI', work: 'Zari', occasion: 'Wedding' };
  assert.deepEqual(mergeReadAttrs(cur, ai, { manual: true, imported: true }), { brand: 'Kumari Art', seo_title: 'Store title', work: 'Zari', occasion: 'Wedding' });
  assert.deepEqual(mergeReadAttrs(cur, ai, { manual: false, imported: true }), { brand: 'Kumari Art', seo_title: 'Store title', work: 'Zari', occasion: 'Wedding' });
  assert.deepEqual(mergeReadAttrs({ work: 'Print' }, { work: 'Zari' }, { manual: false, imported: false }), { work: 'Print' });
  assert.deepEqual(mergeReadAttrs({ work: 'Print' }, { work: 'Zari' }, { manual: true, imported: false }), { work: 'Zari' });
  assert.deepEqual(mergeReadAttrs(null, null, { manual: false, imported: true }), {});
});

test('tag templates: {attr:brand}, {attr:product_type}, one tag per {attr:store_tags}', () => {
  const facts = { category: 'Saree', fabric: '', color: '', vendor: 'V', vendor_code: '', sku: '', sizes: ['S', 'M'], attributes: fromShopify(shopify[0], origin).meta };
  const tags = buildTags({ templates: ['{attr:brand}', 'Type: {attr:product_type}', '{attr:store_tags}', '{attr:manufacturer}'], static: [], case: 'as_is' }, facts, []);
  assert.deepEqual(tags, ['Kumari Art', 'Type: Saree', 'Silk', 'Festive', 'Wedding']); // no manufacturer → that tag is dropped
  const sized = buildTags({ templates: ['{attr:store_tags}-{size}'], static: [], case: 'lower' }, { ...facts, attributes: { store_tags: 'Silk, Festive' } }, []);
  assert.deepEqual(sized, ['silk-s', 'silk-m', 'festive-s', 'festive-m']);
  assert.deepEqual(buildTags({ templates: ['{attr:store_tags}'], static: [], case: 'as_is' }, { ...facts, attributes: {} }, []), []);
  // Other attributes keep the old behaviour: one tag, commas become spaces.
  assert.deepEqual(buildTags({ templates: ['{attr:work}'], static: [], case: 'as_is' }, { ...facts, attributes: { work: 'zari, sequin' } }, []), ['zari sequin']);
});
