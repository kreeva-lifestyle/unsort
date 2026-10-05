// Close a job. With pieces still pending the reason is required (the
// server enforces it too) — "closed short" must always say why.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import type { JobworkSummary } from '../../../types/database';
import { setStatus } from './jobworkApi';

export default function CloseJobModal({ job, onClose, onSaved, addToast }: {
  job: JobworkSummary;
  onClose: () => void;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const short = job.pcs_remaining > 0;
  const submit = async () => {
    if (saving) return;
    if (short && !reason.trim()) return setError(`Say why — ${job.pcs_remaining} piece(s) are still pending`);
    setSaving(true);
    const { error: err } = await setStatus(job.id, 'closed', reason.trim());
    setSaving(false);
    if (err) { setError(friendlyError(err)); return; }
    addToast(`JW #${job.jw_number} closed`, 'success');
    onSaved();
  };
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Close JW #{job.jw_number}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.6 }}>
            {short ? <>{job.pcs_remaining} of {job.pieces} pieces have not come back. Closing stops further receipts; payments can still be recorded.</>
              : <>All pieces are accounted for. Closing locks the job; payments can still be recorded.</>}
          </div>
          <div>
            <label style={S.fLabel}>Reason {short && <span style={{ color: T.re }}>*</span>}</label>
            <input value={reason} onChange={e => { setReason(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              autoFocus placeholder={short ? 'e.g. jobworker short of fabric, balance cancelled' : 'optional'} style={{ ...S.fInput, width: '100%' }} />
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="button" onClick={submit} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Closing…' : 'Close job'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
