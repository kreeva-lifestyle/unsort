// Employee master — name, monthly salary, fixed daily time (the three
// columns of the owner's Employee sheet), plus code + active flag.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { uploadQrImage } from '../../lib/qrUpload';
import { AttEmployee, fixTimeToMinutes, minutesToHM } from '../../lib/attendance';

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
  const [qrBusy, setQrBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.body.classList.toggle('modal-open', showModal); return () => document.body.classList.remove('modal-open'); }, [showModal]);

  const openAdd = () => { setEditing(null); setName(''); setCode(''); setSalary(''); setFixTime('8:30'); setQrUrl(''); setErr(''); setShowModal(true); };
  const openEdit = (e: AttEmployee) => { setEditing(e); setName(e.name); setCode(e.employee_code || ''); setSalary(String(e.salary)); setFixTime(minutesToHM(e.fix_time_minutes)); setQrUrl(e.qr_image_url || ''); setErr(''); setShowModal(true); };
  const close = () => { setShowModal(false); setEditing(null); setErr(''); };

  const pickQr = async (file: File) => {
    setQrBusy(true);
    const r = await uploadQrImage(file);
    setQrBusy(false);
    if (r.error) { addToast(r.error, 'error'); return; }
    setQrUrl(r.url!);
  };

  const save = async () => {
    if (saving) return;
    setErr('');
    if (!name.trim()) { setErr('Employee name is required'); return; }
    const sal = Number(salary);
    if (!Number.isFinite(sal) || sal < 0) { setErr('Enter a valid monthly salary'); return; }
    const fixMin = fixTimeToMinutes(fixTime.trim());
    if (!fixMin) { setErr('Fix time must look like 8:30 (hours:minutes)'); return; }
    setSaving(true);
    const payload = { name: name.trim(), employee_code: code.trim() || null, salary: sal, fix_time_minutes: fixMin, qr_image_url: qrUrl || null, updated_at: new Date().toISOString() };
    const { error } = editing
      ? await supabase.from('attendance_employees').update(payload).eq('id', editing.id)
      : await supabase.from('attendance_employees').insert(payload);
    setSaving(false);
    if (error) { setErr(friendlyError(error)); return; }
    addToast(editing ? 'Employee updated' : 'Employee added', 'success');
    close(); onChanged();
  };

  const toggleActive = async (e: AttEmployee) => {
    const { error } = await supabase.from('attendance_employees').update({ is_active: !e.is_active, updated_at: new Date().toISOString() }).eq('id', e.id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(e.is_active ? `${e.name} deactivated` : `${e.name} activated`, 'success');
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
                {e.qr_image_url && <span title="Payment QR uploaded" style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: T.ac3, color: T.ac2 }}>QR</span>}
              </div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>Fix time {minutesToHM(e.fix_time_minutes)} hrs/day{!e.is_active ? ' · inactive' : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: e.salary > 0 ? T.tx : T.re }}>₹{Number(e.salary).toLocaleString('en-IN')}</div>
              {e.salary <= 0 && <div style={{ fontSize: 9, color: T.re }}>set salary</div>}
            </div>
            <div className="att-emp-actions" style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEdit(e)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10 }}>Edit</button>
              <button onClick={() => toggleActive(e)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10, color: e.is_active ? T.re : T.gr }}>{e.is_active ? 'Deactivate' : 'Activate'}</button>
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
              <span onClick={close} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
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
              <div style={{ marginBottom: 12 }}>
                <label style={S.fLabel}>Payment QR</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: qrUrl ? '#fff' : 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {qrUrl ? <img src={qrUrl} alt="Payment QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 9, color: T.tx3, textAlign: 'center', padding: 4 }}>No QR</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickQr(f); e.target.value = ''; }} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={qrBusy} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11, pointerEvents: qrBusy ? 'none' : 'auto', opacity: qrBusy ? 0.5 : 1 }}>{qrBusy ? 'Uploading…' : qrUrl ? 'Change QR' : 'Upload QR'}</button>
                    {qrUrl && !qrBusy && <button type="button" onClick={() => setQrUrl('')} style={{ background: 'none', border: 'none', color: T.re, fontSize: 10, cursor: 'pointer', padding: 0, textAlign: 'left' }}>Remove</button>}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Shown in the salary payment screen so you can scan &amp; pay.</div>
              </div>
              {err && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={close} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, flex: 1, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
