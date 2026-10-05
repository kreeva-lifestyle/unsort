// Record one movement on a job. SEND OUT: material quantities given (the
// suggestion is what the job still needs at its usage per piece) and any
// rejected pieces going back for rework. RECEIVE: pieces OK / rejected and
// leftover material returned. The server re-checks every limit under a lock.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import DateInput from '../../ui/DateInput';
import { addEntry } from './jobworkApi';
import { today, qty, unitShort, materialBalances, rejectedHeld, n, type JobDetail } from './jobworkModel';

export default function EntryModal({ kind, detail, onClose, onSaved, addToast }: {
  kind: 'out' | 'in';
  detail: JobDetail;
  onClose: () => void;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  const { job } = detail;
  const bal = materialBalances(detail, job.pcs_ok).filter(b => !b.m.removed);
  const held = rejectedHeld(job);
  const [date, setDate] = useState(today());
  const [ok, setOk] = useState('');
  const [rej, setRej] = useState('');
  const [rework, setRework] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const int = (s: string) => (s.trim() === '' ? 0 : Number(s));
  // What the job still needs of a material: pieces × usage − already sent.
  const need = (b: (typeof bal)[number]) => b.m.per_piece == null ? null : Math.max(0, n(b.m.per_piece) * job.pieces - b.sent);
  const submit = async () => {
    if (saving) return;
    const nums = [ok, rej, rework].map(int);
    if (nums.some(x => !Number.isInteger(x) || x < 0)) return setError('Pieces must be whole numbers');
    if (kind === 'in' && nums[0] + nums[1] > job.pcs_remaining) return setError(`Only ${job.pcs_remaining} piece(s) are still with the jobworker`);
    if (kind === 'out' && nums[2] > held) return setError(`Only ${held} rejected piece(s) can go back for rework`);
    const lines = bal.map(b => ({ material_id: b.m.id, qty: Number(q[b.m.id] || 0) }));
    if (lines.some(l => !Number.isFinite(l.qty) || l.qty < 0)) return setError('Quantities cannot be negative');
    const over = kind === 'in' ? bal.find(b => Number(q[b.m.id] || 0) > b.sent - b.returned + 1e-9) : undefined;
    if (over) return setError(`Only ${qty(over.sent - over.returned)} ${unitShort(over.m.unit)} ${over.m.name} was sent and not yet returned`);
    if (lines.every(l => !l.qty) && nums.every(x => !x)) return setError(kind === 'in' ? 'Enter the pieces received or material returned' : 'Enter what was sent');
    setSaving(true);
    const { error: err } = await addEntry(job.id, kind, { date, ok: nums[0], rejected: nums[1], rework: nums[2], note, lines });
    setSaving(false);
    if (err) { setError(friendlyError(err)); return; }
    addToast(kind === 'in' ? `Received on JW #${job.jw_number}` : `Sent out on JW #${job.jw_number}`, 'success');
    onSaved();
  };

  const numInput = (value: string, set: (v: string) => void, label: string, ph = '0') => (
    <input value={value} onChange={e => { set(e.target.value); setError(''); }} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      type="number" min="0" inputMode="decimal" placeholder={ph} aria-label={label} style={{ ...S.fInput, width: '100%', height: 44, fontSize: 15 }} />
  );
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={S.modalTitle}>{kind === 'in' ? 'Receive' : 'Send out'}</div>
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>JW #{job.jw_number} · {job.sku} · {job.vendor_name}</div>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={S.fLabel}>Date</label><DateInput value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ width: '100%', height: 44 }} /></div>
          {kind === 'in' && (<>
            <div style={{ fontSize: 11, color: T.tx2 }}><b style={{ color: T.tx }}>{job.pcs_remaining}</b> of {job.pieces} pieces still with the jobworker</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.fLabel}>Pieces OK</label>{numInput(ok, setOk, 'Pieces OK')}</div>
              <div><label style={S.fLabel}>Rejected</label>{numInput(rej, setRej, 'Pieces rejected')}</div>
            </div>
          </>)}
          {kind === 'out' && held > 0 && (
            <div><label style={S.fLabel}>Rejected pieces sent back for rework <span style={{ color: T.tx3, textTransform: 'none', letterSpacing: 0 }}>({held} with us)</span></label>{numInput(rework, setRework, 'Rework pieces')}</div>
          )}
          {bal.length > 0 && (
            <div>
              <label style={S.fLabel}>{kind === 'in' ? 'Material returned (leftover)' : 'Material given'}</label>
              {bal.map(b => {
                const nd = need(b), u = unitShort(b.m.unit);
                // Receive: the tap fills the expected leftover (sent − returned −
                // used by OK pieces) when usage/pc is known, else what is unreturned.
                const back = b.used != null ? Math.max(0, b.held) : b.sent - b.returned;
                const hint = kind === 'in' ? (b.used != null ? `leftover expected ${qty(back)} ${u}` : `${qty(back)} ${u} not returned`)
                  : nd != null ? `needs ${qty(nd)} ${u} more` : `sent so far ${qty(b.sent)} ${u}`;
                return (
                  <div key={b.m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.m.name} <span style={{ fontWeight: 400, color: T.tx3, fontSize: 11 }}>{b.m.unit}</span></div>
                      <button type="button" disabled={kind === 'out' ? !nd : back <= 0}
                        onClick={() => setQ(x => ({ ...x, [b.m.id]: qty(kind === 'out' ? nd ?? 0 : back) }))}
                        style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: 10, color: T.ac2, cursor: 'pointer', fontFamily: T.sans }}>{hint}</button>
                    </div>
                    {numInput(q[b.m.id] ?? '', v => setQ(x => ({ ...x, [b.m.id]: v })), `${b.m.name} quantity`)}
                  </div>
                );
              })}
            </div>
          )}
          <div><label style={S.fLabel}>Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'in' ? 'e.g. 2 pcs thread pulls' : 'e.g. challan no., sent by'} style={{ ...S.fInput, width: '100%' }} /></div>
          {error && <div style={S.errorBox}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="button" onClick={submit} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : kind === 'in' ? 'Save receipt' : 'Save send-out'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
