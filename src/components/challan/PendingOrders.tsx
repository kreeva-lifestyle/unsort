// Cash Challan → Orders: orders taken before the goods are ready. A pending
// order offers "Make challan": pick what goes out now (OrderPickSheet), the
// parent opens the challan form with those lines, and the save records
// what the challan delivered. Anything not sent keeps the order pending,
// line by line ("2 of 4 sent · 2 due"); the challans made from it are
// listed. Every order has an ID (ORD-0012) that the challans made from it
// carry too; search finds it by ID, customer, phone, SKU or notes. A card
// opens the order's full record (OrderDetail: challans + history). The
// summary and the waiting badge point at what is late. Processed = every
// piece sent; cancelled ones can be reopened.
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import PendingOrderForm from './PendingOrderForm';
import OrderPickSheet from './OrderPickSheet';
import OrderDetail from './OrderDetail';
import type { CashChallanOrder, CashChallanOrderStatus } from '../../types/database';
import { fetchOrders, fetchOrder, cancelOrder, reopenOrder, pieceCount, lineLeft, deliveredCount, leftCount, challansOf, fmtOrderNo, type OrderRow } from './pendingOrdersModel';

const TABS: { key: CashChallanOrderStatus; label: string }[] = [{ key: 'pending', label: 'Pending' }, { key: 'converted', label: 'Processed' }, { key: 'cancelled', label: 'Cancelled' }];
const daysOld = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const ago = (iso: string) => { const d = daysOld(iso); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
/** A pending order waiting over a week is flagged, over two weeks red. */
const ageColor = (d: number) => (d > 14 ? T.re : d > 7 ? T.yl : T.tx3);

export default function PendingOrders({ canEdit, onConvert, addToast }: {
  canEdit: boolean;
  /** Open the challan form with `picks[i]` pieces of each order line. */
  onConvert: (o: CashChallanOrder, picks: number[]) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [tab, setTab] = useState<CashChallanOrderStatus>('pending');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: CashChallanOrder | null }>({ open: false, editing: null });
  const [picking, setPicking] = useState<OrderRow | null>(null);
  const [viewing, setViewing] = useState<OrderRow | null>(null);
  const [busyId, setBusyId] = useState('');
  const { ask, modalProps } = useConfirm();

  // Only the newest read lands (a slow read from the previous tab or search must not overwrite this one).
  const seq = useRef(0);
  const load = useCallback(() => {
    const my = ++seq.current;
    fetchOrders(tab, search).then(r => { if (my === seq.current) setRows(r); }).catch(e => { if (my !== seq.current) return; addToast(friendlyError(e), 'error'); setRows([]); });
  }, [tab, search, addToast]);
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);

  const cancel = async (o: OrderRow) => {
    const sent = deliveredCount(o);
    if (!await ask({ title: `Cancel ${o.customer_name}'s order?`, message: sent > 0 ? `The ${leftCount(o)} pcs still due are dropped (the ${sent} already sent stay on their challans). It moves to Cancelled and can be reopened later.` : 'It moves to Cancelled and can be reopened later.', confirmLabel: 'Cancel order', danger: true })) return;
    setBusyId(o.id);
    try { await cancelOrder(o.id); addToast('Order cancelled', 'success'); load(); } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusyId('');
  };
  // The pick sheet starts from the order as it is now (someone may have made a challan from it meanwhile).
  // From the detail sheet, the detail stays up until the fresh order is in and is swapped for the pick
  // sheet in the same render, so the pick sheet takes over its history entry (useBackClose).
  const pick = async (o: OrderRow) => {
    setBusyId(o.id);
    try {
      const fresh = await fetchOrder(o.id);
      setViewing(null);
      if (!fresh || fresh.status !== 'pending' || leftCount(fresh) <= 0) { addToast(`${fmtOrderNo(o.order_number)} is no longer pending — refreshed`, 'error'); load(); }
      // One piece left: nothing to choose, straight to the challan form.
      else if (leftCount(fresh) === 1) onConvert(fresh, fresh.items.map(lineLeft));
      else setPicking(fresh);
    } catch (e) { addToast(friendlyError(e), 'error'); }
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
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>Orders</div>
          <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Orders taken before the goods are ready · make a challan for all or part of one; the rest stays pending</div>
        </div>
        {canEdit && <button onClick={() => setForm({ open: true, editing: null })} style={S.btnPrimary} className="desktop-only">+ New order</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setRows(null); }} aria-pressed={tab === t.key} style={{ ...S.btnGhost, minHeight: 36, ...(tab === t.key ? { background: T.ac3, color: T.ac2, borderColor: T.ac33 } : { color: T.tx3, borderColor: T.bd2 }) }}>{t.label}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 340 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5, pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ORD-0012, customer, phone, SKU…" style={{ ...S.fSearch, width: '100%' }} />
        </div>
      </div>

      {tab === 'pending' && !search && rows && rows.length > 0 && (() => {
        const due = rows.reduce((s, o) => s + leftCount(o), 0), part = rows.filter(o => deliveredCount(o) > 0).length;
        const late = rows.filter(o => daysOld(o.created_at) > 7).length, oldest = Math.max(...rows.map(o => daysOld(o.created_at)));
        return (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.tx2, marginBottom: 10 }}>
            <span><b style={{ color: T.tx }}>{rows.length}</b> pending</span><span><b style={{ color: T.tx }}>{due}</b> pcs due</span>
            {part > 0 && <span><b style={{ color: T.yl }}>{part}</b> part-sent</span>}
            {late > 0 && <span><b style={{ color: ageColor(oldest) }}>{late}</b> waiting over a week</span>}
            <span>oldest <b style={{ color: ageColor(oldest) }}>{oldest === 0 ? 'today' : `${oldest} day${oldest === 1 ? '' : 's'}`}</b></span>
          </div>
        );
      })()}
      {rows === null && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ padding: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
          <Empty icon="receipt" title={search ? 'No orders match' : tab === 'pending' ? 'No pending orders' : tab === 'converted' ? 'No processed orders' : 'No cancelled orders'}
            message={tab === 'pending' && !search ? 'Record what a customer has ordered; when the goods are ready, make the challan from here — all of it or part.' : undefined}
            cta={canEdit && tab === 'pending' && !search ? '+ New order' : undefined} onCta={() => setForm({ open: true, editing: null })} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows?.map(o => {
          const busy = busyId === o.id;
          const sent = deliveredCount(o), total = pieceCount(o), nums = challansOf(o);
          const part = sent > 0 && sent < total;
          return (
            <div key={o.id} onClick={() => setViewing(o)} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, opacity: busy ? 0.6 : 1, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: T.mono, fontWeight: 600, color: T.ac2 }}>{fmtOrderNo(o.order_number)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                    {o.items.length} item{o.items.length === 1 ? '' : 's'} · {total} pcs · <span style={o.status === 'pending' ? { color: ageColor(daysOld(o.created_at)), fontWeight: daysOld(o.created_at) > 7 ? 600 : 400 } : undefined}>{o.status === 'pending' && daysOld(o.created_at) > 7 ? `waiting ${daysOld(o.created_at)} days` : ago(o.created_at)}</span>{o.customer_phone ? ` · ${o.customer_phone}` : ''}
                  </div>
                </div>
                {part && o.status === 'pending' && <span style={{ fontSize: 11, fontWeight: 600, color: T.yl, whiteSpace: 'nowrap' }}>{sent} of {total} sent</span>}
                {o.status === 'converted' && <span style={{ fontSize: 11, fontWeight: 600, color: T.gr, whiteSpace: 'nowrap' }}>Processed</span>}
                {o.status === 'cancelled' && <span style={{ fontSize: 11, fontWeight: 600, color: T.tx3 }}>Cancelled</span>}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {o.items.map((it, i) => {
                  const done = Math.min(Number(it.delivered) || 0, Number(it.quantity) || 0), left = lineLeft(it);
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: T.tx2, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: T.mono, minWidth: 36, textAlign: 'right', color: left === 0 && done > 0 ? T.tx3 : T.tx }}>{it.quantity}×</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(left === 0 && done > 0 && o.status === 'pending' ? { color: T.tx3, textDecoration: 'line-through' } : {}) }}>{it.sku && <span style={{ fontFamily: T.mono, color: T.ac2 }}>{it.sku}</span>}{it.sku && it.description ? ' · ' : ''}{it.description}</span>
                      {done > 0 && o.status !== 'converted' && <span style={{ fontSize: 11, whiteSpace: 'nowrap', color: left > 0 && o.status === 'pending' ? T.yl : left > 0 ? T.tx3 : T.gr }}>{left > 0 ? (o.status === 'pending' ? `${done} sent · ${left} due` : `${done} sent`) : 'sent'}</span>}
                    </div>
                  );
                })}
              </div>
              {nums.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: T.tx3 }}>On challan{nums.length === 1 ? '' : 's'} <span style={{ color: T.gr, fontWeight: 600 }}>{nums.map(x => `#${x}`).join(' · ')}</span></div>}
              {o.notes && <div style={{ marginTop: 6, fontSize: 11, color: T.tx3, whiteSpace: 'pre-wrap' }}>{o.notes}</div>}
              {/* Desktop: natural-width buttons, right-aligned, primary last (house card
                  layout). Mobile (.order-actions in index.css): Make challan spans
                  the row, Edit/Cancel share the next one, all 44px. */}
              {canEdit && (
                <div className="order-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                  {o.status === 'pending' && <>
                    <button onClick={() => setForm({ open: true, editing: o })} disabled={busy} style={S.btnGhost}>Edit</button>
                    <button onClick={() => cancel(o)} disabled={busy} style={S.btnDanger}>{busy ? 'Working…' : 'Cancel'}</button>
                    <button onClick={() => pick(o)} disabled={busy} className="order-primary" style={S.btnPrimary}>{part ? `Make challan · ${total - sent} due` : 'Make challan'}</button>
                  </>}
                  {o.status === 'cancelled' && <button onClick={() => reopen(o)} disabled={busy} style={S.btnGhost}>{busy ? 'Working…' : 'Reopen'}</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && createPortal(<button className="fab" aria-label="New order" onClick={() => setForm({ open: true, editing: null })}>+</button>, document.body)}
      {form.open && <PendingOrderForm editing={form.editing} onClose={() => setForm({ open: false, editing: null })} onSaved={() => { setForm({ open: false, editing: null }); load(); }} addToast={addToast} />}
      {viewing && <OrderDetail order={viewing} canEdit={canEdit} addToast={addToast} onClose={() => setViewing(null)} onMake={() => pick(viewing)} />}
      {picking && <OrderPickSheet order={picking} onClose={() => setPicking(null)} onPick={picks => { const o = picking; setPicking(null); onConvert(o, picks); }} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
