// The worker's import step: advance AT MOST ONE queued / running import run
// until `until` (ms clock), then release it for the next tick. Per page:
// fetch (pages.ts), add each product through ingest() — source 'import',
// source_ref '<host>:<id>' so a product already imported is skipped (ingest
// answers duplicate) — three products at a time, then save counters + cursor.
// Done when the last page is short; failed after MAX_PAGE_ERRORS consecutive
// page errors; cancelled runs stop between pages; MAX_PRODUCTS caps a run.
// What each product sends to ingest(): body.ts.
import { ago, enc, logActivity, nowIso, one, patch, sel } from '../db.ts';
import { HttpError, plain } from '../http.ts';
import { ingest } from '../ingest.ts';
import { STALE_MS } from '../types.ts';
import { MAX_PAGE_ERRORS, MAX_PRODUCTS } from './cursor.ts';
import { readRobots } from './detect.ts';
import { ingestBody } from './body.ts';
import { type Found } from './normalize.ts';
import { fetchPage } from './pages.ts';
import { robotsRefusal } from './urlCheck.ts';

export interface RunRow {
  id: string; url: string; host: string; platform: string | null; status: string; in_stock_only: boolean; use_their_price: boolean;
  vendor_id: string | null; cursor: Record<string, unknown>; found: number; added: number; skipped: number; out_of_stock: number; failed: number;
  sample: unknown; error: string | null; started_at: string | null; created_by: string | null;
}
export const RUN_COLS = 'id,url,host,platform,status,in_stock_only,use_their_price,vendor_id,cursor,found,added,skipped,out_of_stock,failed,sample,error,started_at,created_by,claimed_at,finished_at,created_at,updated_at';
const INGEST_AT_ONCE = 3;

const due = () => `status=in.(queued,running)&or=(claimed_at.is.null,claimed_at.lt.${ago(STALE_MS)})`;
const CAP_NOTE = `Stopped at ${MAX_PRODUCTS} products — run the import again later for the rest (products already here are skipped).`;

export async function advanceImport(until: number, userId: string | null): Promise<{ run_id: string; found: number; added: number } | null> {
  const left = () => Date.now() < until;
  const cand = await sel<{ id: string }>(`pb_import_runs?${due()}&select=id&order=created_at.asc&limit=1`);
  if (!cand[0]) return null;
  const stamp = nowIso();
  const held = await patch<RunRow>('pb_import_runs', `id=eq.${enc(cand[0].id)}&${due()}`, { claimed_at: stamp, status: 'running' }, RUN_COLS);
  const run = held[0];
  if (!run) return null; // another tick took it
  const mine = `id=eq.${enc(run.id)}&status=eq.running&claimed_at=eq.${enc(stamp)}`;
  const save = (body: Record<string, unknown>) => patch<{ id: string }>('pb_import_runs', mine, body);
  const out = { run_id: run.id, found: 0, added: 0 };
  if (!run.started_at) await save({ started_at: stamp });
  const vendor = run.vendor_id ? (await one<{ name: string }>(`pb_vendors?id=eq.${enc(run.vendor_id)}&select=name`))?.name ?? '' : '';
  const origin = `https://${run.host}`;
  const robots = await readRobots(origin);
  const refusal = robotsRefusal(robots, run.platform || 'unknown');
  if (refusal) { await finish(run, save, 'failed', refusal, userId); return out; }

  let cur = run;
  while (left()) {
    let page;
    try {
      page = await fetchPage({ platform: cur.platform || 'unknown', origin, cursor: cur.cursor, in_stock_only: cur.in_stock_only }, robots, left);
    } catch (e) {
      const errors = Number(cur.cursor.errors || 0) + 1;
      const msg = plain(e);
      // A 400 is our own verdict (no sitemap, unknown platform): trying again would not help.
      if (errors >= MAX_PAGE_ERRORS || (e instanceof HttpError && e.status === 400)) {
        await finish(cur, save, 'failed', msg, userId);
      } else {
        await save({ cursor: { ...cur.cursor, errors }, error: `${msg} (try ${errors} of ${MAX_PAGE_ERRORS})`, claimed_at: null });
      }
      return out;
    }
    const counts = { found: cur.found, added: cur.added, skipped: cur.skipped, out_of_stock: cur.out_of_stock, failed: cur.failed };
    const take: Found[] = [];
    for (const f of page.items) {
      if (counts.found >= MAX_PRODUCTS) break;
      counts.found++;
      if (!f.in_stock && cur.in_stock_only) { counts.out_of_stock++; continue; }
      take.push(f);
    }
    for (let i = 0; i < take.length; i += INGEST_AT_ONCE) {
      await Promise.all(take.slice(i, i + INGEST_AT_ONCE).map(async (f) => {
        try {
          const r = await ingest(ingestBody(f, cur, vendor));
          if (r.duplicate) counts.skipped++; else counts.added++;
        } catch (e) {
          counts.failed++;
          console.error(`pb-products import ${cur.id} ${f.url}: ${plain(e)}`);
        }
      }));
    }
    const pageErrors = Number(page.pageErrors || 0);
    const sample = cur.sample ?? (take.length ? take.slice(0, 3).map(f => ({ name: f.name, price: f.price, image: f.images[0] ?? null, url: f.url })) : null);
    const capped = counts.found >= MAX_PRODUCTS;
    const done = page.done || capped;
    const body: Record<string, unknown> = { ...counts, cursor: { ...page.cursor, errors: 0 }, sample, error: null };
    if (done) Object.assign(body, { status: 'done', finished_at: nowIso(), claimed_at: null, error: capped && !page.done ? CAP_NOTE : null });
    else if (pageErrors && !page.items.length) Object.assign(body, { error: 'Some product pages could not be read; carrying on with the next ones.' });
    const saved = await save(body);
    out.found = counts.found - run.found; out.added = counts.added - run.added;
    if (!saved.length) return out; // cancelled (or taken over) while this page was read: its products are in, the run stays as staff left it
    if (done) { await logRun({ ...cur, ...counts }, 'done', body.error as string | null, userId); return out; }
    cur = { ...cur, ...counts, cursor: body.cursor as Record<string, unknown>, sample };
  }
  await save({ claimed_at: null }); // time is up for this tick: the next one carries on
  return out;
}

async function finish(run: RunRow, save: (b: Record<string, unknown>) => Promise<unknown>, status: 'failed', error: string, userId: string | null) {
  await save({ status, error: error.slice(0, 500), finished_at: nowIso(), claimed_at: null });
  await logRun(run, status, error, userId);
}

const logRun = (run: RunRow, status: string, error: string | null, userId: string | null) =>
  logActivity({ action: 'import_run', user_id: userId ?? run.created_by, details: { run_id: run.id, host: run.host, platform: run.platform, status, found: run.found, added: run.added, skipped: run.skipped, out_of_stock: run.out_of_stock, failed: run.failed, ...(error ? { error } : {}) } });
