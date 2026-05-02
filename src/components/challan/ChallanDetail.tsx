import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import type { CashChallan, CashChallanItem } from '../../types/database';

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

type TimelineEntry = { type: 'audit' | 'payment'; time: string; action?: string; details?: string; user_name?: string; changes?: Record<string, { from: unknown; to: unknown }> | null; amount?: number; payment_mode?: string; is_reversal?: boolean; notes?: string; batch_id?: string | null };

export default function ChallanDetail({ challan: c, onClose, onEdit, onPrint, onRemind, onReturn, onVoid }: Props) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from('audit_log').select('action, details, user_email, changes, created_at').eq('module', 'cash_challan').eq('record_id', c.id).order('created_at'),
      supabase.from('cash_challan_payments').select('amount, payment_mode, payment_date, paid_by, notes, is_reversal, created_at, batch_id').eq('challan_id', c.id).order('created_at'),
    ]).then(async ([auditRes, payRes]) => {
      const entries: TimelineEntry[] = [];
      for (const a of (auditRes.data || [])) entries.push({ type: 'audit', time: a.created_at || '', action: a.action, details: a.details || '', user_name: a.user_email || undefined, changes: a.changes as any });
      const payData = payRes.data || [];
      if (payData.length > 0) {
        const userIds = [...new Set(payData.filter(p => p.paid_by).map(p => p.paid_by!))];
        const nameMap: Record<string, string> = {};
        if (userIds.length > 0) { const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds); (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || 'User'; }); }
        for (const p of payData) entries.push({ type: 'payment', time: p.created_at || '', amount: Number(p.amount), payment_mode: p.payment_mode, is_reversal: p.is_reversal, user_name: p.paid_by ? nameMap[p.paid_by] || 'User' : undefined, notes: p.notes || undefined, batch_id: p.batch_id });
      }
      entries.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      setTimeline(entries);
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
      <div className="modal-inner challan-detail-modal" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 0, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

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
            <div className="table-wrap" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 360 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: isVoided ? T.tx3 : T.gr, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 6, marginTop: 4, textDecoration: isVoided ? 'line-through' : 'none' }}>
              <span>Total</span><span>{isRet ? '−' : ''}₹{Math.abs(Number(c.total)).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Voided banner — makes the reversed-payment state unambiguous */}
          {isVoided && (
            <div style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${T.bd2}`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: T.tx3 }}>
              <span style={{ fontWeight: 600, color: T.tx2 }}>Voided</span>
              {Number(c.amount_paid || 0) > 0 && <span> — ₹{Number(c.amount_paid).toLocaleString('en-IN')} was collected and has been reversed. Net effect: ₹0.</span>}
              {Number(c.amount_paid || 0) === 0 && <span> — this challan is cancelled and excluded from all financial calculations.</span>}
            </div>
          )}

          {/* Payment summary — hide for voided (handled by banner above) */}
          {!isVoided && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div><div style={label}>Total Paid</div><div style={{ ...val, fontFamily: T.mono, color: Number(c.amount_paid) > 0 ? T.gr : T.tx3 }}>₹{Number(c.amount_paid || 0).toLocaleString('en-IN')}</div></div>
              {due > 0 && !isRet && <div><div style={label}>Outstanding</div><div style={{ ...val, fontFamily: T.mono, color: T.re }}>₹{due.toLocaleString('en-IN')}</div></div>}
            </div>
          )}

          {/* Activity Timeline — audit trail + payments merged chronologically */}
          {timeline.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 9, color: T.tx3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Activity Timeline</div>
              {timeline.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0, background: e.type === 'payment' ? (e.is_reversal ? T.re : T.gr) : e.action === 'VOID' ? T.re : e.action === 'CREATE' ? T.ac2 : T.yl }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {e.type === 'payment' ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: T.mono, fontWeight: 600, color: e.is_reversal ? T.re : T.gr }}>{e.is_reversal ? '−' : '+'}₹{Number(e.amount).toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3 }}>{e.payment_mode}</span>
                          {e.batch_id && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(99,102,241,.1)', color: T.ac2, fontFamily: T.mono, fontWeight: 600 }}>{e.batch_id}</span>}
                          {e.user_name && <span style={{ fontSize: 9, color: T.tx3 }}>by {e.user_name}</span>}
                        </div>
                        {e.notes && e.notes !== 'Backfilled from existing payment data' && <div style={{ fontSize: 9, color: T.tx3, marginTop: 2 }}>{e.notes}</div>}
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: T.tx, fontSize: 10 }}>{e.action === 'CREATE' ? 'Created' : e.action === 'UPDATE' ? 'Updated' : e.action === 'VOID' ? 'Voided' : e.action === 'BULK_PAY' ? 'Bulk Paid' : e.action === 'BULK_UNPAY' ? 'Bulk Unpaid' : e.action || 'Changed'}</span>
                          {e.user_name && <span style={{ fontSize: 9, color: T.tx3 }}>by {e.user_name}</span>}
                        </div>
                        {e.changes && Object.keys(e.changes).length > 0 && (
                          <div style={{ marginTop: 3 }}>
                            {Object.entries(e.changes).map(([field, { from, to }]) => (
                              <div key={field} style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>
                                {field}: <span style={{ color: T.re }}>{String(from ?? '—')}</span> → <span style={{ color: T.gr }}>{String(to ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {e.time && <span style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono, whiteSpace: 'nowrap', marginTop: 2 }}>{new Date(e.time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(e.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Notes + Tags */}
          {c.notes && <div style={{ fontSize: 11, color: T.tx2, marginBottom: 6 }}><span style={{ color: T.tx3, fontSize: 9, fontWeight: 600 }}>NOTES: </span>{c.notes}</div>}
          {c.tags && c.tags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>{c.tags.map(t => <span key={t} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,.08)', color: T.ac2, fontWeight: 500 }}>{t}</span>)}</div>}

          {/* Action buttons */}
          <div className="challan-detail-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
            {!isVoided && <button onClick={onEdit} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>}
            <button onClick={onPrint} style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Print</button>
            {canRemind && <button onClick={onRemind} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.08)', color: T.gr, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>WhatsApp</button>}
            {canReturn && <button onClick={onReturn} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', color: T.re, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↩ Return</button>}
            {!isVoided && <button onClick={onVoid} style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Void</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
