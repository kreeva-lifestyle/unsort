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
  const db = { config: null, vendors: [], vendorPatches: [], member: 'administrator', readsAll: false, tgCalls: [], lost: [], rpcs: [], forwardPatches: [] };
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
    if (u.includes('/pb_tg_secrets')) return json([{ bot_token: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', webhook_secret: null, crawler_key_hash: null }]);
    if (u.includes('api.telegram.org')) {                     // the bot asks about itself
      const method = u.split('/').pop(); db.tgCalls.push({ method, body: JSON.parse(init.body) });
      if (db.member === 'down') return json({ ok: false, description: 'Internal Server Error' }, 500);
      if (method === 'getMe') return json({ ok: true, result: { id: 123456, is_bot: true, can_read_all_group_messages: db.readsAll } });
      if (db.member === 'gone') return json({ ok: false, description: 'Forbidden: bot is not a member of the supergroup chat' }, 403);
      return json({ ok: true, result: { status: db.member } });
    }
    if (u.includes('/pb_tg_forwards') && method === 'PATCH') { db.forwardPatches.push({ filter: decodeURIComponent(u), body: JSON.parse(init.body) }); return json([]); }
    if (u.includes('/rpc/pb_tg_lost_forwards')) return json(db.lost);
    if (u.includes('/rpc/')) { db.rpcs.push({ fn: u.split('/rpc/')[1], args: JSON.parse(init.body) }); return json(0); }
    return json({ message: `unexpected ${u}` }, 500);
  };
  const { crawlerConfig, crawlerProgress } = await import('../crawler.ts');
  const stored = (over = {}) => ({ group_chat_id: -1001, crawler_channels: [
    { username: 'aaaa_one', channel_id: -1002, title: 'A', last_id: 900, error: null, sent: 4 },
    { username: 'bbbb_two', channel_id: -1003, title: 'B', last_id: 800, error: null, sent: null },
  ], crawl_window_start: 1380, crawl_window_end: 420, ...over });
  const vendor = (name, over = {}) => ({ id: name, name, tg_username: name, tg_channel_id: null, tg_title: null, tg_slot_minute: 180,
    tg_slot_set_at: null, tg_checked_at: null, tg_cursor_ready: true, ...over });
  const reset = () => { Object.assign(db, { config: stored(), vendors: [], vendorPatches: [], member: 'administrator', readsAll: false, tgCalls: [], lost: [], rpcs: [], forwardPatches: [] }); };
  const dueVendor = (name, over = {}) => vendor(name, { tg_slot_minute: 0, tg_slot_set_at: '2026-01-01T00:00:00Z', tg_checked_at: '2026-01-01T00:00:00Z', ...over });

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

  test('D20: the bot is out of the group → Playbook says why and nothing is due; back as an admin → due again', async () => {
    reset();
    db.vendors = [dueVendor('aaaa_one'), dueVendor('bbbb_two')];
    let out = await crawlerConfig();
    assert.equal(out.group_problem, null);
    assert.ok(out.channels.some(c => c.due), 'due while the bot reads the group');
    assert.equal(db.config.group_ok, true); assert.ok(db.config.group_checked_at);
    assert.deepEqual(db.tgCalls.map(c => c.method), ['getChatMember']); assert.equal(db.tgCalls[0].body.user_id, 123456);
    // Asked again only after 10 minutes: the crawler calls every minute.
    await crawlerConfig(); assert.equal(db.tgCalls.length, 1);
    db.member = 'gone'; db.config.group_checked_at = new Date(Date.now() - 11 * 60_000).toISOString();
    out = await crawlerConfig();
    assert.match(out.group_problem, /not in the admin group/);
    assert.ok(out.channels.every(c => c.due === false), 'nothing is forwarded into a group nobody reads');
    assert.equal(db.config.group_ok, false);
    // A plain member with Group Privacy on sees nothing that is forwarded; an admin, or privacy off, does.
    db.member = 'member'; db.config.group_checked_at = null;
    assert.match((await crawlerConfig()).group_problem, /cannot see its messages/);
    db.readsAll = true; db.config.group_checked_at = null;
    assert.equal((await crawlerConfig()).group_problem, null);
    // Telegram gives no answer: the last answer stays (here: fine), nothing is guessed.
    db.member = 'down'; db.config.group_checked_at = null;
    out = await crawlerConfig();
    assert.equal(out.group_problem, null); assert.equal(db.config.group_ok, true);
    // No group linked: nothing to ask.
    db.config.group_chat_id = null; db.tgCalls = [];
    assert.equal((await crawlerConfig()).group_problem, null); assert.equal(db.tgCalls.length, 0);
  });

  test('D20: forwards that never arrived → the channel is told to go back; the crawler saying so clears them', async () => {
    reset();
    db.config.group_ok = true; db.config.group_checked_at = new Date().toISOString();
    db.vendors = [vendor('aaaa_one', { tg_channel_id: -1002 }), vendor('bbbb_two', { tg_channel_id: -1003 })];
    db.lost = [{ origin_chat_id: -1002, origin_title: 'A', origin_username: 'aaaa_one', lost: 3, first_id: 880, last_id: 890, newest: '2026-11-13T00:00:00Z' }];
    const out = await crawlerConfig();
    const by = Object.fromEntries(out.channels.map(c => [c.username, c]));
    assert.equal(by.aaaa_one.rewind_to, 879, 'just before the first lost post');
    assert.equal(by.bbbb_two.rewind_to, undefined);
    // Not when it would move the channel forward (its cursor is already behind that post).
    db.lost = [{ ...db.lost[0], first_id: 2000 }];
    assert.equal((await crawlerConfig()).channels.find(c => c.username === 'aaaa_one').rewind_to, undefined);
    await crawlerProgress({ version: '1.2.0', channels: [{ username: 'aaaa_one', channel_id: -1002, last_id: 879, rewound: 879 }, { username: 'bbbb_two', last_id: 800, rewound: 'x' }] });
    assert.equal(db.config.crawler_channels.find(c => c.username === 'aaaa_one').last_id, 879, 'the cursor really goes back');
    assert.equal(db.forwardPatches.length, 1);
    assert.match(db.forwardPatches[0].filter, /origin_chat_id=eq\.-1002&origin_message_id=gt\.879&resent_at=is\.null/);
    assert.ok(db.forwardPatches[0].body.resent_at);
  });

  test('D13: the crawler says when the vendor posted each forwarded message', async () => {
    reset();
    const now = Math.floor(Date.now() / 1000);
    await crawlerProgress({ version: '1.2.0', channels: [{ username: 'aaaa_one', channel_id: -1002, last_id: 905 }], forwarded: [
      { group_message_id: 50, channel_id: -1002, message_id: 901, posted_at: now - 3600 },
      { group_message_id: 51, channel_id: -1002, message_id: 902 },                       // an older crawler: no date
      { group_message_id: 52, channel_id: -1002, message_id: 903, posted_at: 12 },        // not a date
      { group_message_id: 53, channel_id: -1002, message_id: 904, posted_at: now + 10 * 86400 }, // not yet
    ] });
    const map = db.rpcs.find(r => r.fn === 'pb_tg_map_forwards'), dates = db.rpcs.find(r => r.fn === 'pb_tg_post_dates');
    assert.equal(map.args.p_rows.length, 4);
    assert.deepEqual(dates.args.p_rows, [{ chat_id: -1001, message_id: 50, posted_at: now - 3600 }]);
    assert.ok(db.rpcs.indexOf(map) < db.rpcs.indexOf(dates), 'the mapping first, then its dates');
  });
}
