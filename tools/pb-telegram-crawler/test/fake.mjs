// A stand-in for lib/telegram.mjs: channels with messages, a group that
// records every forward call, and errors that can be queued per call.
export function rpcError(errorMessage, extra = {}) {
  return Object.assign(new Error(errorMessage), { errorMessage, ...extra });
}

export function makeFakeTelegram() {
  const channels = new Map();        // username → { entity, channel_id, title, messages, blocked, priv }
  const forwards = [];               // { from, ids }
  const failNext = [];               // errors thrown by the next forward calls
  let groupOk = true;
  let nextGroupId = 9000;            // message ids the forwards get in the group
  const calls = { resolve: 0, after: 0 };

  return {
    channels, forwards, failNext, calls,
    setGroup(ok) { groupOk = ok; },
    addChannel(username, { id, title = username, messages = [], blocked = false, priv = false, noforwards = false } = {}) {
      const ch = { entity: { username, id }, channel_id: id, title, messages, blocked, priv, noforwards };
      channels.set(username, ch);
      return ch;
    },
    post(username, ...msgs) { channels.get(username).messages.push(...msgs); },
    async resolveChannel({ username, channel_id }) {
      calls.resolve++;
      const ch = username ? channels.get(username)
        : [...channels.values()].find(c => c.channel_id === Number(channel_id));
      if (!ch) throw new Error(`No user has "${username}" as username`);
      if (ch.priv) throw rpcError('CHANNEL_PRIVATE');
      return { entity: ch.entity, channel_id: ch.channel_id, title: ch.title, username: ch.entity.username, noforwards: ch.noforwards };
    },
    async resolveGroup(id) {
      if (!groupOk) throw new Error('Could not find the input entity for {"chatId":"1"}');
      return { group: id };
    },
    async latest(entity, n) {
      return channels.get(entity.username).messages.slice(-n);
    },
    async after(entity, minId, limit) {
      calls.after++;
      return channels.get(entity.username).messages.filter(m => m.id > minId).sort((a, b) => a.id - b.id).slice(0, limit);
    },
    async forward(group, entity, ids) {
      if (failNext.length) throw failNext.shift();
      if (channels.get(entity.username).blocked) throw rpcError('CHAT_FORWARDS_RESTRICTED');
      forwards.push({ from: entity.username, ids: [...ids] });
      return ids.map(() => ++nextGroupId);
    },
  };
}

// Messages: m(id) single, m(id, 'g1') album part, svc(id) service message.
export const m = (id, groupedId = null) => ({ id, groupedId, service: false });
export const svc = id => ({ id, groupedId: null, service: true });

// A fake clock: sleep() moves time forward instantly and records the waits.
export function makeClock(start = 1_000_000) {
  let t = start;
  const waits = [];
  return {
    now: () => t,
    sleep: async ms => { waits.push(ms); t += ms; },
    advance: ms => { t += ms; },
    waits,
  };
}

export function makeFakePb(config) {
  const reports = [];
  return {
    reports,
    config: async () => structuredClone(typeof config === 'function' ? config() : config),
    progress: async body => { reports.push(structuredClone(body)); return { ok: true }; },
  };
}

// A stand-in for Playbook's crawler_config / crawler_progress that keeps state
// the way pb-telegram/crawler.ts does. rows[] = the vendors: cursor_ready is
// the vendor's tg_cursor_ready, last_id the cursor stored in crawler_channels.
//   config: last_id only while the vendor is ready; cursor_ready = ready + a
//     stored cursor; vendor_ready = the vendor flag; due only when cursor_ready.
//   progress: no `channels` → nothing changes; last_id null / '' keeps the
//     stored cursor (never 0); cursor_ready + a cursor makes the vendor ready;
//     `checked` makes it not due (until the test calls dueNow()).
// Channels: { username, channel_id?, last_id?, cursor_ready?, due?, next_check_at? }.
export function makeFakePlaybook({ group = -1001111111111, channels = [] } = {}) {
  const rows = channels.map((c, i) => ({ vendor_id: `v${i + 1}`, vendor_name: c.username, channel_id: null, last_id: null,
    cursor_ready: false, due: false, next_check_at: null, ...c }));
  const reports = [];
  const checks = [];                 // usernames, in the order they were reported checked
  let failProgress = 0;
  const find = c => rows.find(r => (c.username && r.username === c.username) || (c.channel_id != null && r.channel_id === c.channel_id));
  const view = r => {
    const last_id = r.cursor_ready ? r.last_id : null;
    const cursor_ready = r.cursor_ready && last_id != null;
    return { ...r, last_id, cursor_ready, vendor_ready: r.cursor_ready, due: r.due && cursor_ready };
  };
  return {
    rows, reports, checks,
    /** The next n reports that carry a finished check fail (as if Playbook were offline). */
    failNextReports(n) { failProgress = n; },
    dueNow(username, at) { const r = rows.find(x => x.username === username); r.due = true; r.next_check_at = new Date(at).toISOString(); },
    /** What the trigger does when a vendor is switched off and on, or gets another channel. */
    resetVendor(username) { const r = rows.find(x => x.username === username); r.cursor_ready = false; r.due = false; },
    config: async () => structuredClone({ ok: true, group_chat_id: group, group_title: 'Admin', channels: rows.map(view) }),
    progress: async body => {
      if (failProgress > 0 && body.channels?.some(c => c.checked)) { failProgress--; throw new Error('Playbook could not be reached (crawler_progress): fetch failed'); }
      reports.push(structuredClone(body));
      if (body.channels === undefined) return { ok: true, mapped: 0 };
      if (!Array.isArray(body.channels)) throw Object.assign(new Error('channels must be a list.'), { status: 400 });
      for (const c of body.channels) {
        const r = find(c);
        if (!r) continue;
        if (c.channel_id != null) r.channel_id = c.channel_id;
        const last = c.last_id == null || c.last_id === '' ? NaN : Number(c.last_id);
        if (Number.isSafeInteger(last) && last >= 0) r.last_id = last;
        if (c.cursor_ready === true && r.last_id != null && Number.isSafeInteger(last)) r.cursor_ready = true;
        if (c.checked) { r.due = false; checks.push(r.username); }
      }
      return { ok: true };
    },
  };
}
