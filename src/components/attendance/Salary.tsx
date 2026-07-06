// Salary view — runs the engine per active employee for the month, lets the
// owner add penalties (time-passing deductions), stores the month's results,
// and exports in-depth PDF payslips (single or combined).
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { AttEmployee, AttEntry, AttPenalty, MonthlySalary, computeMonthlySalary, minutesToHM, monthFirstDay } from '../../lib/attendance';

const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const inr2 = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AttendanceSalary({ employees, entries, penalties, savedSalaries, month, onChanged, addToast }: {
  employees: AttEmployee[]; entries: AttEntry[]; penalties: AttPenalty[];
  savedSalaries: Record<string, unknown>[]; month: string;
  onChanged: () => void; addToast: (m: string, t?: string) => void;
}) {
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const [penFor, setPenFor] = useState<AttEmployee | null>(null);
  const [penAmt, setPenAmt] = useState('');
  const [penReason, setPenReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const activeEmployees = useMemo(() => employees.filter(e => e.is_active), [employees]);
  const entriesByEmp = useMemo(() => {
    const m = new Map<string, AttEntry[]>();
    entries.forEach(e => { const a = m.get(e.employee_id) || []; a.push(e); m.set(e.employee_id, a); });
    return m;
  }, [entries]);
  const pensByEmp = useMemo(() => {
    const m = new Map<string, AttPenalty[]>();
    penalties.forEach(p => { const a = m.get(p.employee_id) || []; a.push(p); m.set(p.employee_id, a); });
    return m;
  }, [penalties]);
  const savedByEmp = useMemo(() => new Map(savedSalaries.map(s => [s.employee_id as string, s])), [savedSalaries]);

  const salaries: MonthlySalary[] = useMemo(() =>
    activeEmployees.map(e => computeMonthlySalary(e, entriesByEmp.get(e.id) || [], month, pensByEmp.get(e.id) || [])),
    [activeEmployees, entriesByEmp, pensByEmp, month]);

  const shown = useMemo(() => {
    const sq = q.toLowerCase().trim();
    return sq ? salaries.filter(s => s.name.toLowerCase().includes(sq)) : salaries;
  }, [salaries, q]);

  const totalFinal = shown.reduce((s, x) => s + x.finalSalary, 0);

  useEffect(() => { document.body.classList.toggle('modal-open', !!penFor || !!pdfHtml); return () => document.body.classList.remove('modal-open'); }, [penFor, pdfHtml]);

  // ── Penalty ────────────────────────────────────────────────────────────────
  const savePenalty = async () => {
    if (!penFor) return;
    const amt = Number(penAmt);
    if (!Number.isFinite(amt) || amt <= 0) { addToast('Enter a penalty amount greater than 0', 'error'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('attendance_penalties').insert({ employee_id: penFor.id, month: monthFirstDay(month), amount: amt, reason: penReason.trim() || null, created_by: user?.id });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(`Penalty ${inr(amt)} added for ${penFor.name}`, 'success');
    setPenFor(null); setPenAmt(''); setPenReason(''); onChanged();
  };
  const removePenalty = async (p: AttPenalty) => {
    const { error } = await supabase.from('attendance_penalties').delete().eq('id', p.id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Penalty removed', 'success'); onChanged();
  };

  // ── Save month ─────────────────────────────────────────────────────────────
  const saveMonth = async () => {
    if (saving) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const rows = salaries.map(s => ({
      employee_id: s.employeeId, month: monthFirstDay(month), days_in_month: s.daysInMonth,
      work_days: s.workDays, sundays: s.sundays, leave_days: s.leaveDays, total_worked_minutes: s.totalWorkedMinutes,
      per_day_salary: s.perDaySalary, per_hour_salary: s.perHourSalary, earned: s.earned, sunday_pay: s.sundayPay,
      gross: s.gross, penalty_total: s.penaltyTotal, final_salary: s.finalSalary,
      breakdown: { days: s.days }, computed_at: new Date().toISOString(), computed_by: user?.id,
    }));
    const { error } = await supabase.from('attendance_salaries').upsert(rows, { onConflict: 'employee_id,month' });
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(`Saved ${rows.length} salary record(s) for ${monthLabel}`, 'success'); onChanged();
  };

  // ── PDF ────────────────────────────────────────────────────────────────────
  const payslipBody = (s: MonthlySalary): string => {
    const emp = employees.find(e => e.id === s.employeeId);
    const pens = pensByEmp.get(s.employeeId) || [];
    const dayRows = s.days.map(d => `<tr${d.isSunday ? ' style="background:#f1f5ff"' : (d.status === 'A' ? ' style="background:#fdeaea"' : '')}>
      <td>${esc(new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}</td>
      <td>${esc(d.day)}</td>
      <td style="text-align:center">${esc(d.in_time || '—')}</td>
      <td style="text-align:center">${esc(d.out_time || '—')}</td>
      <td style="text-align:center">${d.workedMin > 0 ? esc(minutesToHM(d.workedMin)) : (d.isSunday ? 'WO' : '—')}</td>
      <td style="text-align:center;color:${d.diffMin < 0 ? '#c0392b' : d.diffMin > 0 ? '#1a7f37' : '#888'}">${d.workedMin > 0 ? esc(minutesToHM(d.diffMin)) : '—'}</td>
      <td style="text-align:right">${d.dayPay > 0 ? esc(inr2(d.dayPay)) : '—'}</td>
      <td style="text-align:center">${esc(d.status)}</td>
    </tr>`).join('');
    const penRows = pens.map(p => `<div style="display:flex;justify-content:space-between"><span>Penalty${p.reason ? ' — ' + esc(p.reason) : ''}</span><span style="color:#c0392b">− ${esc(inr2(Number(p.amount)))}</span></div>`).join('');
    return `<div class="slip">
      <div class="head"><div><div class="nm">${esc(s.name)}</div><div class="sub">${esc(emp?.employee_code || '')} · ${esc(monthLabel)}</div></div>
        <div class="final"><div class="fl">Net Salary</div><div class="fv">${esc(inr(s.finalSalary))}</div></div></div>
      <div class="basis">Monthly salary ${esc(inr(s.salary))} · Fix time ${esc(minutesToHM(s.fixTimeMinutes))}/day · Days in month ${s.daysInMonth} (calendar) · Per-day ${esc(inr2(s.perDaySalary))} · Per-hour ${esc(inr2(s.perHourSalary))}</div>
      <table class="days"><thead><tr><th>Date</th><th>Day</th><th>In</th><th>Out</th><th>Worked</th><th>+/− vs fix</th><th>Day Pay</th><th>St</th></tr></thead><tbody>${dayRows}</tbody></table>
      <div class="totals">
        <div><span>Worked days</span><span>${s.workDays}</span></div>
        <div><span>Paid Sundays</span><span>${s.sundays} × ${esc(inr2(s.perDaySalary))} = ${esc(inr2(s.sundayPay))}</span></div>
        <div><span>Leave days (unpaid)</span><span>${s.leaveDays}</span></div>
        <div><span>Total worked hours</span><span>${esc(minutesToHM(s.totalWorkedMinutes))}</span></div>
        <div class="rule"><span>Earned (worked)</span><span>${esc(inr2(s.earned))}</span></div>
        <div><span>Sunday pay</span><span>+ ${esc(inr2(s.sundayPay))}</span></div>
        <div class="rule"><span>Gross</span><span>${esc(inr2(s.gross))}</span></div>
        ${penRows}
        ${s.penaltyTotal > 0 ? `<div><span>Total penalties</span><span style="color:#c0392b">− ${esc(inr2(s.penaltyTotal))}</span></div>` : ''}
        <div class="final-row"><span>Net Salary (rounded)</span><span>${esc(inr(s.finalSalary))}</span></div>
      </div>
    </div>`;
  };

  const wrap = (body: string, title: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    *{box-sizing:border-box} body{font-family:'Inter',Arial,sans-serif;color:#1a202c;font-size:12px;margin:0;padding:20px;background:#fff}
    h1{font-size:18px;margin:0 0 2px} .muted{color:#718096;font-size:11px;margin-bottom:14px}
    .slip{page-break-inside:avoid;margin-bottom:26px;border:1px solid #e2e8f0;border-radius:10px;padding:16px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    .nm{font-size:16px;font-weight:800} .sub{color:#718096;font-size:11px;margin-top:2px}
    .final{text-align:right} .fl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a0aec0}
    .fv{font-size:22px;font-weight:800;color:#1a7f37}
    .basis{background:#f7fafc;border-radius:6px;padding:8px 10px;font-size:10.5px;color:#4a5568;margin-bottom:10px}
    table.days{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
    table.days th{background:#f1f5f9;text-align:left;padding:5px 7px;border-bottom:1px solid #cbd5e0;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#64748b}
    table.days td{padding:4px 7px;border-bottom:1px solid #edf2f7}
    .totals{max-width:360px;margin-left:auto;font-size:11.5px}
    .totals div{display:flex;justify-content:space-between;padding:3px 0}
    .totals .rule{border-top:1px solid #cbd5e0;margin-top:3px;padding-top:5px;font-weight:600}
    .totals .final-row{border-top:2px solid #2d3748;margin-top:5px;padding-top:6px;font-weight:800;font-size:14px;color:#1a7f37}
    .foot{margin-top:14px;text-align:center;color:#a0aec0;font-size:9px}
    @media print{body{padding:8px}@page{margin:12mm}}
  </style></head><body>${body}<div class="foot">Arya Designs · Generated ${esc(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))} · Powered by DailyOffice</div></body></html>`;

  const exportSingle = (s: MonthlySalary) => setPdfHtml(wrap(`<h1>Salary Slip</h1><div class="muted">${esc(monthLabel)}</div>${payslipBody(s)}`, `Salary — ${s.name}`));
  const exportCombined = () => {
    const rowsHtml = shown.map(s => `<tr><td>${esc(s.name)}</td><td style="text-align:center">${s.workDays}</td><td style="text-align:center">${s.sundays}</td><td style="text-align:center">${s.leaveDays}</td><td style="text-align:center">${esc(minutesToHM(s.totalWorkedMinutes))}</td><td style="text-align:right">${esc(inr2(s.gross))}</td><td style="text-align:right;color:#c0392b">${s.penaltyTotal > 0 ? '− ' + esc(inr2(s.penaltyTotal)) : '—'}</td><td style="text-align:right;font-weight:800">${esc(inr(s.finalSalary))}</td></tr>`).join('');
    const summary = `<h1>Salary Summary</h1><div class="muted">${esc(monthLabel)} · ${shown.length} employees · Total net ${esc(inr(totalFinal))}</div>
      <table class="days" style="font-size:11px"><thead><tr><th>Employee</th><th>Work</th><th>Sun</th><th>Leave</th><th>Worked hrs</th><th style="text-align:right">Gross</th><th style="text-align:right">Penalty</th><th style="text-align:right">Net</th></tr></thead><tbody>${rowsHtml}
      <tr style="border-top:2px solid #2d3748;font-weight:800"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td><td style="text-align:right">${esc(inr(totalFinal))}</td></tr></tbody></table>
      <div style="page-break-after:always"></div>`;
    const detail = shown.map(payslipBody).join('');
    setPdfHtml(wrap(summary + detail, `Salary Summary — ${monthLabel}`));
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 150 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employee…" style={{ ...S.fSearch, width: '100%' }} />
        </div>
        <button onClick={exportCombined} disabled={shown.length === 0} style={{ ...S.btnGhost, opacity: shown.length === 0 ? 0.4 : 1 }}>Export All (PDF)</button>
        <button onClick={saveMonth} disabled={saving || salaries.length === 0} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving || salaries.length === 0 ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save Month'}</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, marginBottom: 8 }}>
        <span>{monthLabel} · {shown.length} employee{shown.length !== 1 ? 's' : ''}</span>
        <span>Total net: <strong style={{ color: T.tx, fontFamily: T.mono }}>{inr(totalFinal)}</strong></span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(s => {
          const saved = savedByEmp.get(s.employeeId);
          const savedFinal = saved ? Number(saved.final_salary) : null;
          const drift = savedFinal !== null && savedFinal !== s.finalSalary;
          const pens = pensByEmp.get(s.employeeId) || [];
          return (
            <div key={s.employeeId} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.name}
                    {saved && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: drift ? 'rgba(245,158,11,.14)' : 'rgba(34,197,94,.12)', color: drift ? T.yl : T.gr, fontWeight: 700, textTransform: 'uppercase' }}>{drift ? 'Saved (changed)' : 'Saved'}</span>}
                    {s.salary <= 0 && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(239,68,68,.14)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>No salary set</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, fontFamily: T.mono }}>
                    {s.workDays}W · {s.sundays}Sun · {s.leaveDays}L · {minutesToHM(s.totalWorkedMinutes)}h · ₹{s.perDaySalary.toLocaleString('en-IN')}/day · ₹{s.perHourSalary.toLocaleString('en-IN')}/hr
                  </div>
                  {pens.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {pens.map(p => (
                        <span key={p.id} onClick={() => removePenalty(p)} title="Click to remove" style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: T.re, cursor: 'pointer', fontFamily: T.mono }}>−{inr(Number(p.amount))}{p.reason ? ` · ${p.reason}` : ''} ✕</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Salary</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.gr }}>{inr(s.finalSalary)}</div>
                  {s.penaltyTotal > 0 && <div style={{ fontSize: 9, color: T.re, fontFamily: T.mono }}>gross {inr(s.gross)} − {inr(s.penaltyTotal)}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button onClick={() => { setPenFor(employees.find(e => e.id === s.employeeId) || null); setPenAmt(''); setPenReason(''); }} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: T.re }}>+ Penalty</button>
                <button onClick={() => exportSingle(s)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11 }}>Payslip PDF</button>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12, border: `1px solid ${T.bd}`, borderRadius: 10 }}>No active employees{q ? ' match your search' : ''}. Add employees and import a timesheet.</div>}
      </div>

      {/* Penalty modal */}
      {penFor && createPortal((
        <div style={{ ...S.modalOverlay }} onClick={() => setPenFor(null)}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 380 }} onClick={ev => ev.stopPropagation()}>
            <div style={S.modalHead}><div style={S.modalTitle}>Penalty — {penFor.name}</div><span onClick={() => setPenFor(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span></div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>Deduct for time-passing / policy breach during {monthLabel}. Subtracts from the net salary.</div>
              <div style={{ marginBottom: 10 }}>
                <label style={S.fLabel}>Amount (₹)</label>
                <input type="number" min="1" value={penAmt} onKeyDown={e => numericKeyDown(e)} onChange={e => setPenAmt(e.target.value)} placeholder="500" autoFocus style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={S.fLabel}>Reason (optional)</label>
                <input value={penReason} onChange={e => setPenReason(e.target.value)} placeholder="Late / idle during shift" style={{ ...S.fInput, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPenFor(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                <button onClick={savePenalty} style={{ ...S.btnDanger, flex: 1 }}>Add Penalty</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* PDF preview overlay */}
      {pdfHtml && createPortal((
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Salary PDF</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPdfHtml(null)} style={{ ...S.btnGhost, flex: 1, maxWidth: 120 }}>Close</button>
              <button onClick={() => { const f = document.getElementById('att-pdf-frame') as HTMLIFrameElement | null; f?.contentWindow?.focus(); f?.contentWindow?.print(); }} style={{ ...S.btnPrimary, flex: 1, maxWidth: 160 }}>Print / Save</button>
            </div>
          </div>
          <iframe id="att-pdf-frame" title="Salary PDF" srcDoc={pdfHtml} style={{ flex: 1, border: 'none', background: '#fff' }} />
        </div>
      ), document.body)}
    </div>
  );
}
