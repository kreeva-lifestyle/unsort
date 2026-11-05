// Filter chip (DESIGN.md §7, mobile.md §9): a 44px <button> hit box (36 on a
// fine pointer) with 2px transparent padding, holding a 40px pill. On =
// frosted active + check icon, aria-pressed. Put chips in <PbChipRow>: one
// tab stop, Left/Right/Home/End move, edge-to-edge sideways scroll on phone.
import { useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { PB, pbActive, pbBtnSecondary, pbNum } from '../../pbTheme';
import PbIcon from './PbIcon';

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & { pressed?: boolean; count?: number; icon?: string; children: ReactNode };

export function PbChip({ pressed, count, icon, children, className, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={pressed} className={['pb-chip', className].filter(Boolean).join(' ')} {...rest}
      style={{ flexShrink: 0, minHeight: 'var(--pb-chip-h)', padding: '2px 0', background: 'transparent', border: 'none', cursor: 'pointer', scrollSnapAlign: 'start', borderRadius: PB.r.pill, display: 'inline-flex', alignItems: 'center' }}>
      <span className="pb-pill" style={{
        ...pbBtnSecondary, minHeight: 'calc(var(--pb-chip-h) - 4px)', borderRadius: PB.r.pill, padding: '0 14px', gap: 6, fontWeight: 500,
        ...(pressed ? pbActive : null),
      }}>
        {pressed ? <PbIcon name="check" size={16} /> : icon ? <PbIcon name={icon} size={16} /> : null}
        {children}
        {count != null && <span style={{ ...pbNum, color: pressed ? PB.onActive : PB.tx2, fontSize: 13 }}>{count}</span>}
      </span>
    </button>
  );
}

/** role="toolbar" row of chips with roving focus. `label` names it for screen readers. */
export function PbChipRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])];
  // One tab stop: keep tabIndex 0 on the focused (or first) chip only.
  useEffect(() => {
    const all = items();
    if (!all.length) return;
    const cur = all.find(b => b.tabIndex === 0 && b === document.activeElement) ?? all.find(b => b.dataset.pbRoving === '1') ?? all[0];
    all.forEach(b => { b.tabIndex = b === cur ? 0 : -1; });
  });
  const move = (to: HTMLButtonElement | undefined) => {
    if (!to) return;
    items().forEach(b => { b.tabIndex = b === to ? 0 : -1; b.dataset.pbRoving = b === to ? '1' : ''; });
    to.focus();
    to.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next = e.key === 'ArrowRight' ? all[i + 1] : e.key === 'ArrowLeft' ? all[i - 1] : e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : undefined;
    if (next) { e.preventDefault(); move(next); }
  };
  return <div ref={ref} role="toolbar" aria-label={label} className="pb-chiprow" onKeyDown={onKeyDown}>{children}</div>;
}
