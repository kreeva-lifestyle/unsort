// Payslip / salary-summary PDF HTML builders (pure string functions, printed
// via the iframe overlay in Salary.tsx). Extracted from Salary.tsx.
// Layout notes: the sheet is capped at 780px and centred so the day table
// doesn't stretch across a wide preview window, and every column header
// carries the same alignment as its cells (In/Out/Worked/diff/St centred,
// Day Pay right) so headers sit directly above their values.
import { AttEmployee, AttPenalty, MonthlySalary, minutesToHM, fmtDiffHM } from '../../lib/attendance';

export const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const inr2 = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GREEN = '#1a7f37', RED = '#c0392b';

export const payslipBody = (s: MonthlySalary, emp: AttEmployee | undefined, pens: AttPenalty[], monthLabel: string): string => {
  const dayRows = s.days.map(d => `<tr${d.isSunday ? ' style="background:#f1f5ff"' : (d.status === 'A' ? ' style="background:#fdeaea"' : (d.diffMin > 0 ? ' style="background:#effaf3"' : ''))}>
    <td>${esc(new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}</td>
    <td>${esc(d.day)}</td>
    <td style="text-align:center">${esc(d.in_time || '—')}</td>
    <td style="text-align:center">${esc(d.out_time || '—')}</td>
    <td style="text-align:center">${d.workedMin > 0 ? esc(minutesToHM(d.workedMin)) : (d.isSunday ? 'WO' : '—')}</td>
    <td style="text-align:center;font-weight:600;color:${d.diffMin < 0 ? RED : d.diffMin > 0 ? GREEN : '#888'}">${d.workedMin > 0 ? esc(fmtDiffHM(d.diffMin)) : '—'}</td>
    <td style="text-align:right">${d.dayPay > 0 ? esc(inr2(d.dayPay)) : '—'}</td>
    <td style="text-align:center">${esc(d.status)}</td>
  </tr>`).join('');
  const penRows = pens.map(p => `<div class="pen"><span>Penalty — ${p.reason ? esc(p.reason) : 'no note'}</span><span style="color:${RED};font-weight:600">− ${esc(inr2(Number(p.amount)))}</span></div>`).join('');
  return `<div class="slip">
    <div class="head"><div><div class="nm">${esc(s.name)}</div><div class="sub">${esc(emp?.employee_code || '')} · ${esc(monthLabel)}</div></div>
      <div class="final"><div class="fl">Net Salary</div><div class="fv" style="color:${s.finalSalary < 0 ? RED : GREEN}">${esc(inr(s.finalSalary))}</div></div></div>
    <div class="basis">Monthly salary ${esc(inr(s.salary))} · Fix time ${esc(minutesToHM(s.fixTimeMinutes))}/day · Days in month ${s.daysInMonth} (calendar) · Per-day ${esc(inr2(s.perDaySalary))} · Per-hour ${esc(inr2(s.perHourSalary))}</div>
    <table class="days"><thead><tr><th>Date</th><th>Day</th><th class="c">In</th><th class="c">Out</th><th class="c">Worked</th><th class="c">+/− vs fix</th><th class="r">Day Pay</th><th class="c">St</th></tr></thead><tbody>${dayRows}</tbody></table>
    <div class="totals">
      <div><span>Worked days</span><span>${s.workDays}</span></div>
      <div><span>Paid Sundays</span><span>${s.sundays} × ${esc(inr2(s.perDaySalary))} = ${esc(inr2(s.sundayPay))}</span></div>
      <div><span>Leave days (unpaid)</span><span>${s.leaveDays}</span></div>
      <div><span>Total worked hours</span><span>${esc(minutesToHM(s.totalWorkedMinutes))}</span></div>
      ${s.extraMinutes > 0 ? `<div><span>Extra time worked (paid in day pay)</span><span style="color:${GREEN};font-weight:600">+${esc(minutesToHM(s.extraMinutes))}</span></div>` : ''}
      ${s.shortMinutes > 0 ? `<div><span>Short time (below fix)</span><span style="color:${RED}">−${esc(minutesToHM(s.shortMinutes))}</span></div>` : ''}
      <div class="rule"><span>Earned (worked)</span><span>${esc(inr2(s.earned))}</span></div>
      <div><span>Sunday pay</span><span>+ ${esc(inr2(s.sundayPay))}</span></div>
      <div class="rule"><span>Gross</span><span>${esc(inr2(s.gross))}</span></div>
      ${penRows}
      ${s.penaltyTotal > 0 ? `<div><span>Total penalties</span><span style="color:${RED};font-weight:700">− ${esc(inr2(s.penaltyTotal))}</span></div>` : ''}
      <div class="final-row" style="color:${s.finalSalary < 0 ? RED : GREEN}"><span>Net Salary (rounded)</span><span>${esc(inr(s.finalSalary))}</span></div>
    </div>
  </div>`;
};

export const combinedSummary = (shown: MonthlySalary[], monthLabel: string, totalFinal: number): string => {
  const rowsHtml = shown.map(s => `<tr><td>${esc(s.name)}</td><td class="c">${s.workDays}</td><td class="c">${s.sundays}</td><td class="c">${s.leaveDays}</td><td class="c">${esc(minutesToHM(s.totalWorkedMinutes))}</td><td class="c" style="color:${s.extraMinutes > 0 ? GREEN : '#888'};font-weight:600">${s.extraMinutes > 0 ? '+' + esc(minutesToHM(s.extraMinutes)) : '—'}</td><td style="text-align:right">${esc(inr2(s.gross))}</td><td style="text-align:right;color:${RED}">${s.penaltyTotal > 0 ? '− ' + esc(inr2(s.penaltyTotal)) : '—'}</td><td style="text-align:right;font-weight:800">${esc(inr(s.finalSalary))}</td></tr>`).join('');
  return `<h1>Salary Summary</h1><div class="muted">${esc(monthLabel)} · ${shown.length} employees · Total net ${esc(inr(totalFinal))}</div>
    <table class="days" style="font-size:11px"><thead><tr><th>Employee</th><th class="c">Work</th><th class="c">Sun</th><th class="c">Leave</th><th class="c">Worked hrs</th><th class="c">Extra</th><th class="r">Gross</th><th class="r">Penalty</th><th class="r">Net</th></tr></thead><tbody>${rowsHtml}
    <tr style="border-top:2px solid #2d3748;font-weight:800"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td style="text-align:right">${esc(inr(totalFinal))}</td></tr></tbody></table>
    <div style="page-break-after:always"></div>`;
};

export const wrapPdf = (body: string, title: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  *{box-sizing:border-box} body{font-family:'Inter',Arial,sans-serif;color:#1a202c;font-size:12px;margin:0 auto;padding:20px;background:#fff;max-width:780px}
  h1{font-size:18px;margin:0 0 2px} .muted{color:#718096;font-size:11px;margin-bottom:14px}
  .slip{page-break-inside:avoid;margin-bottom:26px;border:1px solid #e2e8f0;border-radius:10px;padding:16px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
  .nm{font-size:16px;font-weight:800} .sub{color:#718096;font-size:11px;margin-top:2px}
  .final{text-align:right} .fl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a0aec0}
  .fv{font-size:22px;font-weight:800;color:#1a7f37}
  .basis{background:#f7fafc;border-radius:6px;padding:8px 10px;font-size:10.5px;color:#4a5568;margin-bottom:10px}
  table.days{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
  table.days th{background:#f1f5f9;text-align:left;padding:5px 7px;border-bottom:1px solid #cbd5e0;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#64748b}
  table.days th.c{text-align:center} table.days th.r{text-align:right} table.days td.c{text-align:center}
  table.days td{padding:4px 7px;border-bottom:1px solid #edf2f7}
  .totals{max-width:360px;margin-left:auto;font-size:11.5px}
  .totals div{display:flex;justify-content:space-between;padding:3px 0}
  .totals .pen{background:#fdf3f3;border-radius:4px;padding:3px 6px;margin:1px 0}
  .totals .rule{border-top:1px solid #cbd5e0;margin-top:3px;padding-top:5px;font-weight:600}
  .totals .final-row{border-top:2px solid #2d3748;margin-top:5px;padding-top:6px;font-weight:800;font-size:14px;color:#1a7f37}
  .foot{margin-top:14px;text-align:center;color:#a0aec0;font-size:9px}
  @media print{body{padding:8px}@page{margin:12mm}}
</style></head><body>${body}<div class="foot">Arya Designs · Generated ${esc(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))} · Powered by DailyOffice</div></body></html>`;
