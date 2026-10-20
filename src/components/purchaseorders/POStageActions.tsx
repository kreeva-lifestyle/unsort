// The order's next steps, right under its rail (Motion Lab 06): Approve,
// Mark sent, Receive, Close remaining / Reopen and Cancel PO, in the order
// the work goes. While a step runs, the row keeps showing the order as it
// was when the button was tapped — the "Approving…" label stays and the
// next steps swap in only when the new stage has landed on the rail
// (waitLanded) — and every write on the sheet waits (the shared `busy`), so
// a second tap never lands on a stale button. Receive opens the receive
// sheet and says how much is still due.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { pendingOf } from './POCloseModal';
import { receivedOf } from './PORailCard';
import { fmtQty } from './poStats';
import { TRAVEL_MS } from './PORail';
import type { ConfirmOptions } from '../ui/ConfirmModal';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

type Step = 'approved' | 'sent' | 'cancelled' | 'reopen';
const TEXT: Record<Step, { idle: string; busy: string; done: string }> = {
  approved: { idle: 'Approve', busy: 'Approving…', done: 'Purchase order approved' },
  sent: { idle: 'Mark sent', busy: 'Sending…', done: 'Purchase order marked sent' },
  cancelled: { idle: 'Cancel PO', busy: 'Cancelling…', done: 'Purchase order cancelled' },
  reopen: { idle: 'Reopen', busy: 'Reopening…', done: 'Purchase order reopened' },
};

export default function POStageActions({ po: livePo, items: liveItems, canManage, ask, onChanged, waitLanded, busy: sheetBusy, setBusy: setSheetBusy, onReceive, onCloseRemaining, addToast }: {
  po: PurchaseOrder; items: PurchaseOrderItem[]; canManage: boolean;
  ask: (o: ConfirmOptions) => Promise<boolean>;
  /** Re-reads the order. */
  onChanged: () => void | Promise<void>;
  /** Resolves once the rail shows the order's new stage. */
  waitLanded: () => Promise<void>;
  /** The sheet's shared write gate (also held by receipt undo). */
  busy: string; setBusy: (b: string) => void;
  onReceive: () => void; onCloseRemaining: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [frozen, setFrozen] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  const { po, items } = frozen ?? { po: livePo, items: liveItems };
  const busy = (sheetBusy as Step | '');
  const setBusy = (b: Step | '') => { setSheetBusy(b); if (!b) setFrozen(null); };

  const run = async (step: Step) => {
    if (sheetBusy) return;
    if (step === 'cancelled') {
      const ok = await ask({ title: `Cancel PO #${po.po_number}?`, message: 'The order stays on record but is closed to further edits and receiving. This cannot be undone.', confirmLabel: 'Cancel PO', cancelLabel: 'Keep', danger: true });
      if (!ok) return;
    }
    setFrozen({ po: livePo, items: liveItems }); setBusy(step);
    try {
      const { error } = await supabase.rpc('set_po_status', { p_po_id: po.id, p_status: step });
      if (error) throw error;
      const landed = waitLanded();
      await onChanged();
      // The safety wait starts once the re-read is back, so a slow network never cuts the flight short.
      await Promise.race([landed, new Promise(r => window.setTimeout(r, TRAVEL_MS + 900))]);
      addToast(TEXT[step].done, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy('');
  };

  const open = ['approved', 'sent', 'partially_received'].includes(po.status);
  const canApprove = po.status === 'draft' && canManage;
  // "Mark sent" only before goods start arriving; status changes are manager+ actions.
  const canSend = po.status === 'approved' && canManage;
  const canReceive = open;
  const canClose = open && canManage && items.some(it => pendingOf(it) > 0);
  const canReopen = po.status === 'closed' && canManage;
  const canCancel = !['completed', 'cancelled'].includes(po.status) && canManage;
  if (!canApprove && !canSend && !canReceive && !canClose && !canReopen && !canCancel) return null;

  const got = receivedOf(items);
  const due = got.ordered - got.got;
  const receiveLabel = got.mixed || due <= 0 ? 'Receive' : got.got > 0 ? `Receive remaining ${fmtQty(due)}` : `Receive ${fmtQty(due)}`;
  const wait = { pointerEvents: busy ? 'none' as const : 'auto' as const, opacity: busy ? 0.5 : 1 };
  const btn = (step: Step, look: React.CSSProperties) => (
    <button type="button" onClick={() => run(step)} aria-busy={busy === step} style={{ ...look, ...S.btnLg, ...wait }}>{busy === step ? TEXT[step].busy : TEXT[step].idle}</button>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '-2px 0 16px' }}>
      {canApprove && btn('approved', S.btnPrimary)}
      {canSend && btn('sent', S.btnGhost)}
      {canReceive && <button type="button" onClick={onReceive} style={{ ...(canApprove ? S.btnGhost : S.btnPrimary), ...S.btnLg, ...wait }}>{receiveLabel}</button>}
      {canClose && <button type="button" onClick={onCloseRemaining} title="The rest is not coming — write off the balance" style={{ ...S.btnGhost, ...S.btnLg, ...wait }}>Close remaining</button>}
      {canReopen && btn('reopen', S.btnGhost)}
      {canCancel && btn('cancelled', S.btnDanger)}
    </div>
  );
}
