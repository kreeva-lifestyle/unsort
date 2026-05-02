import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [c.id]);

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

  const btnBase: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx2, transition: 'all .15s' };

  const shareChallan = () => {
    const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[ch] || ch));
    const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '-';
    const itemRows = items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.sku || '-')}</td><td style="text-align:right">${it.quantity ?? 0}</td><td style="text-align:right">₹${Number(it.price || 0).toLocaleString('en-IN')}</td><td style="text-align:right">${Number(it.discount_amount || 0) > 0 ? '-₹' + Number(it.discount_amount).toLocaleString('en-IN') : '-'}</td><td style="text-align:right">₹${Number(it.total || 0).toLocaleString('en-IN')}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Challan #${esc(c.challan_number)}</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#222;max-width:600px}
h2{margin:0;font-size:16px}table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{border:1px solid #ddd;padding:4px 6px;font-size:11px}th{background:#f5f5f5;font-weight:600}
.total{text-align:right;font-size:15px;font-weight:700;margin:8px 0}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}
@media print{@page{margin:10mm}}</style></head><body>
<h2>Arya Designs</h2>
<p style="color:#666;font-size:11px;margin:2px 0">Cash Challan #${esc(c.challan_number)} | ${dateStr}</p>
<p style="font-size:12px;margin:4px 0"><strong>Customer:</strong> ${esc(c.customer_name)}</p>
<table><thead><tr><th>#</th><th>SKU</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Disc</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
<p class="total">Total: ₹${Math.abs(Number(c.total)).toLocaleString('en-IN')}</p>
${due > 0 && !isRet ? `<p style="color:#c00;font-size:12px;font-weight:600">Outstanding: ₹${due.toLocaleString('en-IN')}</p>` : ''}
<p style="font-size:10px;color:#888;margin-top:16px">Powered by DailyOffice</p>
</body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    const iw = iframe.contentWindow;
    if (!iw) { iframe.remove(); return; }
    iw.document.write(html);
    iw.document.close();
    setTimeout(() => { iw.print(); setTimeout(() => iframe.remove(), 1000); }, 300);
  };

  return (
    <div style={{ ...S.modalOverlay, zIndex: 400, overflowY: 'auto' }} onClick={onClose}>
      <div ref={scrollRef} className="modal-inner challan-detail-modal" style={{ ...S.modalBox, maxWidth: 520, margin: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: T.s, zIndex: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>#{c.challan_number}</span>
              <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: sc.bg, color: sc.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{isRet ? 'Return' : c.status}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{c.customer_name}</span>
              <span style={{ fontSize: 10, color: T.tx3 }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.bd}`, borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.tx3, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>&times;</button>
        </div>

        <div style={{ padding: '16px 20px' }}>

          {/* ── Items table ── */}
          {items.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['SKU', 'Qty', 'Price', 'Disc', 'Total'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', color: T.tx3, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: `1px solid ${T.bd}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: i < items.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
                      <td style={{ padding: '8px 12px', fontFamily: T.mono, color: T.tx, fontWeight: 500 }}>{it.sku || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: T.tx }}>{it.quantity ?? 0}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: T.mono, color: T.tx2 }}>₹{Number(it.price || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: T.mono, color: Number(it.discount_amount || 0) > 0 ? T.re : T.tx3 }}>{Number(it.discount_amount || 0) > 0 ? `-₹${Number(it.discount_amount).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: T.mono, fontWeight: 600, color: T.tx }}>₹{Number(it.total || 0).toLocaleString('en-IN')}</td>
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
          {timeline.length > 0 && (
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
                          <span style={{ fontWeight: 600, color: T.tx }}>{e.action === 'CREATE' ? 'Created' : e.action === 'UPDATE' ? 'Updated' : e.action === 'VOID' ? 'Voided' : e.action === 'BULK_PAY' ? 'Bulk Paid' : e.action === 'BULK_UNPAY' ? 'Bulk Unpaid' : e.action || 'Changed'}</span>
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

          {/* ── Notes + Tags ── */}
          {c.notes && <div style={{ fontSize: 11, color: T.tx2, marginBottom: 8, lineHeight: 1.5 }}><span style={{ color: T.tx3, fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>NOTES: </span>{c.notes}</div>}
          {c.tags && c.tags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>{c.tags.map(t => <span key={t} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: 'rgba(99,102,241,.08)', color: T.ac2, fontWeight: 500 }}>{t}</span>)}</div>}

          {/* ── Action buttons ── */}
          <div className="challan-detail-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${T.bd}`, paddingTop: 14 }}>
            {!isVoided && <button onClick={onEdit} style={{ ...btnBase, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, border: 'none', color: '#fff' }}>Edit</button>}
            <button onClick={onPrint} style={btnBase}>Print</button>
            <button onClick={shareChallan} style={{ ...btnBase, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)', color: T.gr }}>Share</button>
            {canRemind && <button onClick={onRemind} style={{ ...btnBase, border: '1px solid rgba(34,197,94,.15)', background: 'rgba(34,197,94,.04)', color: T.gr }}>Remind</button>}
            {canReturn && <button onClick={onReturn} style={{ ...btnBase, border: '1px solid rgba(239,68,68,.15)', background: 'rgba(239,68,68,.04)', color: T.re }}>↩ Return</button>}
            {!isVoided && <button onClick={onVoid} style={btnBase}>Void</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
