// One routing rule as a glass row (no blur): position, a Send / Keep off tag,
// the name, what it matches, its own price, an On/Off switch, and Move up /
// Move down / Edit / Delete as real 44px buttons (never swipe-only). Plus the
// rules list's loading, first-run and load-error states.
import type { CSSProperties } from 'react';
import PbSwitch from '../../ui/PbSwitch';
import { PB, pbBody, pbMeta, pbName, pbNum, pbRow } from '../../../pbTheme';
import type { PbRoutingRule } from '../../../types';
import { Dot } from '../../product/status';
import { PbButton, PbIcon, PbSkeleton, PbTag } from '../../ui';

type Props = {
  rule: PbRoutingRule; index: number; count: number; summary: string; price: string | null; busy: string;
  onMove: (dir: -1 | 1) => void; onToggle: () => void; onEdit: () => void; onDelete: () => void;
};

const up: CSSProperties = { display: 'inline-flex', transform: 'rotate(180deg)' };
/** Square, as tall as the other buttons (48 touch / 40 fine). */
const sq: CSSProperties = { width: 'var(--pb-ctl-h)', padding: 0 };

export default function RuleRow({ rule: r, index: i, count, summary, price, busy, onMove, onToggle, onEdit, onDelete }: Props) {
  const name = r.name || 'Unnamed rule';
  // Another action is running: the rest of the row ignores taps (as before) without greying out.
  const hold = (key: string): CSSProperties | undefined => (busy && busy !== key ? { pointerEvents: 'none' } : undefined);
  const mv = `move-${r.id}`;
  return (
    <li style={{ ...pbRow, flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: 16, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ ...pbNum, fontSize: 13, color: PB.tx2, minWidth: 16 }}>{i + 1}</span>
        <PbTag style={{ color: PB.tx }}>{r.action === 'include' ? 'Send' : 'Keep off'}</PbTag>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0, ...hold(`en-${r.id}`), opacity: busy === `en-${r.id}` ? 0.5 : 1 }}
          aria-busy={busy === `en-${r.id}` || undefined}>
          <span style={{ ...pbMeta, minWidth: 24 }}>{r.enabled ? 'On' : 'Off'}</span>
          <PbSwitch size="sm" on={r.enabled} onToggle={onToggle} label={`Rule ${r.name || i + 1} enabled`} />
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span className="pb-clamp2" style={{ ...pbName, color: r.enabled ? PB.tx : PB.tx2 }}>{name}</span>
        <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{summary}</span>
        {price && <span style={{ ...pbMeta }}>Own price <span style={{ ...pbNum, color: PB.tx, whiteSpace: 'nowrap' }}>{price}</span></span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <PbButton aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => onMove(-1)} busy={busy === mv} style={{ ...sq, ...hold(mv) }}>
          <span style={up}><PbIcon name="chevronDown" size={18} /></span>
        </PbButton>
        <PbButton aria-label={`Move ${name} down`} disabled={i === count - 1} onClick={() => onMove(1)} busy={busy === mv} style={{ ...sq, ...hold(mv) }}>
          <PbIcon name="chevronDown" size={18} />
        </PbButton>
        <PbButton icon="edit" onClick={onEdit} aria-label={`Edit rule ${name}`} style={hold(`edit-${r.id}`)}>Edit</PbButton>
        <PbButton kind="danger" icon="trash" onClick={onDelete} aria-label={`Delete rule ${name}`} busy={busy === `del-${r.id}`} busyLabel="Deleting…" style={{ marginLeft: 'auto', ...hold(`del-${r.id}`) }}>Delete</PbButton>
      </div>
    </li>
  );
}

export function RulesSkeleton() {
  return <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkeleton shape="row" count={3} srLabel="Loading rules" /></div>;
}

export function RulesEmpty({ sendsAll }: { sendsAll: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '24px 16px', borderRadius: PB.r.row, border: `1px dashed ${PB.tileBd}` }}>
      <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PB.brandA }}>
        <PbIcon name="flow" size={20} />
      </span>
      <span style={{ ...pbName }}>No rules yet</span>
      <span style={{ ...pbBody, color: PB.tx2, maxWidth: 420 }}>
        {sendsAll ? 'Every product goes to this store.' : 'Nothing goes to this store until you add a rule (or choose “List everything”).'}
      </span>
    </div>
  );
}

export function RulesError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 16, borderRadius: PB.r.row, background: PB.failedBg, border: `1px solid ${PB.failedBd}` }}>
      <Dot color={PB.failed} label="Could not load the rules" style={{ fontSize: 13, fontWeight: 600, color: PB.tx }} />
      <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{message}</span>
      <PbButton icon="refresh" onClick={onRetry} busy={busy} busyLabel="Trying again…">Try again</PbButton>
    </div>
  );
}
