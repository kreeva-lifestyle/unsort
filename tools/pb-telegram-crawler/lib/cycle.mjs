// One crawl cycle: ask Playbook what to read, copy new posts from each
// channel into the admin group, report back. State lives between cycles in
// memory; Playbook keeps the cursors too, so a restart carries on.
import { makePacer, mergeCursor } from './batch.mjs';
import { classify, isFatal, MSG } from './errors.mjs';
import { GroupError, syncChannel } from './sync.mjs';

const CHECKPOINT_MS = 5_000;       // report at least this often while forwarding (a restart repeats at most this much)
const FORWARDED_MAX = 5_000;       // mappings kept while Playbook can't be reached

export function makeCrawler({ tg, pb, version, backfill = 0, forwardGapMs = 1200, sleep, now = Date.now, log, onReport = () => {} }) {
  const channels = new Map();       // key → channel state
  let group = null;                 // { id, entity }
  let globalError = null;
  let lastReport = 0;
  const forwarded = [];             // { group_message_id, channel_id, message_id } not yet reported
  const flood = { until: 0 };       // a long flood wait pauses every channel
  const pacer = makePacer(forwardGapMs, sleep, now);

  const keyOf = ch => (ch.username ? `@${String(ch.username).toLowerCase()}` : `id:${ch.channel_id}`);

  function payload(error, fwd) {
    const floodLeft = Math.round((flood.until - now()) / 60_000);
    return {
      version,
      error: error ?? globalError ?? (floodLeft > 0 ? `Telegram asked us to slow down for ${floodLeft} min — it carries on by itself` : null),
      forwarded: fwd,
      channels: [...channels.values()].map(s => ({
        username: s.username || null,
        channel_id: s.channel_id ?? null,
        title: s.title || null,
        last_id: s.cursor ?? null,
        error: s.error || null,
      })),
    };
  }

  // Never throws: a failed report is logged and tried again next time.
  async function report(error) {
    lastReport = now();
    onReport();
    const fwd = forwarded.splice(0, 1000);
    try {
      await pb.progress(payload(error, fwd));
      return true;
    } catch (e) {
      forwarded.unshift(...fwd);       // sent again next time
      forwarded.splice(FORWARDED_MAX);
      log(`Could not report to Playbook: ${e.message}`);
      return false;
    }
  }

  function syncList(list) {
    const seen = new Set();
    for (const ch of list) {
      if (!ch.username && ch.channel_id == null) continue;
      const key = keyOf(ch);
      seen.add(key);
      let s = channels.get(key);
      if (!s) {
        s = { username: ch.username ? String(ch.username).toLowerCase() : null, channel_id: ch.channel_id ?? null,
          title: null, cursor: null, entity: null, error: null };
        channels.set(key, s);
      }
      s.vendor = ch.vendor_name || null;
      s.cursor = mergeCursor(s.cursor, ch.last_id);
    }
    for (const key of [...channels.keys()]) if (!seen.has(key)) channels.delete(key);
  }

  async function ensureGroup(chatId) {
    if (chatId == null || chatId === '') {
      if (globalError !== MSG.waitingGroup) log(MSG.waitingGroup);   // once, not every cycle
      group = null;
      globalError = MSG.waitingGroup;
      return;
    }
    const id = String(chatId);
    if (group?.id === id) { globalError = null; return; }
    try {
      group = { id, entity: await tg.resolveGroup(id) };
      globalError = null;
      log(`Admin group found (${id})`);
    } catch (e) {
      const c = classify(e);
      if (isFatal(c)) throw e;
      group = null;
      globalError = MSG.groupMissing;
      log(`${MSG.groupMissing} (${c.code})`);
    }
  }

  // Throws only on network / sign-out problems (crawler.mjs reconnects).
  async function cycle() {
    const cfg = await pb.config();
    syncList(Array.isArray(cfg.channels) ? cfg.channels : []);
    await ensureGroup(cfg.group_chat_id);
    let sent = 0;
    const ctx = {
      tg, group: group?.entity ?? null, backfill, pacer, sleep, now, log, forwarded, flood,
      checkpoint: async () => { if (now() - lastReport >= CHECKPOINT_MS) await report(); },
    };
    for (const s of channels.values()) {
      try {
        sent += await syncChannel(s, ctx);
      } catch (e) {
        if (!(e instanceof GroupError)) { await report(); throw e; }
        group = null;                   // both the group and the channel are looked up again
        ctx.group = null;
        globalError = e.c.peer ? MSG.groupOrChannel : MSG.groupCantPost;
        log(`${globalError} (${e.c.code})`);
      }
    }
    await report();
    return { sent, channels: channels.size, grouped: !!group };
  }

  return { cycle, report, channels, forwarded };
}
