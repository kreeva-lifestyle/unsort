// Who did what on a job — the jobwork audit trail (created, edited, sent,
// received, paid, closed, reopened, cancelled, deletions), drawn by the
// shared ActivityList with the job's own action names.
import ActivityList, { type ActionMeta } from '../ui/ActivityList';
import type { JobActivityRow } from './jobworkModel';

const ACTIONS: Record<string, ActionMeta> = {
  CREATE: { label: 'Created', tone: 'ac' }, UPDATE: { label: 'Edited', tone: 'ac' },
  SEND: { label: 'Sent out', tone: 'bl' }, RECEIVE: { label: 'Received', tone: 'gr' },
  PAYMENT: { label: 'Paid', tone: 'gr' }, PAYMENT_DELETE: { label: 'Payment deleted', tone: 're' },
  ENTRY_DELETE: { label: 'Entry deleted', tone: 're' },
  CLOSED: { label: 'Closed', tone: 'yl' }, CANCELLED: { label: 'Cancelled', tone: 're' }, OPEN: { label: 'Reopened', tone: 'neutral' },
};

export default function JobActivity({ rows, jwNumber, onRetry }: {
  /** null while loading; 'error' when the read failed (the job itself is up). */
  rows: JobActivityRow[] | null | 'error';
  jwNumber: number;
  onRetry: () => void;
}) {
  // Rows say "JW #12 — sent out"; on JW #12's own page the prefix is noise.
  const strip = (d: string | null) => (d ?? '').replace(new RegExp(`^JW #${jwNumber} — `), '');
  return <ActivityList rows={rows} actions={ACTIONS} strip={strip} onRetry={onRetry} />;
}
