// Who did what on a purchase order — the audit trail the PO RPCs write
// (created, edited, approved, sent, received, receipt removed, closed,
// reopened, cancelled), drawn by the shared ActivityList with the order's
// own action names. The actor's name and the real time are stamped by the
// database.
import { T } from '../../lib/theme';
import ActivityList, { type ActionMeta } from '../ui/ActivityList';
import type { AuditLog } from '../../types/database';

// Labels match the sentences the RPCs write ("PO #12 updated", "PO #12
// marked sent"), so the list can drop a detail line that only repeats the pill.
const ACTIONS: Record<string, ActionMeta> = {
  CREATE: { label: 'Created', tone: 'ac' }, UPDATE: { label: 'Updated', tone: 'ac' },
  APPROVED: { label: 'Approved', tone: 'ac' }, SENT: { label: 'Marked sent', tone: 'bl' },
  RECEIVE: { label: 'Received', tone: 'gr' }, RECEIPT_REMOVED: { label: 'Receipt removed', tone: 're' },
  CLOSED: { label: 'Closed', tone: 'yl' }, REOPENED: { label: 'Reopened', tone: 'neutral' }, CANCELLED: { label: 'Cancelled', tone: 're' },
};

export default function POActivity({ audit, poNumber, onRetry }: {
  /** null while loading; 'error' when the read failed (the order itself is up). */
  audit: AuditLog[] | null | 'error';
  poNumber: number;
  onRetry: () => void;
}) {
  // Rows say "PO #12 — received 10 across 1 item" or "PO #12 marked sent";
  // on PO #12's own page the prefix is noise.
  const strip = (d: string | null) => (d ?? '').replace(new RegExp(`^PO #${poNumber}(?: —)? ?`), '');
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Who did what</div>
      <ActivityList rows={audit} actions={ACTIONS} strip={strip} onRetry={onRetry} />
    </div>
  );
}
