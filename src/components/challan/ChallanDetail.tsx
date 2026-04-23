import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import type { CashChallan, CashChallanItem, CashChallanPayment } from '../../types/database';

type Challan = CashChallan & { cash_challan_items?: Partial<CashChallanItem>[] };

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(56,189,248,.10)', color: T.bl },
  paid: { bg: 'rgba(34,197,94,.10)', color: T.gr },
  unpaid: { bg: 'rgba(239,68,68,.10)', color: T.re },
  partial: { bg: 'rgba(245,158,11,.10)', color: T.yl },
  voided: { bg: 'rgba(255,255,255,.10)', color: T.tx3 },
};

interface Props {
  challan: Challan;
  onClose: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onRemind: () => void;
  onReturn: () => void;
  onVoid: () => void;
}

export default function ChallanDetail({ challan: c, onClose, onEdit, onPrint, onRemind, onReturn, onVoid }: Props) {
  const [payments, setPayments] = useState<(CashChallanPayment & { paid_by_name?: string })[]>([]);
  useEffect(() => {
    supabase.from('cash_challan_payments').select('id, challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, created_at')
      .eq('challan_id', c.id).order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) { setPayments([]); return; }
        const userIds = [...new Set(data.filter(p => p.paid_by).map(p => p.paid_by!))];
        if (userIds.length === 0) { setPayments(data); return; }
        supabase.from('profiles').select('id, full_name').in('id', userIds).then(({ data: profiles }) => {
          const nameMap: Record<string, string> = {};
          (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || 'User'; });
          setPayments(data.map(p => ({ ...p, paid_by_name: p.paid_by ? nameMap[p.paid_by] || 'User' : undefined })));
        });
      });
  }, [c.id]);
  const sc = STATUS_COLORS[c.status] || STATUS_COLORS.unpaid;
  const items = c.cash_challan_items || [];
  const isRet = !!c.is_return;
  const isVoided = c.status === 'voided';
  const due = Number(c.total) - Number(c.amount_paid || 0);
  const canRemind = !isRet && (c.status === 'unpaid' || c.status === 'partial');
  const canReturn = !isRet && !isVoided && c.status !== 'draft';

  const label = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 3 };
  const val = { fontSize: 12, color: T.tx, fontWeight: 500 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }} onClick={onClose}>
      <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 0, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora }}>#{c.challan_number}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{c.customer_name}</span>
            <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 4, background: sc.bg, color: sc.color, fontWeight: 700, textTransform: 'uppercase' }}>{isRet ? 'Refunded' : c.status}</span>
            {isRet && <span style={{ fontSize: 7, padding: '2px 6px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>↩ Return</span>}
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1, padding: '0 4px' }}>&times;</span>
        </div>

        <div style={{ padding: '14px 18px' }}>
          {/* Date */}
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 12 }}>
            {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            {c.updated_at && c.updated_at !== c.created_at && <span> · Updated {new Date(c.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: T.tx3, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>SKU</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: T.tx3, fontSize: 9, fontWeight: 600 }}>Qty</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: T.tx3, fontSize: 9, fontWeight: 600 }}>Price</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: T.tx3, fontSize: 9, fontWeight: 600 }}>Disc</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: T.tx3, fontSize: 9, fontWeight: 600 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.bd}` }}>
                      <td style={{ padding: '6px 10px', fontFamily: T.mono, color: T.tx }}>{it.sku || '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: T.tx2 }}>{it.quantity ?? 0}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: T.mono, color: T.tx2 }}>₹{Number(it.price || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: T.mono, color: Number(it.discount_amount || 0) > 0 ? T.re : T.tx3 }}>{Number(it.discount_amount || 0) > 0 ? `-₹${Number(it.discount_amount).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: T.mono, fontWeight: 600, color: T.tx }}>₹{Number(it.total || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals card */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx2, marginBottom: 3 }}><span>Subtotal</span><span style={{ fontFamily: T.mono }}>₹{Number(c.subtotal).toLocaleString('en-IN')}</span></div>
            {Number(c.discount_amount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.re, marginBottom: 3 }}><span>Item Discounts</span><span style={{ fontFamily: T.mono }}>-₹{Number(c.discount_amount).toLocaleString('en-IN')}</span></div>}
            {Number(c.shipping_charges) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.bl, marginBottom: 3 }}><span>Shipping/Porter</span><span style={{ fontFamily: T.mono }}>+₹{Number(c.shipping_charges).toLocaleString('en-IN')}</span></div>}
            {Number(c.round_off) !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, marginBottom: 3 }}><span>Round Off</span><span style={{ fontFamily: T.mono }}>{Number(c.round_off) > 0 ? '+' : ''}₹{Number(c.round_off).toFixed(2)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.gr, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 6, marginTop: 4 }}>
              <span>Total</span><span>{isRet ? '−' : ''}₹{Math.abs(Number(c.total)).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Payment summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <div><div style={label}>Total Paid</div><div style={{ ...val, fontFamily: T.mono, color: Number(c.amount_paid) > 0 ? T.gr : T.tx3 }}>₹{Number(c.amount_paid || 0).toLocaleString('en-IN')}</div></div>
            {due > 0 && !isRet && <div><div style={label}>Outstanding</div><div style={{ ...val, fontFamily: T.mono, color: T.re }}>₹{due.toLocaleString('en-IN')}</div></div>}
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 9, color: T.tx3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Payment History</div>
              {payments.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.is_reversal ? T.re : T.gr, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: T.mono, fontWeight: 600, color: p.is_reversal ? T.re : T.gr }}>{p.is_reversal ? '−' : '+'}₹{Number(p.amount).toLocaleString('en-IN')}</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3 }}>{p.payment_mode}</span>
                      <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                      {p.paid_by_name && <span style={{ fontSize: 9, color: T.tx3 }}>by {p.paid_by_name}</span>}
                    </div>
                    {p.notes && p.notes !== 'Backfilled from existing payment data' && <div style={{ fontSize: 9, color: T.tx3, marginTop: 2 }}>{p.notes}</div>}
                  </div>
                  {p.created_at && <span style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              ))}
            </div>
          )}
          {payments.length === 0 && Number(c.amount_paid || 0) === 0 && !isRet && c.status !== 'draft' && c.status !== 'voided' && (
            <div style={{ fontSize: 10, color: T.tx3, marginBottom: 12, fontStyle: 'italic' }}>No payments recorded yet.</div>
          )}

          {/* Notes + Tags */}
          {c.notes && <div style={{ fontSize: 11, color: T.tx2, marginBottom: 6 }}><span style={{ color: T.tx3, fontSize: 9, fontWeight: 600 }}>NOTES: </span>{c.notes}</div>}
          {c.tags && c.tags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>{c.tags.map(t => <span key={t} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,.08)', color: T.ac2, fontWeight: 500 }}>{t}</span>)}</div>}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
            {!isVoided && <button onClick={onEdit} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Edit</button>}
            <button onClick={onPrint} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Print</button>
            {canRemind && <button onClick={onRemind} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.08)', color: T.gr, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>WhatsApp</button>}
            {canReturn && <button onClick={onReturn} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', color: T.re, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>↩ Return</button>}
            {!isVoided && <button onClick={onVoid} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Void</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
