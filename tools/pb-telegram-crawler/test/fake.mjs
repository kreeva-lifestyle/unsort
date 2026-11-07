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
