// node --test --experimental-strip-types supabase/functions/pb-photo-prints/test/*.test.mjs
// The print of a photo: the same picture at another size, quality or JPEG kind stays close; another picture is far.
// The fixtures are made-up pictures of soft blobs (test/fixtures), never real photos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { readDc, JpegError } = await import('../jpegDc.ts');
const { gridOf, lumaOf, turned, printOf, bitsApart, detailOf } = await import('../print.ts');

const file = name => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const dc = name => readDc(file(name));
const print = d => printOf(turned(gridOf(d.luma, d.bw, d.bh, d.width, d.height, d.unitX, d.unitY), d.orientation));
/** The same bytes with an EXIF block that says how the photo should be turned (as a phone writes it). */
function withExif(jpeg, orientation) {
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff], len = body.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...body, ...jpeg.subarray(2)]);
}

test('a JPEG is read at one-eighth size: its size, kind and block averages', () => {
  const a = dc('a-baseline.jpg');
  assert.deepEqual([a.width, a.height, a.bw, a.bh, a.unitX, a.unitY, a.progressive, a.orientation], [640, 960, 80, 120, 8, 8, false, 1]);
  assert.equal(a.luma.length, 80 * 120);
  assert.ok(a.luma.every(v => v >= 0 && v <= 255));
  const p = dc('a-progressive.jpg');
  assert.deepEqual([p.width, p.height, p.progressive], [640, 960, true]);
  // the same picture stored two ways gives the same averages, block for block
  let worst = 0;
  for (let i = 0; i < a.luma.length; i++) worst = Math.max(worst, Math.abs(a.luma[i] - p.luma[i]));
  assert.ok(worst < 6, `baseline and progressive differ by up to ${worst.toFixed(1)}`);
  const s = dc('a-small-444-restarts.jpg');
  assert.deepEqual([s.width, s.height, s.bw, s.bh], [301, 451, 38, 57]); // odd sizes: the last block is partly outside
  assert.equal(dc('a-grey-q60.jpg').bw, 50);
});

test('the same picture, however it was saved, prints nearly the same', () => {
  const a = print(dc('a-baseline.jpg'));
  assert.match(a.hex, /^[0-9a-f]{64}$/);
  // [file, the most bits it may differ]: a grey copy maps brightness a little differently, so it gets more room
  for (const [name, most] of [['a-progressive.jpg', 10], ['a-small-444-restarts.jpg', 10], ['a-grey-q60.jpg', 20]]) {
    const n = bitsApart(a.hex, print(dc(name)).hex);
    assert.ok(n <= most, `${name}: ${n} bits apart`);
  }
});

test('another picture prints far away', () => {
  const n = bitsApart(print(dc('a-baseline.jpg')).hex, print(dc('b-baseline.jpg')).hex);
  assert.ok(n >= 80, `only ${n} bits apart`);
  assert.equal(bitsApart('f'.repeat(64), '0'.repeat(64)), 256);
});

test('a photo a phone stored on its side is turned upright first', () => {
  const upright = print(dc('a-baseline.jpg')), side = file('a-on-its-side.jpg');
  assert.ok(bitsApart(upright.hex, print(readDc(side)).hex) >= 80, 'untagged, it is another picture');
  const tagged = readDc(withExif(side, 6));
  assert.equal(tagged.orientation, 6);
  const n = bitsApart(upright.hex, print(tagged).hex);
  assert.ok(n <= 10, `turned back: ${n} bits apart`);
});

test('every way of turning is undone: a grid turned and turned back is itself', () => {
  const g = Float64Array.from({ length: 64 * 64 }, (_, i) => (i * 7919) % 251);
  const back = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 8, 7: 7, 8: 6 };
  for (const o of [2, 3, 4, 5, 6, 7, 8]) assert.deepEqual(turned(turned(g, o), back[o]), g, `orientation ${o}`);
  assert.equal(turned(g, 1), g); assert.equal(turned(g, 9), g);
});

test('plain pixels give the same print as the JPEG blocks (the grid is what counts)', () => {
  const d = dc('a-baseline.jpg');
  // blow each block average up to 8 × 8 pixels and print that as an ordinary picture
  const w = d.bw * 8, h = d.bh * 8, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = d.luma[(y >> 3) * d.bw + (x >> 3)], i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; }
  const n = bitsApart(print(d).hex, printOf(gridOf(lumaOf(rgba, w, h), w, h, w, h)).hex);
  assert.ok(n <= 4, `${n} bits apart`);
});

test('half the bits are set, and a blank picture has no detail', () => {
  const ones = h => [...h].reduce((n, c) => n + [...parseInt(c, 16).toString(2)].filter(b => b === '1').length, 0);
  assert.equal(ones(print(dc('a-baseline.jpg')).hex), 128);
  const blank = new Float64Array(64 * 64).fill(255);
  assert.equal(detailOf(blank), 0); assert.equal(printOf(blank).detail, 0);
  assert.ok(print(dc('a-baseline.jpg')).detail >= 5);
  assert.throws(() => printOf(new Float64Array(10)), /no pixels/);
});

test('what is not an ordinary JPEG is refused in plain words', () => {
  assert.throws(() => readDc(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), e => e instanceof JpegError && /not a JPEG/.test(e.message));
  assert.throws(() => readDc(new Uint8Array(0)), JpegError);
  assert.throws(() => readDc(file('a-baseline.jpg').subarray(0, 300)), JpegError);             // cut off before the picture
  const cmyk = file('a-baseline.jpg').slice(); // say "4 colours" in the frame header
  for (let i = 2; i < cmyk.length - 10; i++) if (cmyk[i] === 0xff && cmyk[i + 1] === 0xc0) { cmyk[i + 9] = 4; break; }
  assert.throws(() => readDc(cmyk), /ordinary colour or grey/);
  const twelve = file('a-baseline.jpg').slice();
  for (let i = 2; i < twelve.length - 10; i++) if (twelve[i] === 0xff && twelve[i + 1] === 0xc0) { twelve[i + 4] = 12; break; }
  assert.throws(() => readDc(twelve), /8-bit/);
});
