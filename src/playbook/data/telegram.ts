// Telegram intake (Settings → Telegram): the status row pb_tg_config, how many
// forwarded messages are waiting, and the staff actions of the pb-telegram
// edge function. Contract: supabase/migrations/20261107090000_pb_telegram_intake.sql.
// Errors are thrown as-is — callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { pbFnCall } from './pbFunctions';
import type { PbTgChannel, PbTgConfig } from '../types';

const CONFIG_COLS = 'bot_username,group_chat_id,group_title,link_code,link_code_expires_at,link_attempts,webhook_ok,webhook_error,'
  + 'crawler_seen_at,crawler_version,crawler_error,crawler_channels,last_message_at,updated_at';

/** waiting: not used yet; retrying: failed once or twice, tried again by itself; failed: gave up after 3 tries. */
export type TgStatus = { config: PbTgConfig | null; waiting: number; retrying: number; failed: number };
/** The backend writes "… (attempt N of 3)" on a failed message; 1 and 2 are still being retried (for 7 days). */
const RETRYING = 'note.like."*(attempt 1 of 3)",note.like."*(attempt 2 of 3)"';
const RETRY_DAYS = 7;

const asChannels = (v: unknown): PbTgChannel[] => (Array.isArray(v) ? v : []).filter(c => c && typeof c === 'object').map(c => ({
  username: c.username ?? null, channel_id: c.channel_id ?? null, title: c.title ?? null, last_id: c.last_id ?? null, error: c.error ?? null,
}));

/** One round trip per table: the config row + two head-only counts (never the messages themselves). */
export async function getTgStatus(): Promise<TgStatus> {
  const msgs = () => supabase.from('pb_tg_messages').select('id', { count: 'exact', head: true });
  const since = new Date(Date.now() - RETRY_DAYS * 86_400_000).toISOString();
  const [cfg, waiting, failedAll, retrying] = await Promise.all([
    supabase.from('pb_tg_config').select(CONFIG_COLS).eq('id', 1).maybeSingle(),
    msgs().eq('state', 'pending'),
    msgs().eq('state', 'failed'),
    msgs().eq('state', 'failed').gt('received_at', since).or(RETRYING),
  ]);
  for (const r of [cfg, waiting, failedAll, retrying]) if (r.error) throw r.error;
  const row = cfg.data as (Omit<PbTgConfig, 'crawler_channels'> & { crawler_channels: unknown }) | null;
  return {
    config: row ? { ...row, crawler_channels: asChannels(row.crawler_channels) } : null,
    waiting: waiting.count ?? 0, retrying: retrying.count ?? 0,
    failed: Math.max(0, (failedAll.count ?? 0) - (retrying.count ?? 0)),
  };
}

export type TgFailedPost = { key: string; title: string; username: string | null; firstId: number | null; messages: number; note: string };
/** The posts Playbook gave up on (newest first, up to 20), one line per channel post group. */
export async function listFailedPosts(): Promise<TgFailedPost[]> {
  const { data, error } = await supabase.from('pb_tg_messages')
    .select('origin_chat_id,origin_title,origin_username,origin_message_id,note,received_at')
    .eq('state', 'failed').order('received_at', { ascending: false }).limit(200);
  if (error) throw error;
  const since = Date.now() - RETRY_DAYS * 86_400_000;
  const out = new Map<string, TgFailedPost>();
  for (const r of data ?? []) {
    const note = String(r.note || '');
    if (/\(attempt [12] of 3\)$/.test(note) && new Date(r.received_at).getTime() > since) continue; // still being retried
    const text = note.replace(/ \(attempt \d+ of \d+\)$/, '') || 'Could not be used';
    const key = `${r.origin_chat_id}|${text}`;
    const cur = out.get(key);
    const mid = r.origin_message_id as number | null;
    if (cur) { cur.messages++; if (mid !== null && (cur.firstId === null || mid < cur.firstId)) cur.firstId = mid; continue; }
    out.set(key, { key, title: r.origin_title || (r.origin_username ? `@${r.origin_username}` : 'Unknown channel'), username: r.origin_username, firstId: mid, messages: 1, note: text });
  }
  return [...out.values()].slice(0, 20);
}

const tg = <T>(action: string, body: Record<string, unknown> = {}) => pbFnCall<T>('pb-telegram', action, body);

/** Admin / manager: check the token with Telegram, store it, point the bot's webhook at Playbook. */
export const saveBotToken = (token: string) =>
  tg<{ ok: boolean; bot_username: string; webhook_ok?: boolean; webhook_error?: string | null }>('save_bot_token', { token });
/** A 6-digit code, valid 30 minutes, to send as "/link <code>" in the admin group. */
export const getLinkCode = () => tg<{ code: string; expires_at: string }>('link_code');
/** Admin / manager: a new crawler key (shown once; the old key stops working). */
export const createCrawlerKey = () => tg<{ key: string }>('crawler_key');
/** Asks Telegram whether the bot's webhook points at Playbook. */
export const testBot = () => tg<{ ok: boolean; url_ok: boolean; pending_update_count: number; last_error_message: string | null }>('test_bot');

/** The code from the config row while it is still valid. */
export const activeCode = (c: PbTgConfig | null, now = Date.now()) =>
  c?.link_code && c.link_code_expires_at && new Date(c.link_code_expires_at).getTime() > now ? { code: c.link_code, expires_at: c.link_code_expires_at } : null;

/** The crawler reports every POLL_SECONDS (60 by default): quiet for 5 minutes = it stopped. */
export const CRAWLER_STALE_MIN = 5;
export const crawlerRunning = (c: PbTgConfig | null, now = Date.now()) =>
  !!c?.crawler_seen_at && now - new Date(c.crawler_seen_at).getTime() < CRAWLER_STALE_MIN * 60_000;
