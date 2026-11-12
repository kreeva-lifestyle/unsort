// node --test --experimental-strip-types supabase/functions/pb-photo-prints/test/*.test.mjs
// The print of a photo: the same picture at another size or brightness stays close, another picture is far.
import test from 'node:test';
import assert from 'node:assert/strict';

const { printOf, bitsApart, jpegSize, lumaGrid, detailOf } = await import('../print.ts');

/** A picture made of soft blobs: `seed` picks where they are. RGBA, w × h. */
function picture(seed, w, h, { gain = 1, lift = 0, tint = [1, 1, 1] } = {}) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const blobs = Array.from({ length: 14 }, () => ({ x: rnd(), y: rnd(), r: 0.08 + rnd() * 0.25, v: rnd() * 255 }));
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 110, wsum = 1;
    for (const b of blobs) {
      const d = ((x / w - b.x) ** 2 + (y / h - b.y) ** 2) / (b.r * b.r);
      const k = Math.exp(-d * 3);
      v += b.v * k; wsum += k;
    }
    const l = (v / wsum) * gain + lift, i = (y * w + x) * 4;
    px[i] = l * tint[0]; px[i + 1] = l * tint[1]; px[i + 2] = l * tint[2]; px[i + 3] = 255;
  }
  return px;
}

test('the same picture at another size, brightness or tint prints nearly the same', () => {
  const a = printOf(picture(7, 600, 900), 600, 900);
  assert.match(a.hex, /^[0-9a-f]{64}$/);
  for (const [name, b] of [
    ['half size', printOf(picture(7, 300, 450), 300, 450)],
    ['quarter size', printOf(picture(7, 150, 225), 150, 225)],
    ['a little brighter', printOf(picture(7, 600, 900, { gain: 1.06, lift: 8 }), 600, 900)],
    ['a warm tint', printOf(picture(7, 600, 900, { tint: [1, 0.93, 0.85] }), 600, 900)],
  ]) assert.ok(bitsApart(a.hex, b.hex) <= 16, `${name}: ${bitsApart(a.hex, b.hex)} bits apart`);
});

test('another picture prints far away', () => {
  const a = printOf(picture(7, 600, 900), 600, 900);
  for (const seed of [8, 99, 12345]) {
    const n = bitsApart(a.hex, printOf(picture(seed, 600, 900), 600, 900).hex);
    assert.ok(n >= 70, `seed ${seed}: only ${n} bits apart`);
  }
  assert.equal(bitsApart(a.hex, a.hex), 0);
  assert.equal(bitsApart('f'.repeat(64), '0'.repeat(64)), 256);
});

test('half the bits are set, whatever the picture (the median splits them)', () => {
  const ones = h => [...h].reduce((n, c) => n + [...parseInt(c, 16).toString(2)].filter(b => b === '1').length, 0);
  assert.equal(ones(printOf(picture(3, 400, 400), 400, 400).hex), 128);
});

test('a blank picture has no detail; a real one has', () => {
  const blank = new Uint8ClampedArray(200 * 300 * 4).fill(255);
  assert.equal(printOf(blank, 200, 300).detail, 0);
  assert.ok(printOf(picture(7, 600, 900), 600, 900).detail >= 5);
  assert.equal(detailOf(lumaGrid(blank, 200, 300)), 0);
});

test('a picture smaller than the grid still prints (empty cells take a neighbour)', () => {
  const p = printOf(picture(7, 20, 30), 20, 30);
  assert.match(p.hex, /^[0-9a-f]{64}$/);
  assert.throws(() => printOf(new Uint8ClampedArray(8), 600, 900), /no pixels/);
});

test('the size is read from the JPEG header', () => {
  const sof = (marker, h, w) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, marker, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0]);
  assert.deepEqual(jpegSize(sof(0xc0, 2400, 1600)), { w: 1600, h: 2400, progressive: false });
  assert.deepEqual(jpegSize(sof(0xc2, 1280, 853)), { w: 853, h: 1280, progressive: true });
  assert.equal(jpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), null); // a PNG
  assert.equal(jpegSize(new Uint8Array(0)), null);
});
