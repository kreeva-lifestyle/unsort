// Salary payment kiosk — a full-screen, one-employee-at-a-time flow for paying
// out the month's salaries. Shows the employee's name, their uploaded payment QR
// and that month's net amount; "Mark Paid" records the employee-month as paid
// (attendance_salary_payments) and auto-advances to the next person. Paying is
// independent of "Save Month" — the amount comes from the live salary engine.
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S, Icon, Pill } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { AttEmployee, MonthlySalary, AttSalaryPayment, monthFirstDay } from '../../lib/attendance';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function SalaryPaymentFlow({ employees, salaries, payments, month, onClose, addToast }: {
  employees: AttEmployee[]; salaries: MonthlySalary[]; payments: AttSalaryPayment[];
  month: string; onClose: () => void; addToast: (m: string, t?: string) => void;
}) {
  const salaryByEmp = useMemo(() => new Map(salaries.map(s => [s.employeeId, s])), [salaries]);
  const order = employees; // parent passes active + name-sorted employees
  const monthLabel = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const [index, setIndex] = useState(0);
  const [paid, setPaid] = useState<Map<string, string>>(() => new Map(payments.map(p => [p.employee_id, p.paid_at])));
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.body.classList.add('modal-open'); return () => document.body.classList.remove('modal-open'); }, []);

  const advance = () => setIndex(i => Math.min(i + 1, order.length));
  const back = () => setIndex(i => Math.max(i - 1, 0));

  const markPaid = async (emp: AttEmployee) => {
    if (busy) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('attendance_salary_payments')
      .upsert({ employee_id: emp.id, month: monthFirstDay(month), paid_by: user?.id }, { onConflict: 'employee_id,month', ignoreDuplicates: true });
    setBusy(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setPaid(prev => { const m = new Map(prev); m.set(emp.id, new Date().toISOString()); return m; });
    addToast(`${emp.name} marked paid`, 'success');
    advance();
  };

  const unmark = async (emp: AttEmployee) => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from('attendance_salary_payments')
      .delete().eq('employee_id', emp.id).eq('month', monthFirstDay(month));
    setBusy(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setPaid(prev => { const m = new Map(prev); m.delete(emp.id); return m; });
    addToast(`${emp.name} unmarked`, 'success');
  };

  const paidCount = order.reduce((n, e) => n + (paid.has(e.id) ? 1 : 0), 0);
  const done = index >= order.length && order.length > 0;
  const emp = done ? null : order[index];
  const sal: MonthlySalary | undefined = emp ? salaryByEmp.get(emp.id) : undefined;
  const isPaid = emp ? paid.has(emp.id) : false;
  const btnBusy = { pointerEvents: busy ? 'none' as const : 'auto' as const, opacity: busy ? 0.5 : 1 };

  return createPortal((
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', touchAction: 'none', fontFamily: T.sans, color: T.tx }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd2}`, background: 'rgba(8,11,20,.95)' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Pay Salaries</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 1 }}>{monthLabel} · {paidCount}/{order.length} paid</div>
        </div>
        <button onClick={onClose} style={{ ...S.btnGhost, padding: '6px 14px' }}>Close</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
        {order.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.tx3, fontSize: 13 }}>No active employees to pay.</div>
        ) : done ? (
          <div key="done" className="att-pay-card" style={{ textAlign: 'center', maxWidth: 340 }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, margin: '0 auto 16px', background: T.ac3, color: T.ac2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={30} /></div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.sora, color: T.tx }}>All done</div>
            <div style={{ fontSize: 13, color: T.tx2, marginTop: 6 }}>{paidCount} of {order.length} marked paid for {monthLabel}.</div>
            <button onClick={onClose} style={{ ...S.btnPrimary, marginTop: 20 }}>Done</button>
          </div>
        ) : (
          <div key={emp!.id} className="att-pay-card" style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono, letterSpacing: '0.04em' }}>{index + 1} / {order.length}{emp!.employee_code ? ` · ${emp!.employee_code}` : ''}</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.sora, color: T.tx, margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {emp!.name}
              {isPaid && <Pill tone="gr" dot>Paid</Pill>}
            </div>
            <div style={{ width: 220, height: 220, maxWidth: '72vw', maxHeight: '72vw', borderRadius: 14, overflow: 'hidden', background: emp!.qr_image_url ? '#fff' : 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px 0' }}>
              {emp!.qr_image_url
                ? <img src={emp!.qr_image_url} alt={`${emp!.name} payment QR`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <div style={{ padding: 20, color: T.tx3, fontSize: 12, lineHeight: 1.5 }}>No payment QR uploaded.<br />Add one in Employees.</div>}
            </div>
            <div style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Net Salary</div>
            <div style={{ fontSize: 34, fontWeight: 800, fontFamily: T.sora, color: sal && sal.finalSalary < 0 ? T.re : T.tx, lineHeight: 1.1, marginTop: 2 }}>{sal ? inr(sal.finalSalary) : '—'}</div>
            {sal && sal.penaltyTotal > 0 && <div style={{ fontSize: 10, color: T.re, fontFamily: T.mono, marginTop: 3 }}>gross {inr(sal.gross)} − {inr(sal.penaltyTotal)}</div>}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!done && order.length > 0 && (
        <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.bd2}`, background: 'rgba(8,11,20,.95)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {isPaid ? (
              <>
                <button onClick={() => unmark(emp!)} disabled={busy} style={{ ...S.btnGhost, flex: 1, color: T.re, ...btnBusy }}>Unmark</button>
                <button onClick={advance} disabled={busy} style={{ ...S.btnPrimary, flex: 2, ...btnBusy }}>Next</button>
              </>
            ) : (
              <>
                <button onClick={advance} disabled={busy} style={{ ...S.btnGhost, flex: 1, ...btnBusy }}>Skip</button>
                <button onClick={() => markPaid(emp!)} disabled={busy} style={{ ...S.btnSuccessSolid, flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...btnBusy }}><Icon name="check" size={17} />Mark Paid</button>
              </>
            )}
          </div>
          {index > 0 && <button onClick={back} disabled={busy} style={{ background: 'none', border: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', padding: 2, ...btnBusy }}>← Previous</button>}
        </div>
      )}
    </div>
  ), document.body);
}
