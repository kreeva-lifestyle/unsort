// node --test --experimental-strip-types supabase/functions/pb-products/test/
// What an update keeps of the product as the store has it (publishParts.ts,
// Shopify sync check 2026-11-12): tags and media Playbook did not put there,
// no photo uploaded twice, and which failures do not use up a listing's tries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { busyStreak, filesFor, FREE_RETRIES, knownPhotos, leaveGallery, mergeTags, photoRecord, temporary } = await import('../publishParts.ts');
const { HttpError } = await import('../http.ts');

const m = (id, alt = '', o = {}) => ({ id, alt, image: true, failed: false, ...o });
const ids = (g) => g.files.map(f => f.id || f.originalSource.split('/').pop());

test('tags: the store keeps what Playbook did not put there, and loses what Playbook dropped', () => {
  assert.deepEqual(mergeTags(['Kurta Set', 'Diwali Sale', 'old-tag'], ['Kurta Set', 'Old-Tag'], ['Kurta Set', 'Georgette']), ['Kurta Set', 'Georgette', 'Diwali Sale']);
  assert.deepEqual(mergeTags(['A', 'b'], null, ['B', 'c']), ['B', 'c', 'A']);            // no record of the last publish: nothing of the store's is dropped
  assert.deepEqual(mergeTags([], ['x'], ['x']), ['x']);
  assert.equal(mergeTags(Array.from({ length: 300 }, (_, i) => `t${i}`), null, ['mine']).length, 250);
});

test('photos, first time: every photo afresh; nothing to send without photos', () => {
  const g = filesFor({ paths: ['a/1.jpg', 'a/2.jpg'], alts: ['Front', 'x'.repeat(600)], known: [], store: null });
  assert.deepEqual(g.fresh, ['a/1.jpg', 'a/2.jpg']);
  assert.ok(g.files.every(f => f.contentType === 'IMAGE' && /a\/[12]\.jpg$/.test(f.originalSource)));
  assert.equal(g.files[1].alt.length, 512);
  assert.deepEqual(filesFor({ paths: [], alts: [], known: [], store: [] }), { files: null, fresh: [] });
  // a recovered lost create (nothing known about its photos): sent again, replacing what is there
  assert.deepEqual(filesFor({ paths: ['a/1.jpg'], alts: [], known: [], store: [m('old')] }).fresh, ['a/1.jpg']);
});

test('photos, update: nothing is uploaded twice and the store keeps its own media and order', () => {
  const known = [{ path: 'a/1.jpg', id: 'm1' }, { path: 'a/2.jpg', id: 'm2' }], paths = ['a/1.jpg', 'a/2.jpg'];
  const store = [m('m2', 'Back'), m('shop-video', '', { image: false }), m('m1', 'Front')]; // reordered in Shopify, with a video of theirs
  assert.deepEqual(filesFor({ paths, alts: ['Front', 'Back'], known, store }), { files: null, fresh: [] }); // nothing changed: left alone
  const alts = filesFor({ paths, alts: ['Front view', ''], known, store });                // a rewritten description; an empty one never wipes
  assert.deepEqual(alts.files, [{ id: 'm2' }, { id: 'shop-video' }, { id: 'm1', alt: 'Front view' }]);
  assert.deepEqual(alts.fresh, []);
  const added = filesFor({ paths: ['a/1.jpg', 'a/3.jpg', 'a/2.jpg'], alts: ['Front', 'Side', 'Back'], known, store });
  assert.deepEqual(ids(added), ['m1', '3.jpg', 'm2', 'shop-video']);                       // Playbook's order, theirs after
  assert.deepEqual(added.fresh, ['a/3.jpg']);
  const dropped = filesFor({ paths: ['a/2.jpg'], alts: ['Back'], known, store });          // removed in Playbook: off the store too
  assert.deepEqual(ids(dropped), ['m2', 'shop-video']);
  const gone = filesFor({ paths, alts: ['Front', 'Back'], known, store: [m('m2', 'Back')] }); // removed in Shopify by someone: stays removed
  assert.deepEqual(gone, { files: null, fresh: [] });
  const bad = filesFor({ paths, alts: ['Front', 'Back'], known, store: [m('m1', 'Front'), m('m2', 'Back', { failed: true })] });
  assert.deepEqual(ids(bad), ['m1', '2.jpg']);                                             // Shopify could not process it: sent again, the failed one goes
  assert.deepEqual(bad.fresh, ['a/2.jpg']);
});

test('photos: which Shopify media each photo is, remembered for the next publish', () => {
  const paths = ['a/1.jpg', 'a/2.jpg'];
  const first = filesFor({ paths, alts: [], known: [], store: null });
  assert.deepEqual(photoRecord(first, paths, [], ['m1', 'm2']), ['m1', 'm2']);
  assert.equal(photoRecord(first, paths, [], ['m1']), null);                               // cannot tell which is which
  const known = [{ path: 'a/1.jpg', id: 'm1' }, { path: 'a/2.jpg', id: 'm2' }];
  assert.deepEqual(photoRecord({ files: null, fresh: [] }, paths, known, ['m2', 'm1']), ['m1', 'm2']); // gallery untouched: as before
  const more = ['a/1.jpg', 'a/3.jpg', 'a/2.jpg'];
  const added = filesFor({ paths: more, alts: [], known, store: [m('m1'), m('m2'), m('theirs')] });
  assert.deepEqual(photoRecord(added, more, known, ['m1', 'm9', 'm2', 'theirs']), ['m1', 'm9', 'm2']);
  assert.deepEqual(knownPhotos({ photos: paths, media: ['m1', 'm2'] }, [m('m1')], false), known);
  assert.deepEqual(knownPhotos({ photos: paths }, [m('x1'), m('x2')], false), []);         // no ids on record: never guessed from the order
  assert.deepEqual(knownPhotos({ photos: paths, media: ['m1', 'm2'] }, [m('m1')], true), []); // a recovered lost create
  assert.deepEqual(knownPhotos(null, [m('m1')], false), []);
});

test('photos with no ids on record: the gallery is left alone until the photos change in Playbook', () => {
  const paths = ['a/1.jpg', 'a/2.jpg'];
  assert.equal(leaveGallery({ photos: paths }, paths, [], true, false), true);             // same photos as last time: nothing sent, nothing of the store's lost
  assert.equal(leaveGallery({ photos: paths }, ['a/1.jpg', 'a/3.jpg'], [], true, false), false); // changed here: sent afresh
  assert.equal(leaveGallery(null, paths, [], true, false), false);                         // a first publish that failed half-way
  assert.equal(leaveGallery({ photos: paths }, paths, [], true, true), false);             // a recovered lost create
  assert.equal(leaveGallery({ photos: paths }, paths, [], false, false), false);           // a create
  assert.equal(leaveGallery({ photos: paths }, paths, [{ path: 'a/1.jpg', id: 'm1' }], true, false), false); // ids on record: filesFor decides
  assert.equal(photoRecord({ files: null, fresh: [] }, paths, [], ['x', 'y']), null);      // and no ids are made up afterwards
});

test('Shopify being busy is tried again without using up the attempts, but not for ever', () => {
  assert.equal(temporary(new HttpError(503, 'slow down')), true);
  for (const e of [new HttpError(504, 'too long'), new HttpError(400, 'no'), new Error('x'), null]) assert.equal(temporary(e), false);
  const f = (t, temporary) => ({ created_at: t, details: temporary ? { temporary: true } : {} });
  assert.equal(busyStreak([f('2026-11-12T10:30:00Z', true), f('2026-11-12T10:20:00Z', true), f('2026-11-12T10:10:00Z', false), f('2026-11-12T10:00:00Z', true)], null), 2);
  assert.equal(busyStreak([f('2026-11-12T10:30:00Z', true), f('2026-11-12T10:20:00Z', true)], '2026-11-12T10:25:00Z'), 1); // a publish in between starts the count again
  assert.equal(busyStreak([{ created_at: 'x', details: null }], null), 0);
  assert.ok(FREE_RETRIES >= 5 && FREE_RETRIES <= 12); // the listing's failures are read 12 at a time (publish.ts)
});

test('D19: the colour part of the codes is decided by the first send a store takes, and shared by every website', async () => {
  const { keepColour, skuColour } = await import('../publishParts.ts');
  /** `onStore`: a listing of the product is on a store already; `taken`: another send decided first and saved this. */
  const world = (o = {}) => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = decodeURIComponent(String(url)), method = init.method || 'GET', ok = (b) => new Response(JSON.stringify(b), { status: 200 });
      calls.push({ method, u, body: init.body ? JSON.parse(init.body) : null });
      if (u.includes('/pb_listings?')) return ok(o.onStore ? [{ id: 'l1' }] : []);
      if (method === 'PATCH') return ok(o.taken === undefined ? [{ id: 'p1' }] : []);
      return ok([{ sku_colour: o.taken ?? null }]);
    };
    return calls;
  };
  const P = { id: 'p1', color: 'Wine', source: 'telegram', sku_colour: null };
  let calls = world();
  assert.equal(await skuColour({ ...P, sku_colour: 'MAROON' }), 'MAROON', 'decided before: kept, whatever the colour is called now');
  assert.equal(await skuColour({ ...P, sku_colour: '' }), '', 'decided as none: stays none');
  assert.deepEqual(calls, [], 'nothing is asked or saved again');
  // a new product: worked out from its colour as it is now — and NOT saved yet (third review, 6: a send the store
  // refuses must decide nothing, or a colour corrected afterwards would leave the old word in the codes)
  assert.equal(await skuColour(P), 'WINE');
  assert.match(calls[0].u, /pb_listings\?product_id=eq\.p1&shopify_product_id=not\.is\.null/);
  assert.ok(!calls.some(c => c.method === 'PATCH'), 'nothing is decided before a store has the product');
  // a product that is on a store from before codes carried a colour keeps its codes exactly as they are
  world({ onStore: true });
  assert.equal(await skuColour(P), '');
  // copied from another store: its own codes
  world();
  assert.equal(await skuColour({ ...P, source: 'import' }), '');
  // the store took it: decided now, only where nothing is decided yet
  calls = world();
  assert.equal(await keepColour(P, 'WINE'), 'WINE');
  const save = calls.find(c => c.method === 'PATCH');
  assert.match(save.u, /pb_products\?id=eq\.p1&sku_colour=is\.null/);
  assert.deepEqual(save.body, { sku_colour: 'WINE' });
  calls = world();
  assert.equal(await keepColour({ ...P, sku_colour: 'MAROON' }, 'MAROON'), 'MAROON');
  assert.deepEqual(calls, [], 'decided before: nothing to save');
  // two websites send it for the first time at once, and the colour was re-worded in between: the one that got to
  // the store first decides for both — the other is told, and sends again with it (publishRetry.test.mjs)
  world({ taken: 'MAROON' });
  assert.equal(await keepColour(P, 'WINE'), 'MAROON');
});
