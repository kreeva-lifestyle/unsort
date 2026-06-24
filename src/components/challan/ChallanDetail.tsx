import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { T, S } from '../../lib/theme';
import { SkeletonRows } from '../ui/Skeleton';
import type { CashChallan, CashChallanItem } from '../../types/database';

type Challan = CashChallan & { cash_challan_items?: Partial<CashChallanItem>[] };

import { CHALLAN_STATUS_COLORS as STATUS_COLORS } from '../../lib/theme';

interface Props {
  challan: Challan;
  onClose: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onRemind: () => void;
  onReturn: () => void;
  onVoid: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  qrUrl?: string | null;
  upiId?: string | null;
}

const waPhone = (raw: string) => { const d = raw.replace(/\D/g, ''); return '91' + (d.startsWith('91') && d.length > 10 ? d.slice(2) : d); };

type TimelineEntry = { type: 'audit' | 'payment'; time: string; action?: string; details?: string; user_name?: string; changes?: Record<string, { from: unknown; to: unknown }> | null; amount?: number; payment_mode?: string; is_reversal?: boolean; notes?: string; batch_id?: string | null };

export default function ChallanDetail({ challan: c, onClose, onEdit, onPrint, onRemind, onReturn, onVoid, onNext, onPrev, hasNext, hasPrev, qrUrl, upiId }: Props) {
  const { addToast } = useNotifications();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [editSkuIdx, setEditSkuIdx] = useState<number | null>(null);
  const [editSkuVal, setEditSkuVal] = useState('');
  const [savingSku, setSavingSku] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotesVal, setEditNotesVal] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const [showQrShare, setShowQrShare] = useState(false);
  const [qrPhone, setQrPhone] = useState('');

  const sendQrWhatsApp = () => {
    const phone = qrPhone.trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) { return; }
    const due = Math.max(0, Number(c.total) - Number(c.amount_paid || 0));
    const amt = due > 0 ? due : Number(c.total);
    let msg = `Payment for Challan #${c.challan_number} — ₹${amt.toLocaleString('en-IN')}\n\n`;
    if (upiId) msg += `Pay via UPI ID: ${upiId}\n`;
    if (qrUrl) msg += `Scan QR: ${qrUrl}\n`;
    msg += `\nArya Designs`;
    window.location.href = `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(msg)}`;
    setShowQrShare(false);
  };

  const saveNotes = async () => {
    const newNotes = editNotesVal.trim() || null;
    const oldNotes = c.notes || null;
    if (newNotes === oldNotes) { setEditingNotes(false); return; }
    setSavingNotes(true);
    try {
      const { error } = await supabase.from('cash_challans').update({ notes: newNotes }).eq('id', c.id);
      if (error) { addToast(friendlyError(error), 'error'); setSavingNotes(false); return; }
      await supabase.from('audit_log').insert({ module: 'cash_challan', record_id: c.id, action: 'NOTES_EDIT', details: `Notes ${newNotes ? 'updated' : 'removed'} on challan #${c.challan_number}`, user_email: profile?.email, changes: { notes: { from: oldNotes, to: newNotes } } }).then(({ error: ae }) => { if (ae) console.warn('Audit log failed:', ae.message); });
      (c as any).notes = newNotes;
      addToast('Notes updated', 'success');
    } catch (e: any) { addToast(friendlyError(e), 'error'); }
    setSavingNotes(false);
    setEditingNotes(false);
  };

  const saveSkuEdit = async (item: Partial<CashChallanItem>, oldSku: string) => {
    const newSku = editSkuVal.trim();
    if (!newSku || newSku === oldSku) { setEditSkuIdx(null); return; }
    setSavingSku(true);
    try {
      const { error } = await supabase.from('cash_challan_items').update({ sku: newSku }).eq('id', item.id);
      if (error) { addToast(friendlyError(error), 'error'); setSavingSku(false); return; }
      await supabase.from('audit_log').insert({ module: 'cash_challan', record_id: c.id, action: 'SKU_EDIT', details: `SKU changed: ${oldSku} → ${newSku} (challan #${c.challan_number})`, user_email: profile?.email, changes: { sku: { from: oldSku, to: newSku } } }).then(({ error: ae }) => { if (ae) console.warn('Audit log failed:', ae.message); });
      (item as any).sku = newSku;
      addToast(`SKU updated: ${oldSku} → ${newSku}`, 'success');
    } catch (e: any) { addToast(friendlyError(e), 'error'); }
    setSavingSku(false);
    setEditSkuIdx(null);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef(0);
  const swipeLocked = useRef(false);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [c.id]);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => { swipeStartX.current = e.touches[0].clientX; swipeLocked.current = false; };
    const onEnd = (e: TouchEvent) => {
      if (swipeLocked.current) return;
      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      if (Math.abs(dx) < 80) return;
      swipeLocked.current = true;
      if (dx < -80 && hasNext && onNext) onNext();
      else if (dx > 80 && hasPrev && onPrev) onPrev();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd);
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
  }, [hasNext, hasPrev, onNext, onPrev]);

  useEffect(() => {
    setTimelineLoading(true);
    Promise.all([
      supabase.from('audit_log').select('action, details, user_email, changes, created_at').eq('module', 'cash_challan').eq('record_id', c.id).order('created_at'),
      supabase.from('cash_challan_payments').select('amount, payment_mode, payment_date, paid_by, notes, is_reversal, created_at, batch_id').eq('challan_id', c.id).order('created_at'),
    ]).then(async ([auditRes, payRes]) => {
      if (auditRes.error) addToast(friendlyError(auditRes.error), 'error');
      if (payRes.error) addToast(friendlyError(payRes.error), 'error');
      const entries: TimelineEntry[] = [];
      for (const a of (auditRes.data || [])) {
        if (a.action === 'INV_TOGGLE') continue;
        entries.push({ type: 'audit', time: a.created_at || '', action: a.action, details: a.details || '', user_name: a.user_email || undefined, changes: a.changes as any });
      }
      const payData = payRes.data || [];
      if (payData.length > 0) {
        const userIds = [...new Set(payData.filter(p => p.paid_by).map(p => p.paid_by!))];
        const nameMap: Record<string, string> = {};
        if (userIds.length > 0) { const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds); (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || 'User'; }); }
        for (const p of payData) entries.push({ type: 'payment', time: p.created_at || '', amount: Number(p.amount), payment_mode: p.payment_mode, is_reversal: p.is_reversal, user_name: p.paid_by ? nameMap[p.paid_by] || 'User' : undefined, notes: p.notes || undefined, batch_id: p.batch_id });
      }
      entries.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      setTimeline(entries);
      setTimelineLoading(false);
    }).catch(e => { addToast(friendlyError(e), 'error'); setTimelineLoading(false); });
  }, [c.id]);

  const sc = STATUS_COLORS[c.status] || STATUS_COLORS.unpaid;
  const items = c.cash_challan_items || [];
  const isRet = !!c.is_return;
  const isVoided = c.status === 'voided';
  const due = Number(c.total) - Number(c.amount_paid || 0);
  const canRemind = !isRet && (c.status === 'unpaid' || c.status === 'partial');
  const canReturn = !isRet && !isVoided;

  const btnBase: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx2, transition: 'all .15s' };

  const mobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const dragStartY = useRef(0);

  const onDragStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY; };
  const onDragEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    if (dy > 80 && scrollRef.current && scrollRef.current.scrollTop <= 0) onClose();
  };

  const content = (
    <div className="challan-detail-overlay" style={mobile
      ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)' }
      : { position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.80)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: 16 }
    } onClick={onClose}>
      <div ref={scrollRef} className="challan-detail-modal" style={mobile
        ? { position: 'fixed', bottom: 0, left: 0, right: 0, background: T.bg, borderRadius: '16px 16px 0 0', padding: 0, maxHeight: '85vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', animation: 'slideUp .25s ease both' }
        : { background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 0, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.65)' }
      } onClick={e => e.stopPropagation()} onTouchStart={mobile ? onDragStart : undefined} onTouchEnd={mobile ? onDragEnd : undefined}>

        {/* Drag handle — mobile only */}
        {mobile && <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}><div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} /></div>}

        {/* ── Header ── */}
        <div style={{ padding: mobile ? '14px 16px 10px' : '16px 20px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', ...(mobile ? {} : { position: 'sticky' as const, top: 0, background: T.s, zIndex: 2 }) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: mobile ? 16 : 18, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>#{c.challan_number}</span>
              <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: sc.bg, color: sc.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{isRet ? 'Return' : c.status}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{c.customer_name}</span>
              <span style={{ fontSize: 10, color: T.tx3 }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.bd}`, borderRadius: 6, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1, flexShrink: 0 }} title="Close" aria-label="Close">&times;</button>
        </div>

        <div style={{ padding: mobile ? '12px 16px' : '16px 20px', paddingBottom: mobile ? 20 : 16 }}>

          {/* ── Items table ── */}
          {items.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['SKU', 'Qty', 'Price', 'Disc', 'Total'].map((h, i) => (
                      <th key={h} style={{ ...S.thStyle, textAlign: i === 0 ? 'left' as const : 'right' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: i < items.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
                      <td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.tx, fontWeight: 500 }}>
                        {editSkuIdx === i ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input autoFocus value={editSkuVal} onChange={e => setEditSkuVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveSkuEdit(it, it.sku || ''); if (e.key === 'Escape') setEditSkuIdx(null); }} style={{ ...S.fInput, fontFamily: T.mono, fontSize: 11, padding: '4px 8px', height: 28, width: 100 }} disabled={savingSku} />
                            <button onClick={() => saveSkuEdit(it, it.sku || '')} disabled={savingSku} style={{ ...S.btnPrimary, padding: '4px 8px', fontSize: 10, borderRadius: 5, opacity: savingSku ? 0.5 : 1 }}>{savingSku ? '…' : '✓'}</button>
                            <button onClick={() => setEditSkuIdx(null)} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 10, borderRadius: 5 }}>✕</button>
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {it.sku || '—'}
                            {isAdmin && <button onClick={e => { e.stopPropagation(); setEditSkuIdx(i); setEditSkuVal(it.sku || ''); }} title="Edit SKU (admin)" aria-label="Edit SKU" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.4, display: 'inline-flex' }}>
                              <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.ac2, strokeWidth: 2 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>}
                          </span>
                        )}
                      </td>
                      <td style={{ ...S.tdStyle, textAlign: 'right', color: T.tx }}>{it.quantity ?? 0}</td>
                      <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, color: T.tx2 }}>₹{Number(it.price || 0).toLocaleString('en-IN')}</td>
                      <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, color: Number(it.discount_amount || 0) > 0 ? T.re : T.tx3 }}>{Number(it.discount_amount || 0) > 0 ? `-₹${Number(it.discount_amount).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, fontWeight: 600, color: T.tx }}>₹{Number(it.total || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Totals card ── */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx2, marginBottom: 4 }}><span>Subtotal</span><span style={{ fontFamily: T.mono }}>₹{Number(c.subtotal).toLocaleString('en-IN')}</span></div>
            {Number(c.discount_amount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.re, marginBottom: 4 }}><span>Item Discounts</span><span style={{ fontFamily: T.mono }}>-₹{Number(c.discount_amount).toLocaleString('en-IN')}</span></div>}
            {Number(c.shipping_charges) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.bl, marginBottom: 4 }}><span>Shipping/Porter</span><span style={{ fontFamily: T.mono }}>+₹{Number(c.shipping_charges).toLocaleString('en-IN')}</span></div>}
            {Number(c.round_off) !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, marginBottom: 4 }}><span>Round Off</span><span style={{ fontFamily: T.mono }}>{Number(c.round_off) > 0 ? '+' : ''}₹{Number(c.round_off).toFixed(2)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16, fontWeight: 800, color: isVoided ? T.tx3 : T.gr, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 6, textDecoration: isVoided ? 'line-through' : 'none' }}>
              <span>Total</span><span>{isRet ? '−' : ''}₹{Math.abs(Number(c.total)).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* ── Voided banner ── */}
          {isVoided && (
            <div style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${T.bd2}`, borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: T.tx2 }}>Voided</span>
              {Number(c.amount_paid || 0) > 0 ? <span> — ₹{Number(c.amount_paid).toLocaleString('en-IN')} was collected and has been reversed. Net effect: ₹0.</span> : <span> — this challan is cancelled and excluded from all financial calculations.</span>}
            </div>
          )}

          {/* ── Payment summary ── */}
          {!isVoided && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Total Paid</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: Number(c.amount_paid) > 0 ? T.gr : T.tx3 }}>₹{Number(c.amount_paid || 0).toLocaleString('en-IN')}</div>
              </div>
              {due > 0 && !isRet && (
                <div style={{ flex: 1, background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.12)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Outstanding</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: T.re }}>₹{due.toLocaleString('en-IN')}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Activity Timeline ── */}
          {timelineLoading && <SkeletonRows rows={2} />}
          {!timelineLoading && timeline.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${T.bd}`, fontSize: 9, color: T.tx3, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>Activity Timeline</div>
              {timeline.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 14px', borderBottom: i < timeline.length - 1 ? `1px solid ${T.bd}` : 'none', fontSize: 10 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 4, flexShrink: 0, background: e.type === 'payment' ? (e.is_reversal ? T.re : T.gr) : e.action === 'VOID' ? T.re : e.action === 'CREATE' ? T.ac2 : T.yl }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {e.type === 'payment' ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: T.mono, fontWeight: 600, color: e.is_reversal ? T.re : T.gr }}>{e.is_reversal ? '−' : '+'}₹{Number(e.amount).toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3 }}>{e.payment_mode}</span>
                          {e.batch_id && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(99,102,241,.1)', color: T.ac2, fontFamily: T.mono, fontWeight: 600 }}>{e.batch_id}</span>}
                          {e.user_name && <span style={{ fontSize: 9, color: T.tx3 }}>by {e.user_name}</span>}
                        </div>
                        {e.notes && e.notes !== 'Backfilled from existing payment data' && <div style={{ fontSize: 9, color: T.tx3, marginTop: 2 }}>{e.notes}</div>}
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: T.tx }}>{e.action === 'CREATE' ? 'Created' : e.action === 'UPDATE' ? 'Updated' : e.action === 'VOID' ? 'Voided' : e.action === 'BULK_PAY' ? 'Bulk Paid' : e.action === 'BULK_UNPAY' ? 'Bulk Unpaid' : e.action === 'INV_TOGGLE' ? 'Inv. Toggled' : e.action === 'SETTLE_REFUND' ? 'Settled Refund' : e.action === 'BATCH_UNDO' ? 'Batch Undo' : e.action || 'Changed'}</span>
                          {e.user_name && <span style={{ fontSize: 9, color: T.tx3 }}>by {e.user_name}</span>}
                        </div>
                        {e.changes && Object.keys(e.changes).length > 0 && (
                          <div style={{ marginTop: 3 }}>
                            {Object.entries(e.changes).map(([field, { from, to }]) => {
                              const labels: Record<string, string> = { inventory_deducted: 'Inventory', status: 'Status', amount_paid: 'Amt Paid', payment_mode: 'Payment Mode', customer_name: 'Customer', total: 'Total' };
                              const fmt = (v: unknown, f: string) => {
                                if (v === null || v === undefined) return '—';
                                if (f === 'inventory_deducted') return v ? 'Updated' : 'Not Updated';
                                if (typeof v === 'boolean') return v ? 'Yes' : 'No';
                                return String(v);
                              };
                              return (
                                <div key={field} style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>
                                  {labels[field] || field}: <span style={{ color: T.re }}>{fmt(from, field)}</span> → <span style={{ color: T.gr }}>{fmt(to, field)}</span>
                                </div>
                              );
                            })}
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

          {/* ── Notes + Tags ── */}
          <div style={{ fontSize: 11, color: T.tx2, marginBottom: 8, lineHeight: 1.5 }}>
            {editingNotes ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea autoFocus value={editNotesVal} onChange={e => setEditNotesVal(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setEditingNotes(false); }} rows={3} style={{ ...S.fInput, height: 'auto', resize: 'vertical', fontSize: 11 }} disabled={savingNotes} placeholder="Add a note…" />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={saveNotes} disabled={savingNotes} style={{ ...S.btnPrimary, padding: '4px 10px', fontSize: 10, borderRadius: 5, opacity: savingNotes ? 0.5 : 1 }}>{savingNotes ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditingNotes(false)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10, borderRadius: 5 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'flex-start', gap: 5 }} onClick={() => { setEditNotesVal(c.notes || ''); setEditingNotes(true); }}>
                {c.notes ? <><span style={{ color: T.tx3, fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>NOTES: </span>{c.notes}</> : <span style={{ color: T.ac2, fontSize: 11, fontWeight: 500 }}>+ Add notes</span>}
                <svg viewBox="0 0 24 24" style={{ width: 10, height: 10, fill: 'none', stroke: T.tx3, strokeWidth: 2, opacity: 0.3, flexShrink: 0, marginTop: 2 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </span>
            )}
          </div>
          {c.tags && c.tags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>{c.tags.map(t => <span key={t} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: T.ac3, color: T.ac2, fontWeight: 500 }}>{t}</span>)}</div>}

          {/* ── Action buttons ── */}
          <div className="challan-detail-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${T.bd}`, paddingTop: 14 }}>
            {!isVoided && c.status !== 'paid' && <button onClick={onEdit} style={{ ...S.btnPrimary, padding: '8px 16px' }}>Edit</button>}
            <button onClick={onPrint} style={btnBase}>Print</button>
            {qrUrl && <button onClick={() => { setQrPhone(c.customer_phone || ''); setShowQrShare(true); }} style={btnBase}>Share QR</button>}
            {canRemind && <button onClick={onRemind} style={{ ...S.btnSuccess, padding: '8px 16px' }}>Remind</button>}
            {canReturn && <button onClick={onReturn} style={{ ...S.btnDanger, padding: '8px 16px' }}>Return</button>}
            {!isVoided && (isRet || c.status !== 'paid') && <button onClick={onVoid} style={{ ...S.btnDanger, padding: '8px 16px' }}>Void</button>}
          </div>
        </div>
      </div>
    </div>
  );

  const qrModal = showQrShare && qrUrl ? createPortal(
    <div style={S.modalOverlay} onClick={() => setShowQrShare(false)}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 360, padding: '20px 18px' }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.modalHead, borderBottom: 'none', padding: '0 0 12px' }}>
          <div style={S.modalTitle}>Share Payment QR</div>
          <span onClick={() => setShowQrShare(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18 }}>&times;</span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <img src={qrUrl} alt="Payment QR" style={{ width: '100%', maxWidth: 220, borderRadius: 10, margin: '0 auto' }} />
          {upiId && <div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono, marginTop: 8 }}>{upiId}</div>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={S.fLabel}>Phone number</label>
          <input type="tel" value={qrPhone} onChange={e => setQrPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendQrWhatsApp(); }} placeholder="9876543210" style={{ ...S.fInput, fontFamily: T.mono }} />
        </div>
        <button onClick={sendQrWhatsApp} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', gap: 6 }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
          Send via WhatsApp
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return <>{createPortal(content, document.body)}{qrModal}</>;
}
