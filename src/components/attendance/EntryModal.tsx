// Manual attendance entry — add a day, or correct/delete an existing one,
// without re-importing the whole sheet. Upserts on (employee_id, date) so it
// also fixes a day that was already imported. Only in/out drive pay; status is
// a label. Admin/manager/operator only (enforced by RLS).
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { AttEmployee, AttEntry } from '../../lib/attendance';

const STATUSES = [
  { v: 'P', label: 'P — Present' },
  { v: 'A', label: 'A — Absent' },
  { v: 'HD', label: 'HD — Half day' },
  { v: 'L', label: 'L — Leave' },
  { v: 'WO', label: 'WO — Week off' },
];
const hm = (t: string | null | undefined) => (t || '').slice(0, 5); // "09:52:00" -> "09:52"
const weekday = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });

export default function AttendanceEntryModal({ employees, month, editing, presetEmployeeId, onClose, onSaved, addToast }: {
  employees: AttEmployee[]; month: string; editing: AttEntry | null; presetEmployeeId?: string;
  onClose: () => void; onSaved: () => void; addToast: (m: string, t?: string) => void;
}) {
  const [y, mo] = month.split('-').map(Number);
  const monthMin = `${month}-01`;
  const monthMax = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
  const today = (() => { const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return iso >= monthMin && iso <= monthMax ? iso : monthMin; })();

  const [empId, setEmpId] = useState(editing?.employee_id || presetEmployeeId || '');
  const [date, setDate] = useState(editing?.date || today);
  const [status, setStatus] = useState(editing?.status || '');
  const [inT, setInT] = useState(hm(editing?.in_time));
  const [outT, setOutT] = useState(hm(editing?.out_time));
  const [shift, setShift] = useState(editing?.shift_id || '');
  const [locIn, setLocIn] = useState(editing?.location_in || '');
  const [locOut, setLocOut] = useState(editing?.location_out || '');
  const [remarks, setRemarks] = useState(editing?.remarks || '');
  const [mgr, setMgr] = useState(editing?.manager_remarks || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { document.body.classList.add('modal-open'); return () => document.body.classList.remove('modal-open'); }, []);

  const save = async () => {
    if (saving || deleting) return;
    setErr('');
    if (!empId) { setErr('Choose an employee'); return; }
    if (!date || date < monthMin || date > monthMax) { setErr('Pick a date inside the selected month'); return; }
    if (inT && outT && outT <= inT) { setErr('Out time must be after In time'); return; }
    setSaving(true);
    const payload = {
      employee_id: empId, date, day: weekday(date),
      status: status || null, in_time: inT || null, out_time: outT || null,
      shift_id: shift.trim() || null, location_in: locIn.trim() || null, location_out: locOut.trim() || null,
      remarks: remarks.trim() || null, manager_remarks: mgr.trim() || null, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('attendance_entries').upsert(payload, { onConflict: 'employee_id,date' });
    setSaving(false);
    if (error) { setErr(friendlyError(error)); return; }
    addToast(editing ? 'Entry updated' : 'Entry saved', 'success');
    onSaved();
  };

  const del = async () => {
    if (!editing || saving || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('attendance_entries').delete().eq('id', editing.id);
    setDeleting(false);
    if (error) { setErr(friendlyError(error)); return; }
    addToast('Entry deleted', 'success');
    onSaved();
  };

  const busy = saving || deleting;
  const lbl = { ...S.fLabel, display: 'block', marginBottom: 4 } as const;

  return createPortal((
    <div style={{ ...S.modalOverlay }} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 460 }} onClick={ev => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{editing ? 'Edit attendance' : 'Add attendance'}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Employee</label>
              <select value={empId} onChange={e => setEmpId(e.target.value)} disabled={!!editing} style={{ ...S.fInput, width: '100%', opacity: editing ? 0.6 : 1 }}>
                <option value="">Select…</option>
                {employees.filter(e => e.is_active || e.id === empId).map(e => <option key={e.id} value={e.id}>{e.name}{e.employee_code ? ` (${e.employee_code})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={date} min={monthMin} max={monthMax} disabled={!!editing} onChange={e => setDate(e.target.value)} style={{ ...S.fDate, width: '100%', opacity: editing ? 0.6 : 1 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>In</label>
              <input type="time" value={inT} onChange={e => setInT(e.target.value)} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
            </div>
            <div>
              <label style={lbl}>Out</label>
              <input type="time" value={outT} onChange={e => setOutT(e.target.value)} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...S.fInput, width: '100%' }}>
                <option value="">—</option>
                {STATUSES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 12 }}>Pay is from In/Out hours; a day with no valid In/Out is unpaid. Status is a label only.</div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Remarks</label>
            <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. Forgot to punch out" style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Manager's remarks</label>
            <input value={mgr} onChange={e => setMgr(e.target.value)} style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Shift ID</label>
              <input value={shift} onChange={e => setShift(e.target.value)} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
            </div>
            <div>
              <label style={lbl}>Location In</label>
              <input value={locIn} onChange={e => setLocIn(e.target.value)} style={{ ...S.fInput, width: '100%' }} />
            </div>
            <div>
              <label style={lbl}>Location Out</label>
              <input value={locOut} onChange={e => setLocOut(e.target.value)} style={{ ...S.fInput, width: '100%' }} />
            </div>
          </div>

          {err && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            {editing && <button onClick={del} disabled={busy} style={{ ...S.btnDanger, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{deleting ? 'Deleting…' : 'Delete'}</button>}
            <button onClick={onClose} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
            <button onClick={save} disabled={busy} style={{ ...S.btnPrimary, flex: 1, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
