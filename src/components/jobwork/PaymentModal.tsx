// Record a payment to the jobworker against one job (admin/manager — RLS
// enforces it). The amount starts at what is due; paying ahead of receipt
// is allowed and shows as an advance.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import DateInput from '../ui/DateInput';
import { JOBWORK_PAY_MODES, type JobworkPayMode, type JobworkSummary } from '../../types/database';
import { addPayment } from './jobworkApi';
import { today, inr, n, PAY_MODE_LABELS } from './jobworkModel';

export default function PaymentModal({ job, onClose, onSaved, addToast }: {
  job: JobworkSummary;
  onClose: () => void;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  const due = Math.max(0, n(job.due));
  const [amount, setAmount] = useState(due ? String(due) : '');
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<JobworkPayMode>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (saving) return;
    const a = Number(amount);
    if (!(a > 0)) return setError('Enter an amount above 0');
    setSaving(true);
    const { error: err } = await addPayment({ order_id: job.id, amount: Math.round(a * 100) / 100, pay_date: date || today(), mode, reference: reference.trim() || null, note: note.trim() || null });
    setSaving(false);
    if (err) { setError(friendlyError(err)); return; }
    addToast(`${inr(a)} recorded on JW #${job.jw_number}`, 'success');
    onSaved();
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={S.modalTitle}>Record payment</div>
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>JW #{job.jw_number} · {job.vendor_name}</div>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11, color: T.tx3 }}>
            <div>Bill<div style={{ fontFamily: T.mono, fontSize: 13, color: T.tx, marginTop: 2 }}>{inr(job.bill)}</div></div>
            <div>Paid<div style={{ fontFamily: T.mono, fontSize: 13, color: T.tx, marginTop: 2 }}>{inr(job.paid)}</div></div>
            <div>Due<div style={{ fontFamily: T.mono, fontSize: 13, color: n(job.due) > 0 ? T.yl : T.gr, marginTop: 2 }}>{inr(job.due)}</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.fLabel}>Amount (₹) <span style={{ color: T.re }}>*</span></label>
              <input value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                type="number" min="0" inputMode="decimal" autoFocus style={{ ...S.fInput, width: '100%', height: 44, fontSize: 15 }} /></div>
            <div><label style={S.fLabel}>Date</label><DateInput value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ width: '100%', height: 44 }} /></div>
          </div>
          <div>
            <label style={S.fLabel}>Mode</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {JOBWORK_PAY_MODES.map(m => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                  style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, borderRadius: 999, padding: '6px 14px', fontSize: 11, ...(mode === m ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) }}>{PAY_MODE_LABELS[m]}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.fLabel}>Reference</label><input value={reference} onChange={e => setReference(e.target.value)} placeholder="UTR / cheque no." style={{ ...S.fInput, width: '100%' }} /></div>
            <div><label style={S.fLabel}>Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" style={{ ...S.fInput, width: '100%' }} /></div>
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="button" onClick={submit} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save payment'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
