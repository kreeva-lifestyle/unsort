// Analytics → Payment Mode Breakup → tap a mode (owner's ask, 2026-11-02):
// every challan that money came in on in that mode over the range, from
// challan_mode_payments() — the same rule as the breakup row, so the list
// adds up to it. A refund on a return shows as money out. Tap a row to open
// that challan; closing it comes back here.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';

type Row = { challan_id: string; challan_number: number; customer_name: string; is_return: boolean; status: string; created_at: string; paid_on: string; payments: number; amount: number };
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
  useModalLock();
  useBackClose(true, onClose);

  useEffect(() => {
    let alive = true;
    setErr('');
    supabase.rpc('challan_mode_payments', { p_mode: mode, p_from: from, p_to: to }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setErr(friendlyError(error)); return; }
      setRows(((data as Row[] | null) || []).map(r => ({ ...r, amount: Number(r.amount) })));
    });
    return () => { alive = false; };
  }, [mode, from, to, reload]);

  const total = (rows || []).reduce((t, r) => t + r.amount, 0);
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{mode} — {day(from)} to {day(to)}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, color: T.tx3 }}>{rows ? `${rows.length} challan${rows.length === 1 ? '' : 's'}` : 'Loading…'}{NOT_MONEY.has(mode) ? ' · not money — bills settled without cash' : ''}</span>
          {rows && <span style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>{total < 0 ? '−' : ''}{inr(total)}</span>}
        </div>
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          {err && (
            <div style={{ margin: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{err}</span>
              <button type="button" onClick={() => setReload(n => n + 1)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Retry</button>
            </div>
          )}
          {rows && rows.map(r => (
            <button key={r.challan_id} type="button" onClick={() => onOpenChallan(r.challan_id)}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 18px', minHeight: 52, border: 'none', borderBottom: `1px solid ${T.bd}`, background: 'transparent', color: T.tx, cursor: 'pointer', textAlign: 'left', fontFamily: T.sans }}>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name}</span>
                <span style={{ fontSize: 11, color: T.tx3 }}>
                  <span style={{ fontFamily: T.mono }}>#{r.challan_number}</span>{r.is_return ? ' · return' : ''} · paid {day(r.paid_on)}{r.payments > 1 ? ` · ${r.payments} payments` : ''}
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: r.amount < 0 ? T.re : T.gr, whiteSpace: 'nowrap' }}>{r.amount < 0 ? '− ' : ''}{inr(r.amount)}</span>
            </button>
          ))}
          {rows && rows.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No {mode} payments in this range.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
