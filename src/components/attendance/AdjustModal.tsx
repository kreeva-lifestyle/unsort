// Penalty / Advance modal — one salary-adjustment form for both kinds,
// extracted from Salary.tsx. A penalty needs a mandatory note (the employee
// must know what the deduction is for); an advance's note is optional (it is
// its own explanation — money already handed over). Both deduct from the SAME
// month's net salary.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { AttEmployee, monthFirstDay } from '../../lib/attendance';
import { useBackClose } from '../../hooks/useBackClose';
import { inr } from './payslip';
import { useModalLock } from '../../hooks/useModalLock';

export default function AdjustModal({ emp, kind, month, monthLabel, onClose, onSaved, addToast }: {
  emp: AttEmployee; kind: 'penalty' | 'advance'; month: string; monthLabel: string;
  onClose: () => void; onSaved: () => void; addToast: (m: string, t?: string) => void;
}) {
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const isPen = kind === 'penalty';

  useModalLock();
  // Device Back closes this instead of leaving the page behind it.
  useBackClose(true, () => onClose());

  const save = async () => {
    if (saving) return;
    setErr('');
    // Whole rupees: paise amounts made the card's rounded "gross − deduction"
    // line disagree with the payslip by ₹1.
    const amount = Math.round(Number(amt));
    if (!Number.isFinite(amount) || amount <= 0) { setErr('Enter an amount greater than 0'); return; }
    if (isPen && !note.trim()) { setErr('Add a note — the employee should know what this deduction is for'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const row = { employee_id: emp.id, month: monthFirstDay(month), amount, created_by: user?.id };
    const { error } = isPen
      ? await supabase.from('attendance_penalties').insert({ ...row, reason: note.trim() || null })
      : await supabase.from('attendance_advances').insert({ ...row, note: note.trim() || null });
    setSaving(false);
    if (error) { setErr(friendlyError(error)); return; }
    addToast(`${isPen ? 'Penalty' : 'Advance'} ${inr(amount)} added for ${emp.name}`, 'success');
    onSaved();
  };

  return createPortal((
    <div style={{ ...S.modalOverlay }} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 380 }} onClick={ev => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{isPen ? 'Penalty' : 'Advance'} — {emp.name}</div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>
            {isPen
              ? `Deduct for time-passing / policy breach during ${monthLabel}. Subtracts from the net salary.`
              : `Money already given to ${emp.name} ahead of payday. Subtracts from ${monthLabel}'s net salary.`}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.fLabel}>Amount (₹)</label>
            <input type="number" min="1" value={amt} onKeyDown={e => numericKeyDown(e)} onChange={e => setAmt(e.target.value)} placeholder={isPen ? '500' : '2000'} autoFocus style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.fLabel}>{isPen ? 'Note — what is this deduction for?' : 'Note (optional)'}</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={isPen ? 'e.g. Late 3 days / idle during shift' : 'e.g. Cash on 12th'} style={{ ...S.fInput, width: '100%' }} />
            {isPen && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Required — shown on the payslip and pay screen so the employee understands the deduction.</div>}
          </div>
          {err && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...(isPen ? S.btnDanger : S.btnPrimary), flex: 1, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Adding…' : isPen ? 'Add Penalty' : 'Add Advance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
