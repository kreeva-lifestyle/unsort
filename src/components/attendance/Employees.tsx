// Employee master — name, monthly salary, fixed daily time (the three
// columns of the owner's Employee sheet), plus code + active flag.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { deleteQrObject } from '../../lib/qrUpload';
import { AttEmployee, fixTimeToMinutes, minutesToHM } from '../../lib/attendance';
import { useBackClose } from '../../hooks/useBackClose';
import DateInput from '../ui/DateInput';
import LeaveDateModal from './LeaveDateModal';
import QrField from './QrField';

const prettyDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AttendanceEmployees({ employees, onChanged, addToast }: {
  employees: AttEmployee[]; onChanged: () => void; addToast: (m: string, t?: string) => void;
}) {
  const [editing, setEditing] = useState<AttEmployee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [salary, setSalary] = useState('');
  const [fixTime, setFixTime] = useState('8:30');
  const [qrUrl, setQrUrl] = useState('');
  const [leftOn, setLeftOn] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.body.classList.toggle('modal-open', showModal); return () => document.body.classList.remove('modal-open'); }, [showModal]);
  useBackClose(showModal, () => close());

  const openAdd = () => { setEditing(null); setName(''); setCode(''); setSalary(''); setFixTime('8:30'); setQrUrl(''); setLeftOn(''); setErr(''); setShowModal(true); };
  const openEdit = (e: AttEmployee) => { setEditing(e); setName(e.name); setCode(e.employee_code || ''); setSalary(String(e.salary)); setFixTime(minutesToHM(e.fix_time_minutes)); setQrUrl(e.qr_image_url || ''); setLeftOn(e.left_on || ''); setErr(''); setShowModal(true); };
  const close = () => { setShowModal(false); setEditing(null); setErr(''); };

  const save = async () => {
    if (saving) return;
    setErr('');
    if (!name.trim()) { setErr('Employee name is required'); return; }
    const sal = Number(salary);
    if (!Number.isFinite(sal) || sal < 0) { setErr('Enter a valid monthly salary'); return; }
    const fixMin = fixTimeToMinutes(fixTime.trim());
    if (!fixMin) { setErr('Fix time must look like 8:30 (hours:minutes)'); return; }
    // Sanity ceiling/floor: 0:01 would make perHour = perDay x 60 - one day
    // would pay hundreds of times the daily rate from a single typo.
    if (fixMin < 60 || fixMin > 1440) { setErr('Fix time must be between 1:00 and 24:00 hours per day'); return; }
    setSaving(true);
    // left_on only travels with an already-inactive employee: an active one has
    // no leaving date, and blanking it here would silently un-cap their salary.
    const payload = { name: name.trim(), employee_code: code.trim() || null, salary: sal, fix_time_minutes: fixMin, qr_image_url: qrUrl || null, updated_at: new Date().toISOString(), ...(editing && !editing.is_active ? { left_on: leftOn || null } : {}) };
    const { error } = editing
      ? await supabase.from('attendance_employees').update(payload).eq('id', editing.id)
      : await supabase.from('attendance_employees').insert(payload);
    setSaving(false);
    if (error) { setErr(friendlyError(error)); return; }
    if (editing?.qr_image_url && editing.qr_image_url !== (qrUrl || null)) deleteQrObject(editing.qr_image_url);
    addToast(editing ? 'Employee updated' : 'Employee added', 'success');
    close(); onChanged();
  };

  const [toggling, setToggling] = useState('');
  const [deactivating, setDeactivating] = useState<AttEmployee | null>(null);

  // Deactivating asks for the last working day (the salary cutoff); activating
  // clears it, because the person is employed again from now on.
  const deactivate = async (e: AttEmployee, date: string) => {
    if (toggling) return; // double-click fired two updates + contradictory toasts
    setToggling(e.id);
    const { error } = await supabase.from('attendance_employees')
      .update({ is_active: false, left_on: date, updated_at: new Date().toISOString() }).eq('id', e.id);
    setToggling('');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setDeactivating(null);
    addToast(`${e.name} deactivated — salary stops after ${prettyDate(date)}; months up to it stay on the Salary tab`, 'success');
    onChanged();
  };

  const activate = async (e: AttEmployee) => {
    if (toggling) return;
    setToggling(e.id);
    const { error } = await supabase.from('attendance_employees')
      .update({ is_active: true, left_on: null, updated_at: new Date().toISOString() }).eq('id', e.id);
    setToggling('');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(`${e.name} activated`, 'success');
    onChanged();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: T.tx3 }}>{employees.length} employee{employees.length !== 1 ? 's' : ''} · salary is monthly, fix time is the standard working day</div>
        <button onClick={openAdd} style={S.btnPrimary}>+ Add Employee</button>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
        {employees.map(e => (
          <div key={e.id} className="att-emp-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${T.bd}`, opacity: e.is_active ? 1 : 0.45 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, display: 'flex', alignItems: 'center', gap: 6 }}>
                {e.name}
                {e.employee_code ? <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{e.employee_code}</span> : null}
                {e.qr_image_url && e.is_active && <span title="Payment QR uploaded" style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: T.ac3, color: T.ac2 }}>QR</span>}
              </div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>
                Fix time {minutesToHM(e.fix_time_minutes)} hrs/day
                {!e.is_active && (e.left_on
                  ? <span style={{ color: T.yl }}> · left {prettyDate(e.left_on)}</span>
                  : <span style={{ color: T.yl }}> · inactive, no leaving date set</span>)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: e.salary > 0 ? T.tx : T.re }}>₹{Number(e.salary).toLocaleString('en-IN')}</div>
              {e.salary <= 0 && <div style={{ fontSize: 9, color: T.re }}>set salary</div>}
            </div>
            <div className="att-emp-actions" style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEdit(e)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10 }}>Edit</button>
              <button onClick={() => (e.is_active ? setDeactivating(e) : activate(e))} disabled={!!toggling} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10, color: e.is_active ? T.re : T.gr, opacity: toggling === e.id ? 0.5 : 1 }}>{toggling === e.id ? '…' : e.is_active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        ))}
        {employees.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No employees yet — add one, or Import Excel to create them from the timesheet.</div>}
      </div>

      {showModal && createPortal((
        <div style={{ ...S.modalOverlay }} onClick={close}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 400 }} onClick={ev => ev.stopPropagation()}>
            <div style={S.modalHead}>
              <div style={S.modalTitle}>{editing ? `Edit ${editing.name}` : 'Add Employee'}</div>
              <button type="button" onClick={close} style={S.modalClose} aria-label="Close">&#215;</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 10 }}>
                <label style={S.fLabel}>Employee Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ramesh Patel" autoFocus style={{ ...S.fInput, width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={S.fLabel}>Employee ID</label>
                  <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. EMP-01" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                </div>
                <div>
                  <label style={S.fLabel}>Monthly Salary (₹)</label>
                  <input type="number" min="0" value={salary} onKeyDown={e => numericKeyDown(e)} onChange={e => setSalary(e.target.value)} placeholder="22000" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={S.fLabel}>Fix Time (hours:minutes per day)</label>
                <input value={fixTime} onChange={e => setFixTime(e.target.value)} placeholder="8:30" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
              </div>
              {editing && !editing.is_active && (
                <div style={{ marginBottom: 12 }}>
                  <label style={S.fLabel}>Last working day</label>
                  <DateInput value={leftOn} onChange={e => setLeftOn(e.target.value)} style={{ width: '100%' }} />
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Salary accrues up to and including this day. Clearing it lets the old months pay again — set it right rather than blank.</div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={S.fLabel}>Payment QR</label>
                <QrField value={qrUrl} savedUrl={editing?.qr_image_url ?? null} onChange={setQrUrl} addToast={addToast} />
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Shown in the salary payment screen so you can scan &amp; pay.</div>
              </div>
              {err && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={close} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, flex: 1, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {deactivating && (
        <LeaveDateModal emp={deactivating} busy={toggling === deactivating.id}
          onCancel={() => setDeactivating(null)} onConfirm={d => deactivate(deactivating, d)} />
      )}

    </div>
  );
}
