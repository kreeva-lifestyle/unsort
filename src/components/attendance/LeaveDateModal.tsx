// Deactivation asks for the last working day, because "inactive" alone told
// the salary engine nothing: an employee deactivated in July still collected
// August's paid Sunday (the weekly-off rule looks 6 days back across the month
// boundary, so their final July week qualified it). The date is the cutoff —
// salary accrues up to and including it, nothing after.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import DateInput from '../ui/DateInput';
import { AttEmployee } from '../../lib/attendance';
import { useBackClose } from '../../hooks/useBackClose';
import { useModalLock } from '../../hooks/useModalLock';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pretty = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function LeaveDateModal({ emp, busy, onCancel, onConfirm }: {
  emp: AttEmployee; busy: boolean;
  onCancel: () => void; onConfirm: (leftOn: string) => void;
}) {
  const [date, setDate] = useState(emp.left_on || todayISO());
  const [err, setErr] = useState('');

  useBackClose(true, () => { if (!busy) onCancel(); });
  useModalLock();

  const confirm = () => {
    if (busy) return;
    if (!date) { setErr('Pick the last working day'); return; }
    onConfirm(date);
  };

  return createPortal((
    <div style={{ ...S.modalOverlay }} onClick={busy ? undefined : onCancel}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 380 }} onClick={ev => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Deactivate {emp.name}</div>
          <button type="button" onClick={busy ? undefined : onCancel} aria-label="Close" style={S.modalClose}>&#215;</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Last working day</label>
            <DateInput value={date} onChange={e => { setDate(e.target.value); setErr(''); }} autoFocus style={{ width: '100%' }} />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px', fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
            From {pretty(date) || 'the day after'} onward{date ? ' (exclusive)' : ''}:
            <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
              <span>· no worked hours or Sunday pay</span>
              <span>· days aren't counted as unpaid leave</span>
              <span>· the payment QR is hidden</span>
            </div>
            <div style={{ marginTop: 8, color: T.tx2 }}>Months up to that date stay on the Salary tab for final settlement. You can correct the date later from Edit.</div>
          </div>
          {err && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} disabled={busy} style={{ ...S.btnGhost, flex: 1, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>Cancel</button>
            <button onClick={confirm} disabled={busy} style={{ ...S.btnDanger, flex: 1, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Deactivating…' : 'Deactivate'}</button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
