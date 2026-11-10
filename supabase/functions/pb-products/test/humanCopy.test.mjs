// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Product copy that reads like a person wrote it (humanCopy.ts) and its place in the writer's prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_RULES, copyTells, tidyCopy } from '../humanCopy.ts';
globalThis.Deno ??= { env: { get: () => '' } }; // genPrompt.ts → readerPrompt.ts → db.ts reads Deno.env
const { genSystem } = await import('../genPrompt.ts');

const EM = '—', EN = '–';

test('tidyCopy: dashes between clauses become commas, ranges and compounds keep a hyphen', () => {
  assert.equal(tidyCopy(`A georgette suit ${EM} with a net dupatta ${EM} in wine.`), 'A georgette suit, with a net dupatta, in wine.');
  assert.equal(tidyCopy(`Sizes 38${EN}44`), 'Sizes 38-44');
  assert.equal(tidyCopy(`Sizes 38 ${EN} 44`), 'Sizes 38-44');
  assert.equal(tidyCopy(`semi${EN}stitched A${EM}line kurta`), 'semi-stitched A-line kurta');
  assert.equal(tidyCopy('Pink Anarkali Set -- 3 Piece'), 'Pink Anarkali Set, 3 Piece');
  assert.equal(tidyCopy(`Pink Anarkali Set ${EN} 3 Piece`), 'Pink Anarkali Set, 3 Piece');
});

test('tidyCopy: no stray comma at the start or end of a line or list item', () => {
  assert.equal(tidyCopy(`<ul><li>${EM} Fabric: silk</li><li>Work: zari ${EM}</li></ul>`), '<ul><li>Fabric: silk</li><li>Work: zari</li></ul>');
  assert.equal(tidyCopy(`${EM} Wine silk saree`), 'Wine silk saree');
  assert.equal(tidyCopy(`Wine silk saree ${EM}`), 'Wine silk saree');
  assert.equal(tidyCopy(`It has a zari border ${EM}. Blouse piece included.`), 'It has a zari border. Blouse piece included.');
});

test('tidyCopy: straight quotes, tags untouched, plain text untouched, safe to run twice', () => {
  assert.equal(tidyCopy('“Rani” pink, the weaver’s own shade'), '"Rani" pink, the weaver\'s own shade');
  const html = '<p>Wine georgette semi-stitched suit with a net dupatta.</p><ul><li>Fabric: georgette</li><li>Sizes: 38, 40, 42</li></ul>';
  assert.equal(tidyCopy(html), html);
  const messy = `<p>Soft cotton ${EM} easy to wear ${EM} in “mint”.</p>`;
  assert.equal(tidyCopy(tidyCopy(messy)), tidyCopy(messy));
  assert.equal(tidyCopy(null), '');
  assert.equal(tidyCopy(undefined), '');
});

test('copyTells: the usual AI product copy is caught, pattern by pattern', () => {
  const ai = `<p>Introducing our stunning Anarkali ${EM} it's not just a suit, it's a statement. Crafted to perfection, it boasts intricate embroidery, ensuring all-day comfort. Loved by customers. Elegance redefined.</p>`;
  assert.deepEqual(copyTells(ai), ['not-x-but-y', 'announcing opener', 'slogan closer', 'sales word', 'tacked-on -ing', 'unsupported claim', 'boasts / features', 'dash']);
  assert.deepEqual(copyTells('More than an outfit.'), ['not-x-but-y']);
  assert.deepEqual(copyTells('A must-have for the season.'), ['slogan closer', 'sales word']);
  assert.deepEqual(copyTells('Soft cotton, making it ideal for summer.'), ['tacked-on -ing']);
});

test('copyTells: plain, factual copy passes; words inside tags do not count', () => {
  const plain = '<p>Wine georgette semi-stitched suit with thread embroidery on the yoke. It comes with a net dupatta and a santoon bottom.</p><ul><li>Fabric: georgette</li><li>Work: thread embroidery</li><li>Sizes: 38, 40, 42</li><li>Care: dry clean</li></ul>';
  assert.deepEqual(copyTells(plain), []);
  assert.deepEqual(copyTells('Kurta is not lined. Bottom is not included.'), []);
  assert.deepEqual(copyTells('Printed cotton kurta with a statement-free plain back'), []);
  assert.deepEqual(copyTells(null), []);
});

test('the rules themselves follow the rules they can: no dashes, no curly quotes', () => {
  const all = HUMAN_RULES.join('\n');
  assert.ok(!/[–—‘’“”]/.test(all));
  assert.ok(HUMAN_RULES.length >= 12 && all.length < 3500);
});

test('writer prompt: carries the rules, and the store owner still has the last word', () => {
  const sys = genSystem('Kreeva', { description_words: 90, extra_instructions: 'Always mention free shipping.' }, 0, 2);
  assert.ok(sys.includes(HUMAN_RULES[0]));
  assert.ok(sys.includes('never pad to reach the word count'));
  assert.ok(sys.includes('at most about 90 words (fewer when there is less to say)'));
  const lines = sys.split('\n');
  const lastRule = lines.lastIndexOf(HUMAN_RULES[HUMAN_RULES.length - 1]);
  const owner = lines.findIndex(l => l.startsWith('Extra instructions from the store owner:'));
  assert.ok(lastRule > 0 && owner === lastRule + 1 && owner === lines.length - 1);
  assert.ok(sys.includes('Use ONLY the facts given'));        // the old guard rails are still there
  const noExtra = genSystem('Kreeva', {}, 3, 0);
  assert.equal(noExtra.split('\n').at(-1), HUMAN_RULES.at(-1));
});
