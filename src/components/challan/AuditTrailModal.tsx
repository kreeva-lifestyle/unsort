// Audit-trail modal for a challan — extracted from ChallanForm.tsx for the
// file budget. Pure display: the parent owns loading and the open/close state.
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import type { AuditLog } from '../../types/database';

export default function AuditTrailModal({ trail, onClose }: { trail: AuditLog[]; onClose: () => void }) {
  return createPortal(
    <div style={S.modalOverlay}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', padding: '18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Audit Trail</span>
          <button onClick={onClose} style={{ ...S.btnGhost, ...S.btnSm }}>Close</button>
        </div>
        {trail.length === 0 && <div style={{ padding: 16, textAlign: 'center' as const, color: T.tx3, fontSize: 11 }}>No history for this challan.</div>}
        {trail.map(a => (
          <div key={a.id} style={{ padding: '8px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: a.action === 'VOID' ? 'oklch(0.63 0.22 25 / 0.12)' : a.action === 'CREATE' ? 'oklch(0.72 0.19 145 / 0.12)' : T.ac3, color: a.action === 'VOID' ? T.re : a.action === 'CREATE' ? T.gr : T.ac2, fontWeight: 700 }}>{a.action}</span>
              <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>{a.created_at ? new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
            <div style={{ color: T.tx2, fontSize: 11 }}>{a.details}</div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
