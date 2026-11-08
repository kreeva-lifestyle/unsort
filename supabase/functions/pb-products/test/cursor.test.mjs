// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterShopify, afterSitemap, afterWoo, linkNext, nextPath, pickSitemaps, productSitemap, productUrl, sitemapLocs, sitemapStep } from '../import/cursor.ts';
import { listingPrice } from '../pricing.ts';

const origin = 'https://kumari.example';

test('Shopify: page counter, Link header rel=next (same origin only), short page ends', () => {
  assert.equal(nextPath('shopify', {}, true), '/products.json?limit=250&page=1');
  let s = afterShopify({}, '/products.json?limit=250&page=1', 250, null, origin);
  assert.deepEqual(s, { cursor: { next: '/products.json?limit=250&page=2', errors: 0 }, done: false });
  assert.equal(nextPath('shopify', s.cursor, true), '/products.json?limit=250&page=2');
  const link = '<https://kumari.example/products.json?limit=250&page_info=abc123>; rel="next", <https://kumari.example/products.json?page_info=zzz>; rel="previous"';
  s = afterShopify(s.cursor, '/products.json?limit=250&page=2', 250, link, origin);
  assert.equal(s.cursor.next, '/products.json?limit=250&page_info=abc123');
  assert.equal(linkNext('<https://evil.example/x>; rel="next"', origin), null);
  assert.equal(linkNext(null, origin), null);
  s = afterShopify(s.cursor, '/products.json?limit=250&page_info=abc123', 12, null, origin);
  assert.deepEqual(s, { cursor: { next: null, errors: 0 }, done: true });
});

test('WooCommerce: per_page 100, in-stock filter, total pages header ends the run', () => {
  assert.equal(nextPath('woocommerce', {}, true), '/wp-json/wc/store/v1/products?per_page=100&page=1&stock_status=instock');
  assert.equal(nextPath('woocommerce', { page: 3 }, false), '/wp-json/wc/store/v1/products?per_page=100&page=3');
  assert.deepEqual(afterWoo({}, 100, 3), { cursor: { page: 2, errors: 0 }, done: false });
  assert.deepEqual(afterWoo({ page: 3 }, 100, 3), { cursor: { page: 4, errors: 0 }, done: true });
  assert.deepEqual(afterWoo({ page: 2 }, 40, null), { cursor: { page: 3, errors: 0 }, done: true });
  assert.equal(nextPath('generic', {}, true), null);
});

test('generic: sitemap steps and slices, next sitemap when used up, done after the last', () => {
  const c = { sitemaps: ['https://m.example/sitemap_products_1.xml', 'https://m.example/sitemap_products_2.xml'], si: 0, off: 0 };
  assert.deepEqual(sitemapStep(c), { sitemap: c.sitemaps[0], si: 0, off: 0 });
  let r = afterSitemap(c, 0, 0, 25, 60);
  assert.deepEqual(r, { cursor: { ...c, si: 0, off: 25, errors: 0 }, done: false });
  r = afterSitemap(r.cursor, 0, 50, 10, 60);
  assert.deepEqual(r, { cursor: { ...c, si: 1, off: 0, errors: 0 }, done: false });
  r = afterSitemap(r.cursor, 1, 0, 25, 25);
  assert.equal(r.done, true);
  assert.equal(sitemapStep(r.cursor), null);
  assert.equal(sitemapStep({}), null);
});

test('generic: sitemap parsing, product sitemaps first, product URL shapes', () => {
  const idx = sitemapLocs('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://m.example/sitemap_products_1.xml?from=1&amp;to=9</loc></sitemap><sitemap><loc> https://m.example/sitemap_pages_1.xml </loc></sitemap><sitemap><loc>https://m.example/sitemap_collections_1.xml</loc></sitemap></sitemapindex>');
  assert.equal(idx.index, true);
  assert.deepEqual(idx.locs, ['https://m.example/sitemap_products_1.xml?from=1&to=9', 'https://m.example/sitemap_pages_1.xml', 'https://m.example/sitemap_collections_1.xml']);
  assert.deepEqual(pickSitemaps(idx.locs), ['https://m.example/sitemap_products_1.xml?from=1&to=9']);
  assert.deepEqual(pickSitemaps(['https://m.example/a.xml', 'https://m.example/b.xml']), ['https://m.example/a.xml', 'https://m.example/b.xml']);
  assert.equal(productSitemap('https://m.example/product-collections.xml'), false);
  const urls = sitemapLocs('<urlset><url><loc>https://m.example/product/saree-1/</loc></url><url><loc>https://m.example/about</loc></url></urlset>');
  assert.equal(urls.index, false);
  assert.deepEqual(urls.locs.filter(productUrl), ['https://m.example/product/saree-1/']);
  assert.equal(productUrl('https://m.example/products/x-123'), true);
  assert.equal(productUrl('https://m.example/p/x'), true);
  assert.equal(productUrl('https://m.example/kurta-p-5521.html'), true);
  assert.equal(productUrl('https://m.example/collections/all'), false);
  assert.equal(productUrl('https://m.example/blog/products-we-love'), false);
});

test('listingPrice: sell_price is used as is (rules and override skipped), else the cost formula, else null', () => {
  const pricing = { markup_pct: 100, add_flat: 50, rounding: 'end_99', compare_at_pct: 20, min_price: 999 };
  assert.deepEqual(listingPrice({ cost_price: 1000, sell_price: 2499 }, pricing, { markup_pct: 300 }), { price: 2499, compare_at: 2999 });
  assert.deepEqual(listingPrice({ cost_price: null, sell_price: 2499 }, { ...pricing, compare_at_pct: 0 }), { price: 2499, compare_at: null });
  assert.deepEqual(listingPrice({ cost_price: 1000, sell_price: null }, pricing, null), { price: 2099, compare_at: 2599 });
  assert.equal(listingPrice({ cost_price: null, sell_price: null }, pricing), null);
  assert.deepEqual(listingPrice({ cost_price: 1000, sell_price: 0 }, pricing), { price: 2099, compare_at: 2599 }); // 0 is not a price
});
