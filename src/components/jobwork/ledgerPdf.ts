// A4 statement of one jobworker's ledger (same look as the Received on
// document). Oldest first, as a statement of account reads: four boxed
// figures — balance at start, billed in period, paid in period, balance at
// end written as a sentence — then Date | Particulars | Billed | Paid |
// Balance with a labelled subtotal per month (never in the balance's slot),
// and a Pieces section listing every open job so "baki" pieces and "baki"
// money are both on paper. Money only when the viewer may see it; otherwise
// the pieces statement alone. Every value goes through escHtml.
import { escHtml } from '../../lib/escape';
import { docTitle } from '../../lib/exportName';
import { fmtDate, inr, qty, per } from './jobworkModel';
import { lineText, rateText, owed, isMoney, type Ledger, type Period, type WorkerAccount } from './jobworkLedger';

const money = (v: number) => (Math.abs(v) < 0.005 ? '' : inr(v));
const monthOf = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export function buildLedgerPdf(d: { account: WorkerAccount; period: Period; ledger: Ledger; money: boolean }): string {
  const { account: a, period: p, ledger: l } = d;
  const range = p.from || p.to ? `${p.from ? fmtDate(p.from) : 'Start'} – ${p.to ? fmtDate(p.to) : 'today'}` : 'All time';
  const end = owed(a.worker_name, l.closing), start = owed(a.worker_name, l.opening);
  const cols = d.money ? 5 : 2;
  const rows = d.money ? l.rows : l.rows.filter(r => !isMoney(r) || r.kind === 'in');
  let body = '', m = '', mWork = 0, mPaid = 0;
  const subtotal = () => (d.money && m ? `<tr class="sub"><td colspan="2">Billed in ${escHtml(m)} · Paid in ${escHtml(m)}</td><td class="r">${escHtml(inr(mWork))}</td><td class="r">${escHtml(inr(mPaid))}</td><td></td></tr>` : '');
  for (const r of rows) {
    const mm = monthOf(r.d);
    if (mm !== m) { body += subtotal(); m = mm; mWork = 0; mPaid = 0; }
    mWork += r.amount; mPaid += r.paid;
    const sub = [d.money ? rateText(r) : '', r.note || ''].filter(Boolean).join(' · ');
    body += `<tr class="${isMoney(r) ? 'money' : 'goods'}"><td>${escHtml(fmtDate(r.d))}</td>
      <td><span class="mono">JW #${escHtml(r.jw)} · ${escHtml(r.sku)}</span> — ${escHtml(lineText(r))}${sub ? `<div class="m">${escHtml(sub)}</div>` : ''}</td>
      ${d.money ? `<td class="r">${escHtml(money(r.amount))}</td><td class="r ok">${escHtml(money(r.paid))}</td><td class="r">${isMoney(r) ? `<b>${escHtml(inr(r.balance))}</b>` : ''}</td>` : ''}</tr>`;
  }
  body += subtotal();
  const open = l.jobs.filter(j => j.status === 'open');
  const pieces = open.map(j => `<tr><td class="mono">JW #${escHtml(j.jw)} · ${escHtml(j.sku)}</td><td>${escHtml(j.job_type)}${j.component ? ` · ${escHtml(j.component)}` : ''}</td><td class="r">${escHtml(qty(j.pieces))}</td><td class="r ok">${escHtml(qty(j.ok))}</td><td class="r">${escHtml(qty(j.rejected))}</td><td class="r"><b>${escHtml(qty(j.pending))}</b></td>${d.money ? `<td class="r">${escHtml(inr(j.rate))}/${escHtml(per(j.unit))}</td><td class="r"><b>${escHtml(inr(j.due))}</b></td>` : ''}</tr>`).join('');
  const boxes = d.money
    ? `<div class="boxes">${[['Balance at start', inr(l.opening), start.text], ['Billed in period', inr(l.work), 'pieces received × rate'], ['Paid in period', inr(l.paid), 'all payments'], ['Balance at end', inr(l.closing), end.text]].map(([t, v, s]) => `<div class="box"><div class="t">${escHtml(t)}</div><div class="v">${escHtml(v)}</div><div class="s">${escHtml(s)}</div></div>`).join('')}</div>
       <div class="say">${escHtml(end.text)}${a.pending_pcs || a.pending_m ? ` · ${escHtml(qty(a.pending_pcs))} pcs${a.pending_m ? ` + ${escHtml(qty(a.pending_m))} m` : ''} still with ${escHtml(a.worker_name)}` : ''}</div>`
    : `<div class="say">${escHtml(qty(a.pending_pcs))} pcs${a.pending_m ? ` + ${escHtml(qty(a.pending_m))} m` : ''} still with ${escHtml(a.worker_name)} · ${open.length} open job${open.length === 1 ? '' : 's'}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(docTitle('Jobworker-Statement', a.worker_name, p.from ?? 'all', p.to ?? ''))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:11px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
  .head h1{margin:0;font-size:18px;letter-spacing:.5px}.sub0{color:#666;font-size:10px;margin-top:2px}
  .doc{text-align:right}.doc .num{font-size:15px;font-weight:700}
  .boxes{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}
  .box{border:1px solid #ddd;border-radius:6px;padding:8px 10px}.box .t{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#555}.box .v{font-size:15px;font-weight:700;margin-top:2px}.box .s{font-size:9px;color:#666;margin-top:2px}
  .say{font-size:13px;font-weight:700;margin:4px 0 12px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#444;margin:16px 0 6px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 6px;text-align:left;border-bottom:1px solid #eee;vertical-align:top}
  th{background:#f4f4f6;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#555}
  td.r,th.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace}.m{color:#666;font-size:10px;margin-top:2px}
  .ok{color:#137333}tr.goods td{color:#777}
  tr.sub td{font-size:10px;color:#555;background:#fafafa;border-bottom:2px solid #ddd}
  tr{page-break-inside:avoid}
  .foot{margin-top:14px;font-size:9px;color:#888}
  @media print{body{padding:0}}
</style></head><body>
  <div class="head">
    <div><h1>Arya Designs</h1><div class="sub0">Jobworker statement</div></div>
    <div class="doc"><div class="num">${escHtml(a.worker_name)}</div><div class="sub0">${escHtml(range)}${a.worker_phone ? ` · ${escHtml(a.worker_phone)}` : ''}</div></div>
  </div>
  ${boxes}
  <h2>What happened</h2>
  <table>
    <thead><tr><th>Date</th><th>Particulars</th>${d.money ? '<th class="r">Billed</th><th class="r">Paid</th><th class="r">Balance</th>' : ''}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}">Nothing in this period.</td></tr>`}</tbody>
  </table>
  ${open.length ? `<h2>Pieces still open</h2><table><thead><tr><th>Job</th><th>Work</th><th class="r">Given</th><th class="r">OK</th><th class="r">Rejected</th><th class="r">Pending</th>${d.money ? '<th class="r">Rate</th><th class="r">Due</th>' : ''}</tr></thead><tbody>${pieces}</tbody></table>` : ''}
  <div class="foot">Billed = OK pieces × rate, on the day they came back. Balance = billed − paid. Printed ${escHtml(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} from DailyOffice.</div>
</body></html>`;
}
