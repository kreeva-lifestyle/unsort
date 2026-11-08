// Staff actions for "Import from website" (index.ts action table):
//   import_check  { url }  → the preview: platform, estimate (+ in stock), 3 samples, warnings, vendor name
//   import_start  { url, in_stock_only?, use_their_price?, vendor_name?, estimate? } → a queued run
//                 (estimate = the number the check showed, kept in cursor.estimate for the progress tile)
//   import_cancel { run_id } → cancelled (unless already done / failed)
//   import_list   → the last 20 runs
// The URL is validated here (urlCheck.ts) and the platform detected again on
// start, so the app can never make the worker fetch an address of its choosing.
// The run itself is advanced by the worker (runner.ts), one run per tick.
import { type Body, uuid } from '../actions.ts';
import { enc, insert, logActivity, patch, sel } from '../db.ts';
import { HttpError } from '../http.ts';
import { vendorId } from '../ingest.ts';
import { detect } from './detect.ts';
import { RUN_COLS, type RunRow } from './runner.ts';
import { type SiteUrl, checkUrl } from './urlCheck.ts';

async function ourDomains(): Promise<string[]> {
  const sites = await sel<{ shop_domain: string }>('pb_websites?select=shop_domain');
  return sites.map(s => s.shop_domain);
}

async function siteOf(b: Body): Promise<SiteUrl> {
  const r = checkUrl(b.url, await ourDomains());
  if (!r.ok) throw new HttpError(400, r.error);
  return r.site;
}

export async function importCheck(b: Body) {
  const site = await siteOf(b);
  const d = await detect(site, { estimate: true });
  if (d.platform === 'unknown') {
    throw new HttpError(400, `Playbook could not find a product list on ${site.host}. It reads Shopify and WooCommerce stores, and other stores whose product pages carry standard product data (JSON-LD).${d.warnings.length ? ` ${d.warnings.join(' ')}` : ''}`);
  }
  // A count, '5000+' when counting stopped at the cap, null when this kind of store cannot say.
  const shown = (n: number | null) => (n === null ? null : d.estimate.capped ? `${n}+` : n);
  return {
    ok: true, platform: d.platform, host: d.host, origin: d.origin,
    estimate: shown(d.estimate.total), estimate_in_stock: shown(d.estimate.in_stock),
    sample: d.sample.slice(0, 3).map(f => ({ name: f.name, price: f.price, currency: f.currency, image: f.images[0] ?? null, url: f.url, in_stock: f.in_stock })),
    warnings: d.warnings, vendor_suggestion: d.vendor_suggestion,
  };
}

export async function importStart(b: Body, userId: string | null) {
  const site = await siteOf(b);
  const open = await sel<{ id: string; status: string }>(`pb_import_runs?host=eq.${enc(site.host)}&status=in.(queued,running)&select=id,status&limit=1`);
  if (open[0]) throw new HttpError(409, `An import from ${site.host} is already ${open[0].status === 'queued' ? 'waiting to start' : 'running'} — cancel it first to start another.`);
  const d = await detect(site, { estimate: false });
  if (d.platform === 'unknown') throw new HttpError(400, `Playbook could not find a product list on ${site.host}, so there is nothing to import.`);
  const vendorName = String(b.vendor_name ?? d.vendor_suggestion).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!vendorName) throw new HttpError(400, 'Give the vendor a name — the imported products are filed under it.');
  const vendor_id = await vendorId(vendorName);
  const cursor: Record<string, unknown> = d.platform === 'generic' && d.sitemaps.length ? { sitemaps: d.sitemaps, si: 0, off: 0 } : {};
  const est = Number(b.estimate); // display only ("480 of ~980"): the check's count, as the app saw it
  if (Number.isInteger(est) && est > 0 && est <= 1_000_000) cursor.estimate = est;
  const row = {
    url: site.url, host: site.host, platform: d.platform, status: 'queued',
    in_stock_only: b.in_stock_only !== false, use_their_price: b.use_their_price !== false,
    vendor_id, cursor, created_by: userId,
  };
  const made = await insert<{ id: string }>('pb_import_runs', [row]);
  await logActivity({ action: 'import_started', user_id: userId, details: { run_id: made[0].id, host: site.host, platform: d.platform, in_stock_only: row.in_stock_only, use_their_price: row.use_their_price, vendor: vendorName } });
  return { ok: true, run_id: made[0].id, platform: d.platform, host: site.host, warnings: d.warnings };
}

export async function importCancel(b: Body, userId: string | null) {
  const id = uuid(b.run_id, 'run_id');
  const rows = await patch<{ id: string }>('pb_import_runs', `id=eq.${enc(id)}&status=in.(queued,running)`, { status: 'cancelled', finished_at: new Date().toISOString() });
  if (!rows.length) {
    const cur = await sel<{ status: string }>(`pb_import_runs?id=eq.${enc(id)}&select=status&limit=1`);
    if (!cur[0]) throw new HttpError(404, 'That import no longer exists.');
    throw new HttpError(400, `This import is already ${cur[0].status} — nothing to cancel.`);
  }
  await logActivity({ action: 'import_cancelled', user_id: userId, details: { run_id: id } });
  return { ok: true };
}

export async function importList() {
  const runs = await sel<RunRow>(`pb_import_runs?select=${RUN_COLS}&order=created_at.desc&limit=20`);
  return { ok: true, runs };
}
