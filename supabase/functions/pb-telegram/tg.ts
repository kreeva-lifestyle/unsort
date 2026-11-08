// Telegram Bot API calls and the one-row config / secrets tables.
// The bot token is part of every Bot API URL (and of file download links), so
// no URL and no raw fetch error is ever logged, stored or returned: errors are
// rewritten into plain sentences and scrubbed of anything token-shaped.
import { SB_URL, insert, one, patch, svcHeaders } from '../pb-products/db.ts';
import { HttpError, fetchT } from '../pb-products/http.ts';

const API = 'https://api.telegram.org';
export const TG_MAX_BYTES = 20 * 1024 * 1024; // getFile only serves files up to 20 MB

export interface TgSecrets { bot_token: string | null; webhook_secret: string | null; crawler_key_hash: string | null }
export interface TgConfig {
  bot_username: string | null; group_chat_id: number | null; group_title: string | null;
  link_code: string | null; link_code_expires_at: string | null; link_attempts: number; webhook_ok: boolean | null; webhook_error: string | null;
  crawler_seen_at: string | null; crawler_version: string | null; crawler_error: string | null;
  crawler_channels: CrawlerChannel[]; last_message_at: string | null;
  crawl_window_start: number; crawl_window_end: number;
}
/** sent: how many messages the channel's last finished daily check forwarded. */
export interface CrawlerChannel { username: string | null; channel_id: number | null; title: string | null; last_id: number | null; error: string | null; sent?: number | null }
export const CONFIG_COLS = 'bot_username,group_chat_id,group_title,link_code,link_code_expires_at,link_attempts,webhook_ok,webhook_error,crawler_seen_at,crawler_version,crawler_error,crawler_channels,last_message_at,crawl_window_start,crawl_window_end';

const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
export const sha256 = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

/** Removes a bot token (and any "bot<id>:<secret>" shape) from text. */
export function scrub(s: string, token?: string | null): string {
  let t = String(s || '');
  if (token) t = t.split(token).join('***');
  return t.replace(/\d{5,}:[A-Za-z0-9_-]{20,}/g, '***').slice(0, 300);
}

export async function secrets(): Promise<TgSecrets> {
  return (await one<TgSecrets>('pb_tg_secrets?id=eq.1&select=bot_token,webhook_secret,crawler_key_hash'))
    ?? { bot_token: null, webhook_secret: null, crawler_key_hash: null };
}
export async function config(): Promise<TgConfig> {
  const c = await one<TgConfig>(`pb_tg_config?id=eq.1&select=${CONFIG_COLS}`);
  if (!c) throw new HttpError(500, 'The Telegram settings row is missing — apply the pb_telegram_intake migration.');
  return { ...c, crawler_channels: Array.isArray(c.crawler_channels) ? c.crawler_channels : [] };
}
/** Writes the single row (id 1), creating it if a migration replay left it out. */
async function upsert1(table: string, set: Record<string, unknown>) {
  const r = await patch(table, 'id=eq.1', set);
  if (!r.length) await insert(table, [{ id: 1, ...set }], { onConflict: 'id', mode: 'merge' });
}
export const saveConfig = (set: Partial<Record<keyof TgConfig, unknown>>) => upsert1('pb_tg_config', set);
export const saveSecrets = (set: Partial<Record<keyof TgSecrets, unknown>>) => upsert1('pb_tg_secrets', set);

/** POST /rest/v1/rpc/<fn> with the service role. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetchT(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...svcHeaders, 'content-type': 'application/json' }, body: JSON.stringify(args) }, 15_000);
  if (!r.ok) throw new HttpError(502, `The database refused ${fn} (${r.status}).`);
  return await r.json() as T;
}

export async function botToken(): Promise<string> {
  const t = (await secrets()).bot_token;
  if (!t) throw new HttpError(400, 'Save the Telegram bot token first (Settings → Telegram, step 1).');
  return t;
}

/** One Bot API method. Telegram's own "description" becomes the error sentence. */
export async function tg<T>(token: string, method: string, params: Record<string, unknown> = {}, ms = 15_000): Promise<T> {
  let r: Response;
  try {
    r = await fetchT(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) }, ms);
  } catch (e) {
    throw new HttpError(502, e instanceof DOMException ? 'Telegram took too long to answer.' : 'Telegram could not be reached.');
  }
  const j = await r.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  // 400 / 401 / 404 will not get better by trying again; 429 and 5xx may.
  if (!j?.ok) throw new HttpError([400, 401, 403, 404].includes(r.status) ? 400 : 502, `Telegram said: ${scrub(j?.description || `error ${r.status}`, token)}`);
  return j.result as T;
}

/** Downloads one file the bot can see (≤ 20 MB) as a Blob (no second copy of the bytes). Throws plain sentences only. */
export async function download(token: string, fileId: string, ms: number): Promise<Blob> {
  const f = await tg<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId }, 15_000);
  if (!f.file_path) throw new HttpError(502, 'Telegram did not hand over the file.');
  if (Number(f.file_size || 0) > TG_MAX_BYTES) throw new TooBig(Number(f.file_size));
  let r: Response;
  try {
    r = await fetchT(`${API}/file/bot${token}/${f.file_path}`, {}, ms);
  } catch (e) {
    throw new HttpError(502, e instanceof DOMException ? 'The download from Telegram took too long.' : 'The download from Telegram failed.');
  }
  if (!r.ok || !r.body) throw new HttpError(502, `The download from Telegram failed (${r.status}).`);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read().catch(() => { throw new HttpError(502, 'The download from Telegram was cut off.'); });
    if (done) break;
    size += value.length;
    if (size > TG_MAX_BYTES) { await reader.cancel(); throw new TooBig(size); }
    parts.push(value);
  }
  return new Blob(parts);
}

/** A file over Telegram's 20 MB bot limit: not retried, noted on the product. */
export class TooBig extends Error {
  constructor(public bytes: number) { super('too big'); }
}
export const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1048576));
