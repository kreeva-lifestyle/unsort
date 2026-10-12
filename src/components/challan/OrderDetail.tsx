// One order's full record, opened by tapping its card in Orders: the order
// ID and status, how much has gone out (meter), every line with sent / due,
// every challan made from it (a voided one marked, its pieces back on the
// order), and the history — who created, edited, made a challan, voided,
// cancelled or reopened it, and when (audit_log, written by the database).
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { T, S, alpha } from '../../lib/theme';
import { fmtWhen } from '../../lib/humanize';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import ActivityList, { type ActionMeta } from '../ui/ActivityList';
import type { AuditLog } from '../../types/database';
import { fmtOrderNo, lineLeft, deliveredCount, pieceCount, loadOrderHistory, type OrderRow } from './pendingOrdersModel';

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: T.yl }, converted: { label: 'Processed', color: T.gr }, cancelled: { label: 'Cancelled', color: T.tx3 },
};
const ACTIONS: Record<string, ActionMeta> = {
  CREATE: { label: 'Created', tone: 'ac' }, UPDATE: { label: 'Edited', tone: 'ac' }, CHALLAN_MADE: { label: 'Challan made', tone: 'bl' }, CHALLAN_EDITED: { label: 'Challan edited', tone: 'yl' },
  PIECES_BACK: { label: 'Challan voided', tone: 're' }, PROCESSED: { label: 'Processed', tone: 'gr' }, CANCELLED: { label: 'Cancelled', tone: 're' }, REOPENED: { label: 'Reopened', tone: 'neutral' },
};

export default function OrderDetail({ order: o, canEdit, onClose, onMake, addToast }: {
  order: OrderRow; canEdit: boolean; onClose: () => void;
  /** "Make challan" for what is still due (opens the pick sheet). */
  onMake: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock(true);
  useBackClose(true, onClose);
  const [history, setHistory] = useState<AuditLog[] | null | 'error'>(null);
  const load = useCallback(() => {
    setHistory(null);
    loadOrderHistory(o.id).then(setHistory).catch(e => { addToast(friendlyError(e), 'error'); setHistory('error'); });
  }, [o.id, addToast]);
  useEffect(load, [load]);

  const total = pieceCount(o), sent = deliveredCount(o), pct = total > 0 ? Math.round(sent / total * 100) : 0;
  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.pending;
  const deliveries = [...o.cash_challan_order_deliveries].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', margin: '16px 0 6px' };
  const strip = (d: string | null) => (d ?? '').replace(new RegExp(`^${fmtOrderNo(o.order_number)}(?: —)? ?`), '');

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ ...S.modalTitle, fontFamily: T.mono }}>{fmtOrderNo(o.order_number)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: alpha(st.color, .12), color: st.color }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />{st.label}</span>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{o.customer_name}</div>
          <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{o.customer_phone ? `${o.customer_phone} · ` : ''}ordered <span style={{ fontFamily: T.mono }}>{fmtWhen(o.created_at)}</span>{o.status === 'converted' && o.converted_at ? <> · processed <span style={{ fontFamily: T.mono }}>{fmtWhen(o.converted_at)}</span></> : null}</div>

          {/* How much has gone out */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx2, marginBottom: 5 }}><span><b style={{ color: T.tx }}>{sent}</b> of {total} pcs sent</span><span>{total - sent > 0 ? `${total - sent} due` : 'nothing due'}</span></div>
            <div role="img" aria-label={`${sent} of ${total} pieces sent`} style={{ height: 6, borderRadius: 3, background: T.glass2, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: sent >= total ? T.gr : T.yl }} /></div>
          </div>

          <div style={label}>Items</div>
          <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
            {o.items.map((it, i) => {
              const done = Math.min(Number(it.delivered) || 0, Number(it.quantity) || 0), left = lineLeft(it);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${T.bd}` : 'none', fontSize: 12 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: it.sku ? T.mono : T.sans, color: T.tx }}>{it.sku || it.description}</span>
                  <span style={{ fontFamily: T.mono, color: T.tx2 }}>{it.quantity} ordered</span>
                  <span style={{ fontFamily: T.mono, minWidth: 64, textAlign: 'right', color: left > 0 ? (done > 0 ? T.yl : T.tx3) : T.gr }}>{left > 0 ? `${left} due` : 'all sent'}</span>
                </div>
              );
            })}
          </div>

          <div style={label}>Challans</div>
          {deliveries.length === 0 && <div style={{ fontSize: 11, color: T.tx3 }}>No challan made from this order yet.</div>}
          {deliveries.map(d => {
            const pcs = d.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
            return (
              <div key={d.id} style={{ padding: '7px 10px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 6, marginBottom: 4, fontSize: 12, opacity: d.reversed_at ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span><span style={{ fontFamily: T.mono, fontWeight: 600, color: d.reversed_at ? T.tx3 : T.ac2, textDecoration: d.reversed_at ? 'line-through' : 'none' }}>#{d.cash_challans?.challan_number ?? '—'}</span> <span style={{ color: T.tx2 }}>· {pcs} pcs</span>{d.reversed_at && <span style={{ color: T.re, fontSize: 11 }}> · {d.cash_challans?.status === 'voided' ? 'voided, pieces back on the order' : 'nothing on it is counted for this order'}</span>}</span>
                  <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{fmtWhen(d.created_at)}</span>
                </div>
                {d.lines.length > 0 && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{d.lines.map(l => `${l.sku || l.description} ×${l.qty}`).join(' · ')}</div>}
              </div>
            );
          })}

          {o.notes && <><div style={label}>Notes</div><div style={{ fontSize: 12, color: T.tx2, whiteSpace: 'pre-wrap' }}>{o.notes}</div></>}

          <div style={label}>History</div>
          <ActivityList rows={history} actions={ACTIONS} strip={strip} onRetry={load} />
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Close</button>
          {canEdit && o.status === 'pending' && total - sent > 0 && <button type="button" onClick={onMake} style={{ ...S.btnPrimary, minHeight: 44 }}>Make challan · {total - sent} due</button>}
        </div>
      </div>
    </div>,
    document.body);
}
