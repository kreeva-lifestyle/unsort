// Attendance module shell — owns data fetching (employees, month entries,
// penalties, saved salaries); the three views are presentational children.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, S } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';
import { useNotifications } from '../hooks/useNotifications';
import { AttEmployee, AttEntry, AttPenalty, AttSalaryPayment, monthFirstDay } from '../lib/attendance';
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
  const [savedSalaries, setSavedSalaries] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<AttSalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase.from('attendance_employees')
      .select('id, employee_code, name, salary, fix_time_minutes, is_active, qr_image_url').order('name');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setEmployees((data as AttEmployee[]) || []);
  }, [addToast]);

  const fetchMonth = useCallback(async (m: string, isCurrent: () => boolean = () => true) => {
    setLoading(true);
    const from = monthFirstDay(m);
    const [y, mo] = m.split('-').map(Number);
    const to = `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
    const [en, pe, sa, pa] = await Promise.all([
      supabase.from('attendance_entries').select('id, employee_id, date, day, shift_id, in_time, out_time, location_in, location_out, status, remarks, manager_remarks').gte('date', from).lte('date', to).order('date').limit(4000),
      supabase.from('attendance_penalties').select('id, employee_id, month, amount, reason').eq('month', from),
      supabase.from('attendance_salaries').select('id, employee_id, month, days_in_month, work_days, sundays, leave_days, total_worked_minutes, per_day_salary, per_hour_salary, earned, sunday_pay, gross, penalty_total, final_salary, computed_at').eq('month', from),
      supabase.from('attendance_salary_payments').select('id, employee_id, month, paid_at, paid_by').eq('month', from),
    ]);
    // A newer month may have been requested while these were in flight — drop
    // superseded responses so Salary never computes/saves the wrong month.
    if (!isCurrent()) return;
    const err = en.error || pe.error || sa.error || pa.error;
    if (err) addToast(friendlyError(err), 'error');
    setEntries((en.data as AttEntry[]) || []);
    setPenalties((pe.data as AttPenalty[]) || []);
    setSavedSalaries((sa.data as Record<string, unknown>[]) || []);
    setPayments((pa.data as AttSalaryPayment[]) || []);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { let active = true; fetchMonth(month, () => active); return () => { active = false; }; }, [month, fetchMonth]);

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
        <div className="att-controls" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={S.fDate} aria-label="Month" />
          <button onClick={() => setShowImport(true)} style={S.btnPrimary}>Import Excel</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
      ) : view === 'timesheet' ? (
        <AttendanceTimesheet employees={employees} entries={entries} month={month} />
      ) : view === 'salary' ? (
        <AttendanceSalary employees={employees} entries={entries} penalties={penalties} savedSalaries={savedSalaries} payments={payments} month={month}
          onChanged={() => fetchMonth(month)} addToast={addToast} />
      ) : (
        <AttendanceEmployees employees={employees} onChanged={fetchEmployees} addToast={addToast} />
      )}

      {showImport && (
        <ImportExcel employees={employees} onClose={() => setShowImport(false)} addToast={addToast}
          onImported={() => { setShowImport(false); fetchEmployees(); fetchMonth(month); }} />
      )}
    </div>
  );
}
