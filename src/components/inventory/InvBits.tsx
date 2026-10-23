// Small pieces the inventory table and cards share: the status dot + label,
// the missing / damaged chips, the age tag, and the props both layouts take.
import { T } from '../../lib/theme';
import { statusTag, statusLabel, ageOf } from './invStatus';

export interface InvListProps {
  rows: any[];
  canEdit: boolean;
  isCompletedView: boolean;
  itemMissing: Record<string, string[]>;
  itemDamaged: Record<string, string[]>;
  onView: (item: any) => void;
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
}

export function StatusDotLabel({ status, size = 8 }: { status: string; size?: number }) {
  return (
    <span style={statusTag(status)}>
      <span style={{ width: size, height: size, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 4px currentColor', flexShrink: 0 }} />
      <span style={{ textTransform: 'capitalize', fontSize: size === 8 ? 11 : 10 }}>{statusLabel(status)}</span>
    </span>
  );
}

const chip = (bg: string, color: string): React.CSSProperties => ({ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: bg, color });

/** Missing / damaged components; `quiet` is what to show when there are none. */
export function IssueChips({ missing, damaged, quiet }: { missing: string[]; damaged: string[]; quiet?: string }) {
  if (missing.length === 0 && damaged.length === 0) return quiet ? <span style={{ color: T.tx3, fontSize: 10 }}>{quiet}</span> : null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {missing.map((name, i) => <span key={'m' + i} style={chip('oklch(0.78 0.18 75 / .08)', T.yl)}>Missing: {name}</span>)}
      {damaged.map((name, i) => <span key={'d' + i} style={chip('rgba(248,113,113,.08)', T.re)}>Damaged: {name}</span>)}
    </div>
  );
}

export function AgeTag({ createdAt }: { createdAt: string | null | undefined }) {
  const a = ageOf(createdAt);
  if (!a) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, color: a.color, whiteSpace: 'nowrap' }}>{a.date} · {a.days}d</span>;
}
