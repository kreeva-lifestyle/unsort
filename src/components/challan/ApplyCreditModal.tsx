// Apply a return's credit against a same-customer outstanding sales challan
// (no cash moves). Opens from EITHER side: a return with unused credit picks
// an outstanding challan; an unpaid/partial challan picks a return. The
// apply_return_credit RPC records both ledger legs atomically (same day, so
// they net to zero inside the cash-handover period) and enforces the
// same-customer / over-application / double-spend guards server-side.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { SkeletonRows } from '../ui/Skeleton';
import type { CashChallan } from '../../types/database';

type Row = Pick<CashChallan, 'id' | 'challan_number' | 'customer_name' | 'total' | 'amount_paid' | 'status' | 'created_at' | 'is_return'>;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const open = (r: Row) => Math.max(0, Number(r.total) - Number(r.amount_paid || 0));

export default function ApplyCreditModal({ challan: c, onClose, onDone, addToast }: {
  challan: CashChallan;
  onClose: () => void;
  onDone: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const fromReturn = !!c.is_return; // source side decides what we pick
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Row | null>(null);
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.body.classList.add('modal-open'); return () => document.body.classList.remove('modal-open'); }, []);

  // Counterparts: same customer, not voided, with money still open on them.
  useEffect(() => {
    let stale = false;
    let q = supabase.from('cash_challans')
      .select('id, challan_number, customer_name, total, amount_paid, status, created_at, is_return')
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(50);
    q = fromReturn ? q.eq('is_return', false).in('status', ['unpaid', 'partial']) : q.eq('is_return', true);
    q = c.customer_id ? q.eq('customer_id', c.customer_id) : q.eq('customer_name', c.customer_name);
    q.then(({ data, error }) => {
      if (stale) return;
      if (error) { addToast(friendlyError(error), 'error'); setRows([]); }
      else setRows(((data as Row[]) || []).filter(r => r.id !== c.id && open(r) > 0));
      setLoading(false);
    });
    return () => { stale = true; };
  }, [c.id]);

  const srcOpen = Math.max(0, Number(c.total) - Number(c.amount_paid || 0)); // credit left (return) or pending (sale)
  const maxApply = picked ? Math.min(srcOpen, open(picked)) : 0;
  const amt = Number(amount) || 0;
  const retNumber = fromReturn ? c.challan_number : picked?.challan_number;
  const saleNumber = fromReturn ? picked?.challan_number : c.challan_number;

  const pick = (r: Row) => { setPicked(r); setAmount(String(Math.min(srcOpen, open(r)))); setErr(''); };

  const submit = async () => {
    if (!picked || saving) return;
    if (amt <= 0 || amt > maxApply) { setErr(`Enter an amount between 1 and ${inr(maxApply)}`); return; }
    setSaving(true); setErr('');
    const args = fromReturn
      ? { p_return_id: c.id, p_challan_id: picked.id, p_amount: amt }
      : { p_return_id: picked.id, p_challan_id: c.id, p_amount: amt };
    const { data, error } = await supabase.rpc('apply_return_credit', args);
    if (error) { setErr(friendlyError(error)); setSaving(false); return; }
    const d = (data || {}) as { applied?: number; challan_pending?: number; credit_remaining?: number; batch?: string };
    const applied = Number(d.applied || amt);
    const details = `Return credit ${inr(applied)} from #${retNumber} applied to challan #${saleNumber} (${d.batch || ''}) — pending now ${inr(Number(d.challan_pending || 0))}, credit left ${inr(Number(d.credit_remaining || 0))}`;
    // Audit both records — best-effort, the RPC already wrote the ledger.
    for (const rid of [args.p_challan_id, args.p_return_id]) {
      await supabase.from('audit_log').insert({ module: 'cash_challan', record_id: rid, action: 'CREDIT_APPLIED', details, user_email: profile?.email }).then(({ error: ae }) => { if (ae) console.warn('Audit log failed:', ae.message); });
    }
    addToast(`${inr(applied)} credit applied — challan #${saleNumber} pending is now ${inr(Number(d.challan_pending || 0))}`, 'success');
    onDone();
  };

  return createPortal(
    <div style={{ ...S.modalOverlay, zIndex: 10001 }} onClick={saving ? undefined : onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{fromReturn ? 'Apply credit to a challan' : 'Use return credit'}</div>
          <span onClick={saving ? undefined : onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginBottom: 10 }}>
            {fromReturn
              ? <>Return <b>#{c.challan_number}</b> has <b style={{ color: T.yl }}>{inr(srcOpen)}</b> unused credit. Pick which of {c.customer_name}'s outstanding challans it pays down — no cash moves.</>
              : <>Challan <b>#{c.challan_number}</b> has <b style={{ color: T.re }}>{inr(srcOpen)}</b> pending. Pick one of {c.customer_name}'s returns to pay it down with credit — no cash moves.</>}
          </div>
          {loading && <SkeletonRows rows={3} />}
          {!loading && rows.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: T.tx3, fontSize: 11 }}>
              {fromReturn ? 'No outstanding challans for this customer.' : 'No returns with unused credit for this customer.'}
            </div>
          )}
          {!loading && rows.length > 0 && (
            <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>
              {rows.map(r => (
                <div key={r.id} onClick={() => pick(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${T.bd}`, background: picked?.id === r.id ? 'oklch(0.55 0.22 265 / .08)' : 'transparent', borderLeft: picked?.id === r.id ? `2px solid ${T.ac}` : '2px solid transparent' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.mono }}>#{r.challan_number}</span>
                  <span style={{ fontSize: 10, color: T.tx3, flex: 1 }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}</span>
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: fromReturn ? T.re : T.yl, fontWeight: 600 }}>
                    {inr(open(r))} {fromReturn ? 'pending' : 'credit'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {picked && (
            <div style={{ marginBottom: 12 }}>
              <label style={S.fLabel}>Amount to apply (max {inr(maxApply)})</label>
              <input type="number" value={amount} min={1} max={maxApply} onChange={e => { setAmount(e.target.value); setErr(''); }}
                onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') submit(); }} style={{ ...S.fInput, fontFamily: T.mono }} />
              {amt > 0 && amt <= maxApply && (
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, lineHeight: 1.5 }}>
                  Challan #{saleNumber} pending after: <b style={{ color: T.tx }}>{inr(Math.max(0, (fromReturn ? open(picked) : srcOpen) - amt))}</b>
                  {' · '}Return #{retNumber} credit left: <b style={{ color: T.tx }}>{inr(Math.max(0, (fromReturn ? srcOpen : open(picked)) - amt))}</b>
                </div>
              )}
            </div>
          )}
          {err && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={saving} style={S.btnGhost}>Cancel</button>
            <button onClick={submit} disabled={!picked || saving}
              style={{ ...S.btnPrimary, pointerEvents: (!picked || saving) ? 'none' : 'auto', opacity: (!picked || saving) ? 0.5 : 1 }}>
              {saving ? 'Applying…' : 'Apply credit'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
