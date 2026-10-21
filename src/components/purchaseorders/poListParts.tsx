// The PO list cards' "pending since" (POListCard's caption). Pure — split
// out of POList.tsx so the list file stays under the house limit.
import { T } from '../../lib/theme';
import { fileDate } from '../../lib/exportName';
import { PENDING_STATUSES } from './pendencyData';
import { dueOf, dueTone, ASSUMED_LEAD_DAYS, type DueTone } from './poDue';
import type { PORow } from './POList';

// "Pending since": how long an open PO has been waiting, from its PO date
// (or creation) — owner's ask, so a forgotten order stands out in the grid —
// and where it stands against its due date (poDue): red once breached,
// amber on the day it is due. Same definition of "open" as the vendor
// pendency report (approved, sent, partially received): a draft has not
// reached the vendor, so it is not waiting on anyone; completed / cancelled
// are over.
export const pendingDays = (po: PORow): number | null => {
  if (!PENDING_STATUSES.includes(po.status)) return null;
  const since = po.po_date ? new Date(po.po_date + 'T00:00:00') : po.created_at ? new Date(po.created_at) : null;
  if (!since || Number.isNaN(since.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 86400000));
};
const TONE_COLOR: Record<DueTone, string> = { late: T.re, today: T.yl, ok: T.tx3 };
export const PendingSince = ({ po, inline }: { po: PORow; inline?: boolean }) => {
  const d = pendingDays(po);
  if (d === null) return null;
  const due = dueOf(po, fileDate()), tone = dueTone(due);
  const text = `${d === 0 ? 'pending since today' : `pending ${d} d`}${tone === 'late' ? ` · ${due.late} d late` : tone === 'today' ? ' · due today' : ''}`;
  const title = `Due ${new Date(due.due + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}${due.assumed ? ` — no expected date on the PO, so ${ASSUMED_LEAD_DAYS} days from the ${po.po_date ? 'PO date' : 'day it was raised'}` : ''}`;
  return inline ? <span title={title} style={{ color: TONE_COLOR[tone] }}>{text}</span> : <div title={title} style={{ fontSize: 9, color: TONE_COLOR[tone], marginTop: 3, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{text}</div>;
};
