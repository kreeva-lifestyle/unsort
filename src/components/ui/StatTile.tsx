// The pieces of a summary tile: the card, a small caps label, the headline
// figure (with an optional unit line under it, so a long unit never clips
// the number in a phone's two-column grid), a quiet hint, and the sub line.
// `ready` false prints a dash and keeps the sub line's height, so the
// tiles do not jump when the numbers land. A tile with `onPick` is a
// button (it narrows the list below); `active` tints it.
import { T } from '../../lib/theme';

export const tileCard: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 14px', minWidth: 0, fontFamily: T.sans };

export const TileLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</div>
);

export const TileHint = ({ children, gap = 6 }: { children: React.ReactNode; gap?: number }) => (
  <div style={{ fontSize: 11, color: T.tx3, margin: `2px 0 ${gap}px` }}>{children}</div>
);

export const TileBig = ({ value, color, tail, ready }: { value: string; color: string; tail?: string; ready: boolean }) => (
  <div style={{ margin: '4px 0 8px' }}>
    <div style={{ fontFamily: T.sora, fontSize: 24, fontWeight: 800, color, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ready ? value : '—'}</div>
    {ready && tail && <div style={{ fontSize: 11, fontWeight: 600, color: T.tx3, marginTop: 2 }}>{tail}</div>}
  </div>
);

export const TileSub = ({ text, ready }: { text: string; ready: boolean }) => (
  <div style={{ fontSize: 11, color: T.tx3, marginTop: 6, lineHeight: 1.45 }}>{ready ? text : ' '}</div>
);

export function StatTile({ active, onPick, children }: { active?: boolean; onPick?: () => void; children: React.ReactNode }) {
  const on = !!active;
  return (
    <div role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} aria-pressed={onPick ? on : undefined}
      onClick={onPick} onKeyDown={onPick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } } : undefined}
      style={{ ...tileCard, cursor: onPick ? 'pointer' : 'default', background: on ? T.ac3 : tileCard.background, borderColor: on ? T.ac22 : T.bd }}>
      {children}
    </div>
  );
}
