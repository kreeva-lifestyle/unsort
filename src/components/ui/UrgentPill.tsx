// The red URGENT chip a flagged PO / job / order wears in its list and
// detail — "URGENT · by 02 Nov" when a needed-by date was given, "N d past"
// once it has gone by. Nothing when the row is not urgent. `reason` adds
// the why beside it (detail views only — it never leaves the building).
import { T, Pill } from '../../lib/theme';
import { urgentLabel } from '../../lib/urgency';
import type { Urgent } from '../../types/urgency';

export default function UrgentPill({ row, reason, size = 10 }: { row: Urgent; reason?: boolean; size?: number }) {
  const u = urgentLabel(row);
  if (!u) return null;
  return (
    <>
      <Pill tone="re" dot style={{ fontSize: size, fontWeight: 700, padding: '1px 7px', letterSpacing: '0.04em', verticalAlign: 'middle', ...(u.past ? { background: 'oklch(0.63 0.22 25 / .22)' } : {}) }}>{u.text}</Pill>
      {reason && row.urgent_reason && <span style={{ fontSize: 11, color: T.tx2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.urgent_reason}</span>}
    </>
  );
}
