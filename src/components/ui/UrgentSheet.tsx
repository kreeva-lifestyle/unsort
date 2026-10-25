// Mark a PO / job / order urgent, change why or by when, or clear it. One
// sheet for all three modules; the save is the set_urgent RPC (role and
// "still live" checks, audit row). Opens over the record's own detail, so
// the parent renders it OUTSIDE its overlay (React events bubble through
// portals — a tap in here must not close the detail behind it).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import DateInput from './DateInput';
import { setUrgent } from '../../lib/urgency';
import type { Urgent, UrgentModule } from '../../types/urgency';

export default function UrgentSheet({ module, id, title, row, onClose, onSaved, addToast }: {
  module: UrgentModule;
  id: string;
  /** "PO #111", "JW #42", "ORD-0012" — the toast and the sheet's title. */
  title: string;
  row: Urgent;
  onClose: () => void;
  /** The flag changed: re-read the record / list. */
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  const [reason, setReason] = useState(row.urgent_reason ?? '');
  const [by, setBy] = useState(row.urgent_by ?? '');
  const [busy, setBusy] = useState<'' | 'save' | 'clear'>('');
  const [err, setErr] = useState('');

  const save = async (on: boolean) => {
    if (busy) return;
    setBusy(on ? 'save' : 'clear'); setErr('');
    const { error } = await setUrgent(module, id, on, reason, by);
    setBusy('');
    if (error) { setErr(friendlyError(error)); return; }
    addToast(on ? `${title} marked urgent` : `${title} is no longer urgent`, 'success');
    onSaved(); onClose();
  };
  const dim = (b: boolean): React.CSSProperties => ({ pointerEvents: busy ? 'none' : 'auto', opacity: b ? 0.5 : 1 });

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <form className="modal-inner" style={{ ...S.modalBox, width: 420 }} onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); save(true); }}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{row.is_urgent ? 'Urgent' : 'Mark urgent'} · <span style={{ fontFamily: T.mono }}>{title}</span></span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>
            It moves to the top of its list with a red <b style={{ color: T.re }}>URGENT</b> tag. The reason stays in-house; only the needed-by date goes on a shared message.
          </div>
          <div>
            <label style={S.fLabel} htmlFor="urgent-reason">Why (optional)</label>
            <input id="urgent-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={120} autoFocus placeholder="e.g. Customer leaving on 2 Nov" style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div>
            <label style={S.fLabel} htmlFor="urgent-by">Needed by (optional)</label>
            <DateInput id="urgent-by" value={by} onChange={e => setBy(e.target.value)} style={{ width: '100%' }} />
          </div>
          {err && <div style={S.errorBox}>{err}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {row.is_urgent && <button type="button" onClick={() => save(false)} style={{ ...S.btnDanger, minHeight: 44, marginRight: 'auto', ...dim(busy === 'clear') }}>{busy === 'clear' ? 'Clearing…' : 'Clear urgent'}</button>}
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, ...dim(busy === 'save') }}>{busy === 'save' ? 'Saving…' : row.is_urgent ? 'Save' : 'Mark urgent'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
