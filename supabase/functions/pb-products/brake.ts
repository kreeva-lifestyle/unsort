// The two brakes on a run (pre-launch check, 2026-11-13, D7).
//   Pause: the switch in Settings. It used to stop only the every-minute
//     call; a run already going finished all its items. Now every run asks
//     again before each new item (at most once every 10 seconds) and stops
//     starting items once paused. A run a person starts with "Run now" WHILE
//     paused is their own choice and runs its round. Stock owed to a store is
//     sent regardless (stockSend.ts).
//   Daily AI limit: pb_settings.automation.daily_limit_inr (₹ per IST day,
//     default 500, 0 = none). Once today's AI cost (pb_ai_cost_since: reads,
//     tag fills, listings written, and failed calls that were still paid for)
//     reaches it, the worker stops reading and writing for the day; sending
//     to Shopify needs no AI and goes on. A button a person taps is not held
//     back by it.
import { getSettings, rpc } from './db.ts';
import { plain } from './http.ts';

/** Rupees per US dollar, as the app shows AI cost (src/playbook/format.ts USD_INR). */
export const USD_INR = 95;

/** Today's midnight in India, as an ISO moment. */
export function istDayStart(now = Date.now()): string {
  const IST = 5.5 * 3600_000, day = 24 * 3600_000;
  return new Date(Math.floor((now + IST) / day) * day - IST).toISOString();
}

/** What the AI has cost today (IST), in rupees. */
export async function spentToday(): Promise<number> {
  const r = await rpc<{ usd: number | string }[]>('pb_ai_cost_since', { p_since: istDayStart() });
  return Math.round(Number(r?.[0]?.usd || 0) * USD_INR * 100) / 100;
}

/** Is the day's AI limit used up? A spend that cannot be read does not stop the run (and is logged). */
export async function overLimit(limit: number): Promise<boolean> {
  if (!(limit > 0)) return false;
  try { return (await spentToday()) >= limit; } catch (e) { console.error(`pb-products daily limit: ${plain(e)}`); return false; }
}

/** `await paused()` → is automation paused now? Asked of the database at most once every 10 seconds. */
export function pauseWatch(): () => Promise<boolean> {
  let at = 0, last = false;
  return async () => {
    if (Date.now() - at < 10_000) return last;
    at = Date.now();
    try { last = (await getSettings()).automation.paused; } catch (e) { console.error(`pb-products pause check: ${plain(e)}`); }
    return last;
  };
}
