// Staff actions for "Import from website" (index.ts action table):
//   import_check  { url }  → the preview: platform, estimate (+ in stock), 3 samples, warnings, vendor name,
//                 and what Playbook already has from this website: already_here (products) and
//                 last_vendor (the vendor its last import was filed under), so a repeat import
//                 says "nothing new" up front and does not ask for the vendor again
//   import_start  { url, in_stock_only?, use_their_price?, vendor_name?, estimate? } → a queued run
//                 (estimate = the number the check showed, kept in cursor.estimate for the progress tile)
//   import_cancel { run_id } → cancelled (unless already done / failed)
//   import_list   → the last 20 runs
// The URL is validated here (urlCheck.ts) and the platform detected again on
// start, so the app can never make the worker fetch an address of its choosing.
// The run is stored under the store's own host (a redirect between www. and
// the bare name is followed once, detect.ts). One open run per site: checked
// here (also for import_check, so two people cannot double the store's load)
// and guarded by a unique index, so two quick taps on Start make one run.
// The run itself is advanced by the worker (runner.ts), one run per tick.
import { type Body, uuid } from '../actions.ts';
import { endRun } from '../bulkLog.ts';
import { SB_URL, enc, insert, logActivity, patch, sel, svcHeaders } from '../db.ts';
import { HttpError, plain } from '../http.ts';
import { vendorId } from '../ingest.ts';
import { detect } from './detect.ts';
import { RUN_COLS, type RunRow, ownDomains } from './runner.ts';
import { type SiteUrl, checkUrl } from './urlCheck.ts';

async function siteOf(b: Body): Promise<SiteUrl> {
  const r = checkUrl(b.url, await ownDomains());
  if (!r.ok) throw new HttpError(400, r.error);
  return r.site;
}

const variants = (host: string) => [host, host.startsWith('www.') ? host.slice(4) : `www.${host}`];
const busySentence = (host: string, status: string) => `An import from ${host} is already ${status === 'queued' ? 'waiting to start' : 'running'} — cancel it first to start another.`;
/** 409 while a run for this site (www. or not) is queued or running. */
async function refuseOpen(host: string) {
  const open = await sel<{ id: string; status: string }>(`pb_import_runs?host=in.(${variants(host).map(enc).join(',')})&status=in.(queued,running)&select=id,status&limit=1`);
  if (open[0]) throw new HttpError(409, busySentence(host, open[0].status));
}

/** What Playbook already holds from this website (www. or not): how many products were copied from it,
 *  and the vendor its last import was filed under. */
export async function importedBefore(host: string): Promise<{ count: number; vendor: string | null }> {
  const like = variants(host).map(h => `source_ref.like."${h}:*"`).join(',');
  const r = await fetch(`${SB_URL}/rest/v1/pb_products?source=eq.import&or=(${enc(like)})&select=id`, { method: 'HEAD', headers: { ...svcHeaders, prefer: 'count=exact' } });
  const count = r.ok ? Number((r.headers.get('content-range') || '').split('/')[1]) || 0 : 0;
  const last = await sel<{ pb_vendors: { name: string } | null }>(`pb_import_runs?host=in.(${variants(host).map(enc).join(',')})&vendor_id=not.is.null&select=pb_vendors(name)&order=created_at.desc&limit=1`);
  return { count, vendor: last[0]?.pb_vendors?.name ?? null };
}

export async function importCheck(b: Body) {
  const site = await siteOf(b);
  await refuseOpen(site.host);
  const d = await detect(site, { estimate: true });
  if (d.platform === 'unknown') {
    const msg = `Playbook could not find a product list on ${site.host}. It reads Shopify and WooCommerce stores, and other stores whose product pages carry standard product data.`;
    const extra = d.warnings[0] ? ` ${d.warnings[0]}` : '';
    throw new HttpError(400, (msg + extra).length <= 300 ? msg + extra : msg); // the app shows sentences up to 300 characters as they are
  }
  // The preview is about the store; what we already hold is a help, so a failed look-up is logged, not fatal.
  const before = await importedBefore(d.host).catch((e) => { console.error(`pb-products import_check ${d.host}: ${plain(e)}`); return { count: 0, vendor: null }; });
  // A count, '5000+' when counting stopped at the cap, null when this kind of store cannot say.
  const shown = (n: number | null) => (n === null ? null : d.estimate.capped ? `${n}+` : n);
  return {
    ok: true, platform: d.platform, host: d.host, origin: d.origin,
    estimate: shown(d.estimate.total), estimate_in_stock: shown(d.estimate.in_stock),
    sample: d.sample.slice(0, 3).map(f => ({ name: f.name, price: f.price, currency: f.currency, image: f.images[0] ?? null, url: f.url, in_stock: f.in_stock })),
    warnings: d.warnings, vendor_suggestion: d.vendor_suggestion, already_here: before.count, last_vendor: before.vendor,
    maker: d.maker ?? null, // do the products name who makes them? (import/maker.ts)
  };
}

export async function importStart(b: Body, userId: string | null) {
  const site = await siteOf(b);
  await refuseOpen(site.host);
  const d = await detect(site, { estimate: false });
  if (d.host !== site.host) await refuseOpen(d.host);
  if (d.platform === 'unknown') throw new HttpError(400, `Playbook could not find a product list on ${site.host}, so there is nothing to import.`);
  const vendorName = String(b.vendor_name ?? d.vendor_suggestion).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!vendorName) throw new HttpError(400, 'Give the vendor a name — the imported products are filed under it.');
  const vendor_id = await vendorId(vendorName);
  const cursor: Record<string, unknown> = d.platform === 'generic' && d.sitemaps.length ? { sitemaps: d.sitemaps, si: 0, off: 0 } : {};
  const est = Number(b.estimate); // display only ("480 of ~980"): the check's count, as the app saw it
  if (Number.isInteger(est) && est > 0 && est <= 1_000_000) cursor.estimate = est;
  const row = {
    url: site.url, host: d.host, platform: d.platform, status: 'queued',
    in_stock_only: b.in_stock_only !== false, use_their_price: b.use_their_price !== false,
    vendor_id, cursor, created_by: userId,
  };
  let made: { id: string }[];
  try { made = await insert<{ id: string }>('pb_import_runs', [row]); } catch (e) {
    if (e instanceof HttpError && e.status === 409) throw new HttpError(409, busySentence(d.host, 'queued')); // pb_import_runs_one_open
    throw e;
  }
  await logActivity({ action: 'import_started', user_id: userId, details: { run_id: made[0].id, host: d.host, platform: d.platform, in_stock_only: row.in_stock_only, use_their_price: row.use_their_price, vendor: vendorName } });
  return { ok: true, run_id: made[0].id, platform: d.platform, host: d.host, warnings: d.warnings };
}

export async function importCancel(b: Body, userId: string | null) {
  const id = uuid(b.run_id, 'run_id');
  const rows = await patch<{ id: string; host: string; added: number; found: number; skipped: number }>('pb_import_runs', `id=eq.${enc(id)}&status=in.(queued,running)`,
    { status: 'cancelled', finished_at: new Date().toISOString() }, 'id,host,added,found,skipped');
  if (!rows.length) {
    const cur = await sel<{ status: string }>(`pb_import_runs?id=eq.${enc(id)}&select=status&limit=1`);
    if (!cur[0]) throw new HttpError(404, 'That import no longer exists.');
    throw new HttpError(400, `This import is already ${cur[0].status} — nothing to cancel.`);
  }
  // What it added before it was stopped stays in the bulk-change log, where it can be taken back.
  await endRun(id, { host: rows[0].host, added: rows[0].added, found: rows[0].found, skipped: rows[0].skipped, status: 'cancelled' });
  await logActivity({ action: 'import_cancelled', user_id: userId, details: { run_id: id } });
  return { ok: true };
}

export async function importList() {
  const runs = await sel<RunRow>(`pb_import_runs?select=${RUN_COLS}&order=created_at.desc&limit=20`);
  return { ok: true, runs };
}
