// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The AI step's lists and schema (tagPrompt.ts) and the reader's schema with tags (readerPrompt.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTags, tagPromptLines, tagSchema, tagSpec } from '../tagPrompt.ts';
globalThis.Deno ??= { env: { get: () => '' } }; // readerPrompt.ts → db.ts reads Deno.env
const { readerSchema } = await import('../readerPrompt.ts');

const spec = tagSpec([
  { id: 'col', name: 'Colour', multi: true, values: [{ id: 'pink', name: 'Pink' }, { id: 'wine', name: 'Wine' }] },
  { id: 'fab', name: 'Fabric', multi: false, values: [{ id: 'org', name: 'Organza' }, { id: 'silk', name: 'Silk' }] },
  { id: 'empty', name: 'Occasion', multi: true, values: [] },
], { Lehenga: ['col', 'fab'] });

test('only attributes with values; safe property names; enum per attribute', () => {
  assert.deepEqual(spec.attrs.map(a => a.pk), ['colour', 'fabric']);
  const s = tagSchema(spec);
  assert.deepEqual(s.tags.properties.colour.properties.values.items.enum, ['Pink', 'Wine']);
  assert.deepEqual(s.tags.required, ['colour', 'fabric']);
  assert.ok(s.tag_other);
  assert.equal(tagSchema(spec, { fillOnly: true }).tag_other, undefined);
  assert.equal(tagSchema(tagSpec([])), null);
});

test('prompt: lists, the category map, closest-value rule, never invent', () => {
  const t = tagPromptLines(spec).join('\n');
  assert.match(t, /Colour \(one or several\): Pink, Wine/);
  assert.match(t, /Fabric \(one value\): Organza, Silk/);
  assert.match(t, /Lehenga → Colour, Fabric/);
  assert.match(t, /CLOSEST value/);
  assert.match(t, /Never invent/);
});

test('readTags: unknown names dropped, one-value keeps the first, other phrases kept, `only` respected', () => {
  const r = readTags(spec, { tags: { colour: { values: ['pink', 'Maroon', 'Wine'], other: ['Rani Pink'] }, fabric: { values: ['Silk', 'Organza'], other: [] } }, tag_other: ['Festive', 'a very long phrase that is not a tag at all'] });
  assert.deepEqual(r.chosen, { col: ['pink', 'wine'], fab: ['silk'] });
  assert.deepEqual(r.other, [{ attribute_id: 'col', phrase: 'Rani Pink' }, { attribute_id: null, phrase: 'Festive' }]);
  assert.deepEqual(Object.keys(readTags(spec, { tags: { colour: { values: ['Pink'] }, fabric: { values: ['Silk'] } } }, new Set(['fab'])).chosen), ['fab']);
});

test('reader schema: tags added only when there is something to choose', () => {
  assert.equal(readerSchema(['Saree']).properties.tags, undefined);
  const s = readerSchema(['Saree'], spec);
  assert.ok(s.properties.tags && s.required.includes('tags') && s.required.includes('tag_other'));
});
