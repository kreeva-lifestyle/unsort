// node --test --experimental-strip-types supabase/functions/pb-products/test/
// One store, one voice (owner, 2026-11-12): the store profile and keyword
// (profile.ts), the word helpers (seoText.ts) and the program checks that
// replace the writer's self check (seoCheck.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYWORD, hasOrdering, keywordOf, profileOf } from '../profile.ts';
import { copiedRuns, countPhrase, factWords, opening, sectionAfter, wordsOf } from '../seoText.ts';
import { better, checkCopy, hardOf } from '../seoCheck.ts';

const PRODUCT = { name: 'Zari Kurta Set', category: 'Kurta Set', fabric: 'Georgette', color: 'Maroon', attributes: { work: 'Zari', occasion: 'Festive', set_contents: 'Kurta, Pant and Dupatta' } };
const LIMITS = { metaDescMin: 140, metaDescMax: 155, wordsMin: 130, wordsMax: 200 };
const META = 'Maroon georgette kurta set with zari work on the yoke and a matching dupatta. Ships in 5 to 7 days from Surat with easy 7 day returns on every order.';
const GOOD = {
  title: 'Maroon Georgette Kurta Set with Zari Work',
  description_html: '<p>Zari runs along the yoke of this maroon georgette kurta set, and the dupatta carries the same border.</p><ul><li>Fabric: georgette</li><li>Set: kurta, pant and dupatta</li></ul><h3>How to wear it</h3><p>Pair it with gold jhumkas for a puja.</p><h3>Ordering from Kreeva</h3><p>It ships in 5 to 7 days and can be returned within 7 days.</p>',
  seo_title: 'Maroon Georgette Kurta Set with Zari | Kreeva', seo_description: META,
  image_alts: ['Front view of the maroon kurta', 'Close view of the zari yoke'], faq: [{ q: 'Is the dupatta included?', a: 'Yes, the set has a kurta, pant and dupatta.' }],
};
const input = (o = {}) => ({
  copy: GOOD, keyword: 'Maroon Georgette Kurta Set', brand: 'Kreeva', aiTitle: true, source: '', others: [], facts: Object.values(PRODUCT).flatMap(v => (typeof v === 'string' ? [v] : Object.values(v))),
  vendor: 'Rangoli Fashions', sku: 'RG-1042', ordering: 'Ships in 5 to 7 days. Returns within 7 days.', limits: LIMITS, ...o,
});
const codes = (o) => checkCopy(input(o)).map(p => p.code);

test('profile: gaps are filled, the brand falls back to the website name', () => {
  const p = profileOf({ name: 'Kreeva India', content: {} });
  assert.deepEqual([p.brand, p.spelling, p.units, p.keyword_pattern, p.faq_in_description, p.custom_fields], ['Kreeva India', 'british', 'inches', DEFAULT_KEYWORD, true, true]);
  assert.equal(hasOrdering(p), false);
  const q = profileOf({ name: 'x', content: { profile: { brand_name: ' Kreeva ', spelling: 'american', units: 'cm', delivery: '5 days', faq_in_description: false } } });
  assert.deepEqual([q.brand, q.spelling, q.units, q.faq_in_description, hasOrdering(q)], ['Kreeva', 'american', 'cm', false, true]);
});

test('keyword: the pattern is filled from the facts; empty parts leave no gaps', () => {
  assert.equal(keywordOf(DEFAULT_KEYWORD, PRODUCT), 'Maroon Georgette Kurta Set');
  assert.equal(keywordOf('{occasion} {category} with {work} work', PRODUCT), 'Festive Kurta Set with Zari work');
  assert.equal(keywordOf(DEFAULT_KEYWORD, { ...PRODUCT, color: null }), 'Georgette Kurta Set');
  assert.equal(keywordOf('', { name: null, category: null, fabric: null, color: null, attributes: {} }), '');
});

test('words, phrases, the opening and a section', () => {
  assert.deepEqual(wordsOf('<p>It’s a Kurta-Set, 46 inches.</p>'), ["it's", 'a', 'kurta', 'set', '46', 'inches']);
  assert.equal(countPhrase('A maroon georgette kurta set. Maroon Georgette Kurta-Set again', 'maroon georgette kurta set'), 2);
  assert.equal(countPhrase('maroon georgette embroidered kurta set', 'maroon georgette kurta set'), 0);
  assert.equal(opening('<p>Zari runs along the yoke. Second.</p><ul><li>x</li></ul>'), 'Zari runs along the yoke');
  assert.equal(sectionAfter(GOOD.description_html, /ordering from/i), 'It ships in 5 to 7 days and can be returned within 7 days. .');
  assert.equal(sectionAfter('<p>none</p>', /ordering from/i), '');
});

test('copied runs: 5+ shared words are caught, facts may repeat', () => {
  const facts = factWords(['Kurta, Pant and Dupatta', 'Maroon', 'Georgette']);
  const theirs = ['The yoke carries fine zari that catches the evening light. The set comes with kurta, pant and dupatta in maroon georgette.'];
  assert.deepEqual(copiedRuns('Fine zari that catches the evening light sits on the yoke.', theirs, facts), ['fine zari that catches the evening light']);
  assert.deepEqual(copiedRuns('It comes with kurta, pant and dupatta in maroon georgette.', theirs, facts), []); // facts held together by joining words
  assert.deepEqual(copiedRuns('Ships in 5 to 7 days across India.', ['It ships in 5 to 7 days.'], factWords([])), []);
  assert.deepEqual(copiedRuns('Top length 46 inches, bottom length 39 inches.', ['top length 46 inches bottom length 39 inches'], factWords([])), ['top length 46 inches bottom length 39 inches']);
  assert.deepEqual(copiedRuns('Four word run only here', ['four word run only there'], factWords([])), []);
});

test('a clean listing passes every check', () => {
  assert.deepEqual(checkCopy(input()), []);
});

test('fabric: the description must name it word for word (owner, 2026-11-12)', () => {
  assert.deepEqual(codes({ fabric: 'Georgette' }), []);                       // "georgette" is there: case and punctuation do not matter
  assert.deepEqual(codes({ fabric: '' }), []);                                // no fabric, or a listing not in English: not checked
  const p = checkCopy(input({ fabric: 'Pure Soft Fox Georgette' }));          // shortened to "georgette"
  assert.deepEqual(p.map(x => [x.code, x.hard]), [['fabric', true]]);
  assert.ok(p[0].say.includes('"Pure Soft Fox Georgette"') && p[0].fix.includes('word for word'));
  const named = { ...GOOD, description_html: GOOD.description_html.replace('<li>Fabric: georgette</li>', '<li>Fabric: Pure Soft Fox Georgette</li>') };
  assert.deepEqual(codes({ copy: named, fabric: 'pure soft  fox georgette', facts: [...input().facts, 'Pure Soft Fox Georgette'] }), []);
  assert.deepEqual(codes({ fabric: 'Pure Soft Fox Georgette', kept: ['description_html'] }), []); // a description a person typed is theirs
});

test('copying the supplier or another store is a hard problem with the phrase named', () => {
  const p = checkCopy(input({ source: 'Zari runs along the yoke of this lovely piece' }));
  assert.deepEqual(p.map(x => [x.code, x.hard]), [['copied', true]]);
  assert.match(p[0].say, /"zari runs along the yoke of this"/);
  assert.match(p[0].fix, /new words/);
});

test('same title, same SEO title and same opening as another store', () => {
  const other = { title: 'maroon georgette kurta set with zari work', description_html: '<p>Zari runs along the hem of the other piece.</p>', seo_title: 'Maroon Georgette Kurta Set with Zari | Arya', seo_description: 'x', image_alts: [] };
  assert.deepEqual(codes({ others: [other] }), ['same_title', 'same_meta', 'opening']);
  assert.deepEqual(codes({ others: [other], aiTitle: false }), ['same_meta', 'opening']); // a pattern title is the owner's choice
});

test('keyword: once in the title, in the first 50 words and in the SEO title', () => {
  assert.deepEqual(codes({ copy: { ...GOOD, title: 'Zari Kurta Set in Maroon' } }), ['keyword_title']);
  assert.deepEqual(codes({ copy: { ...GOOD, title: 'Zari Kurta Set in Maroon' }, aiTitle: false }), []);
  assert.deepEqual(codes({ copy: { ...GOOD, seo_title: 'Zari Kurta Set | Kreeva' } }), ['keyword_meta']);
  const late = `<p>${'Plain words here. '.repeat(20)}A maroon georgette kurta set.</p>`;
  assert.deepEqual(codes({ copy: { ...GOOD, description_html: late }, ordering: '' }), ['keyword_start']);
  assert.deepEqual(codes({ keyword: '' }), []);
});

test('brand ending, supplier name, design code, links and claims', () => {
  assert.deepEqual(codes({ copy: { ...GOOD, seo_title: 'Maroon Georgette Kurta Set with Zari' } }), ['brand']);
  assert.deepEqual(codes({ copy: { ...GOOD, seo_description: `${META.slice(0, 120)} by Rangoli Fashions RG-1042` } }), ['names']);
  assert.deepEqual(codes({ copy: { ...GOOD, faq: [{ q: 'Where?', a: 'See www.example.com or call 98765 43210.' }] } }), ['names']);
  assert.deepEqual(codes({ copy: { ...GOOD, faq: [{ q: 'Why?', a: 'It is our No. 1 kurta, only 3 left.' }] } }), ['claims']);
  assert.deepEqual(codes({ vendor: 'RG', sku: '101' }), []); // too short to tell apart from ordinary words
});

test('false alarms: a size run is not a phone number, a missing space is not a website, the store\'s own brand is not a supplier', () => {
  const sizes = { ...GOOD, faq: [{ q: 'Which sizes?', a: 'It comes in 38 40 42 44 46 and 36-38-40-42-44.Check the chart.' }] };
  assert.deepEqual(codes({ copy: sizes }), []);
  assert.deepEqual(codes({ copy: { ...GOOD, faq: [{ q: 'Contact?', a: 'Write to care@example.com or see example.in today.' }] } }), ['names']);
  assert.deepEqual(codes({ vendor: 'Kreeva' }), []);                  // the supplier IS the brand: "| Kreeva" is fine
  assert.deepEqual(codes({ vendor: 'Rangoli', copy: { ...GOOD, faq: [{ q: 'Who makes it?', a: 'Rangoli makes it.' }] } }), ['names']);
});

test('a field typed by hand is the owner\'s: only what the AI wrote is checked', () => {
  const bad = { ...GOOD, title: 'Zari Kurta Set', seo_title: 'My own SEO title', description_html: '<p>Zari runs along the yoke of this lovely piece, by Rangoli Fashions.</p>', seo_description: 'Short.' };
  const all = codes({ copy: bad, source: 'Zari runs along the yoke of this lovely piece' });
  assert.deepEqual(all, ['copied', 'keyword_title', 'keyword_start', 'keyword_meta', 'brand', 'names', 'meta_length']);
  assert.deepEqual(codes({ copy: bad, source: 'Zari runs along the yoke of this lovely piece', kept: ['title', 'description_html', 'seo_title', 'seo_description'] }), []);
  assert.deepEqual(codes({ copy: bad, kept: ['seo_title', 'seo_description'] }), ['keyword_title', 'keyword_start', 'names']);
});

test('a phrase that cannot fit is not demanded: long brand, short SEO title', () => {
  const copy = { ...GOOD, seo_title: 'Kurta Set | Svaraa Ethnic Wear Online Store India' };
  const limits = { ...LIMITS, titleMax: 70, metaTitleMax: 60 };
  const p = checkCopy(input({ copy, brand: 'Svaraa Ethnic Wear Online Store India', limits })); // 26 + 3 + 37 characters > 60
  assert.deepEqual(p.map(x => [x.code, x.hard]), [['keyword_fit', false]]);
  assert.match(p[0].say, /do not fit in the SEO title together \(60 characters\)/);
  assert.deepEqual(codes({ limits }), []);                            // the usual brand: the phrase fits and is checked
  assert.deepEqual(codes({ limits, copy: { ...GOOD, seo_title: 'Zari Kurta Set | Kreeva' } }), ['keyword_meta']);
});

test('ordering: only the numbers the store profile gives', () => {
  const bad = GOOD.description_html.replace('5 to 7 days', '2 days');
  const p = checkCopy(input({ copy: { ...GOOD, description_html: bad } }));
  assert.deepEqual(p.map(x => x.code), ['ordering']);
  assert.match(p[0].say, /: 2\./);
  assert.deepEqual(codes({ copy: { ...GOOD, description_html: bad }, ordering: '' }), []); // no profile text → no ordering check
});

test('soft notes never block: lengths, repeated alts, sales copy', () => {
  const p = checkCopy(input({ copy: { ...GOOD, seo_description: 'Too short.', image_alts: ['Same', 'same'], faq: [{ q: 'Nice?', a: 'A stunning, timeless piece.' }] } }));
  assert.deepEqual(p.map(x => [x.code, x.hard]), [['meta_length', false], ['alts', false], ['tells', false]]);
  assert.deepEqual(hardOf(p), []);
});

test('better: fewer hard problems wins, then fewer in all', () => {
  const hard = { code: 'copied', hard: true, say: '', fix: '' }, soft = { code: 'tells', hard: false, say: '', fix: '' };
  assert.ok(better([soft, soft], [hard]) < 0);
  assert.ok(better([hard], [hard, soft]) < 0);
  assert.equal(better([], []), 0);
});
