// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkUrl, parseRobots, robotsAllow, robotsRefusal } from '../import/urlCheck.ts';

const robotsTxt = readFileSync(new URL('robots.txt', import.meta.url), 'utf8');

test('checkUrl: accepts public https sites, adds https, keeps the path, lowercases the host', () => {
  assert.deepEqual(checkUrl('https://Kumari-Art.example.com/collections/sarees?x=1'), { ok: true, site: { origin: 'https://kumari-art.example.com', host: 'kumari-art.example.com', url: 'https://kumari-art.example.com/collections/sarees' } });
  assert.deepEqual(checkUrl('  meera.in/ '), { ok: true, site: { origin: 'https://meera.in', host: 'meera.in', url: 'https://meera.in' } });
  assert.equal(checkUrl('https://shop.example.in:443/').ok, true);
});

test('checkUrl: refuses http, IP addresses, localhost, private names, ports, empty, our own domains', () => {
  const bad = (u, re, own) => { const r = checkUrl(u, own); assert.equal(r.ok, false, u); assert.match(r.error, re, u); };
  bad('http://example.com', /Only https/);
  bad('ftp://example.com', /Only https/);
  bad('', /Type the website/);
  bad('not a url at all', /does not look right|not a web address/);
  bad('https://127.0.0.1/', /IP address/);
  bad('https://10.0.0.5/products.json', /IP address/);
  bad('https://[::1]/', /IP address/);
  bad('https://2130706433/', /IP address/);
  bad('https://localhost/', /does not look right|not a public/);
  bad('https://shop.localhost/', /not a public/);
  bad('https://intranet.corp/', /not a public/);
  bad('https://store.internal/', /not a public/);
  bad('https://example.com:8443/', /port/);
  bad('https://user:pw@example.com/', /login details/);
  bad('https://dailyoffice.aryadesigns.co.in/', /our own/);
  bad('https://ulphprdnswznfztawbvg.supabase.co/rest/v1/', /our own/);
  bad('https://arya-store.myshopify.com/', /our own/, ['arya-store.myshopify.com']);
  bad('https://www.ARYA-STORE.myshopify.com/', /our own/, ['arya-store.myshopify.com']);
  assert.equal(checkUrl('https://other-store.myshopify.com/', ['arya-store.myshopify.com']).ok, true);
});

test('robots.txt: the * group applies to us, longest rule wins, Allow wins a tie, sitemaps and crawl-delay read', () => {
  const r = parseRobots(robotsTxt);
  assert.deepEqual(r.sitemaps, ['https://example-store.in/sitemap.xml', 'https://example-store.in/sitemap_products_1.xml']);
  assert.equal(r.crawlDelay, 5);
  assert.equal(robotsAllow(r, '/private/x'), true); // Googlebot's rule is not ours
  assert.equal(robotsAllow(r, '/cart'), false);
  assert.equal(robotsAllow(r, '/cart/anything'), false);
  assert.equal(robotsAllow(r, '/products.json'), false);
  assert.equal(robotsAllow(r, '/collections/all/products.json'), true);
  assert.equal(robotsAllow(r, '/products/some-saree'), true);
  assert.equal(robotsRefusal(r, 'shopify'), null); // one of the two Shopify paths is still allowed
  assert.equal(robotsRefusal(r, 'woocommerce'), null);
});

test('robots.txt: our own group wins over *, wildcards and $, empty file allows all, full refusal sentence', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: DailyOffice-Playbook\nDisallow: /wp-json/\nAllow: /wp-json/wc/store/v1/products\nDisallow: /*.pdf$\n');
  assert.equal(robotsAllow(r, '/products.json'), true);
  assert.equal(robotsAllow(r, '/wp-json/wp/v2/posts'), false);
  assert.equal(robotsAllow(r, '/wp-json/wc/store/v1/products?per_page=100'), true);
  assert.equal(robotsAllow(r, '/files/a.pdf'), false);
  assert.equal(robotsAllow(r, '/files/a.pdfx'), true);
  assert.equal(robotsRefusal(r, 'woocommerce'), null);
  const all = parseRobots('User-agent: *\nDisallow: /');
  assert.equal(robotsAllow(all, '/products.json'), false);
  assert.match(robotsRefusal(all, 'shopify'), /does not allow automated access[\s\S]*robots\.txt disallows \/products\.json/);
  assert.match(robotsRefusal(all, 'generic'), /sitemap\.xml/);
  assert.equal(robotsRefusal(parseRobots(''), 'shopify'), null);
  assert.equal(robotsRefusal(parseRobots('User-agent: *\nDisallow:'), 'shopify'), null);
  assert.equal(robotsRefusal(all, 'unknown'), null);
});
