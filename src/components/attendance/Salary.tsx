// Salary view — runs the engine per active employee for the month, lets the
// owner add penalties (each with a mandatory note so the employee knows what
// the deduction is for), stores the month's results, and exports in-depth PDF
// payslips (single or combined; HTML builders live in payslip.ts).
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S, Pill } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { useAuth } from '../../hooks/useAuth';
import { AttEmployee, AttEntry, AttPenalty, AttSalaryPayment, MonthlySalary, computeMonthlySalary, minutesToHM, monthFirstDay } from '../../lib/attendance';
import { payslipBody, combinedSummary, wrapPdf, inr } from './payslip';
import SalaryPaymentFlow from './SalaryPaymentFlow';

export default function AttendanceSalary({ employees, entries, penalties, savedSalaries, payments, month, onChanged, addToast }: {
  employees: AttEmployee[]; entries: AttEntry[]; penalties: AttPenalty[];
  savedSalaries: Record<string, unknown>[]; payments: AttSalaryPayment[]; month: string;
  onChanged: () => void; addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const canPay = ['admin', 'manager', 'operator'].includes(profile?.role);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const [penFor, setPenFor] = useState<AttEmployee | null>(null);
  const [penAmt, setPenAmt] = useState('');
  const [penReason, setPenReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPen, setSavingPen] = useState(false);
  const [payFlow, setPayFlow] = useState(false);
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
  const paidByEmp = useMemo(() => new Map(payments.map(p => [p.employee_id, p])), [payments]);

  const salaries: MonthlySalary[] = useMemo(() =>
    activeEmployees.map(e => computeMonthlySalary(e, entriesByEmp.get(e.id) || [], month, pensByEmp.get(e.id) || [])),
    [activeEmployees, entriesByEmp, pensByEmp, month]);

  const shown = useMemo(() => {
    const sq = q.toLowerCase().trim();
    return sq ? salaries.filter(s => s.name.toLowerCase().includes(sq)) : salaries;
  }, [salaries, q]);

  const totalFinal = shown.reduce((s, x) => s + x.finalSalary, 0);
  const totalExtraMin = shown.reduce((s, x) => s + x.extraMinutes, 0);
  const totalPenalty = shown.reduce((s, x) => s + x.penaltyTotal, 0);

  useEffect(() => { document.body.classList.toggle('modal-open', !!penFor || !!pdfHtml || payFlow); return () => document.body.classList.remove('modal-open'); }, [penFor, pdfHtml, payFlow]);

  // ── Penalty ────────────────────────────────────────────────────────────────
  const savePenalty = async () => {
    if (!penFor || savingPen) return;
    const amt = Number(penAmt);
    if (!Number.isFinite(amt) || amt <= 0) { addToast('Enter a penalty amount greater than 0', 'error'); return; }
    if (!penReason.trim()) { addToast('Add a note — the employee should know what this deduction is for', 'error'); return; }
    setSavingPen(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('attendance_penalties').insert({ employee_id: penFor.id, month: monthFirstDay(month), amount: amt, reason: penReason.trim() || null, created_by: user?.id });
    setSavingPen(false);
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

  // ── PDF (builders in payslip.ts) ───────────────────────────────────────────
  const slip = (s: MonthlySalary) => payslipBody(s, employees.find(e => e.id === s.employeeId), pensByEmp.get(s.employeeId) || [], monthLabel);
  const exportSingle = (s: MonthlySalary) => setPdfHtml(wrapPdf(slip(s), `Salary — ${s.name}`));
  const exportCombined = () => setPdfHtml(wrapPdf(combinedSummary(shown, monthLabel, totalFinal) + shown.map(slip).join(''), `Salary Summary — ${monthLabel}`));

  return (
    <div>
      <div className="att-filters" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 150 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employee…" style={{ ...S.fSearch, width: '100%' }} />
        </div>
        <div className="att-filter-actions" style={{ display: 'flex', gap: 6 }}>
          <button onClick={exportCombined} disabled={shown.length === 0} style={{ ...S.btnGhost, opacity: shown.length === 0 ? 0.4 : 1 }}>Export All (PDF)</button>
          {canPay && <button onClick={() => setPayFlow(true)} disabled={salaries.length === 0} style={{ ...S.btnSuccessSolid, opacity: salaries.length === 0 ? 0.5 : 1, pointerEvents: salaries.length === 0 ? 'none' : 'auto' }}>Pay Salaries</button>}
          <button onClick={saveMonth} disabled={saving || salaries.length === 0} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving || salaries.length === 0 ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save Month'}</button>
        </div>
      </div>

      <div className="att-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Employees</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.sora, color: T.tx, marginTop: 2 }}>{shown.length}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Total Net</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.sora, color: T.gr, marginTop: 2 }}>{inr(totalFinal)}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Extra Time</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.sora, color: totalExtraMin > 0 ? T.gr : T.tx3, marginTop: 2 }}>{totalExtraMin > 0 ? `+${minutesToHM(totalExtraMin)}h` : '—'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Penalties</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.sora, color: totalPenalty > 0 ? T.re : T.tx3, marginTop: 2 }}>{totalPenalty > 0 ? `− ${inr(totalPenalty)}` : '—'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Month</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.sora, color: T.tx2, marginTop: 4 }}>{monthLabel}</div>
        </div>
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
                    {paidByEmp.has(s.employeeId) && <Pill tone="gr" dot>Paid</Pill>}
                    {saved && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: drift ? 'oklch(0.78 0.18 75 / .14)' : 'oklch(0.72 0.19 145 / .12)', color: drift ? T.yl : T.gr, fontWeight: 700, textTransform: 'uppercase' }}>{drift ? 'Saved (changed)' : 'Saved'}</span>}
                    {s.salary <= 0 && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'oklch(0.63 0.22 25 / .14)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>No salary set</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, fontFamily: T.mono }}>
                    {s.workDays}W · {s.paidSundays}/{s.sundays}Sun · {s.leaveDays}L · {minutesToHM(s.totalWorkedMinutes)}h · ₹{s.perDaySalary.toLocaleString('en-IN')}/day · ₹{s.perHourSalary.toLocaleString('en-IN')}/hr
                    {s.extraMinutes > 0 && <span style={{ color: T.gr, fontWeight: 700 }}> · +{minutesToHM(s.extraMinutes)}h extra</span>}
                  </div>
                  {pens.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {pens.map(p => (
                        <span key={p.id} onClick={() => removePenalty(p)} title="Click to remove" style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', color: T.re, cursor: 'pointer', fontFamily: T.mono }}>−{inr(Number(p.amount))}{p.reason ? ` · ${p.reason}` : ''} ✕</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Salary</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: s.finalSalary < 0 ? T.re : T.gr }}>{inr(s.finalSalary)}</div>
                  {s.penaltyTotal > 0 && <div style={{ fontSize: 9, color: T.re, fontFamily: T.mono }}>gross {inr(s.gross)} − {inr(s.penaltyTotal)}</div>}
                </div>
              </div>
              <div className="att-salary-actions" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
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
                <label style={S.fLabel}>Note — what is this deduction for?</label>
                <input value={penReason} onChange={e => setPenReason(e.target.value)} placeholder="e.g. Late 3 days / idle during shift" style={{ ...S.fInput, width: '100%' }} />
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Required — shown on the payslip and pay screen so the employee understands the deduction.</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPenFor(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                <button onClick={savePenalty} disabled={savingPen} style={{ ...S.btnDanger, flex: 1, pointerEvents: savingPen ? 'none' : 'auto', opacity: savingPen ? 0.5 : 1 }}>{savingPen ? 'Adding…' : 'Add Penalty'}</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* PDF preview overlay */}
      {pdfHtml && createPortal((
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', touchAction: 'none', paddingBottom: 'env(safe-area-inset-bottom)' }}>
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

      {/* Mobile "Pay" FAB */}
      {canPay && salaries.length > 0 && (
        <button className="fab mobile-only" onClick={() => setPayFlow(true)} aria-label="Pay salaries"
          style={{ background: 'linear-gradient(135deg, #16A34A, #22C55E)', fontSize: 12, fontWeight: 700, fontFamily: T.sans }}>Pay</button>
      )}

      {/* Salary payment kiosk */}
      {payFlow && (
        <SalaryPaymentFlow employees={activeEmployees} salaries={salaries} payments={payments} month={month}
          penaltiesByEmp={pensByEmp} onClose={() => { setPayFlow(false); onChanged(); }} addToast={addToast} />
      )}
    </div>
  );
}
