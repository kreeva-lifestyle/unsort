// Challan create / edit form — extracted from CashChallan.tsx for god-component split (audit P0).
// Parent owns all state and the submit logic; this component is just render + event routing.
// Wide prop surface is intentional — keeps state in one place without introducing a context.
import { useRef, useState, useEffect } from 'react';
import { T } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { CashChallan, CashChallanCustomer, AuditLog } from '../../types/database';

type Challan = Omit<CashChallan, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string };
type Customer = Pick<CashChallanCustomer, 'id' | 'name' | 'phone' | 'address'>;
interface ChallanItem { id?: string; sku: string; description: string; quantity: number; price: number; total: number; discount_type?: string; discount_value?: number; discount_amount?: number }

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

export type ChallanFormProps = {
  // Mode
  editing: Challan | null;
  isReturn: boolean;
  setIsReturn: (v: boolean) => void;
  // Return-against flow
  returnSource: Challan | null;
  returnSearchQ: string;
  setReturnSearchQ: (v: string) => void;
  returnResults: Challan[];
  searchReturnSource: (q: string) => void;
  selectReturnSource: (c: Challan) => void;
  onClearReturnSource: () => void;
  // Customer
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (v: string | null) => void;
  customerSuggestions: Customer[];
  setCustomerSuggestions: (v: Customer[]) => void;
  searchCustomers: (q: string) => void;
  // Items + charges
  items: ChallanItem[];
  setItems: (v: ChallanItem[]) => void;
  itemValidationError: (it: ChallanItem) => string | null;
  shippingCharges: number;
  setShippingCharges: (v: number) => void;
  tags: string;
  setTags: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  // Payment / status
  paymentMode: string;
  setPaymentMode: (v: string) => void;
  paymentDate: string;
  setPaymentDate: (v: string) => void;
  amountPaid: number;
  setAmountPaid: (v: number) => void;
  challanStatus: string;
  setChallanStatus: (v: string) => void;
  // Totals (derived by parent)
  subtotal: number;
  totalDiscount: number;
  roundOff: number;
  grandTotal: number;
  // Audit trail
  auditTrail: AuditLog[] | null;
  setAuditTrail: (v: AuditLog[] | null) => void;
  loadAuditTrail: (challanNumber: number) => void;
  // Submit + close
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  formError: string;
};

export default function ChallanForm(p: ChallanFormProps) {
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [nextNum, setNextNum] = useState<number | null>(null);
  const [outstanding, setOutstanding] = useState(0);
  const [recentCustomers, setRecentCustomers] = useState<{ name: string; phone?: string; id?: string }[]>([]);

  useEffect(() => {
    if (!p.editing) {
      supabase.rpc('get_next_challan_number').then(({ data }) => { if (data) setNextNum(data); });
      supabase.from('cash_challans').select('customer_name, customer_id').order('created_at', { ascending: false }).limit(20).then(({ data }) => {
        const seen = new Set<string>();
        const recent: { name: string; id?: string }[] = [];
        (data || []).forEach(c => { if (!seen.has(c.customer_name)) { seen.add(c.customer_name); recent.push({ name: c.customer_name, id: c.customer_id }); } });
        setRecentCustomers(recent.slice(0, 5));
      });
    }
    return () => { clearTimeout(searchTimeout.current); };
  }, [p.editing]);

  useEffect(() => {
    if (!p.customerName.trim()) { setOutstanding(0); return; }
    supabase.from('cash_challans').select('total, amount_paid').eq('customer_name', p.customerName.trim()).in('status', ['unpaid', 'partial']).eq('is_return', false).then(({ data }) => {
      const total = (data || []).reduce((s, c) => s + (Number(c.total) - Number(c.amount_paid || 0)), 0);
      setOutstanding(Math.round(total));
    });
  }, [p.customerName]);
  const lbl: React.CSSProperties = { display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 };
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '8px 12px', height: 36, outline: 'none', boxSizing: 'border-box' };

  return (
    <div className="challan-form" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>{p.editing ? `Edit #${p.editing.challan_number}` : (p.isReturn ? 'New Return' : 'New Cash Challan')}</span>
            {!p.editing && nextNum && <span title="Approximate — final number assigned on save" style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3, fontWeight: 500, padding: '2px 7px', background: 'rgba(255,255,255,.03)', border: `1px solid ${T.bd}`, borderRadius: 6 }}>~#{nextNum}</span>}
            {p.editing && <button onClick={() => p.loadAuditTrail(p.editing!.challan_number)} style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>View History</button>}
          </div>
          <button onClick={p.onClose} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.06)', color: T.ac2, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
        </div>

        {/* Sale / Return Toggle */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}` }}>
          {([{ v: false, label: 'Sale', color: T.gr }, { v: true, label: 'Return', color: T.re }] as const).map(opt => (
            <div key={String(opt.v)} onClick={() => !p.editing && p.setIsReturn(opt.v)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: p.isReturn === opt.v ? 600 : 400, cursor: p.editing ? 'not-allowed' : 'pointer', opacity: p.editing ? 0.6 : 1, background: p.isReturn === opt.v ? opt.color + '33' : 'transparent', color: p.isReturn === opt.v ? opt.color : T.tx3, border: p.isReturn === opt.v ? `1px solid ${opt.color}44` : 'none' }}>{opt.label}</div>
          ))}
        </div>

        {/* Return: Select source invoice */}
        {p.isReturn && !p.editing && !p.returnSource && (
          <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <label style={{ ...lbl, color: T.re }}>Select Original Invoice *</label>
            <input type="text" value={p.returnSearchQ} onChange={e => { p.setReturnSearchQ(e.target.value); p.searchReturnSource(e.target.value); }}
              placeholder="Search by challan # or customer name..." style={inp} autoFocus />
            {p.returnResults.length > 0 && <div style={{ marginTop: 6, border: `1px solid ${T.bd}`, borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
              {p.returnResults.map(c => (
                <div key={c.id} onClick={() => p.selectReturnSource(c)} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2 }}>#{c.challan_number}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: T.tx }}>{c.customer_name}</span>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.tx }}>₹{Number(c.total).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>}
          </div>
        )}
        {p.isReturn && p.returnSource && !p.editing && (
          <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 10, padding: '8px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 9, color: T.re, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Return against</span>
              <div style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>#{p.returnSource.challan_number} — {p.returnSource.customer_name} — ₹{Number(p.returnSource.total).toLocaleString('en-IN')}</div>
            </div>
            <span onClick={p.onClearReturnSource} style={{ fontSize: 10, color: T.re, cursor: 'pointer', fontWeight: 600 }}>Change</span>
          </div>
        )}

        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          {/* Recent customers */}
          {!p.editing && recentCustomers.length > 0 && !p.customerName && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {recentCustomers.map(c => (
                <span key={c.name} onClick={() => { p.setCustomerName(c.name); if (c.id) { p.setSelectedCustomerId(c.id); supabase.from('cash_challan_customers').select('phone').eq('name', c.name).maybeSingle().then(({ data }) => { if (data?.phone) p.setCustomerPhone(data.phone); }); } p.setCustomerSuggestions([]); }}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', background: 'rgba(99,102,241,.06)', border: `1px solid rgba(99,102,241,.15)`, color: T.ac2, whiteSpace: 'nowrap' }}>{c.name}</span>
              ))}
            </div>
          )}

          {/* Customer */}
          <div className="challan-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: outstanding > 0 ? 4 : 12 }}>
            <div style={{ position: 'relative' }}>
              <label style={lbl}>Customer Name *</label>
              <input type="text" value={p.customerName} onChange={e => {
                if (p.editing) return;
                p.setCustomerName(e.target.value); p.setSelectedCustomerId(null);
                clearTimeout(searchTimeout.current);
                searchTimeout.current = setTimeout(() => p.searchCustomers(e.target.value), 300);
              }}
                placeholder="Type customer name..." style={{ ...inp, opacity: p.editing ? 0.6 : 1 }} disabled={!!p.editing} />
              {p.customerSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'rgba(14,18,30,.98)', border: `1px solid ${T.bd2}`, borderRadius: 6, maxHeight: 120, overflowY: 'auto' }}>
                  {p.customerSuggestions.map(c => (
                    <div key={c.id} onClick={() => { p.setCustomerName(c.name); p.setSelectedCustomerId(c.id); p.setCustomerPhone(c.phone || ''); p.setCustomerSuggestions([]); }}
                      style={{ padding: '8px 10px', fontSize: 11, color: T.tx, cursor: 'pointer', borderBottom: `1px solid ${T.bd}` }}>{c.name} {c.phone && <span style={{ color: T.tx3 }}>({c.phone})</span>}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Phone (for WhatsApp){p.selectedCustomerId && p.customerPhone && <span style={{ marginLeft: 6, fontSize: 8, color: T.gr, textTransform: 'none' as const, letterSpacing: 0, fontWeight: 600 }}>✓ Auto-filled</span>}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <span style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRight: 'none', borderRadius: '6px 0 0 6px', fontSize: 12, color: T.tx3, fontFamily: T.mono, whiteSpace: 'nowrap', lineHeight: '1.2' }}>+91</span>
                <input type="tel" value={p.customerPhone} onChange={e => p.setCustomerPhone(e.target.value)} placeholder="9876543210" style={{ ...inp, fontFamily: T.mono, borderRadius: '0 6px 6px 0', flex: 1 }} />
              </div>
            </div>
          </div>
          {outstanding > 0 && <div style={{ fontSize: 11, color: T.re, fontWeight: 600, marginBottom: 10, padding: '6px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)', borderRadius: 6 }}>Outstanding: ₹{outstanding.toLocaleString('en-IN')}</div>}

          {/* Line Items */}
          <div className="challan-item-grid-wrap" data-items style={{ background: 'rgba(0,0,0,.15)', border: `1px solid ${T.bd}`, borderRadius: 9, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 100px 28px', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, background: T.glass1 }}>
              <span style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontWeight: 600 }}>SKU</span>
              <span style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontWeight: 600, textAlign: 'center' as const }}>Qty</span>
              <span style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontWeight: 600, textAlign: 'right' as const }}>Price</span>
              <span className="challan-disc-col" title="Per-item discount: ₹ flat or % of line total" style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontWeight: 600, textAlign: 'right' as const, cursor: 'help' }}>Discount</span>
              <span></span>
            </div>
            {p.items.map((it, i) => {
              // Per-row validation (mirror of saveChallan's check) for inline
              // red-border feedback while typing. Humans should see the error
              // immediately, not after clicking Save.
              const err = p.itemValidationError(it);
              const q = Number(it.quantity) || 0;
              const pr = Number(it.price) || 0;
              const d = Number(it.discount_value) || 0;
              const qtyBad = q < 0;
              const priceBad = pr < 0;
              const discBad =
                d < 0 ||
                (it.discount_type === 'percentage' && d > 100) ||
                (it.discount_type !== 'percentage' && q > 0 && pr > 0 && d > q * pr);
              const errBorder = `1px solid ${T.re}aa`;
              const okBorder = `1px solid ${T.bd}`;
              return (
              <div key={i}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 100px 28px', gap: 6, padding: '7px 12px', borderBottom: err ? 'none' : `1px solid ${T.bd}`, alignItems: 'center' }}>
                  <input data-sku value={it.sku} onChange={e => { const n = [...p.items]; n[i].sku = e.target.value; p.setItems(n); }} placeholder="SKU / Item name" disabled={!!(p.isReturn && p.returnSource)} style={{ background: 'rgba(255,255,255,0.04)', border: okBorder, borderRadius: 4, color: T.tx, fontSize: 12, padding: '6px', outline: 'none', fontFamily: T.mono, opacity: p.isReturn && p.returnSource ? 0.6 : 1 }} />
                  <input type="number" value={it.quantity || ''} onChange={e => { const n = [...p.items]; n[i].quantity = Number(e.target.value); p.setItems(n); }} placeholder="1" style={{ background: 'rgba(255,255,255,0.04)', border: qtyBad ? errBorder : okBorder, borderRadius: 4, color: T.tx, fontSize: 12, padding: '6px', outline: 'none', textAlign: 'center' as const }} />
                  <input type="number" value={it.price || ''} onChange={e => { const n = [...p.items]; n[i].price = Number(e.target.value); p.setItems(n); }} placeholder="0" disabled={!!(p.isReturn && p.returnSource)} style={{ background: 'rgba(255,255,255,0.04)', border: priceBad ? errBorder : okBorder, borderRadius: 4, color: T.tx, fontSize: 12, padding: '6px', outline: 'none', textAlign: 'right' as const, fontFamily: T.mono, opacity: p.isReturn && p.returnSource ? 0.6 : 1 }} />
                  <div className="challan-disc-col" style={{ display: 'flex', gap: 2, alignItems: 'center', opacity: p.isReturn && p.returnSource ? 0.6 : 1 }}>
                    <select value={it.discount_type || 'flat'} onChange={e => { const n = [...p.items]; n[i].discount_type = e.target.value; p.setItems(n); }} disabled={!!(p.isReturn && p.returnSource)} style={{ background: 'rgba(255,255,255,0.04)', border: okBorder, borderRadius: 4, color: T.tx3, fontSize: 11, padding: '4px 6px', outline: 'none', width: 32 }}>
                      <option value="flat">₹</option><option value="percentage">%</option>
                    </select>
                    <input
                      type="number"
                      value={it.discount_value || ''}
                      onChange={e => { const n = [...p.items]; n[i].discount_value = Number(e.target.value); p.setItems(n); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && i === p.items.length - 1 && !(p.isReturn && p.returnSource)) {
                          e.preventDefault();
                          p.setItems([...p.items, { sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
                          setTimeout(() => {
                            const inputs = (e.currentTarget.closest('[data-items]') as HTMLElement | null)?.querySelectorAll<HTMLInputElement>('input[data-sku]');
                            inputs?.[inputs.length - 1]?.focus();
                          }, 0);
                        }
                      }}
                      placeholder="0"
                      disabled={!!(p.isReturn && p.returnSource)}
                      style={{ background: 'rgba(255,255,255,0.04)', border: discBad ? errBorder : okBorder, borderRadius: 4, color: T.tx, fontSize: 12, padding: '6px', outline: 'none', textAlign: 'right' as const, fontFamily: T.mono, flex: 1, minWidth: 0 }}
                    />
                  </div>
                  <button onClick={() => { if (p.items.length > 1) p.setItems(p.items.filter((_, j) => j !== i)); }} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 14, padding: 0, opacity: 0.6 }}>×</button>
                </div>
                {err && <div style={{ padding: '4px 10px 6px', fontSize: 10, color: T.re, borderBottom: `1px solid ${T.bd}`, background: 'rgba(239,68,68,.04)', display: 'flex', alignItems: 'center', gap: 5 }}>⚠ {err}</div>}
              </div>
              );
            })}
            {!(p.isReturn && p.returnSource) && <button onClick={() => p.setItems([...p.items, { sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }])} style={{ width: '100%', padding: '7px', border: 'none', background: 'rgba(99,102,241,.06)', color: T.ac2, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>+ Add Item (or press Enter on last row)</button>}
          </div>

          {/* Shipping + Tags + Notes */}
          <div className="challan-form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Shipping/Porter</label>
              <input type="number" value={p.shippingCharges || ''} onChange={e => p.setShippingCharges(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: T.mono, fontSize: 11, border: p.shippingCharges < 0 ? `1px solid ${T.re}aa` : `1px solid ${T.bd}` }} />
              {p.shippingCharges < 0 && <div style={{ fontSize: 10, color: T.re, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ Cannot be negative</div>}
            </div>
            <div>
              <label style={lbl}>Tags <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 7 }}>comma separated</span></label>
              <input value={p.tags} onChange={e => p.setTags(e.target.value)} placeholder="vip, urgent" style={{ ...inp, fontSize: 11 }} />
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={p.notes} onChange={e => p.setNotes(e.target.value)} placeholder="Optional" style={{ ...inp, fontSize: 11 }} />
            </div>
          </div>

          {/* Status + Payment */}
          <div className="challan-form-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Status</label>
              {p.isReturn ? (
                // Refunds are instant — no dropdown, always 'paid' (=Refunded).
                <div style={{ ...inp, fontSize: 11, display: 'flex', alignItems: 'center', color: T.re, fontWeight: 600, cursor: 'default' }}>Refunded</div>
              ) : (
                <select value={p.challanStatus} onChange={e => p.setChallanStatus(e.target.value)} style={{ ...inp, fontSize: 11 }}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  {(!p.editing || p.editing.status === 'draft') && <option value="draft">Draft</option>}
                </select>
              )}
            </div>
            <div>
              <label style={lbl}>{p.isReturn ? 'Refund Mode' : 'Payment Mode'}</label>
              <select value={p.paymentMode} onChange={e => p.setPaymentMode(e.target.value)} style={{ ...inp, fontSize: 11 }}>
                <option value="">Select...</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{p.isReturn ? 'Refund Amount' : 'Amount Paid'}</label>
              <input type="number" value={p.amountPaid || ''} onChange={e => p.setAmountPaid(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: T.mono, fontSize: 11 }} />
            </div>
            <div>
              <label style={lbl}>{p.isReturn ? 'Refund Date' : 'Payment Date'}</label>
              <input type="date" value={p.paymentDate} onChange={e => p.setPaymentDate(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* Totals card — honest math. Totals go red when negative so the
            user sees the problem and fixes it (save is also blocked). */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${p.grandTotal < 0 ? 'rgba(239,68,68,.35)' : T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx2, marginBottom: 4 }}><span>Subtotal</span><span style={{ fontFamily: T.mono }}>₹{p.subtotal.toFixed(2)}</span></div>
          {p.totalDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.re, marginBottom: 4 }}><span>Item Discounts{p.totalDiscount > p.subtotal ? ' ⚠' : ''}</span><span style={{ fontFamily: T.mono }}>-₹{p.totalDiscount.toFixed(2)}</span></div>}
          {p.shippingCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.bl, marginBottom: 4 }}><span>Shipping/Porter</span><span style={{ fontFamily: T.mono }}>+₹{p.shippingCharges.toFixed(2)}</span></div>}
          {p.roundOff !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, marginBottom: 4 }}><span>Round Off</span><span style={{ fontFamily: T.mono }}>{p.roundOff > 0 ? '+' : ''}₹{p.roundOff.toFixed(2)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: p.grandTotal < 0 ? T.re : T.gr, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4 }}><span>Total</span><span>{p.grandTotal < 0 ? '−' : ''}₹{Math.abs(p.grandTotal).toLocaleString('en-IN')}</span></div>
          {p.grandTotal < 0 && <div style={{ marginTop: 6, fontSize: 10, color: T.re, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ Total is negative — reduce discount or add items before saving.</div>}
        </div>

        {p.formError && <div style={{ background: 'rgba(239,68,68,.15)', borderLeft: `4px solid ${T.re}`, borderRadius: 6, padding: '10px 14px', fontSize: 11, color: T.tx, marginBottom: 8 }}>{p.formError}</div>}
        <button onClick={p.onSave} disabled={p.saving} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: p.saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,.3)', opacity: p.saving ? 0.6 : 1 }}>{p.saving ? 'Saving...' : p.editing ? (p.isReturn ? 'Update Return' : 'Update Challan') : (p.isReturn ? 'Create Return' : 'Create Challan')}</button>
      </div>

      {/* Audit Trail Modal */}
      {p.auditTrail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '18px 16px', maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Audit Trail</span>
              <button onClick={() => p.setAuditTrail(null)} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Close</button>
            </div>
            {p.auditTrail.length === 0 && <div style={{ padding: 16, textAlign: 'center' as const, color: T.tx3, fontSize: 11 }}>No history for this challan.</div>}
            {p.auditTrail.map(a => (
              <div key={a.id} style={{ padding: '8px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: a.action === 'VOID' ? 'rgba(239,68,68,.12)' : a.action === 'CREATE' ? 'rgba(34,197,94,.12)' : 'rgba(99,102,241,.12)', color: a.action === 'VOID' ? T.re : a.action === 'CREATE' ? T.gr : T.ac2, fontWeight: 700 }}>{a.action}</span>
                  <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>{a.created_at ? new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
                <div style={{ color: T.tx2, fontSize: 11 }}>{a.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
