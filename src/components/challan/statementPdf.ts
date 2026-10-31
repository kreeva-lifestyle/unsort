// Printable customer statement (owner-approved design, 2026-10-31): the same
// passbook layout as ChallanStatement on paper — to collect, the sum that
// gets there, every bill / return / payment with the running balance, and
// the bills still open. Shown in the ledger's iframe preview and printed /
// shared from there. Every interpolated value goes through escHtml.
import { escHtml as e } from '../../lib/escape';
import { closingLabel, dayLabel, inr, type Statement } from './statementData';

export function statementPdfHtml(customer: string, st: Statement): string {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  // '-' never matches a year, so the year is always printed in the period line.
  const period = st.from || st.to ? `${st.from ? dayLabel(st.from, '-') : 'Start'} – ${st.to ? dayLabel(st.to, '-') : 'today'}` : 'All time';
  const close = closingLabel(st);
  const due = st.closing > 0.009;
  const cell = (label: string, value: string, sub: string, cls = '') =>
    `<div class="cell ${cls}"><div class="l">${e(label)}</div><div class="v">${e(value)}</div><div class="s">${e(sub)}</div></div>`;
  const rows = st.rows.map(r => `<tr class="${r.plus ? '' : 'cr'}">
      <td class="dim">${e(r.date)}</td>
      <td><b>${e(r.title)}</b>${r.detail ? `<div class="det">${e(r.detail)}</div>` : ''}</td>
      <td class="r m">${r.plus ? e(inr(r.amount)) : ''}</td>
      <td class="r m g">${r.plus ? '' : '− ' + e(inr(r.amount))}</td>
      <td class="r m b">${e(inr(r.balance))}</td></tr>`).join('');
  const open = st.open.map(b => `<div class="ob"><span><b class="m">#${e(b.no)}</b> <span class="dim">${e(b.date)}${b.partly ? ' · part paid' : ''}</span></span><b class="m red">${e(inr(b.due))}</b></div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${e(`Statement ${customer}`)}</title><style>
    *{box-sizing:border-box} body{font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1B1D22;background:#fff;margin:0;padding:28px;font-size:12px}
    .m{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace} .dim{color:#5B6170} .red{color:#B91C1C} .g{color:#15803D} .b{font-weight:700} .r{text-align:right}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1B1D22;padding-bottom:12px;margin-bottom:16px}
    .k{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5B6170} h1{margin:4px 0;font-size:24px}
    .hero{display:flex;justify-content:space-between;align-items:flex-end;border:1px solid #E4E2DC;border-radius:10px;padding:14px 18px;margin-bottom:10px}
    .hero .v{font-size:30px;font-weight:800}
    .sum{display:grid;grid-template-columns:repeat(${st.refunds !== 0 ? 6 : 5},1fr);border:1px solid #E4E2DC;border-radius:10px;overflow:hidden;margin-bottom:16px}
    .cell{padding:10px 12px;border-right:1px solid #E4E2DC} .cell:last-child{border-right:none;background:#F3F2FF;color:#3730A3}
    .cell .l{font-size:10px;font-weight:600;color:#5B6170} .cell:last-child .l{color:#3730A3} .cell .v{font-size:14px;font-weight:700;margin:3px 0;font-family:'JetBrains Mono',ui-monospace,monospace} .cell .s{font-size:10px;color:#5B6170}
    .cell.gr .v{color:#15803D}
    h2{font-size:13px;margin:16px 0 6px}
    table{width:100%;border-collapse:collapse} th{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#5B6170;text-align:left;padding:6px 8px;background:#F4F3EF;border-bottom:1px solid #E4E2DC}
    td{padding:6px 8px;border-bottom:1px solid #ECEAE4;vertical-align:top} tr.cr td{background:#F1F8F3} .det{font-size:10px;color:#4B5563;margin-top:2px}
    tr.end td{background:#F3F2FF;color:#3730A3;font-weight:700;border-bottom:none}
    .obs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px} .ob{display:flex;justify-content:space-between;gap:6px;border:1px solid #E4E2DC;border-radius:8px;padding:6px 8px}
    footer{margin-top:18px;border-top:1px solid #E4E2DC;padding-top:8px;display:flex;justify-content:space-between;font-size:10px;color:#5B6170}
    @media print{body{padding:0}@page{margin:12mm} tr{break-inside:avoid}}
  </style></head><body>
    <header><div><div class="k">Statement of account</div><h1>${e(customer)}</h1><div class="dim">${e(period)}</div></div>
      <div class="r"><div class="dim">Generated</div><b>${e(today)}</b></div></header>
    <div class="hero"><div><div class="k">${e(close)}</div><div class="v m ${due ? 'red' : 'g'}">${e(inr(Math.abs(st.closing)))}</div></div>
      <div class="dim r">${e(st.open.length ? `${st.open.length} bill${st.open.length === 1 ? '' : 's'} open today` : 'No bill open today')}</div></div>
    <div class="sum">
      ${cell(st.from ? `Pending on ${dayLabel(st.from, '')}` : 'Pending before', inr(st.opening), st.from ? 'from earlier bills' : 'none — all time')}
      ${cell('+ Bills', inr(st.bills.sum), `${st.bills.n} challan${st.bills.n === 1 ? '' : 's'}`)}
      ${cell('− Goods returned', inr(st.returns.sum), `${st.returns.n} return${st.returns.n === 1 ? '' : 's'}`, 'gr')}
      ${cell('− Money received', inr(st.received), 'cash, UPI, bank', 'gr')}
      ${st.refunds !== 0 ? cell('+ Refunds paid', inr(st.refunds), 'to the customer') : ''}
      ${cell(`= ${close}`, inr(st.closing), st.to ? dayLabel(st.to, '') : 'today')}
    </div>
    <h2>Day by day</h2>
    <table><thead><tr><th>Date</th><th>What happened</th><th class="r">Bill (+)</th><th class="r">Return / paid (−)</th><th class="r">Balance</th></tr></thead><tbody>
      ${st.from ? `<tr><td class="dim">${e(dayLabel(st.from, ''))}</td><td><b>Pending from before</b></td><td></td><td></td><td class="r m b">${e(inr(st.opening))}</td></tr>` : ''}
      ${rows || '<tr><td colspan="5" class="dim">Nothing billed, returned or paid in this period.</td></tr>'}
      <tr class="end"><td>${e(st.to ? dayLabel(st.to, '') : 'Today')}</td><td>${e(close)}</td><td class="r m">${e(inr(st.bills.sum + st.refunds))}</td><td class="r m">− ${e(inr(st.returns.sum + st.received))}</td><td class="r m">${e(inr(st.closing))}</td></tr>
    </tbody></table>
    ${st.open.length ? `<h2>Bills still open today</h2><div class="obs">${open}</div>` : ''}
    ${st.unusedCredit > 0.009 ? `<p class="g">Return credit not used yet: − ${e(inr(st.unusedCredit))}</p>` : ''}
    <footer><span>Amounts in ₹. Balance = pending + bills − returns − money received.</span><span>Powered by DailyOffice</span></footer>
  </body></html>`;
}
