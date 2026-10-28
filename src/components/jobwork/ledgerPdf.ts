// A4 statement of one jobworker's ledger for the print / save-as-PDF preview
// (same look as the Received on document): who, the period, opening balance,
// every dated line with the running balance, and the period totals. Money
// columns only when the viewer may see money (admin/manager); otherwise it is
// a pieces statement. Every value goes through escHtml.
import { escHtml } from '../../lib/escape';
import { docTitle } from '../../lib/exportName';
import { fmtDate, inr, qty } from './jobworkModel';
import { lineText, rateText, balanceWords, type Ledger, type Period, type WorkerAccount } from './jobworkLedger';

const KIND: Record<string, string> = { given: 'Given', out: 'Sent', in: 'Received', payment: 'Paid' };
const money = (v: number) => (Math.abs(v) < 0.005 ? '' : inr(v));

export function buildLedgerPdf(d: { account: WorkerAccount; period: Period; ledger: Ledger; money: boolean }): string {
  const { account: a, period: p, ledger: l } = d;
  const range = p.from || p.to ? `${p.from ? fmtDate(p.from) : 'Start'} – ${p.to ? fmtDate(p.to) : 'today'}` : 'All time';
  const cols = d.money ? 6 : 3;
  const opening = d.money && p.from ? `<tr class="op"><td colspan="${cols - 1}">Opening balance on ${escHtml(fmtDate(p.from))}</td><td class="r">${escHtml(inr(l.opening))}</td></tr>` : '';
  const body = l.rows.map(r => {
    const sub = [d.money ? rateText(r) : '', r.note || ''].filter(Boolean).join(' · ');
    return `<tr>
      <td>${escHtml(fmtDate(r.d))}<br><span class="k k-${escHtml(r.kind)}">${escHtml(KIND[r.kind] ?? r.kind)}</span></td>
      <td><span class="mono">JW #${escHtml(r.jw)}</span><br><b class="mono">${escHtml(r.sku)}</b></td>
      <td>${escHtml(lineText(r))}${sub ? `<div class="m">${escHtml(sub)}</div>` : ''}</td>
      ${d.money ? `<td class="r">${escHtml(money(r.amount))}</td><td class="r ok">${escHtml(money(r.paid))}</td><td class="r"><b>${escHtml(inr(r.balance))}</b></td>` : ''}
    </tr>`;
  }).join('');
  const totals = d.money ? `<tr class="tot"><td colspan="3">Totals for the period</td><td class="r">${escHtml(inr(l.work))}</td><td class="r ok">${escHtml(inr(l.paid))}</td><td class="r">${escHtml(inr(l.closing))}</td></tr>` : '';
  const pending = [a.pending_pcs ? `${qty(a.pending_pcs)} pcs` : '', a.pending_m ? `${qty(a.pending_m)} m` : ''].filter(Boolean).join(' + ');
  const summary = d.money
    ? `<div class="big">${escHtml(balanceWords(l.closing))}</div><div class="m">${p.from ? `Opening ${escHtml(inr(l.opening))} · ` : ''}Work done ${escHtml(inr(l.work))} · Paid ${escHtml(inr(l.paid))} · Closing ${escHtml(inr(l.closing))}</div>`
    : `<div class="big">${l.count} entr${l.count === 1 ? 'y' : 'ies'}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(docTitle('Jobworker-Ledger', a.worker_name, p.from ?? 'all', p.to ?? ''))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:11px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
  .head h1{margin:0;font-size:18px;letter-spacing:.5px}
  .sub0{color:#666;font-size:10px;margin-top:2px}
  .doc{text-align:right}.doc .num{font-size:15px;font-weight:700}
  .sum{border:1px solid #ddd;border-radius:6px;padding:8px 12px;margin-bottom:12px}
  .big{font-size:15px;font-weight:700}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 6px;text-align:left;border-bottom:1px solid #eee;vertical-align:top}
  th{background:#f4f4f6;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#555}
  td.r,th.r{text-align:right;white-space:nowrap}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .m{color:#666;font-size:10px;margin-top:2px}
  .k{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666}
  .k-in{color:#137333}.k-payment{color:#3949ab}.k-out{color:#a15c00}
  .ok{color:#137333}
  tr.op td,tr.tot td{font-weight:700;background:#fafafa}
  tr.tot td{border-top:2px solid #ddd;border-bottom:2px solid #ddd}
  tr{page-break-inside:avoid}
  .foot{margin-top:14px;font-size:9px;color:#888}
  @media print{body{padding:0}}
</style></head><body>
  <div class="head">
    <div><h1>Arya Designs</h1><div class="sub0">Jobworker ledger</div></div>
    <div class="doc"><div class="num">${escHtml(a.worker_name)}</div><div class="sub0">${escHtml(range)}${a.worker_phone ? ` · ${escHtml(a.worker_phone)}` : ''}</div></div>
  </div>
  <div class="sum">${summary}<div class="m">${a.open_jobs} open job${a.open_jobs === 1 ? '' : 's'}${pending ? ` · ${escHtml(pending)} still with ${escHtml(a.worker_name)}` : ''}${l.rows.length < l.count ? ` · first ${l.rows.length} of ${l.count} lines shown` : ''}</div></div>
  <table>
    <thead><tr><th>Date</th><th>Job</th><th>What happened</th>${d.money ? '<th class="r">Work done</th><th class="r">Paid</th><th class="r">Balance</th>' : ''}</tr></thead>
    <tbody>${opening}${body}${totals}</tbody>
  </table>
  <div class="foot">Balance = work done (OK pieces × rate, on the day they came back) − payments. Printed ${escHtml(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} from DailyOffice.</div>
</body></html>`;
}
