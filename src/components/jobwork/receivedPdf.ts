// A4 "Received on <date>" document for the print / save-as-PDF preview:
// every receipt of that date (one jobworker or all), grouped by jobworker,
// with the SKU photo, the job's details, what came back, where the job stands
// today, material returned, the note and who entered it. Rate and amount
// only when asked (admin/manager switch). Every value goes through escHtml.
import { escHtml } from '../../lib/escape';
import { docTitle } from '../../lib/exportName';
import { fmtDate, mixedQty, qty, inr } from './jobworkModel';
import type { ReceivedRow, JobProgress } from './jobworkReceived';

export interface ReceivedDoc {
  date: string; vendor: string | null; rows: ReceivedRow[]; names: Record<string, string>;
  progress: Record<string, JobProgress>; photos: Record<string, string | null>; money: boolean;
}

const unitOf = (r: ReceivedRow) => (r.job?.qty_unit === 'm' ? 'm' : 'pcs');
const sumBy = (rows: ReceivedRow[], f: (r: ReceivedRow) => number, u: 'pcs' | 'm') => rows.filter(r => unitOf(r) === u).reduce((a, r) => a + f(r), 0);
const totalLine = (rows: ReceivedRow[]) => {
  const rp = sumBy(rows, r => r.pcs_rejected, 'pcs'), rm = sumBy(rows, r => r.pcs_rejected, 'm');
  return `${mixedQty(sumBy(rows, r => r.pcs_ok, 'pcs'), sumBy(rows, r => r.pcs_ok, 'm'))} OK${rp || rm ? ` · ${mixedQty(rp, rm)} rejected` : ''}`;
};
const amountOf = (r: ReceivedRow) => Math.round(r.pcs_ok * (Number(r.job?.rate) || 0) * 100) / 100;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function buildReceivedPdf(d: ReceivedDoc): string {
  const groups = new Map<string, ReceivedRow[]>();
  for (const r of d.rows) { const v = r.job?.vendor_name ?? '—'; groups.set(v, [...(groups.get(v) ?? []), r]); }
  const cols = d.money ? 9 : 7;
  const body = [...groups.entries()].map(([vendor, rows]) => {
    const lines = rows.map(r => {
      const j = r.job, u = unitOf(r), p = d.progress[r.order_id], photo = j ? d.photos[j.sku] : null;
      const progress = p && j ? `${qty(p.ok)} of ${qty(j.pieces)} ${u} OK${p.rejected ? ` · ${qty(p.rejected)} rej.` : ''}<br><span class="m">${p.remaining > 0 ? `${qty(p.remaining)} ${u} still out` : 'all back'}${p.status !== 'open' ? ` · ${escHtml(p.status === 'closed' ? 'completed' : p.status)}` : ''}</span>` : '—';
      const extra = [
        r.lines.length ? `Material back: ${escHtml(r.lines.map(l => `${l.name} ${qty(l.qty)} ${l.unit}`.trim()).join(', '))}` : '',
        r.note ? `Note: ${escHtml(r.note)}` : '',
      ].filter(Boolean).join('<br>');
      return `<tr>
        <td class="ph">${photo ? `<img src="${escHtml(photo)}" alt="">` : '<div class="nop">no photo</div>'}</td>
        <td><b class="mono">${escHtml(j?.sku ?? '—')}</b><br><span class="m">JW #${escHtml(j?.jw_number ?? '—')} · ${escHtml(j?.job_type ?? '')}${j?.component ? ` · ${escHtml(j.component)}` : ''}</span>${extra ? `<div class="x">${extra}</div>` : ''}</td>
        <td class="r ok">${qty(r.pcs_ok)} ${u}</td>
        <td class="r">${r.pcs_rejected ? `<span class="rej">${qty(r.pcs_rejected)} ${u}</span>` : '—'}</td>
        <td>${progress}</td>
        ${d.money ? `<td class="r">${j ? `${inr(j.rate)}/${u === 'm' ? 'm' : 'pc'}` : '—'}</td><td class="r"><b>${inr(amountOf(r))}</b></td>` : ''}
        <td class="m">${escHtml((r.created_by && d.names[r.created_by]) || '—')}<br>${escHtml(timeOf(r.created_at))}</td>
      </tr>`;
    }).join('');
    const amt = d.money ? `<td class="r" colspan="2"><b>${inr(rows.reduce((a, r) => a + amountOf(r), 0))}</b></td>` : '';
    return `<tr class="grp"><td colspan="${cols}">${escHtml(vendor)} <span class="m">· ${rows.length} receipt${rows.length === 1 ? '' : 's'}</span></td></tr>${lines}
      <tr class="sub"><td colspan="2">Total ${escHtml(vendor)}</td><td colspan="3">${escHtml(totalLine(rows))}</td>${amt}<td></td></tr>`;
  }).join('');
  const grand = d.money ? ` · ${inr(d.rows.reduce((a, r) => a + amountOf(r), 0))}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(docTitle('Jobwork-Received', d.date, d.vendor ?? 'All'))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:11px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
  .head h1{margin:0;font-size:18px;letter-spacing:.5px}
  .sub0{color:#666;font-size:10px;margin-top:2px}
  .doc{text-align:right}.doc .num{font-size:15px;font-weight:700}
  .sum{border:1px solid #ddd;border-radius:6px;padding:8px 12px;margin-bottom:12px}
  .sum .big{font-size:15px;font-weight:700}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 6px;text-align:left;border-bottom:1px solid #eee;vertical-align:top}
  th{background:#f4f4f6;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#555}
  td.r,th.r{text-align:right}
  .ph{width:58px}.ph img{width:52px;height:52px;object-fit:cover;border-radius:4px;border:1px solid #ddd;display:block}
  .nop{width:52px;height:52px;border:1px dashed #ccc;border-radius:4px;font-size:8px;color:#999;display:flex;align-items:center;justify-content:center;text-align:center}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .m{color:#666;font-size:10px}.x{margin-top:4px;color:#333;font-size:10px}
  .ok{color:#137333;font-weight:700}.rej{color:#b3261e;font-weight:700}
  tr.grp td{background:#fafafa;font-weight:700;font-size:12px;border-top:2px solid #ddd}
  tr.sub td{font-weight:600;border-bottom:2px solid #ddd}
  tr{page-break-inside:avoid}
  .foot{margin-top:14px;font-size:9px;color:#888}
  @media print{body{padding:0}}
</style></head><body>
  <div class="head">
    <div><h1>Arya Designs</h1><div class="sub0">Jobwork — received</div></div>
    <div class="doc"><div class="num">${escHtml(fmtDate(d.date))}</div><div class="sub0">${escHtml(d.vendor ?? 'All jobworkers')}</div></div>
  </div>
  <div class="sum"><div class="big">${escHtml(totalLine(d.rows))}${grand}</div>
    <div class="m">${d.rows.length} receipt${d.rows.length === 1 ? '' : 's'} from ${groups.size} jobworker${groups.size === 1 ? '' : 's'} · "Job today" counts every receipt up to now</div></div>
  <table>
    <thead><tr><th></th><th>SKU · job</th><th class="r">OK</th><th class="r">Rejected</th><th>Job today</th>${d.money ? '<th class="r">Rate</th><th class="r">Amount</th>' : ''}<th>Entered</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="foot">Printed ${escHtml(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} from DailyOffice.</div>
</body></html>`;
}
