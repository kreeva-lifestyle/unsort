// node --test --experimental-strip-types supabase/functions/pb-photo-prints/test/*.test.mjs
// One call = one photo: what is answered, and what is left for a later try.
import test from 'node:test';
import assert from 'node:assert/strict';

const { runOne, readPhoto, MAX_PIXELS, MAX_BYTES } = await import('../work.ts');

const jpegHead = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
/** A decoder that hands back a simple picture of the size the header says. */
const fakeDecode = (flat = false) => (bytes) => {
  const h = (bytes[7] << 8) | bytes[8], w = (bytes[9] << 8) | bytes[10];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = flat ? 255 : (Math.sin(x / 9) * Math.cos(y / 13) + 1) * 120, i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
};
function deps(over = {}) {
  const puts = [];
  let t = 0;
  return {
    puts,
    d: {
      claim: async () => ({ image_id: 'img1', product_id: 'p1', path: 'p1/a.jpg', bytes: null }),
      put: async (a) => { puts.push(a); return 2; },
      download: async () => jpegHead(120, 180),
      decode: fakeDecode(),
      now: () => (t += 40),
      ...over,
    },
  };
}

test('nothing waiting: nothing is downloaded or saved', async () => {
  const { d, puts } = deps({ claim: async () => null, download: async () => { throw new Error('must not download'); } });
  assert.deepEqual(await runOne(d), { state: 'idle' });
  assert.equal(puts.length, 0);
});

test('a photo is printed and the answer saved with its size', async () => {
  const { d, puts } = deps();
  const r = await runOne(d);
  assert.equal(r.state, 'done'); assert.equal(r.paired, 2); assert.equal(r.pixels, 120 * 180); assert.equal(r.read_ms, 40);
  assert.equal(puts.length, 1);
  assert.match(puts[0].print, /^[0-9a-f]{64}$/);
  assert.deepEqual([puts[0].image, puts[0].width, puts[0].height, puts[0].note], ['img1', 120, 180, null]);
});

test('what cannot be printed is answered with the reason, so it is not asked again', async () => {
  for (const [over, note] of [
    [{ download: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]), claim: async () => ({ image_id: 'img1', product_id: 'p1', path: 'p1/a.png', bytes: null }) }, 'Only JPEG photos are checked.'],
    [{ download: async () => Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) }, 'The file is not a JPEG photo.'],
    [{ download: async () => jpegHead(3000, 4000) }, 'The photo is too large to check.'],
    [{ download: async () => null }, 'The file is too large to check.'],
    [{ claim: async () => ({ image_id: 'img1', product_id: 'p1', path: 'p1/a.jpg', bytes: MAX_BYTES + 1 }), download: async () => { throw new Error('must not download'); } }, 'The file is too large to check.'],
    [{ decode: fakeDecode(true) }, 'The picture is too plain to tell apart.'],
  ]) {
    const { d, puts } = deps(over);
    const r = await runOne(d);
    assert.equal(r.state, 'skipped', note); assert.equal(r.note, note);
    assert.equal(puts.length, 1); assert.equal(puts[0].print, null); assert.equal(puts[0].note, note);
  }
  assert.ok(3000 * 4000 > MAX_PIXELS);
});

test('a photo the decoder cannot open is answered, with the decoder\'s own words', async () => {
  const { d, puts } = deps({ decode: () => { throw new Error('unexpected marker'); } });
  const r = await runOne(d);
  assert.equal(r.state, 'skipped');
  assert.match(puts[0].note, /could not be opened \(unexpected marker\)/);
});

test('a failed download is NOT answered: the photo stays claimed for a later try', async () => {
  const { d, puts } = deps({ download: async () => { throw new Error('storage is down'); } });
  await assert.rejects(runOne(d), /storage is down/);
  assert.equal(puts.length, 0);
});

test('readPhoto never decodes a photo that is too large', () => {
  let decoded = false;
  const r = readPhoto('a.jpg', jpegHead(3000, 4000), () => { decoded = true; throw new Error('no'); }, () => 0);
  assert.equal(decoded, false); assert.equal(r.print, null); assert.deepEqual([r.width, r.height], [3000, 4000]);
});
