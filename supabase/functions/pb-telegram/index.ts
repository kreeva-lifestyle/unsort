// pb-telegram Edge Function — Playbook · Telegram intake (2026-11-07).
// Docs: docs/playbook/telegram-intake.md. Deploy with verify_jwt = false: every
// caller is checked here. Shares pb-products' db / http / auth helpers.
//
// Callers:
//   - Telegram (header X-Telegram-Bot-Api-Secret-Token) → webhook.ts
//   - the crawler (header x-crawler-key)                → crawler.ts
//   - the pg_cron trigger (x-sync-secret = pb_worker_secret) or staff (Bearer JWT)
//
// POST JSON { action, ... } → JSON; errors → HTTP 4xx/5xx { ok:false, error:'<plain sentence>' }.
//   save_bot_token   admin|manager { token }  → { ok, bot_username, webhook_ok, webhook_error }
//   link_code        admin|manager            → { ok, code, expires_at }
//   crawler_key      admin|manager            → { ok, key }   (shown once; replaces the old key)
//   test_bot         staff                    → { ok, url_ok, pending_update_count, last_error_message, group_ok, group_error }
//   respread         admin|manager            → { ok, channels }   daily times spaced evenly
//   save_window      admin|manager { start, end } → { ok, start, end, channels }
//   assemble         secret|staff             → { ok, products, less, ignored, failed, waiting }
//   crawler_config   crawler                  → { ok, now, group_chat_id, group_title, group_problem, window, channels[] }
//   crawler_progress crawler { version, error?, channels[], forwarded? } → { ok, mapped }
// Details of the crawler pair: crawler.ts; of the daily schedule: schedule.ts.
import { whoIs } from '../pb-products/auth.ts';
import { HttpError, corsHeaders, fail, json, plain } from '../pb-products/http.ts';
import type { Caller } from '../pb-products/types.ts';
import { assemble } from './assemble.ts';
import { crawlerConfig, crawlerOk, crawlerProgress } from './crawler.ts';
import { type Body, crawlerKey, linkCode, respread, saveBotToken, saveWindow, testBot } from './staff.ts';
import { scrub } from './tg.ts';
import { webhook } from './webhook.ts';

type Who = 'any' | 'staff' | 'admin';
const ACTIONS: Record<string, { who: Who; run: (b: Body, c: Caller) => Promise<unknown> }> = {
  save_bot_token: { who: 'admin', run: (b) => saveBotToken(b) },
  link_code: { who: 'admin', run: () => linkCode() },
  crawler_key: { who: 'admin', run: () => crawlerKey() },
  test_bot: { who: 'staff', run: () => testBot() },
  respread: { who: 'admin', run: () => respread() },
  save_window: { who: 'admin', run: (b) => saveWindow(b) },
  assemble: { who: 'any', run: () => assemble() },
};
const CRAWLER: Record<string, (b: Body) => Promise<unknown>> = {
  crawler_config: () => crawlerConfig(),
  crawler_progress: (b) => crawlerProgress(b),
};

function denied(who: Who, c: Caller): string | null {
  if (who === 'any') return null;
  if (c.kind !== 'staff') return 'Sign in as a staff member for this.';
  if (who === 'admin' && !['admin', 'manager'].includes(c.role)) return 'Only an admin or manager can change the Telegram settings.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 405, 'Only POST requests are accepted.');
  if (req.headers.has('x-telegram-bot-api-secret-token')) return await webhook(req);
  if (Number(req.headers.get('content-length') || 0) > 256 * 1024) return fail(req, 413, 'The request is too large.');
  let body: Body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Body;
  } catch {
    return fail(req, 400, 'The request must be a JSON object.');
  }
  const action = String(body.action || '');
  try {
    if (req.headers.has('x-crawler-key')) {
      if (!(await crawlerOk(req))) return fail(req, 401, 'This crawler key is not valid — create a new one in Playbook → Settings → Telegram.');
      const run = CRAWLER[action];
      if (!run) return fail(req, 400, `Unknown crawler action "${action.slice(0, 40)}".`);
      return json(req, await run(body));
    }
    const caller = await whoIs(req);
    if (!caller) return fail(req, 401, 'Sign in to DailyOffice again — Playbook is for active staff only.');
    const a = ACTIONS[action];
    if (!a) return fail(req, 400, `Unknown action "${action.slice(0, 40)}".`);
    const no = denied(a.who, caller);
    if (no) return fail(req, 403, no);
    return json(req, await a.run(body, caller));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(`pb-telegram ${action}: ${scrub(e instanceof Error ? e.message : String(e))}`);
    return fail(req, status, scrub(plain(e)));
  }
});
