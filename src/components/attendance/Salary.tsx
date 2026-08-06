// Salary view — runs the engine per active employee for the month, lets the
// owner add penalties and advances (both deduct from this month's net; the
// modal lives in AdjustModal.tsx), stores the month's results, and exports
// in-depth PDF payslips (single or combined; HTML builders in payslip.ts).
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S, Pill } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';
import { AttEmployee, AttEntry, AttPenalty, AttAdvance, AttSalaryPayment, MonthlySalary, computeMonthlySalary, minutesToHM, monthFirstDay } from '../../lib/attendance';
import { payslipBody, combinedSummary, wrapPdf, inr } from './payslip';
import SalaryPaymentFlow from './SalaryPaymentFlow';
import AdjustModal from './AdjustModal';
import { useBackClose } from '../../hooks/useBackClose';
import { docTitle } from '../../lib/exportName';

const leftLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export default function AttendanceSalary({ employees, entries, penalties, advances, savedSalaries, payments, month, onChanged, addToast }: {
  employees: AttEmployee[]; entries: AttEntry[]; penalties: AttPenalty[]; advances: AttAdvance[];
  savedSalaries: Record<string, unknown>[]; payments: AttSalaryPayment[]; month: string;
  onChanged: () => void; addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const canPay = ['admin', 'manager', 'operator'].includes(profile?.role);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const [adjFor, setAdjFor] = useState<{ emp: AttEmployee; kind: 'penalty' | 'advance' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [payFlow, setPayFlow] = useState(false);
  const [q, setQ] = useState('');
  // Armed money chip ("kind:id"): first tap arms, second tap deletes. A single
  // tap on a tiny chip silently removing a money record was too easy to hit
  // by accident on a phone.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  // '-01T00:00:00' parses as LOCAL time — bare '-01' parses as UTC and can
  // label the payslip/toast with the PREVIOUS month west of UTC.
  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
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
  const advByEmp = useMemo(() => {
    const m = new Map<string, AttAdvance[]>();
    advances.forEach(a => { const arr = m.get(a.employee_id) || []; arr.push(a); m.set(a.employee_id, arr); });
    return m;
  }, [advances]);
  const savedByEmp = useMemo(() => new Map(savedSalaries.map(s => [s.employee_id as string, s])), [savedSalaries]);
  const paidByEmp = useMemo(() => new Map(payments.map(p => [p.employee_id, p])), [payments]);

  // Employees whose entries fall INSIDE this month. entriesByEmp also carries
  // the previous month's 6-day tail (it feeds the Sunday rule), so testing it
  // directly kept someone who left in July on August's list forever.
  const monthStart = monthFirstDay(month);
  const hasMonthEntries = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => { if (e.date >= monthStart) set.add(e.employee_id); });
    return set;
  }, [entries, monthStart]);

  // Active employees PLUS deactivated ones that still have data this month —
  // an employee who quit on the 20th must stay payable (final settlement)
  // instead of vanishing from Salary/payslips/kiosk. But once their leaving
  // date is behind the whole month they are gone, unless money is still
  // attached to them here (a penalty, an advance, or a recorded payment).
  const activeEmployees = useMemo(() => employees.filter(e => {
    const money = pensByEmp.has(e.id) || advByEmp.has(e.id) || paidByEmp.has(e.id);
    if (e.left_on && e.left_on < monthStart) return money;
    return e.is_active || hasMonthEntries.has(e.id) || money;
  }), [employees, hasMonthEntries, pensByEmp, advByEmp, paidByEmp, monthStart]);

  const salaries: MonthlySalary[] = useMemo(() =>
    activeEmployees.map(e => computeMonthlySalary(e, entriesByEmp.get(e.id) || [], month, pensByEmp.get(e.id) || [], advByEmp.get(e.id) || [])),
    [activeEmployees, entriesByEmp, pensByEmp, advByEmp, month]);

  const shown = useMemo(() => {
    const sq = q.toLowerCase().trim();
    return sq ? salaries.filter(s => s.name.toLowerCase().includes(sq)) : salaries;
  }, [salaries, q]);

  const totalFinal = shown.reduce((s, x) => s + x.finalSalary, 0);
  const totalExtraMin = shown.reduce((s, x) => s + x.extraMinutes, 0);
  const totalPenalty = shown.reduce((s, x) => s + x.penaltyTotal, 0);
  const totalAdvance = shown.reduce((s, x) => s + x.advanceTotal, 0);

  useEffect(() => { document.body.classList.toggle('modal-open', !!pdfHtml || payFlow); return () => document.body.classList.remove('modal-open'); }, [pdfHtml, payFlow]);
  // Back dismisses this overlay instead of leaving the page (or closing the PWA).
  useBackClose(!!pdfHtml, () => { setPdfHtml(null); });

  // ── Remove a penalty/advance chip (two-tap) ────────────────────────────────
  const removeAdjust = async (kind: 'penalty' | 'advance', id: string) => {
    const key = `${kind}:${id}`;
    if (armed !== key) { setArmed(key); return; } // first tap arms, second deletes
    setArmed(null);
    const { error } = await supabase.from(kind === 'penalty' ? 'attendance_penalties' : 'attendance_advances').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(kind === 'penalty' ? 'Penalty removed' : 'Advance removed', 'success'); onChanged();
  };

  // ── Manual paid toggle (same records the pay kiosk writes) ─────────────────
  // Guard is PER ROW: a global guard silently swallowed a tap on employee B
  // while employee A's round-trip was in flight — a no-op on a money action.
  const [payBusy, setPayBusy] = useState('');
  const togglePaid = async (s: MonthlySalary) => {
    if (payBusy === s.employeeId) return;
    const isPaid = paidByEmp.has(s.employeeId);
    if (isPaid && armed !== `paid:${s.employeeId}`) { setArmed(`paid:${s.employeeId}`); return; } // unmark = two-tap
    setArmed(null); setPayBusy(s.employeeId);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = isPaid
      ? await supabase.from('attendance_salary_payments').delete().eq('employee_id', s.employeeId).eq('month', monthFirstDay(month))
      : await supabase.from('attendance_salary_payments').upsert({ employee_id: s.employeeId, month: monthFirstDay(month), paid_by: user?.id }, { onConflict: 'employee_id,month', ignoreDuplicates: true });
    setPayBusy('');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(isPaid ? `${s.name} unmarked` : `${s.name} marked paid`, 'success'); onChanged();
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
      gross: s.gross, penalty_total: s.penaltyTotal, advance_total: s.advanceTotal, final_salary: s.finalSalary,
      // paidSundays/extra/short ride in the jsonb so a saved month can
      // reproduce the payslip figures without re-running the engine.
      breakdown: { days: s.days, paidSundays: s.paidSundays, extraMinutes: s.extraMinutes, shortMinutes: s.shortMinutes },
      computed_at: new Date().toISOString(), computed_by: user?.id,
    }));
    const { error } = await supabase.from('attendance_salaries').upsert(rows, { onConflict: 'employee_id,month' });
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(`Saved ${rows.length} salary record(s) for ${monthLabel}`, 'success'); onChanged();
  };

  // ── PDF (builders in payslip.ts) ───────────────────────────────────────────
  const slip = (s: MonthlySalary) => payslipBody(s, employees.find(e => e.id === s.employeeId), pensByEmp.get(s.employeeId) || [], advByEmp.get(s.employeeId) || [], monthLabel);
  const exportSingle = (s: MonthlySalary) => setPdfHtml(wrapPdf(slip(s), docTitle('Payslip', s.name, monthLabel)));
  // ALWAYS the full month — "Export All" while a search filter was active
  // used to produce a document claiming to be the month's total while
  // silently omitting everyone the filter hid.
  const exportCombined = () => {
    const allTotal = salaries.reduce((s, x) => s + x.finalSalary, 0);
    setPdfHtml(wrapPdf(combinedSummary(salaries, monthLabel, allTotal) + salaries.map(slip).join(''), docTitle('Salary-Summary', monthLabel)));
  };

  const kpi = (label: string, value: string, color: string) => (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.sora, color, marginTop: 2 }}>{value}</div>
    </div>
  );
  // Deduction chip (penalty = red, advance = blue) with two-tap remove.
  const chip = (kind: 'penalty' | 'advance', id: string, amount: number, note: string | null) => {
    const isArmed = armed === `${kind}:${id}`;
    const c = kind === 'penalty' ? '0.63 0.22 25' : '0.62 0.17 245';
    return (
      <span key={`${kind}:${id}`} onClick={() => removeAdjust(kind, id)} title={isArmed ? 'Tap again to remove' : 'Tap to remove'}
        style={{ fontSize: 10, padding: '4px 9px', borderRadius: 5, background: `oklch(${c} / ${isArmed ? '.22' : '.08'})`, border: `1px solid oklch(${c} / ${isArmed ? '.55' : '.2'})`, color: kind === 'penalty' ? T.re : T.bl, cursor: 'pointer', fontFamily: T.mono, fontWeight: isArmed ? 700 : 400 }}>
        {isArmed ? `Remove −${inr(amount)}? tap again` : <>−{inr(amount)}{kind === 'advance' ? ' adv' : ''}{note ? ` · ${note}` : ''} ✕</>}
      </span>
    );
  };

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
        {kpi('Employees', String(shown.length), T.tx)}
        {kpi('Total Net', inr(totalFinal), T.gr)}
        {kpi('Extra Time', totalExtraMin > 0 ? `+${minutesToHM(totalExtraMin)}h` : '—', totalExtraMin > 0 ? T.gr : T.tx3)}
        {kpi('Penalties', totalPenalty > 0 ? `− ${inr(totalPenalty)}` : '—', totalPenalty > 0 ? T.re : T.tx3)}
        {kpi('Advances', totalAdvance > 0 ? `− ${inr(totalAdvance)}` : '—', totalAdvance > 0 ? T.bl : T.tx3)}
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
          const advs = advByEmp.get(s.employeeId) || [];
          const deductions = s.penaltyTotal + s.advanceTotal;
          return (
            <div key={s.employeeId} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.name}
                    {paidByEmp.has(s.employeeId) && <Pill tone="gr" dot>Paid</Pill>}
                    {saved && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: drift ? 'oklch(0.78 0.18 75 / .14)' : 'oklch(0.72 0.19 145 / .12)', color: drift ? T.yl : T.gr, fontWeight: 700, textTransform: 'uppercase' }}>{drift ? 'Saved (changed)' : 'Saved'}</span>}
                    {s.salary <= 0 && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'oklch(0.63 0.22 25 / .14)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>No salary set</span>}
                    {employees.find(e => e.id === s.employeeId)?.is_active === false && <span title={s.leftOn ? `Left on ${leftLabel(s.leftOn)} — nothing accrues after that day` : 'Deactivated with no leaving date — salary still accrues; set the date from Employees → Edit'} style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'oklch(0.78 0.18 75 / .14)', color: T.yl, fontWeight: 700, textTransform: 'uppercase' }}>{s.leftOn ? `Left ${leftLabel(s.leftOn)}` : 'Inactive · no leaving date'}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, fontFamily: T.mono }}>
                    {s.workDays}W · {s.paidSundays}/{s.sundays}Sun · {s.leaveDays}L · {minutesToHM(s.totalWorkedMinutes)}h · ₹{s.perDaySalary.toLocaleString('en-IN')}/day · ₹{s.perHourSalary.toLocaleString('en-IN')}/hr
                    {s.extraMinutes > 0 && <span style={{ color: T.gr, fontWeight: 700 }}> · +{minutesToHM(s.extraMinutes)}h extra</span>}
                  </div>
                  {(pens.length > 0 || advs.length > 0) && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {pens.map(p => chip('penalty', p.id, Number(p.amount), p.reason))}
                      {advs.map(a => chip('advance', a.id, Number(a.amount), a.note))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Salary</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: s.finalSalary < 0 ? T.re : T.gr }}>{inr(s.finalSalary)}</div>
                  {deductions > 0 && <div style={{ fontSize: 9, color: T.re, fontFamily: T.mono }}>gross {inr(s.gross)} − {inr(deductions)}</div>}
                </div>
              </div>
              <div className="att-salary-actions" style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => setAdjFor({ emp: employees.find(e => e.id === s.employeeId)!, kind: 'penalty' })} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: T.re }}>+ Penalty</button>
                <button onClick={() => setAdjFor({ emp: employees.find(e => e.id === s.employeeId)!, kind: 'advance' })} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: T.bl }}>+ Advance</button>
                <button onClick={() => exportSingle(s)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11 }}>Payslip PDF</button>
                {/* Manual paid toggle — no need to walk the pay kiosk for one
                    person. Unmark is two-tap (removes a money record). */}
                {canPay && (paidByEmp.has(s.employeeId) ? (
                  <button onClick={() => togglePaid(s)} disabled={payBusy === s.employeeId}
                    style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: T.re, fontWeight: armed === `paid:${s.employeeId}` ? 700 : 400, opacity: payBusy === s.employeeId ? 0.5 : 1 }}>
                    {payBusy === s.employeeId ? 'Removing…' : armed === `paid:${s.employeeId}` ? 'Unmark paid? tap again' : 'Unmark paid'}
                  </button>
                ) : (
                  <button onClick={() => togglePaid(s)} disabled={payBusy === s.employeeId || s.salary <= 0} title={s.salary <= 0 ? 'Set a monthly salary first' : undefined}
                    style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: T.gr, opacity: (payBusy === s.employeeId || s.salary <= 0) ? 0.5 : 1, pointerEvents: (payBusy === s.employeeId || s.salary <= 0) ? 'none' : 'auto' }}>
                    {payBusy === s.employeeId ? 'Marking…' : '✓ Mark Paid'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12, border: `1px solid ${T.bd}`, borderRadius: 10 }}>No active employees{q ? ' match your search' : ''}. Add employees and import a timesheet.</div>}
      </div>

      {/* Penalty / Advance modal */}
      {adjFor && (
        <AdjustModal emp={adjFor.emp} kind={adjFor.kind} month={month} monthLabel={monthLabel}
          onClose={() => setAdjFor(null)} onSaved={() => { setAdjFor(null); onChanged(); }} addToast={addToast} />
      )}

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
          penaltiesByEmp={pensByEmp} advancesByEmp={advByEmp} onClose={() => { setPayFlow(false); onChanged(); }} addToast={addToast} />
      )}
    </div>
  );
}
