// node --test --experimental-strip-types supabase/functions/pb-photo-prints/test/*.test.mjs
// One call = one photo: what is answered, and what is left for a later try.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { runOne, runBatch, readPhoto, MAX_BYTES } = await import('../work.ts');
const file = name => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

function deps(over = {}) {
  const puts = [];
  let t = 0;
  return {
    puts,
    d: {
      claim: async () => ({ image_id: 'img1', product_id: 'p1', path: 'p1/a.jpg', bytes: null }),
      put: async (a) => { puts.push(a); return 2; },
      download: async () => file('a-baseline.jpg'),
      now: () => (t += 20),
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
  assert.equal(r.state, 'done'); assert.equal(r.paired, 2); assert.equal(r.pixels, 640 * 960); assert.equal(r.read_ms, 20);
  assert.equal(r.bytes, file('a-baseline.jpg').length);
  assert.equal(puts.length, 1);
  assert.match(puts[0].print, /^[0-9a-f]{64}$/);
  assert.deepEqual([puts[0].image, puts[0].width, puts[0].height, puts[0].note], ['img1', 640, 960, null]);
  assert.ok(puts[0].detail >= 5);
});

test('what cannot be printed is answered with the reason, so it is not asked again', async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  for (const [over, note] of [
    [{ download: async () => png, claim: async () => ({ image_id: 'img1', product_id: 'p1', path: 'p1/a.png', bytes: null }) }, 'Only JPEG photos are checked.'],
    [{ download: async () => png }, 'The file is not a JPEG photo.'],
    [{ download: async () => file('a-tiny.jpg') }, 'The photo is too small to check.'],
    [{ download: async () => null }, 'The file is too large to check.'],
    [{ claim: async () => ({ image_id: 'img1', product_id: 'p1', path: 'p1/a.jpg', bytes: MAX_BYTES + 1 }), download: async () => { throw new Error('must not download'); } }, 'The file is too large to check.'],
    [{ download: async () => file('a-baseline.jpg').subarray(0, 300) }, 'The photo file is cut short.'],
  ]) {
    const { d, puts } = deps(over);
    const r = await runOne(d);
    assert.equal(r.state, 'skipped', note); assert.equal(r.note, note);
    assert.equal(puts.length, 1); assert.equal(puts[0].print, null); assert.equal(puts[0].note, note);
  }
});

test('a failed download is NOT answered: the photo stays claimed for a later try', async () => {
  const { d, puts } = deps({ download: async () => { throw new Error('storage is down'); } });
  await assert.rejects(runOne(d), /storage is down/);
  assert.equal(puts.length, 0);
});

test('a small photo keeps its size in the answer, so the reason can be checked', () => {
  const r = readPhoto('a.jpg', file('a-tiny.jpg'), () => 0);
  assert.equal(r.print, null); assert.deepEqual([r.width, r.height], [120, 180]);
});

/** A queue of `n` waiting photos; `bad` (an index) fails to download. */
function queue(n, { bad = -1, step = 20 } = {}) {
  const puts = []; let i = 0, t = 0;
  return {
    puts,
    d: {
      claim: async () => (i < n ? { image_id: `img${i++}`, product_id: 'p1', path: 'p1/a.jpg', bytes: null } : null),
      put: async (a) => { puts.push(a); return 1; },
      download: async () => { if (i - 1 === bad) throw new Error('storage is down'); return file('a-baseline.jpg'); },
      now: () => (t += step),
    },
  };
}

test('a batch takes photos one after the other until none is waiting', async () => {
  const { d, puts } = queue(3);
  const r = await runBatch(d);
  assert.deepEqual([r.done, r.skipped, r.paired, r.notes.length], [3, 0, 3, 0]);
  assert.deepEqual(puts.map(p => p.image), ['img0', 'img1', 'img2']);
});

test('a batch stops claiming once it has used its share of the call', async () => {
  const byReading = queue(50, { step: 60 });               // every reading takes 60 ms
  const r = await runBatch(byReading.d, { readMs: 200, photos: 20, wallMs: 1e9 });
  assert.equal(r.done, 4); assert.equal(byReading.puts.length, 4); // 180 ms spent after three, so a fourth starts; then it stops
  const byCount = queue(50);
  assert.equal((await runBatch(byCount.d, { readMs: 1e9, photos: 5, wallMs: 1e9 })).done, 5);
  const byClock = queue(50);
  assert.ok((await runBatch(byClock.d, { readMs: 1e9, photos: 50, wallMs: 100 })).done < 5);
});

test('a download that fails mid-batch keeps what was done; a first failure is the call\'s', async () => {
  const { d, puts } = queue(5, { bad: 2 });
  const r = await runBatch(d);
  assert.equal(r.done, 2); assert.equal(puts.length, 2); assert.match(r.stopped, /storage is down/);
  await assert.rejects(runBatch(queue(5, { bad: 0 }).d), /storage is down/);
});

test('reasons for skipped photos are reported once each', async () => {
  const q = queue(3);
  q.d.download = async () => file('a-tiny.jpg');
  const r = await runBatch(q.d);
  assert.deepEqual([r.done, r.skipped, r.notes], [0, 3, ['The photo is too small to check.']]);
});
