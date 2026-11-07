// node --test --experimental-strip-types supabase/functions/pb-telegram/test/
// crawler.ts crawler_config / crawler_progress against an in-memory database
// (fetch stubbed). crawler.ts needs --experimental-transform-types (a
// parameter property in pb-products/http.ts): under strip-types this file runs
// itself again in a child node with that flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.features.typescript !== 'transform') {
  test('crawler.ts progress (child node with --experimental-transform-types)', () => {
    const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--test', fileURLToPath(import.meta.url)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
} else {
  globalThis.Deno = { env: { get: () => 'http://db.test' } };
  const db = { config: null, vendors: [], vendorPatches: [] };
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    if (u.includes('/pb_tg_config')) {
      if (method === 'PATCH') { Object.assign(db.config, JSON.parse(init.body)); return json([{ id: 1 }]); }
      return json([structuredClone(db.config)]);
    }
    if (u.includes('/pb_vendors')) {
      if (method === 'PATCH') { db.vendorPatches.push({ filter: decodeURIComponent(u), body: JSON.parse(init.body) }); return json([]); }
      return json(u.includes('tg_username=in.') ? [] : structuredClone(db.vendors));
    }
    if (u.includes('/rpc/')) return json(0);
    return json({ message: `unexpected ${u}` }, 500);
  };
  const { crawlerConfig, crawlerProgress } = await import('../crawler.ts');
  const stored = (over = {}) => ({ group_chat_id: -1001, crawler_channels: [
    { username: 'aaaa_one', channel_id: -1002, title: 'A', last_id: 900, error: null, sent: 4 },
    { username: 'bbbb_two', channel_id: -1003, title: 'B', last_id: 800, error: null, sent: null },
  ], crawl_window_start: 1380, crawl_window_end: 420, ...over });
  const vendor = (name, over = {}) => ({ id: name, name, tg_username: name, tg_channel_id: null, tg_title: null, tg_slot_minute: 180,
    tg_slot_set_at: null, tg_checked_at: null, tg_cursor_ready: true, ...over });
  const reset = () => { db.config = stored(); db.vendors = []; db.vendorPatches = []; };

  test('a report with no channel list (before the first cycle) keeps every stored cursor', async () => {
    reset();
    assert.deepEqual(await crawlerProgress({ version: '1', error: 'signed out' }), { ok: true, mapped: 0 });
    assert.deepEqual(db.config.crawler_channels.map(c => c.last_id), [900, 800]);
    assert.equal(db.config.crawler_error, 'signed out');
    assert.ok(db.config.crawler_seen_at);
    await assert.rejects(crawlerProgress({ channels: 'x' }), /channels must be a list/);
  });

  test('last_id null / "" / missing keeps the stored cursor (never 0); a real number replaces it', async () => {
    reset();
    await crawlerProgress({ version: '1', channels: [{ username: 'aaaa_one', last_id: null, sent: null }, { username: 'bbbb_two', last_id: '' }] });
    assert.deepEqual(db.config.crawler_channels.map(c => [c.username, c.last_id, c.sent]), [['aaaa_one', 900, 4], ['bbbb_two', 800, null]]);
    await crawlerProgress({ version: '1', channels: [{ username: 'aaaa_one', last_id: 950, sent: 0 }] });
    assert.equal(db.config.crawler_channels.find(c => c.username === 'aaaa_one').last_id, 950);
    assert.equal(db.config.crawler_channels.find(c => c.username === 'aaaa_one').sent, 0);
  });

  test('a channel left out of the report keeps its stored entry; an empty list drops nothing', async () => {
    reset();
    await crawlerProgress({ version: '1', channels: [] });
    assert.deepEqual(db.config.crawler_channels.map(c => c.last_id), [900, 800]);
    await crawlerProgress({ version: '1', channels: [{ username: 'cccc_three', channel_id: -1004, last_id: 5, cursor_ready: true }] });
    assert.deepEqual(db.config.crawler_channels.map(c => c.username), ['cccc_three', 'aaaa_one', 'bbbb_two']);
    const ready = db.vendorPatches.find(p => p.body.tg_cursor_ready === true);
    assert.match(ready.filter, /tg_cursor_ready=eq\.false/);
    assert.match(ready.filter, /cccc_three/);
  });

  test('cursor_ready without a usable last_id never marks the vendor ready', async () => {
    reset();
    await crawlerProgress({ version: '1', channels: [{ username: 'dddd_four', last_id: null, cursor_ready: true }] });
    assert.equal(db.vendorPatches.length, 0);
  });

  test('crawler_config sends the cursor only while the vendor is ready, plus vendor_ready', async () => {
    reset();
    db.vendors = [vendor('aaaa_one'), vendor('bbbb_two', { tg_cursor_ready: false }), vendor('cccc_three')];
    const out = await crawlerConfig();
    const by = Object.fromEntries(out.channels.map(c => [c.username, c]));
    assert.deepEqual([by.aaaa_one.last_id, by.aaaa_one.cursor_ready, by.aaaa_one.vendor_ready], [900, true, true]);
    assert.deepEqual([by.bbbb_two.last_id, by.bbbb_two.cursor_ready, by.bbbb_two.vendor_ready], [null, false, false]);
    // ready vendor whose cursor the server lost: not ready (the crawler re-reports it or sets it up)
    assert.deepEqual([by.cccc_three.last_id, by.cccc_three.cursor_ready, by.cccc_three.vendor_ready], [null, false, true]);
  });
}
