// Staff actions from Playbook → Settings → Telegram.
//   save_bot_token (admin|manager) { token } → getMe, store token + a new webhook
//                  secret, setWebhook → { ok, bot_username, webhook_ok, webhook_error }
//   link_code      (admin|manager) → { ok, code, expires_at }   6 digits, 30 minutes, 5 wrong tries
//   crawler_key    (admin|manager) → { ok, key }          shown once; replaces the old key
//   test_bot       (staff)  → { ok, url_ok, pending_update_count, last_error_message }
//   respread       (admin|manager) → { ok, channels }  every channel's daily time spaced evenly
//                  over the window, in their current order (pb_tg_respread_slots)
//   save_window    (admin|manager) { start, end } → { ok, start, end, channels }  the overnight
//                  window (IST minutes of day 0–1439, may cross midnight, >= 60 min), then a
//                  respread in the old order — one database step (pb_tg_set_window)
import { SB_URL } from '../pb-products/db.ts';
import { HttpError, plain } from '../pb-products/http.ts';
import { windowProblem } from './schedule.ts';
import { botToken, randomHex, rpc, saveConfig, saveSecrets, scrub, sha256, tg } from './tg.ts';
import { resetCache } from './webhook.ts';
import { resetKeyCache } from './crawler.ts';

export type Body = Record<string, unknown>;

export const WEBHOOK_URL = `${SB_URL || 'https://ulphprdnswznfztawbvg.supabase.co'}/functions/v1/pb-telegram`;

interface WebhookInfo { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number }

export async function saveBotToken(b: Body) {
  const token = String(b.token ?? '').trim();
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new HttpError(400, 'That does not look like a bot token — copy the whole token BotFather gave you (numbers, a colon, then letters).');
  const me = await tg<{ username?: string; is_bot?: boolean }>(token, 'getMe').catch((e) => {
    throw new HttpError(400, `Telegram did not accept this bot token (${scrub(plain(e), token)}).`);
  });
  if (!me?.is_bot || !me.username) throw new HttpError(400, 'Telegram did not accept this bot token.');
  const secret = randomHex(32);
  // Stored before setWebhook, so the first update Telegram sends is already accepted.
  await saveSecrets({ bot_token: token, webhook_secret: secret });
  resetCache();
  let webhook_ok = true; let webhook_error: string | null = null;
  try {
    await tg(token, 'setWebhook', { url: WEBHOOK_URL, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: false });
  } catch (e) {
    webhook_ok = false; webhook_error = scrub(plain(e), token);
  }
  await saveConfig({ bot_username: me.username, webhook_ok, webhook_error });
  return { ok: true, bot_username: me.username, webhook_ok, webhook_error };
}

export async function linkCode() {
  await botToken(); // a code is useless before the bot exists
  let n: number; // drawn again above the last whole million, so every code is equally likely
  do n = crypto.getRandomValues(new Uint32Array(1))[0]; while (n >= 4_294_000_000);
  const code = String(n % 1_000_000).padStart(6, '0');
  const expires_at = new Date(Date.now() + 30 * 60_000).toISOString();
  await saveConfig({ link_code: code, link_code_expires_at: expires_at, link_attempts: 0 });
  return { ok: true, code, expires_at };
}

export async function crawlerKey() {
  const key = randomHex(32);
  await saveSecrets({ crawler_key_hash: await sha256(key) });
  resetKeyCache();
  return { ok: true, key };
}

export async function testBot() {
  const token = await botToken();
  const info = await tg<WebhookInfo>(token, 'getWebhookInfo');
  const url_ok = info.url === WEBHOOK_URL;
  const recent = !!info.last_error_date && Date.now() / 1000 - info.last_error_date < 3600;
  const last_error_message = info.last_error_message ? scrub(info.last_error_message, token) : null;
  const webhook_error = !url_ok ? 'The bot is not pointed at Playbook — save the bot token again.' : recent ? last_error_message : null;
  await saveConfig({ webhook_ok: url_ok && !webhook_error, webhook_error });
  return { ok: true, url_ok, pending_update_count: Number(info.pending_update_count || 0), last_error_message };
}

export async function respread() {
  return { ok: true, channels: Number(await rpc<number>('pb_tg_respread_slots', {})) || 0 };
}

export async function saveWindow(b: Body) {
  const start = Number(b.start), end = Number(b.end);
  const no = windowProblem(start, end);
  if (no) throw new HttpError(400, no);
  const channels = Number(await rpc<number>('pb_tg_set_window', { p_start: start, p_end: end })) || 0;
  return { ok: true, start, end, channels };
}
