// Cash Challan → Pending Orders: orders taken before the goods are ready.
// Pending ones offer "Make challan" (opens the challan form pre-filled, the
// parent handles that and marks the order converted after the save);
// converted ones show the challan they became; cancelled ones can be reopened.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import PendingOrderForm from './PendingOrderForm';
import type { CashChallanOrder, CashChallanOrderStatus } from '../../types/database';
import { fetchOrders, cancelOrder, reopenOrder, pieceCount, type OrderRow } from './pendingOrdersModel';

const TABS: { key: CashChallanOrderStatus; label: string }[] = [{ key: 'pending', label: 'Pending' }, { key: 'converted', label: 'Converted' }, { key: 'cancelled', label: 'Cancelled' }];
const ago = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

export default function PendingOrders({ canEdit, onConvert, addToast }: {
  canEdit: boolean;
  /** Open the challan form pre-filled from this order. */
  onConvert: (o: CashChallanOrder) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [tab, setTab] = useState<CashChallanOrderStatus>('pending');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: CashChallanOrder | null }>({ open: false, editing: null });
  const [busyId, setBusyId] = useState('');
  const { ask, modalProps } = useConfirm();

  const load = useCallback(() => {
    fetchOrders(tab, search).then(setRows).catch(e => { addToast(friendlyError(e), 'error'); setRows([]); });
  }, [tab, search, addToast]);
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);

  const cancel = async (o: OrderRow) => {
    if (!await ask({ title: `Cancel ${o.customer_name}'s order?`, message: 'It moves to Cancelled and can be reopened later.', confirmLabel: 'Cancel order', danger: true })) return;
    setBusyId(o.id);
    try { await cancelOrder(o.id); addToast('Order cancelled', 'success'); load(); } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusyId('');
  };
  const reopen = async (o: OrderRow) => {
    setBusyId(o.id);
    try { await reopenOrder(o.id); addToast('Order is pending again', 'success'); load(); } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusyId('');
  };

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>Pending orders</div>
          <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Orders taken before the goods are ready · make a challan when they are</div>
        </div>
        {canEdit && <button onClick={() => setForm({ open: true, editing: null })} style={S.btnPrimary} className="desktop-only">+ New order</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setRows(null); }} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, ...(tab === t.key ? { background: T.ac3, color: T.ac2 } : { color: T.tx3, borderColor: T.bd2 }) }}>{t.label}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer…" style={{ ...S.fSearch, width: '100%' }} />
        </div>
      </div>

      {rows === null && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ padding: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
          <Empty icon="receipt" title={search ? 'No orders match' : tab === 'pending' ? 'No pending orders' : `No ${tab} orders`}
            message={tab === 'pending' && !search ? 'Record what a customer has ordered; when the goods are ready, make the challan from here.' : undefined}
            cta={canEdit && tab === 'pending' && !search ? '+ New order' : undefined} onCta={() => setForm({ open: true, editing: null })} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows?.map(o => {
          const busy = busyId === o.id;
          return (
            <div key={o.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, opacity: busy ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                    {o.items.length} item{o.items.length === 1 ? '' : 's'} · {pieceCount(o)} pcs · {ago(o.created_at)}{o.customer_phone ? ` · ${o.customer_phone}` : ''}
                  </div>
                </div>
                {o.status === 'converted' && <span style={{ fontSize: 11, fontWeight: 600, color: T.gr, whiteSpace: 'nowrap' }}>Challan #{o.cash_challans?.challan_number ?? '—'}</span>}
                {o.status === 'cancelled' && <span style={{ fontSize: 11, fontWeight: 600, color: T.tx3 }}>Cancelled</span>}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {o.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: T.tx2 }}>
                    <span style={{ fontFamily: T.mono, minWidth: 36, textAlign: 'right', color: T.tx }}>{it.quantity}×</span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sku && <span style={{ fontFamily: T.mono, color: T.ac2 }}>{it.sku}</span>}{it.sku && it.description ? ' · ' : ''}{it.description}</span>
                  </div>
                ))}
              </div>
              {o.notes && <div style={{ marginTop: 6, fontSize: 11, color: T.tx3, whiteSpace: 'pre-wrap' }}>{o.notes}</div>}
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {o.status === 'pending' && <>
                    <button onClick={() => onConvert(o)} disabled={busy} style={{ ...S.btnPrimary, minHeight: 40 }}>Make challan</button>
                    <button onClick={() => setForm({ open: true, editing: o })} disabled={busy} style={{ ...S.btnGhost, minHeight: 40 }}>Edit</button>
                    <button onClick={() => cancel(o)} disabled={busy} style={{ ...S.btnDanger, minHeight: 40, marginLeft: 'auto' }}>{busy ? 'Working…' : 'Cancel'}</button>
                  </>}
                  {o.status === 'cancelled' && <button onClick={() => reopen(o)} disabled={busy} style={{ ...S.btnGhost, minHeight: 40 }}>{busy ? 'Working…' : 'Reopen'}</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && createPortal(<button className="fab" aria-label="New pending order" onClick={() => setForm({ open: true, editing: null })}>+</button>, document.body)}
      {form.open && <PendingOrderForm editing={form.editing} onClose={() => setForm({ open: false, editing: null })} onSaved={() => { setForm({ open: false, editing: null }); load(); }} addToast={addToast} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
