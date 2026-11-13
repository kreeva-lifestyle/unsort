// Is the bot in the admin group, and can it read what is forwarded there?
// Pre-launch fix D20: a bot removed from the group was not noticed — Settings
// still said Linked, the crawler kept forwarding into a group nobody was
// reading, and moved its place in each channel past posts Playbook never got.
//   - Telegram is asked (getChatMember for the bot itself): left / kicked →
//     not in the group; administrator → fine; a plain member reads the group
//     only when the bot's Group Privacy is off (getMe), else it sees nothing
//     that is forwarded.
//   - The answer is kept on pb_tg_config (group_ok, group_error,
//     group_checked_at). While it is "no", crawler_config tells the crawler
//     that nothing is due, so no post is forwarded and no cursor moves.
//   - Asked again at most every 10 minutes (the crawler calls every minute),
//     at once when the webhook hears the bot was removed or added, and when
//     staff tap Check bot.
// "Telegram could not be reached" is not an answer: the last one stays.
import { nowIso } from '../pb-products/db.ts';
import { HttpError, plain } from '../pb-products/http.ts';
import { config, saveConfig, scrub, tg, type TgConfig } from './tg.ts';

export const REMOVED = 'The bot is not in the admin group any more. Add it back as an admin: until then no vendor post is copied.';
export const CANNOT_READ = 'The bot is in the admin group but cannot see its messages. Make it an admin of the group.';
const EVERY_MS = 10 * 60_000;
const botId = (token: string) => Number(token.split(':')[0]);

/** Asks Telegram. Throws when Telegram gives no answer (busy, unreachable). */
export async function checkGroup(token: string, chatId: number): Promise<{ ok: boolean; error: string | null }> {
  let status = '';
  try {
    status = String((await tg<{ status?: string }>(token, 'getChatMember', { chat_id: chatId, user_id: botId(token) }, 8_000))?.status || '');
  } catch (e) {
    // "bot is not a member", "bot was kicked", "chat not found": Telegram's way of saying the same thing.
    if (e instanceof HttpError && e.status === 400 && /not a member|kicked|chat not found|not found/i.test(e.message)) return { ok: false, error: REMOVED };
    throw e;
  }
  if (status === 'left' || status === 'kicked') return { ok: false, error: REMOVED };
  if (status === 'administrator' || status === 'creator') return { ok: true, error: null };
  const me = await tg<{ can_read_all_group_messages?: boolean }>(token, 'getMe', {}, 8_000);
  return me?.can_read_all_group_messages ? { ok: true, error: null } : { ok: false, error: CANNOT_READ };
}

/** The stored answer, asked afresh when it is older than 10 minutes (or `force`). No group linked or no bot: nothing to check. */
export async function refreshGroup(token: string | null, cfg: TgConfig, force = false): Promise<{ ok: boolean | null; error: string | null }> {
  const was = { ok: cfg.group_ok, error: cfg.group_error };
  if (!token || cfg.group_chat_id === null) return { ok: null, error: null };
  if (!force && cfg.group_checked_at && Date.now() - Date.parse(cfg.group_checked_at) < EVERY_MS) return was;
  try {
    const r = await checkGroup(token, cfg.group_chat_id);
    await saveConfig({ group_ok: r.ok, group_error: r.error, group_checked_at: nowIso() });
    return r;
  } catch (e) {
    console.error(`pb-telegram group check: ${scrub(plain(e), token)}`);
    return was;
  }
}

/** The webhook heard that the bot left or joined the linked group. */
export async function groupChanged(token: string, change: 'left' | 'joined'): Promise<void> {
  if (change === 'left') { await saveConfig({ group_ok: false, group_error: REMOVED, group_checked_at: nowIso() }); return; }
  await refreshGroup(token, await config(), true); // back in: is it an admin?
}
