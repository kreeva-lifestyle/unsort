// The automation run ('work'): read → route → generate → publish, oldest
// first. Stops STARTING new items after ~100 s (every outside call also ends
// by ~140 s, under the edge runtime's wall clock; a publish starts only while
// 70 s are left, see PUBLISH_NEEDS_MS; a read only while READ_NEEDS_MS and a
// generation only while GEN_NEEDS_MS are left, so the AI call is never cut
// short by the run's own clock) and caps each step per call:
// at most 6 reads, 8 generations, 10 publishes. Each item records its own
// outcome (status, error, pb_activity) inside its step, so a failure here is
// only counted and logged, and the run moves on to the next item.
// Import from website (import/runner.ts) goes FIRST and gets the first
// IMPORT_MS of the run (one run, as many products as fit): it releases the run
// when its time is up, so read / generate / publish keep at least
// soft − IMPORT_MS = 70 s of starting time plus the hard margin. It is skipped
// while the steps after it have work waiting (importWaits: backpressure), so
// a 5,000-product store moves at the pace the AI reads and writes, and the
// other products (Telegram, typed in) are never starved by it. A product
// being added when the import clock runs out finishes (its photo downloads
// are bounded by ingest's own timeouts).
// Tags (tagFill.ts) go LAST, with whatever time is left: products a tag
// change made Ready are routed (route_due, at most 10), then up to 5 queued
// "Let AI decide" products get their values-only pass.
// Pre-launch check, 2026-11-13:
//   * stock owed to a store goes FIRST (stockSend.ts, up to 25 s), for every
//     website, and it is ALL a paused cron run does;
//   * the two brakes (brake.ts): once paused, a run stops starting items;
//     once the day's AI limit is used up, reading, writing and tag filling
//     are skipped (sending to Shopify goes on);
//   * the photos of freshly published listings are looked at (mediaCheck.ts).
import { overLimit, pauseWatch } from './brake.ts';
import { getSettings } from './db.ts';
import { claimGenerate, genCandidates, generateOne } from './generate.ts';
import { advanceImport } from './import/runner.ts';
import { plain } from './http.ts';
import { checkMedia } from './mediaCheck.ts';
import { claimPublish, PUBLISH_NEEDS_MS, pubCandidates, publishOne } from './publish.ts';
import { temporary } from './publishParts.ts';
import { claimRead, readCandidates, readOne } from './reader.ts';
import { sendStockDue } from './stockSend.ts';
import { FILL_NEEDS_MS, fillCandidates, fillQueued, routeDue } from './tagFill.ts';
import { loadTaxonomy } from './taxonomy.ts';
import type { Budget } from './types.ts';

/** stock = stock changes sent to stores; paused = automation is paused (the run stopped, or sent stock only); limit = the day's AI limit is used up. */
export interface WorkResult { read: number; routed: number; generated: number; published: number; failed: number; imported?: number; tagged?: number; stock?: number; paused?: boolean; limit?: boolean }

const CAPS = { read: 6, generate: 8, publish: 10, route: 10, fill: 5, stock: 10, media: 5 };
/** The slice of each run that stock sends may use. */
const STOCK_MS = 25_000;
/** Time an AI step needs left before it is claimed: photo checks + a slow answer (Opus / high effort). */
const READ_NEEDS_MS = 45_000;
const GEN_NEEDS_MS = 80_000;
/** The slice of each run that an import may use before the other steps start. */
const IMPORT_MS = 30_000;
/** The import waits while this much is queued after it: products to read, listings to write or to publish. */
const WAIT_AT = { read: 10, generate: 20, publish: 20 };

async function importWaits(): Promise<boolean> {
  const [r, g, p] = await Promise.all([readCandidates(WAIT_AT.read), genCandidates(WAIT_AT.generate), pubCandidates(WAIT_AT.publish)]);
  return r.length >= WAIT_AT.read || g.length >= WAIT_AT.generate || p.length >= WAIT_AT.publish;
}

export function newBudget(): Budget {
  const t0 = Date.now();
  return { soft: t0 + 100_000, hard: t0 + 140_000 };
}

/** `manual`: a person tapped "Run now" (the cron's call is not manual). */
export async function work(userId: string | null, manual = false): Promise<WorkResult> {
  const budget = newBudget();
  const out: WorkResult = { read: 0, routed: 0, generated: 0, published: 0, failed: 0 };
  const inTime = () => Date.now() < budget.soft;
  const left = (need: number) => inTime() && budget.hard - Date.now() >= need;
  const failed = (step: string, id: string, e: unknown) => {
    out.failed++;
    console.error(`pb-products ${step} ${id}: ${plain(e)}`);
  };
  const auto = await getSettings().then(s => s.automation).catch((e) => { failed('settings', 'run', e); return null; });
  const pausedAtStart = auto?.paused === true;

  try { // never held back: not by a pause, not by a website that is off
    const until = Date.now() + STOCK_MS, sent = await sendStockDue(CAPS.stock, () => Date.now() < until, userId);
    if (sent) out.stock = sent;
  } catch (e) { failed('stock', 'run', e); }
  if (pausedAtStart && !manual) return { ...out, paused: true };

  // Paused while this run is going → it stops starting items. A round a person started while paused runs through.
  const watch = pauseWatch();
  const stopped = async () => { if (manual && pausedAtStart) return false; if (await watch()) out.paused = true; return !!out.paused; };
  // The day's AI limit: asked before each AI step, so one run cannot overshoot by more than that step.
  const capped = async () => { if (!out.limit && auto && await overLimit(auto.daily_limit_inr)) out.limit = true; return !!out.limit; };

  try {
    const imp = (await stopped()) || (await importWaits()) ? null : await advanceImport(Date.now() + IMPORT_MS, userId);
    if (imp) out.imported = imp.added;
  } catch (e) { failed('import', 'run', e); } // the run itself records its error; the next tick carries on

  for (const c of (await capped()) ? [] : await readCandidates(CAPS.read)) {
    if (!left(READ_NEEDS_MS) || await stopped()) break;
    const p = await claimRead(c.id, false);
    if (!p) continue; // another run took it
    try {
      const r = await readOne(p, { manual: false, userId, budget });
      out.read++; out.routed += r.routed;
      if (r.warning) console.error(`pb-products route ${c.id}: ${r.warning}`);
    } catch (e) { failed('read', c.id, e); }
  }

  for (const c of left(GEN_NEEDS_MS) && !(await capped()) ? await genCandidates(CAPS.generate) : []) {
    if (!left(GEN_NEEDS_MS) || await stopped()) break;
    const l = await claimGenerate(c.id, false);
    if (!l) continue;
    try { await generateOne(l, { manual: false, userId, budget }); out.generated++; } catch (e) { failed('generate', c.id, e); }
  }

  // A publish is started only with time to finish it (a slow productSet may take up to 90 s).
  const pubTime = () => left(PUBLISH_NEEDS_MS + 10_000);
  const busyStores = new Set<string>(); // a store that asked for a pause: its other listings wait for the next run, the other stores go on
  let sentNow = 0;
  for (const c of pubTime() ? await pubCandidates(CAPS.publish * 3) : []) {
    if (!pubTime() || sentNow >= CAPS.publish || await stopped()) break;
    if (busyStores.has(c.website_id)) continue;
    const l = await claimPublish(c.id, false);
    if (!l) continue;
    sentNow++;
    try {
      const r = await publishOne(l, { manual: false, userId, budget });
      if (r.status === 'published') out.published++;
    } catch (e) {
      failed('publish', c.id, e);
      if (temporary(e)) busyStores.add(c.website_id);
    }
  }

  try { if (inTime() && !(await stopped())) await checkMedia(CAPS.media, inTime); } catch (e) { failed('media', 'run', e); }
  try { if (inTime() && !(await stopped())) out.routed += await routeDue(CAPS.route, userId, inTime); } catch (e) { failed('route_due', 'run', e); }
  try {
    const queued = left(FILL_NEEDS_MS) && !(await stopped()) && !(await capped()) ? await fillCandidates(CAPS.fill) : [];
    const tax = queued.length ? await loadTaxonomy() : null;
    for (const c of queued) {
      if (!tax || !left(FILL_NEEDS_MS)) break;
      if (await fillQueued(c, tax, userId, budget)) out.tagged = (out.tagged ?? 0) + 1; // false: another run took it
    }
  } catch (e) { failed('tags_fill', 'run', e); }
  return out;
}
