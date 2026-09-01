// Attendance module shell — owns data fetching (employees, month entries,
// penalties, saved salaries); the three views are presentational children.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { T, S } from '../lib/theme';
import DateInput from '../components/ui/DateInput';
import { friendlyError } from '../lib/friendlyError';
import { useNotifications } from '../hooks/useNotifications';
import { AttEmployee, AttEntry, AttPenalty, AttAdvance, AttSalaryPayment, monthFirstDay } from '../lib/attendance';
import AttendanceEmployees from '../components/attendance/Employees';
import AttendanceTimesheet from '../components/attendance/Timesheet';
import AttendanceSalary from '../components/attendance/Salary';
import ImportExcel from '../components/attendance/ImportExcel';

const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function Attendance() {
  const { addToast } = useNotifications();
  const [view, setView] = useState<'timesheet' | 'salary' | 'employees'>('timesheet');
  const [month, setMonth] = useState(localMonth());
  const [employees, setEmployees] = useState<AttEmployee[]>([]);
  const [entries, setEntries] = useState<AttEntry[]>([]);
  const [penalties, setPenalties] = useState<AttPenalty[]>([]);
  const [advances, setAdvances] = useState<AttAdvance[]>([]);
  const [savedSalaries, setSavedSalaries] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<AttSalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase.from('attendance_employees')
      .select('id, employee_code, name, salary, fix_time_minutes, is_active, qr_image_url, left_on').order('name').limit(300);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setEmployees((data as AttEmployee[]) || []);
  }, [addToast]);

  // silent: refresh data WITHOUT the loading spinner. The spinner swap
  // unmounts the child views, which resets Timesheet's filters/scroll and
  // Salary's search after every one-row edit — so post-edit refreshes are
  // silent; only first load and month changes go loud.
  // fetchSeq: EVERY fetch (loud, silent, post-import) takes a sequence number
  // and only the newest may write state. Without it, a silent post-edit
  // refetch of August landing after a switch to September silently replaced
  // September's data — and Save Month would then write August numbers under
  // September. The old isCurrent() guard only covered the month effect.
  const fetchSeq = useRef(0);
  const fetchMonth = useCallback(async (m: string, silent = false) => {
    const seq = ++fetchSeq.current;
    if (!silent) setLoading(true);
    const from = monthFirstDay(m);
    const [y, mo] = m.split('-').map(Number);
    const to = `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
    // Fetch starts 6 days BEFORE the month: the paid-Sunday rule judges the
    // 6 calendar days preceding each Sunday, across the month boundary. The
    // engine never pays out-of-month days; Timesheet filters them out.
    const tail = new Date(y, mo - 1, -5);
    const tailFrom = `${tail.getFullYear()}-${String(tail.getMonth() + 1).padStart(2, '0')}-${String(tail.getDate()).padStart(2, '0')}`;
    const [en, pe, ad, sa, pa] = await Promise.all([
      supabase.from('attendance_entries').select('id, employee_id, date, day, shift_id, in_time, out_time, location_in, location_out, status, remarks, manager_remarks').gte('date', tailFrom).lte('date', to).order('date').limit(4000),
      supabase.from('attendance_penalties').select('id, employee_id, month, amount, reason').eq('month', from),
      supabase.from('attendance_advances').select('id, employee_id, month, amount, note').eq('month', from),
      supabase.from('attendance_salaries').select('id, employee_id, month, days_in_month, work_days, sundays, leave_days, total_worked_minutes, per_day_salary, per_hour_salary, earned, sunday_pay, gross, penalty_total, advance_total, final_salary, computed_at').eq('month', from),
      supabase.from('attendance_salary_payments').select('id, employee_id, month, paid_at, paid_by').eq('month', from),
    ]);
    if (seq !== fetchSeq.current) return; // superseded — never write stale data
    const err = en.error || pe.error || ad.error || sa.error || pa.error;
    if (err) addToast(friendlyError(err), 'error');
    if ((en.data?.length || 0) >= 4000) addToast('This month has more attendance rows than can be loaded (4,000) — salary figures may be incomplete', 'error');
    setEntries((en.data as AttEntry[]) || []);
    setPenalties((pe.data as AttPenalty[]) || []);
    setAdvances((ad.data as AttAdvance[]) || []);
    setSavedSalaries((sa.data as Record<string, unknown>[]) || []);
    setPayments((pa.data as AttSalaryPayment[]) || []);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { fetchMonth(month); }, [month, fetchMonth]);

  const tabBtn = (id: typeof view, label: string) => (
    <button key={id} onClick={() => setView(id)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: view === id ? T.ac3 : 'transparent', color: view === id ? T.ac2 : T.tx3, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, transition: 'background .15s, color .15s' }}>{label}</button>
  );

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div className="att-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="att-tabs" style={{ display: 'inline-flex', gap: 3, alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 3 }}>
          {tabBtn('timesheet', 'Timesheet')}
          {tabBtn('salary', 'Salary')}
          {tabBtn('employees', 'Employees')}
        </div>
        {/* The employee roster is month-independent — a month picker and an
            Excel import there only invite the wrong action. */}
        {view !== 'employees' && (
          <div className="att-controls" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <DateInput type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Month" />
            <button onClick={() => setShowImport(true)} style={S.btnPrimary}>Import Excel</button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
      ) : view === 'timesheet' ? (
        <AttendanceTimesheet employees={employees} entries={entries.filter(e => e.date >= monthFirstDay(month))} month={month}
          onChanged={() => fetchMonth(month, true)} addToast={addToast} />
      ) : view === 'salary' ? (
        <AttendanceSalary employees={employees} entries={entries} penalties={penalties} advances={advances} savedSalaries={savedSalaries} payments={payments} month={month}
          onChanged={() => fetchMonth(month, true)} addToast={addToast} />
      ) : (
        <AttendanceEmployees employees={employees} onChanged={fetchEmployees} addToast={addToast} />
      )}

      {showImport && (
        <ImportExcel employees={employees} onClose={() => setShowImport(false)} addToast={addToast}
          onImported={m => {
            setShowImport(false); fetchEmployees();
            // Jump to the month the sheet's dates belong to — importing July
            // while the picker sits on August (the default is the current
            // month) looked like "imported successfully but nothing shows".
            if (m && m !== month) setMonth(m); // the month effect refetches
            else fetchMonth(month);
          }} />
      )}
    </div>
  );
}
