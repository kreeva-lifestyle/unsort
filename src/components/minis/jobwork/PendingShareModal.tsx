// Share everything still pending with one jobworker, straight from the
// list: every jobworker with open jobs, how many pieces and jobs are still
// out (and what is owed, for admin/manager), and a Share button that sends
// the jobworker statement — all open jobs, pieces pending, material with
// them and the dated last movement.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import Toggle from '../../ui/Toggle';
import { openByVendor, type VendorPending } from './jobworkApi';
import { shareVendor } from './jobworkShare';
import { inr } from './jobworkModel';

export default function PendingShareModal({ boss, onClose, addToast }: {
  boss: boolean;
  onClose: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  const [rows, setRows] = useState<VendorPending[] | null>(null);
  const [money, setMoney] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    openByVendor().then(({ rows: r, error }) => {
      if (error) { addToast(friendlyError(error), 'error'); setRows([]); return; }
      setRows(r);
    });
  }, [addToast]);

  const share = async (v: string) => {
    if (busy) return;
    setBusy(v);
    await shareVendor(v, boss && money, addToast);
    setBusy(null);
  };
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={S.modalTitle}>Share pending</div>
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>All open jobs of one jobworker — pieces pending and material with them</div>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '10px 18px 18px', overflowY: 'auto' }}>
          {boss && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 10px', minHeight: 44 }}>
              <Toggle on={money} onToggle={() => setMoney(m => !m)} label="Include bill, paid and due" />
              <span onClick={() => setMoney(m => !m)} style={{ fontSize: 12, color: T.tx2, cursor: 'pointer' }}>Include bill, paid and due</span>
            </div>
          )}
          {rows === null ? <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
            : rows.length === 0 ? <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Nothing pending — no open jobs.</div>
            : rows.map(r => (
              <div key={r.vendor} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.bd}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vendor}</div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                    <b style={{ color: r.pending ? T.yl : T.tx2 }}>{r.pending}</b> pcs pending · {r.jobs} open job{r.jobs === 1 ? '' : 's'}
                    {r.overdue > 0 && <span style={{ color: T.re }}> · {r.overdue} overdue</span>}
                    {boss && r.due > 0 && <> · due <span style={{ fontFamily: T.mono, color: T.tx2 }}>{inr(r.due)}</span></>}
                  </div>
                </div>
                <button type="button" onClick={() => share(r.vendor)}
                  style={{ ...S.btnGhost, minHeight: 44, minWidth: 92, pointerEvents: busy ? 'none' : 'auto', opacity: busy && busy !== r.vendor ? 0.5 : 1 }}>
                  {busy === r.vendor ? 'Sharing…' : 'Share'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
