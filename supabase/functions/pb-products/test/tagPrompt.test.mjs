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

test('prompt: lists, the category map, must-have always chosen, "only if it fits" left empty when nothing fits, never invent', () => {
  const t = tagPromptLines(spec).join('\n');
  assert.match(t, /Colour \(one or several; must have\): Pink, Wine/);
  assert.match(t, /Fabric \(one value; must have\): Organza, Silk/);
  assert.match(t, /Lehenga → Colour, Fabric/);
  assert.match(t, /"must have" always gets a value: choose the best-fitting one .* Never leave a must-have attribute empty\./);
  assert.match(t, /Occasion from the look of the product/);
  assert.match(t, /"only if it fits" gets a value only when one in its list truly fits .* leave values \[\]/);
  assert.match(t, /Never invent/);
  const opt = tagSpec([{ id: 'type', name: 'Product Type', multi: false, required: false, values: [{ id: 'bl', name: 'Bridal Lehenga' }] }]);
  assert.match(tagPromptLines(opt).join('\n'), /Product Type \(one value; only if it fits\): Bridal Lehenga/);
});

test('schema: in "Let AI decide" a must-have attribute takes at least one value, an "only if it fits" one may stay empty; the read asks for none', () => {
  const s = tagSpec([{ id: 'col', name: 'Colour', multi: false, values: [{ id: 'p', name: 'Pink' }] },
    { id: 'type', name: 'Product Type', multi: false, required: false, values: [{ id: 'bl', name: 'Bridal Lehenga' }] }]);
  const fill = tagSchema(s, { fillOnly: true }).tags.properties;
  assert.equal(fill.colour.properties.values.minItems, 1);
  assert.equal(fill.product_type.properties.values.minItems, undefined);
  assert.equal(tagSchema(s).tags.properties.colour.properties.values.minItems, undefined);
});

test('readTags: unknown names dropped, one-value keeps the first, other phrases kept, `only` respected', () => {
  const r = readTags(spec, { tags: { colour: { values: ['pink', 'Maroon', 'Wine'], other: ['Rani Pink'] }, fabric: { values: ['Silk', 'Organza'], other: [] } }, tag_other: ['Festive', 'a very long phrase that is not a tag at all'] });
  assert.deepEqual(r.chosen, { col: ['pink', 'wine'], fab: ['silk'] });
  assert.deepEqual(r.other, [{ attribute_id: 'col', phrase: 'Rani Pink' }, { attribute_id: null, phrase: 'Festive' }]);
  assert.deepEqual(Object.keys(readTags(spec, { tags: { colour: { values: ['Pink'] }, fabric: { values: ['Silk'] } } }, new Set(['fab'])).chosen), ['fab']);
});

test('Plain (owner, 18 Nov 2026): the AI is told it means none of the others, and it is dropped when another value is chosen', () => {
  const s = tagSpec([{ id: 'work', name: 'Work', multi: true, values: [{ id: 'emb', name: 'Embroidery' }, { id: 'plain', name: 'Plain' }] }]);
  assert.match(tagPromptLines(s).join('\n'), /"Plain" means the product shows none of that at all .* a work that is not in the list takes the nearest listed value .* never Plain\./);
  assert.doesNotMatch(tagPromptLines(spec).join('\n'), /"Plain"/);
  assert.deepEqual(readTags(s, { tags: { work: { values: ['Plain', 'Embroidery'], other: [] } } }).chosen, { work: ['emb'] });
  assert.deepEqual(readTags(s, { tags: { work: { values: ['Plain'], other: [] } } }).chosen, { work: ['plain'] });
});

test('reader schema: tags added only when there is something to choose', () => {
  assert.equal(readerSchema(['Saree']).properties.tags, undefined);
  const s = readerSchema(['Saree'], spec);
  assert.ok(s.properties.tags && s.required.includes('tags') && s.required.includes('tag_other'));
});
