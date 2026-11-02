// Analytics → Payment Mode Breakup → tap a mode (owner's ask, 2026-11-02):
// every challan that money came in on in that mode over the range, from
// challan_mode_payments() — the same rule as the breakup row, so the list
// adds up to it. A refund on a return shows as money out. Tap a row to open
// that challan; closing it comes back here. Each row says who received the
// money (the staff member on the payment); the chips on top total it per
// person and filter the list to one of them.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';

type Receiver = { name: string; amount: number };
type Row = { challan_id: string; challan_number: number; customer_name: string; is_return: boolean; status: string; created_at: string; paid_on: string; payments: number; amount: number; receivers: Receiver[] };
const NOT_MONEY = new Set(['Write-off', 'Return Credit']);
const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
const day = (d: string) => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export default function ModePaymentsSheet({ mode, from, to, onClose, onOpenChallan }: {
  mode: string;
  from: string;
  to: string;
  onClose: () => void;
  onOpenChallan: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const [who, setWho] = useState<string | null>(null);
  useModalLock();
  useBackClose(true, onClose);

  useEffect(() => {
    let alive = true;
    setErr('');
    supabase.rpc('challan_mode_receipts', { p_mode: mode, p_from: from, p_to: to }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setErr(friendlyError(error)); return; }
      setRows(((data as Row[] | null) || []).map(r => ({ ...r, amount: Number(r.amount), receivers: (r.receivers || []).map(x => ({ name: x.name, amount: Number(x.amount) })) })));
    });
    return () => { alive = false; };
  }, [mode, from, to, reload]);

  // Per person across the range; picking one shows only their share of each challan.
  const people = new Map<string, number>();
  for (const r of rows || []) for (const x of r.receivers) people.set(x.name, (people.get(x.name) || 0) + x.amount);
  const shown = (rows || []).filter(r => !who || r.receivers.some(x => x.name === who))
    .map(r => (who ? { ...r, amount: r.receivers.find(x => x.name === who)?.amount ?? 0 } : r));
  const total = shown.reduce((t, r) => t + r.amount, 0);
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{mode} — {day(from)} to {day(to)}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, color: T.tx3 }}>{rows ? `${shown.length} challan${shown.length === 1 ? '' : 's'}${who ? ` · received by ${who}` : ''}` : 'Loading…'}{NOT_MONEY.has(mode) ? ' · not money — bills settled without cash' : ''}</span>
          {rows && <span style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>{total < 0 ? '−' : ''}{inr(total)}</span>}
        </div>
        {people.size > 0 && (
          <div style={{ padding: '8px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ ...S.fLabel, width: '100%', marginBottom: 0 }}>Received by</span>
            {[...people.entries()].sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
              <button key={name} type="button" onClick={() => setWho(w => (w === name ? null : name))} aria-pressed={who === name}
                style={{ minHeight: 36, padding: '4px 10px', borderRadius: 18, border: `1px solid ${who === name ? T.ac2 : T.bd2}`, background: who === name ? T.ac3 : 'transparent', color: T.tx, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>
                {name} <span style={{ fontFamily: T.mono, color: T.tx2 }}>{amt < 0 ? '−' : ''}{inr(amt)}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          {err && (
            <div style={{ margin: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{err}</span>
              <button type="button" onClick={() => setReload(n => n + 1)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Retry</button>
            </div>
          )}
          {rows && shown.map(r => (
            <button key={r.challan_id} type="button" onClick={() => onOpenChallan(r.challan_id)}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 18px', minHeight: 52, border: 'none', borderBottom: `1px solid ${T.bd}`, background: 'transparent', color: T.tx, cursor: 'pointer', textAlign: 'left', fontFamily: T.sans }}>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name}</span>
                <span style={{ fontSize: 11, color: T.tx3 }}>
                  <span style={{ fontFamily: T.mono }}>#{r.challan_number}</span>{r.is_return ? ' · return' : ''} · paid {day(r.paid_on)}{r.payments > 1 ? ` · ${r.payments} payments` : ''}
                </span>
                <span style={{ fontSize: 11, color: T.tx2 }}>
                  {r.is_return ? 'Refunded by ' : 'Received by '}{r.receivers.length > 1 && !who ? r.receivers.map(x => `${x.name} ${inr(x.amount)}`).join(' + ') : (who ?? r.receivers[0]?.name ?? 'Not recorded')}
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: r.amount < 0 ? T.re : T.gr, whiteSpace: 'nowrap' }}>{r.amount < 0 ? '− ' : ''}{inr(r.amount)}</span>
            </button>
          ))}
          {rows && shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No {mode} payments in this range.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
