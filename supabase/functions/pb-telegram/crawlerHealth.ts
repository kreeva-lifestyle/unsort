// What the crawler must know before it forwards anything (pre-launch fix D20),
// and what it tells Playbook about the posts it forwarded (D13).
//   health()     is the admin group being read by the bot (groupCheck.ts), and
//                which forwards of the last 2 days never reached Playbook
//                (pb_tg_lost_forwards). While the group is not being read,
//                crawler_config marks no channel due: nothing is forwarded and
//                no cursor moves, with any version of the crawler.
//   rewinds      a channel with lost forwards is told to go back to just
//                before the first of them (`rewind_to`); its next daily check
//                sends those posts again. A post that did arrive and is sent
//                twice is dropped as a repeat (adopt.ts / group.ts).
//   markResent() the crawler said it went back: those forwards are not counted
//                as lost any more.
//   postDates()  when the vendor posted each forwarded message.
import { ago, enc, nowIso, patch } from '../pb-products/db.ts';
import { plain } from '../pb-products/http.ts';
import { REMOVED, refreshGroup } from './groupCheck.ts';
import { rpc, secrets, type TgConfig } from './tg.ts';

export interface Lost { origin_chat_id: number; origin_title: string | null; origin_username: string | null; lost: number; first_id: number; last_id: number; newest: string }
/** pb_tg_lost_forwards() counts a forward as lost once it is this old with no message. */
const LOST_AFTER_MS = 10 * 60_000;

export async function health(cfg: TgConfig, anyDue: boolean): Promise<{ problem: string | null; lost: Lost[] }> {
  if (cfg.group_chat_id === null) return { problem: null, lost: [] };
  // Telegram is asked only when a check is about to run or the last answer was not "yes" (the crawler calls every minute).
  const g = anyDue || cfg.group_ok !== true ? await refreshGroup((await secrets()).bot_token, cfg) : { ok: cfg.group_ok, error: cfg.group_error };
  if (g.ok === false) return { problem: g.error || REMOVED, lost: [] };
  const lost = await rpc<Lost[]>('pb_tg_lost_forwards', {}).catch((e) => { console.error(`pb-telegram lost forwards: ${plain(e)}`); return [] as Lost[]; });
  return { problem: null, lost: Array.isArray(lost) ? lost : [] };
}

/** channel id → the post id to go back to (just before the first lost forward). */
export const rewinds = (lost: Lost[]) => new Map(lost.filter(l => Number.isSafeInteger(Number(l.first_id)) && Number(l.first_id) > 0).map(l => [Number(l.origin_chat_id), Number(l.first_id) - 1]));

/** The crawler went back to `to` in this channel: what was lost after it is on its way again. */
export async function markResent(list: { channel_id: number; to: number }[]): Promise<void> {
  for (const r of list) {
    await patch('pb_tg_forwards', `origin_chat_id=eq.${r.channel_id}&origin_message_id=gt.${r.to}&resent_at=is.null&created_at=lt.${enc(ago(LOST_AFTER_MS))}`, { resent_at: nowIso() }, 'message_id');
  }
}

/** [{ chat_id, message_id, posted_at (unix seconds) }] → the mapping and the waiting messages. */
export async function postDates(rows: { chat_id: number; message_id: number; posted_at: number }[]): Promise<void> {
  if (rows.length) await rpc<number>('pb_tg_post_dates', { p_rows: rows });
}
