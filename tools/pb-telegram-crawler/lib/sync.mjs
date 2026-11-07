// Copies one channel's new posts into the admin group.
// `s` is the channel's state, kept between cycles:
//   { username, channel_id, title, cursor, entity, error, retryAt, stuck, noforwards }
// cursor = id of the newest message already forwarded or skipped (null =
// never set). It only moves after Telegram accepted a forward and is reported
// every few seconds, so a crash or error never loses a post (at worst one
// album is sent twice, and Playbook files a post once per channel + message id).
// Each forward's {group message → channel post} goes to ctx.forwarded, so
// Playbook knows the vendor even for a repost (whose forward header names the
// original channel).
import { planBatches, startCursor } from './batch.mjs';
import { channelErrorText, classify, isFatal } from './errors.mjs';

export const PAGE = 100;
const MAX_PAGES = 5;              // ≤ 500 messages per channel per cycle
const FLOOD_TRIES = 5;
const FLOOD_SLEEP_MAX = 60;       // longer waits pause every channel instead of sleeping in the cycle
const SKIP_AFTER_FAILS = 10;      // one message failing this many cycles…
const SKIP_AFTER_MS = 6 * 3600_000; // …and for this long is skipped
const RESOLVE_RETRY_MS = [10, 20, 40, 60].map(m => m * 60_000);

export class GroupError extends Error {
  constructor(c) { super(c.code); this.c = c; }
}
const GROUP_OR_CHANNEL = 'Could not forward — check the staff account is still in the admin group and in this channel';

// ctx: { tg, group (entity|null), backfill, pacer, sleep, now, log, checkpoint,
//        forwarded (array), flood: { until } }
// Returns the number of messages forwarded. Throws on network / sign-out /
// group problems (the cycle handles those); channel problems land in s.error.
export async function syncChannel(s, ctx) {
  const { tg, log } = ctx;
  const name = s.username ? `@${s.username}` : String(s.channel_id);
  if (!s.entity) {
    if (s.retryAt && ctx.now() < s.retryAt) return 0;
    try {
      const r = await tg.resolveChannel(s);
      Object.assign(s, { entity: r.entity, channel_id: r.channel_id, title: r.title, error: null, retryAt: 0, fails: 0, noforwards: !!r.noforwards });
      if (r.username) s.username = r.username;
      log(`${name}: found "${r.title}" (${r.channel_id})`);
    } catch (e) {
      const c = classify(e);
      if (isFatal(c)) throw e;
      s.error = channelErrorText(c, s);
      s.fails = (s.fails || 0) + 1;
      s.retryAt = ctx.now() + (c.kind === 'flood' ? (c.seconds + 5) * 1000
        : RESOLVE_RETRY_MS[Math.min(s.fails, RESOLVE_RETRY_MS.length) - 1]);
      log(`${name}: ${s.error}`);
      return 0;
    }
  }
  if (!ctx.group) return 0;                 // nowhere to send yet: keep the cursor unset
  if (s.waitUntil && ctx.now() < s.waitUntil) return 0;   // Telegram asked us to wait
  if (ctx.flood?.until && ctx.now() < ctx.flood.until) return 0; // …for the whole account

  let sent = 0;
  try {
    if (s.cursor == null) {
      const newest = await tg.latest(s.entity, ctx.backfill > 0 ? ctx.backfill + 10 : 1);
      s.cursor = startCursor(newest, ctx.backfill);
      log(`${name}: starting after message ${s.cursor}${ctx.backfill > 0 ? ` (copying the last ${ctx.backfill})` : ''}`);
      if (!(ctx.backfill > 0)) return 0;
    }
    s.restricted = false;
    s.runError = false;
    pages: for (let page = 0; page < MAX_PAGES; page++) {
      const msgs = await tg.after(s.entity, s.cursor, PAGE);
      if (!msgs.length) break;
      const { units, more } = planBatches(msgs, PAGE);
      for (const u of units) {
        if (s.noforwards && !u.skip) {           // "Restrict saving content": forwards always fail
          s.error = 'This channel blocks forwarding'; s.runError = true;
        } else if (!u.skip && !s.restricted) {
          const ok = await forwardUnit(s, u, ctx);
          if (ok === 'stop') break pages;
          if (ok === 'sent') sent += u.ids.length;
        }
        s.cursor = u.lastId;
        s.stuck = null;
        await ctx.checkpoint();
      }
      if (!more) break;
    }
    if (!s.runError) s.error = null;        // a clean run clears the old problem
    if (s.noforwards) { s.entity = null; s.retryAt = ctx.now() + 30 * 60_000; } // look again later: the vendor may allow it
  } catch (e) {
    if (e instanceof GroupError) throw e;
    const c = classify(e);
    if (isFatal(c)) throw e;
    s.error = channelErrorText(c, s);
    if (c.kind === 'not_joined' || c.kind === 'no_channel') s.entity = null;   // look it up again later
    if (c.kind === 'flood') s.waitUntil = ctx.now() + (c.seconds + 1) * 1000;
    log(`${name}: ${s.error}`);
  }
  if (sent) log(`${name}: forwarded ${sent} message(s), now at ${s.cursor}`);
  return sent;
}

// One forwardMessages call for one unit (an album or a single message).
// 'sent' | 'skipped' (cursor moves on) | 'stop' (cursor stays, retry next cycle)
async function forwardUnit(s, u, ctx) {
  for (let attempt = 1; ; attempt++) {
    await ctx.pacer.wait();
    try {
      const got = await ctx.tg.forward(ctx.group, s.entity, u.ids);
      (Array.isArray(got) ? got : []).forEach((gid, i) => {
        if (gid != null && u.ids[i] != null) ctx.forwarded?.push({ group_message_id: gid, channel_id: s.channel_id, message_id: u.ids[i] });
      });
      return 'sent';
    } catch (e) {
      const c = classify(e);
      if (c.kind === 'flood' && c.seconds <= FLOOD_SLEEP_MAX && attempt < FLOOD_TRIES) {
        ctx.log(`Telegram asked to wait ${c.seconds} s before forwarding more`);
        await ctx.sleep((c.seconds + 1) * 1000);
        continue;
      }
      if (c.kind === 'flood') {                  // long: every channel pauses, nothing is skipped
        if (ctx.flood) ctx.flood.until = ctx.now() + (c.seconds + 1) * 1000;
        s.waitUntil = ctx.now() + (c.seconds + 1) * 1000;
        s.error = channelErrorText(c, s);
        s.runError = true;
        ctx.log(`Telegram asked to wait ${c.seconds} s before forwarding more — pausing`);
        return 'stop';
      }
      if (c.kind === 'not_joined' || c.kind === 'no_channel') {
        // The group or the channel can't be reached: never skip the post for it.
        s.error = GROUP_OR_CHANNEL; s.runError = true; s.entity = null;
        throw new GroupError({ ...c, peer: true });
      }
      if (c.kind === 'forwards_restricted') {
        s.restricted = true;                     // skip the rest of this cycle's posts
        s.runError = true;
        s.error = channelErrorText(c, s);
        ctx.log(`${s.username ? '@' + s.username : s.channel_id}: ${s.error} — skipping its posts`);
        return 'skipped';
      }
      if (c.kind === 'gone') return 'skipped';  // deleted before we got to it
      if (c.kind === 'group') throw new GroupError(c);
      if (isFatal(c)) throw e;
      // Anything else: retry next cycle; a message that keeps failing is skipped.
      const key = u.ids[0];
      s.stuck = s.stuck?.id === key ? { ...s.stuck, n: s.stuck.n + 1 } : { id: key, n: 1, since: ctx.now() };
      s.runError = true;
      if (s.stuck.n >= SKIP_AFTER_FAILS && ctx.now() - s.stuck.since >= SKIP_AFTER_MS) {
        s.error = `Skipped message ${key} after ${s.stuck.n} failed tries: ${c.code}`;
        ctx.log(`${s.username || s.channel_id}: ${s.error}`);
        return 'skipped';
      }
      s.error = channelErrorText(c, s);
      return 'stop';
    }
  }
}
