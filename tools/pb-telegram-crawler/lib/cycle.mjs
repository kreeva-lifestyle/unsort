// One crawl cycle (every POLL_SECONDS): ask Playbook what is due, do at most
// ONE cursor setup and at most ONE daily check, report back.
//   - crawler_config is a Playbook call only: a cycle with nothing due sends
//     Telegram nothing at all.
//   - Cursor setup: a channel with no cursor (just added; or Playbook reset
//     the vendor — a new channel name, switched back on — and says
//     vendor_ready: false) gets its newest post id noted — nothing is
//     forwarded — and reported once with cursor_ready, so its first nightly
//     check copies only posts made after it was added. A cursor Playbook lost
//     while the vendor stayed ready is simply reported again.
//   - Daily check: Playbook says which channels are due (each has its own time
//     in the overnight window, see pb-telegram/schedule.ts); the one overdue
//     longest is checked: every post after its cursor is forwarded, then it
//     is reported `checked` (Playbook stores the time). A check cut short (a
//     restart, a dropped line, Telegram's limits) is not reported checked, so
//     it carries on from the cursor next cycle. A channel whose check failed
//     waits a few minutes, so one broken channel never holds up the others.
//   - Playbook's bot is not reading the admin group (removed from it, or not
//     an admin): crawler_config says so in `group_problem` and marks nothing
//     due. Nothing is forwarded and no cursor moves, so no post is passed by
//     while nobody is reading; the reason is reported as this crawler's status.
//   - Forwards that never reached Playbook: crawler_config gives the channel
//     a `rewind_to`. Its cursor goes back to that post, which is reported
//     (`rewound`), and its next daily check sends those posts again.
// State lives between cycles in memory; Playbook keeps the cursors too, so a
// restart carries on. A report before the first channel list (signed out,
// stopped early) sends no list at all, so it never wipes Playbook's cursors.
import { makePacer, mergeCursor } from './batch.mjs';
import { classify, isFatal, MSG } from './errors.mjs';
import { checkChannel, GroupError, setupChannel } from './sync.mjs';

const CHECKPOINT_MS = 5_000;       // report at least this often while forwarding (a restart repeats at most this much)
const FORWARDED_MAX = 5_000;       // mappings kept while Playbook can't be reached
export const CHECK_RETRY_MS = 5 * 60_000; // a check that failed is tried again after this

export function makeCrawler({ tg, pb, version, backfill = 0, forwardGapMs = 1500, sleep, now = Date.now, log, onReport = () => {} }) {
  const channels = new Map();       // key → channel state
  let group = null;                 // { id, entity }
  let globalError = null;
  let lastReport = 0;
  let synced = false;               // false until the first channel list from Playbook (a report before it sends no list)
  let heldWhy = null;               // why Playbook asked to wait (its bot is not reading the group), as last logged
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
      channels: !synced ? undefined : [...channels.values()].map(s => ({
        username: s.username || null,
        channel_id: s.channel_id ?? null,
        title: s.title || null,
        last_id: s.cursor ?? null,
        error: s.error || null,
        ...(s.readyPending ? { cursor_ready: true } : {}),
        ...(s.checkedPending ? { checked: true } : {}),
        ...(s.lastSent != null ? { sent: s.lastSent } : {}),
        ...(s.rewound != null ? { rewound: s.rewound } : {}),
      })),
    };
  }

  // Never throws: a failed report is logged and tried again next time.
  async function report(error) {
    lastReport = now();
    onReport();
    const fwd = forwarded.splice(0, 1000);
    const marked = [...channels.values()].filter(s => s.checkedPending || s.readyPending);
    const back = [...channels.values()].filter(s => s.rewound != null).map(s => [s, s.rewound]);
    try {
      await pb.progress(payload(error, fwd));
      for (const s of marked) { s.checkedPending = false; s.readyPending = false; }
      for (const [s, to] of back) if (s.rewound === to) s.rewound = null;   // Playbook knows: said once
      return true;
    } catch (e) {
      forwarded.unshift(...fwd);       // sent again next time (and so is `checked`)
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
      // Playbook reset the vendor (switched off and on, another channel): drop the cursor held here and
      // note a fresh one — unless it is this crawler's own setup, not yet reported.
      if (ch.vendor_ready === false && !s.readyPending && s.cursor != null) {
        s.cursor = null; s.entity = null; s.checkedPending = false; s.runSent = 0;
      }
      s.cursor = mergeCursor(s.cursor, ch.last_id);
      // Forwards after this post never reached Playbook: go back to it (never forward of where it is).
      const to = ch.rewind_to == null ? NaN : Number(ch.rewind_to);
      if (Number.isSafeInteger(to) && to >= 0 && s.cursor != null && to < s.cursor) {
        log(`${s.username ? '@' + s.username : s.channel_id}: going back to message ${to} — posts after it did not reach Playbook; they are sent again at the next daily check`);
        s.cursor = to; s.rewound = to; s.checkedPending = false;
      }
      s.due = !!ch.due;
      s.dueAt = Date.parse(ch.next_check_at || '') || Infinity;
    }
    for (const key of [...channels.keys()]) if (!seen.has(key)) channels.delete(key);
    synced = true;
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

  // Not waiting on Telegram (a flood wait), a failed lookup or a failed check.
  const free = s => !(flood.until > now()) && !(s.waitUntil > now()) && !(s.retryAt > now()) && !(s.checkRetryAt > now());

  /** The channel to note a cursor for, and the due channel overdue longest (null: none). */
  function pick() {
    const all = [...channels.values()].filter(free);
    const setup = all.find(s => s.cursor == null) ?? null;
    const check = all.filter(s => s.due && s.cursor != null && !s.checkedPending && s !== setup)
      .sort((a, b) => a.dueAt - b.dueAt)[0] ?? null;
    return { setup, check };
  }

  // Throws only on network / sign-out problems (crawler.mjs reconnects).
  async function cycle() {
    const cfg = await pb.config();
    syncList(Array.isArray(cfg.channels) ? cfg.channels : []);
    await ensureGroup(cfg.group_chat_id);
    // Playbook's bot is not reading the group: forwarding now would pass posts by unread.
    const held = typeof cfg.group_problem === 'string' && cfg.group_problem ? cfg.group_problem.slice(0, 280) : null;
    if (held && heldWhy !== held) log(`Waiting: ${held}`);   // once, not every cycle
    if (!held && heldWhy) log('Playbook’s bot is reading the admin group again — carrying on');
    heldWhy = held;
    if (held && group) globalError = held;
    const out = { sent: 0, setup: null, checked: null, channels: channels.size, grouped: !!group, held: !!held };
    if (group && !held) {             // no group yet: nothing is set up either, so nothing piles up
      const { setup, check } = pick();
      const ctx = {
        tg, group: group.entity, backfill, pacer, sleep, now, log, forwarded, flood,
        checkpoint: async () => { if (now() - lastReport >= CHECKPOINT_MS) await report(); },
      };
      try {
        if (setup && (await setupChannel(setup, ctx))) { setup.readyPending = true; out.setup = setup.username || setup.channel_id; }
        if (check) {
          const r = await checkChannel(check, ctx);
          out.sent = r.sent;
          check.runSent = (check.runSent || 0) + r.sent;
          if (r.done) {
            check.checkedPending = true; check.lastSent = check.runSent; check.runSent = 0;
            out.checked = check.username || check.channel_id;
          } else if (r.failed) check.checkRetryAt = now() + CHECK_RETRY_MS;
        }
      } catch (e) {
        if (!(e instanceof GroupError)) { await report(); throw e; }
        group = null;                   // looked up again next cycle; the check stays due
        globalError = e.c.peer ? MSG.groupOrChannel : MSG.groupCantPost;
        log(`${globalError} (${e.c.code})`);
      }
    }
    await report();
    return out;
  }

  return { cycle, report, channels, forwarded };
}
