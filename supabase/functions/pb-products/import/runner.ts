// The worker's import step: advance AT MOST ONE queued / running import run
// until `until` (ms clock), then release it for the next tick. Per page: fetch
// (pages.ts), add its products (batch.ts), then save counters + cursor.
// Done when the last page is short; failed after MAX_PAGE_ERRORS consecutive
// page errors (a generic store that refuses every product page counts too);
// cancelled runs stop between pages; batch.ts caps a run.
// Shopify / WooCommerce fetch each new product's own page (enrich.ts), so a
// page rarely fits one tick: out of time mid-page, the run saves `cursor.skip`
// + `skip_ref` (the last product handled) and the next tick carries on after
// that product — found by its id, so a product added to or removed from the
// store in between does not shift the run. Generic pages are only fetched
// while GENERIC_INGEST_MS is left, so their products are all added in time.
// A store that asks us to slow down (RateLimited) is left alone until
// `cursor.wait_until`; that is not an error. Shopify's currency comes from its
// /meta.json, read once per run (cursor.currency).
import { endRun, startRun } from '../bulkLog.ts';
import { ago, enc, logActivity, nowIso, one, patch, sel } from '../db.ts';
import { HttpError } from '../http.ts';
import { STALE_MS } from '../types.ts';
import { MAX_PAGE_ERRORS, MAX_PRODUCTS, MAX_SCANNED } from './cursor.ts';
import { readRobots, shopCurrency } from './detect.ts';
import { addProducts, capped, type Counts } from './batch.ts';
import { hostTwin } from './body.ts';
import { type Gate, needsPage } from './enrich.ts';
import { RateLimited, pageError, setPace } from './fetch.ts';
import { type Found } from './normalize.ts';
import { fetchPage } from './pages.ts';
import { robotsRefusal, setOwnDomains } from './urlCheck.ts';

export interface RunRow {
  id: string; url: string; host: string; platform: string | null; status: string; in_stock_only: boolean; use_their_price: boolean;
  vendor_id: string | null; cursor: Record<string, unknown>; found: number; added: number; skipped: number; out_of_stock: number; failed: number;
  sample: unknown; error: string | null; started_at: string | null; created_by: string | null; created_at?: string;
}
export const RUN_COLS = 'id,url,host,platform,status,in_stock_only,use_their_price,vendor_id,cursor,found,added,skipped,out_of_stock,failed,sample,error,started_at,created_by,claimed_at,finished_at,created_at,updated_at';
/** Generic sites: product pages are fetched only while this much of the import clock is left, for adding them. */
const GENERIC_INGEST_MS = 20_000;
const CAP_NOTE = `Stopped at ${MAX_PRODUCTS.toLocaleString('en-IN')} new products — run the import again later for the rest (products already here are skipped).`;
const SCAN_NOTE = `Stopped after looking at ${MAX_SCANNED.toLocaleString('en-IN')} products — run the import again later for the rest.`;
const REFUSED_ALL = 'The website refused every product page Playbook asked for (it may block automated visitors).';
const SLOW_DOWN = 'The store asked Playbook to slow down, so the import is waiting a few minutes before it carries on.';

/** Our own stores' domains (never imported from, not even through a redirect); also set for every later URL check. */
export async function ownDomains(): Promise<string[]> {
  const d = (await sel<{ shop_domain: string }>('pb_websites?select=shop_domain')).map(s => s.shop_domain);
  setOwnDomains(d);
  return d;
}

/** Which of these refs (ids on that site) were imported before, under either address of the site, so a
 *  second import of the same store (typed with or without "www.") adds only what is new. */
async function known(host: string, refs: string[]): Promise<Set<string>> {
  if (!refs.length) return new Set();
  const out = new Set<string>();
  for (const h of [host, hostTwin(host)]) {
    const full = refs.slice(0, 60).map(r => `${h}:${r}`.slice(0, 200));
    const list = full.map(r => `"${r.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
    const rows = await sel<{ source_ref: string }>(`pb_products?source=eq.import&source_ref=in.(${enc(list)})&select=source_ref`);
    for (const r of rows) out.add(r.source_ref.slice(h.length + 1));
  }
  return out;
}

/** Where to carry on in a page that was cut short: after the product `skip_ref` (else at index `skip`). */
function resumeAt(items: Found[], c: Record<string, unknown>): number {
  const skip = Number(c.skip) > 0 ? Number(c.skip) : 0;
  if (!skip) return 0;
  const k = typeof c.skip_ref === 'string' ? items.findIndex(f => f.ref === c.skip_ref) : -1;
  return k >= 0 ? k + 1 : skip;
}

const due = () => `status=in.(queued,running)&or=(claimed_at.is.null,claimed_at.lt.${ago(STALE_MS)})`;
const clean = (c: Record<string, unknown>) => { const x = { ...c }; delete x.skip; delete x.skip_ref; delete x.wait_until; return x; };

export async function advanceImport(until: number, userId: string | null): Promise<{ run_id: string; found: number; added: number } | null> {
  // The oldest run that is not waiting out a "slow down" from its store: a run in a wait must not hold up the ones behind it.
  const cands = await sel<{ id: string; cursor: Record<string, unknown> | null }>(`pb_import_runs?${due()}&select=id,cursor&order=created_at.asc&limit=10`);
  const cand = cands.find(c => !(Number(c.cursor?.wait_until) > Date.now()));
  if (!cand) return null;
  const stamp = nowIso();
  const held = await patch<RunRow>('pb_import_runs', `id=eq.${enc(cand.id)}&${due()}`, { claimed_at: stamp, status: 'running' }, RUN_COLS);
  const run = held[0];
  if (!run) return null; // another tick took it
  const mine = `id=eq.${enc(run.id)}&status=eq.running&claimed_at=eq.${enc(stamp)}`;
  const save = (body: Record<string, unknown>) => patch<{ id: string }>('pb_import_runs', mine, body);
  const out = { run_id: run.id, found: 0, added: 0 };
  if (Number(run.cursor.wait_until) > Date.now()) { await save({ claimed_at: null }); return out; }
  if (!run.started_at) await save({ started_at: stamp });
  // An import is a bulk change: its log entry carries the import's own id, and every product it adds is recorded
  // under it (batch.ts → ingest), so the import can be taken back. Asked for on every tick: a run that began before
  // the log existed gets its entry here, and an existing one is left as it is.
  await startRun('import', `Imported products from ${run.host}`, { id: run.id, userId: run.created_by, createdAt: run.created_at });
  let cur = run;
  // A failed request: a rate limit waits (not an error); our own 400 (refused, no sitemap) fails at once; else 3 tries.
  const failed = async (e: unknown) => {
    if (e instanceof RateLimited) {
      await save({ cursor: { ...cur.cursor, wait_until: Date.now() + e.retryAfter * 1000 }, error: SLOW_DOWN, claimed_at: null });
      return out;
    }
    const errors = Number(cur.cursor.errors || 0) + 1;
    const msg = pageError(e, 'The store’s product list');
    if (errors >= MAX_PAGE_ERRORS || (e instanceof HttpError && e.status === 400)) await finish(cur, save, msg, userId);
    else await save({ cursor: { ...cur.cursor, errors }, error: `${msg} (try ${errors} of ${MAX_PAGE_ERRORS})`, claimed_at: null });
    return out;
  };

  let robots, vendor = '';
  try {
    await ownDomains();
    robots = await readRobots(`https://${run.host}`);
    if (run.vendor_id) vendor = (await one<{ name: string }>(`pb_vendors?id=eq.${enc(run.vendor_id)}&select=name`))?.name ?? '';
    if (run.platform === 'shopify' && !('currency' in run.cursor)) cur = { ...cur, cursor: { ...cur.cursor, currency: await shopCurrency(`https://${run.host}`, robots) } };
  } catch (e) { return failed(e); }
  const refusal = robotsRefusal(robots, run.platform || 'unknown');
  if (refusal) { await finish(run, save, refusal, userId); return out; }
  const origin = `https://${run.host}`;
  setPace(run.host, (robots.crawlDelay ?? 1) * 1000);

  const gate: Gate = { blocked: false };
  const ctx = { run, origin, robots, vendor, perItem: needsPage(run.platform || ''), until, worked: false, gate, known: (refs: string[]) => known(run.host, refs) };
  while (Date.now() < until) {
    let page;
    try {
      page = await fetchPage({ platform: cur.platform || 'unknown', origin, cursor: cur.cursor, in_stock_only: cur.in_stock_only, currency: (cur.cursor.currency as string | null) ?? null, known: ctx.known },
        robots, () => Date.now() < until - GENERIC_INGEST_MS);
    } catch (e) { return failed(e); }
    // A product page that could not be read (a timeout, a 5xx, a 403) is passed over for good: it counts as failed.
    const counts: Counts = { found: cur.found + (page.known ?? 0), added: cur.added, skipped: cur.skipped + (page.known ?? 0), out_of_stock: cur.out_of_stock, failed: cur.failed + Number(page.pageErrors || 0) };
    const { next: i, taken } = await addProducts(page.items, resumeAt(page.items, cur.cursor), counts, ctx);
    const partial = i < page.items.length && !capped(counts);
    const stop = capped(counts);
    // Every product page fetched failed (403s, bot walls): that is a page error too.
    const refused = !!page.taken && Number(page.pageErrors || 0) >= page.taken;
    const errors = refused ? Number(cur.cursor.errors || 0) + 1 : 0;
    const sample = cur.sample ?? (taken.length ? taken.slice(0, 3).map(f => ({ name: f.name, price: f.price, image: f.images[0] ?? null, url: f.url })) : null);
    if (refused && errors >= MAX_PAGE_ERRORS) { await finish({ ...cur, ...counts }, save, REFUSED_ALL, userId, { ...counts, sample }); return out; }
    const done = !partial && (page.done || stop);
    const cursor = partial ? { ...clean(cur.cursor), skip: i, skip_ref: page.items[i - 1]?.ref ?? null, errors: 0 }
      : { ...clean(page.cursor), errors, ...(page.wait ? { wait_until: Date.now() + page.wait * 1000 } : {}) };
    const body: Record<string, unknown> = { ...counts, cursor, sample, error: null };
    if (done) Object.assign(body, { status: 'done', finished_at: nowIso(), claimed_at: null, error: stop && !page.done ? (counts.found >= MAX_SCANNED ? SCAN_NOTE : CAP_NOTE) : null });
    else if (partial || page.wait) Object.assign(body, { claimed_at: null, ...(page.wait ? { error: SLOW_DOWN } : {}) });
    else if (refused) body.error = `${REFUSED_ALL} (try ${errors} of ${MAX_PAGE_ERRORS})`;
    else if (page.pageErrors && !page.items.length) body.error = 'Some product pages could not be read; carrying on with the next ones.';
    const saved = await save(body);
    out.found = counts.found - run.found; out.added = counts.added - run.added;
    if (!saved.length) return out; // cancelled (or taken over) while this page was read: its products are in, the run stays as staff left it
    if (done) { await logRun({ ...cur, ...counts }, 'done', body.error as string | null, userId); return out; }
    if (partial || page.wait) return out;
    cur = { ...cur, ...counts, cursor, sample };
  }
  await save({ claimed_at: null }); // time is up for this tick: the next one carries on
  return out;
}

async function finish(run: RunRow, save: (b: Record<string, unknown>) => Promise<{ id: string }[]>, error: string, userId: string | null, extra: Record<string, unknown> = {}) {
  const saved = await save({ ...extra, status: 'failed', error: error.slice(0, 500), finished_at: nowIso(), claimed_at: null });
  if (saved.length) await logRun(run, 'failed', error, userId); // 0 rows: cancelled meanwhile, so nothing failed
}

/** The run is over: its timeline line, and its entry in the bulk-change log is closed (taken out when it added nothing). */
const logRun = async (run: RunRow, status: string, error: string | null, userId: string | null) => {
  await endRun(run.id, { host: run.host, added: run.added, found: run.found, skipped: run.skipped, status });
  await logActivity({ action: 'import_run', user_id: userId ?? run.created_by, details: { run_id: run.id, host: run.host, platform: run.platform, status, found: run.found, added: run.added, skipped: run.skipped, out_of_stock: run.out_of_stock, failed: run.failed, ...(error ? { error } : {}) } });
};
