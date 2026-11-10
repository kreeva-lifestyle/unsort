// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTags, fillTemplate, maxSiteTags } from '../tags.ts';

const facts = {
  category: 'Kurta Set', fabric: 'Cotton', color: 'Pink', vendor: 'Bahu Palace', vendor_code: 'BP', sku: 'KB261', sizes: ['S', 'M'],
  attributes: { store_tags: '_altnew_KBSUIT25, Ideal Collection, kb261', brand: 'Bahu Palace' },
  tags: ['Kurta Set', 'Cotton', 'Pink', 'Festive', 'Ideal Collection'],
};

test('{tags}: one tag per product tag; the facts templates still work; dedupe is case-insensitive', () => {
  const out = buildTags({ templates: ['{category}', '{fabric}', '{color}', '{tags}', 'Vendor_{vendor}'], static: [], case: 'as_is', ai_extra: false, ai_extra_max: 0 }, facts, []);
  assert.deepEqual(out, ['Kurta Set', 'Cotton', 'Pink', 'Festive', 'Ideal Collection', 'Vendor_Bahu Palace']);
});

test('{tags} with a prefix and with {size}: per tag (× size); a product with no tags gives nothing for that template', () => {
  assert.deepEqual(buildTags({ templates: ['tag:{tags}'] }, { ...facts, tags: ['Festive', 'Wedding'] }, []), ['tag:Festive', 'tag:Wedding']);
  assert.deepEqual(buildTags({ templates: ['{tags}-{size}'] }, { ...facts, tags: ['Festive'] }, []), ['Festive-S', 'Festive-M']);
  assert.deepEqual(buildTags({ templates: ['{tags}', '{sku}'] }, { ...facts, tags: [] }, []), ['KB261']);
  assert.deepEqual(buildTags({ templates: ['{tags}'] }, { ...facts, tags: undefined }, []), []);
});

test('{attr:store_tags} keeps giving the RAW store tags (one each), unchanged', () => {
  assert.deepEqual(buildTags({ templates: ['{attr:store_tags}'] }, facts, []), ['_altnew_KBSUIT25', 'Ideal Collection', 'kb261']);
});

test('max_tags caps the final list (default 30 when the site has none; at most 250)', () => {
  const many = Array.from({ length: 40 }, (_, i) => `T${i}`);
  assert.equal(buildTags({ templates: ['{tags}'] }, { ...facts, tags: many }, []).length, 30);
  assert.equal(buildTags({ templates: ['{tags}'], max_tags: 5 }, { ...facts, tags: many }, []).length, 5);
  assert.deepEqual(buildTags({ templates: ['{tags}'], static: ['Z'], max_tags: 3 }, { ...facts, tags: ['A', 'B'] }, []), ['A', 'B', 'Z']);
  assert.equal(maxSiteTags({}), 30);
  assert.equal(maxSiteTags({ max_tags: 0 }), 30);
  assert.equal(maxSiteTags({ max_tags: 999 }), 250);
});

test('AI extras still come last and are capped by ai_extra_max', () => {
  const out = buildTags({ templates: ['{category}'], static: ['New'], case: 'lower', ai_extra: true, ai_extra_max: 1 }, facts, ['Wedding Guest', 'Party']);
  assert.deepEqual(out, ['kurta set', 'new', 'wedding guest']);
});

test('fillTemplate: {tags} is empty without a tag (the template is dropped)', () => {
  assert.equal(fillTemplate('{tags}', facts), null);
  assert.equal(fillTemplate('{tags}', facts, '', 'Festive'), 'Festive');
});
