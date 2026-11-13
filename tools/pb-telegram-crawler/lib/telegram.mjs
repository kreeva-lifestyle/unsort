// The only file that talks to GramJS. Everything else uses this small
// interface, which the tests replace with a fake:
//   connect() / reconnect() / disconnect()
//   resolveChannel({ username, channel_id }) → { entity, channel_id, title, username, noforwards }
//   resolveGroup(chatId)                     → entity
//   latest(entity, n)                        → newest n messages
//   after(entity, minId, limit)              → messages with id > minId, oldest first
//   forward(groupEntity, fromEntity, ids)    → the new message ids in the group, same order
//                                              (a prefix when Telegram returned fewer)
// Channel and group ids use the Bot API form (-100…), the same numbers the
// Playbook bot sees in forward_origin.chat.id.
// GramJS calls have no timeout of their own and can wait forever on a dead
// line, so every call goes through within(): a stuck call becomes a TIMEOUT
// network error, and reconnect() builds a fresh client.
import { Api, Logger, TelegramClient, utils } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { LogLevel } from 'telegram/extensions/Logger.js';

const DIALOGS_EVERY_MS = 10 * 60_000;
export const CALL_MS = 60_000;
export const CONNECT_MS = 90_000;

const timeoutError = what => Object.assign(new Error(`Telegram did not answer (${what})`), { errorMessage: 'TIMEOUT' });

/** `p`, or a TIMEOUT error after `ms`. */
export function within(p, ms, what = 'request') {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => { t = setTimeout(() => rej(timeoutError(what)), ms); }),
  ]).finally(() => clearTimeout(t));
}

export function makeTelegram({ apiId, apiHash, session, makeClient }) {
  const newClient = makeClient || (() => new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
    retryDelay: 2000,
    autoReconnect: true,
    floodSleepThreshold: 30,       // short waits: GramJS sleeps; longer ones reach us
    baseLogger: new Logger(LogLevel.ERROR),
  }));
  let client = newClient();
  let dialogsAt = 0;

  async function connect() {
    await within(client.connect(), CONNECT_MS, 'connect');
    if (!client.connected) throw Object.assign(new Error('Could not connect to Telegram'), { errorMessage: 'TIMEOUT' });
    // getMe throws AUTH_KEY_UNREGISTERED / SESSION_REVOKED for a real sign-out;
    // a dropped line stays a network error (checkAuthorization would hide it).
    await within(client.getMe(), 30_000, 'getMe');
  }

  // Ids only resolve once GramJS has seen the chat; walking the dialog list
  // (chats the staff account is in) fills its cache. Done at most every 10 min.
  async function byId(id) {
    const peer = Number(id);
    try {
      return await within(client.getEntity(peer), CALL_MS, 'getEntity');
    } catch (e) {
      if (e?.errorMessage === 'TIMEOUT' || Date.now() - dialogsAt < DIALOGS_EVERY_MS) throw e;
      dialogsAt = Date.now();
      const walk = async () => {
        for await (const d of client.iterDialogs({ limit: 3000 })) if (String(d.id) === String(peer)) return d.entity;
        return null;
      };
      return (await within(walk(), 3 * CALL_MS, 'dialogs')) ?? within(client.getEntity(peer), CALL_MS, 'getEntity');
    }
  }

  return {
    connect,
    async reconnect() {
      try { await within(client.destroy(), 10_000, 'destroy'); } catch { /* stuck or already down */ }
      client = newClient();
      dialogsAt = 0;
      await connect();
    },
    async disconnect() {
      try { await within(client.destroy(), 5_000, 'destroy'); } catch { /* shutting down */ }
    },
    async resolveChannel({ username, channel_id }) {
      const ent = username ? await within(client.getEntity(username), CALL_MS, 'getEntity') : await byId(channel_id);
      if (!(ent instanceof Api.Channel)) {
        throw Object.assign(new Error('Not a channel'), { errorMessage: 'NOT_A_CHANNEL' });
      }
      if (ent.megagroup) throw Object.assign(new Error('Group, not channel'), { errorMessage: 'NOT_BROADCAST' });
      const name = ent.username || ent.usernames?.find(u => u.active)?.username || null;
      return {
        entity: ent,
        channel_id: Number(utils.getPeerId(ent)),
        title: ent.title || null,
        username: name ? name.toLowerCase() : null,
        noforwards: !!ent.noforwards,
      };
    },
    resolveGroup: chatId => byId(chatId),
    async latest(entity, n) {
      return normalize(await within(client.getMessages(entity, { limit: n }), CALL_MS, 'getMessages'));
    },
    async after(entity, minId, limit) {
      return normalize(await within(client.getMessages(entity, { minId, limit, reverse: true }), CALL_MS, 'getMessages'));
    },
    async forward(groupEntity, fromEntity, ids) {
      // silent: the admin group's members are not pinged ~25 times per product.
      const sent = await within(client.forwardMessages(groupEntity, { messages: ids, fromPeer: fromEntity, silent: true }), CALL_MS, 'forward');
      const flat = [sent].flat(2).filter(Boolean);
      const out = [];
      for (const m of flat) { if (m?.id == null) break; out.push(Number(m.id)); }
      return out.slice(0, ids.length);
    },
  };
}

export function normalize(list) {
  return [...list].map(m => ({
    id: Number(m.id),
    groupedId: m.groupedId != null ? String(m.groupedId) : null,
    service: m.className !== 'Message',
    // When the vendor posted it (unix seconds). Playbook groups a night's burst by this, not by arrival.
    date: Number.isFinite(Number(m.date)) && Number(m.date) > 0 ? Number(m.date) : null,
  })).sort((a, b) => a.id - b.id);
}
