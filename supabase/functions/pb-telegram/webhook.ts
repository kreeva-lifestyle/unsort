// The Telegram webhook (header X-Telegram-Bot-Api-Secret-Token = the secret set
// by save_bot_token). Handles:
//   - "/link 123456" in a group → that group becomes the admin group (code from
//     Settings, 30 minutes; pb_tg_link_try voids it after 5 wrong tries); the
//     bot answers only while a code is live, so guesses get no oracle;
//   - a group turned into a supergroup (its id changes) → the new id is kept;
//   - a FORWARDED message in the linked group → pb_tg_messages (duplicates
//     ignored), last_message_at updated. The crawler's own mapping
//     (pb_tg_forwards) fixes its origin when the header names another channel;
//   - the bot removed from the linked group, or added back (groupCheck.ts):
//     Settings says so and the crawler holds its forwards meanwhile.
// Everything else is ignored. Answers 200 at once, except when saving a
// forwarded message failed: then 500, so Telegram sends it again.
import { insert, nowIso } from '../pb-products/db.ts';
import { HttpError, plain } from '../pb-products/http.ts';
import { groupChanged, refreshGroup } from './groupCheck.ts';
import { parseUpdate } from './parse.ts';
import { config, rpc, saveConfig, scrub, secrets, tg, type TgSecrets } from './tg.ts';

let cached: { at: number; s: TgSecrets } | null = null;
let lastMiss = 0;
/** Forget the cached secrets (a new bot token / webhook secret was just saved). */
export const resetCache = () => { cached = null; lastMiss = 0; };
/** Webhook secrets and crawler keys are 32 random bytes as hex. */
export const HEX64 = /^[0-9a-f]{64}$/;

export function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** The secrets, cached for a minute per worker. A header that does not match
 * re-reads them (a new token) at most once every 5 s, so junk requests cannot
 * turn into a database read each. */
async function check(given: string): Promise<TgSecrets | null> {
  if (!HEX64.test(given)) return null;
  const fresh = cached && Date.now() - cached.at < 60_000;
  if (fresh && same(given, cached!.s.webhook_secret || '')) return cached!.s;
  if (fresh && Date.now() - lastMiss < 5_000) return null;
  lastMiss = Date.now();
  const s = await secrets();
  cached = { at: Date.now(), s };
  return same(given, s.webhook_secret || '') ? s : null;
}

const ok = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });

async function say(token: string, chatId: number, text: string) {
  try { await tg(token, 'sendMessage', { chat_id: chatId, text }, 8_000); } catch (e) { console.error(`pb-telegram reply: ${scrub(plain(e), token)}`); }
}

export async function webhook(req: Request): Promise<Response> {
  const s = await check(req.headers.get('x-telegram-bot-api-secret-token') || '').catch(() => null);
  if (!s?.bot_token) return new Response('{"ok":false}', { status: 401, headers: { 'content-type': 'application/json' } });
  const token = s.bot_token;
  let update: unknown;
  try { update = await req.json(); } catch { return ok(); }
  const p = parseUpdate(update);
  if (p.chat_id === undefined) return ok();
  try {
    const cfg = await config();
    if (p.link) {
      // A basic group numbers its messages separately for every account, so the crawler's "this group message
      // is that channel post" notes would never match what the bot receives: reposts would land under the wrong
      // vendor. Only a supergroup can be linked. Answered only while a code is live (as below: no code, no answer).
      if (p.chat_type === 'group') {
        if (cfg.link_code && cfg.link_code_expires_at && Date.parse(cfg.link_code_expires_at) > Date.now()) {
          await say(token, p.chat_id, 'This is a basic group, which Playbook cannot use. Make it a supergroup first: open the group’s settings, set “Chat history for new members” to Visible, then send /link with the code again.');
        }
        return ok();
      }
      const r = await rpc<string>('pb_tg_link_try', { p_code: p.link, p_chat: p.chat_id, p_title: p.chat_title ?? null });
      if (r === 'linked') {
        await say(token, p.chat_id, 'Linked to Playbook ✓');
        // A new group: what was known about the old one no longer holds — ask Telegram about this one now.
        await refreshGroup(token, await config(), true).catch((e) => console.error(`pb-telegram group check: ${scrub(plain(e), token)}`));
      }
      else if (r === 'wrong') await say(token, p.chat_id, 'That code is not right or has expired — get a new one in Playbook → Settings → Telegram.');
      else if (r === 'locked') await say(token, p.chat_id, 'Too many wrong codes — get a new code in Playbook → Settings → Telegram.');
      return ok(); // 'none': no code is live — no answer at all
    }
    if (p.migrate) {
      if (cfg.group_chat_id === p.migrate.from) await saveConfig({ group_chat_id: p.migrate.to });
      return ok();
    }
    if (cfg.group_chat_id === null || p.chat_id !== cfg.group_chat_id) return ok();
    // The bot's own place in the group (its id is the number before the colon in its token).
    if (p.member && (p.member.bot || p.member.users.includes(Number(token.split(':')[0])))) {
      await groupChanged(token, p.member.change).catch((e) => console.error(`pb-telegram group state: ${scrub(plain(e), token)}`));
      return ok();
    }
    if (!p.row) return ok();
    try {
      await insert('pb_tg_messages', [{ ...p.row }], { onConflict: 'chat_id,message_id', mode: 'ignore' });
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e; // the same update twice (update_id) is fine
    }
    // A forward that arrives is proof the bot reads the group: a "not in the group" answer is out of date.
    await saveConfig({ last_message_at: nowIso(), ...(p.chat_title && p.chat_title !== cfg.group_title ? { group_title: p.chat_title } : {}),
      ...(cfg.group_ok === false ? { group_ok: true, group_error: null, group_checked_at: nowIso() } : {}) }).catch((e) => console.error(`pb-telegram last_message_at: ${plain(e)}`));
    return ok();
  } catch (e) {
    console.error(`pb-telegram webhook: ${scrub(plain(e), token)}`);
    return new Response('{"ok":false}', { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
