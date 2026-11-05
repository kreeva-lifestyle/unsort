// Glass list row (DESIGN.md §7, mobile.md §9): no blur. With a photo it is
// 96 tall (64×80 photo, 8px padding); without, min 60 with a 20px icon in a
// 36px control square. The whole row is ONE button / link; a second action
// (… menu) goes beside it as its own 44px button via `after`, never inside.
import type { CSSProperties, ReactNode } from 'react';
import { PB, pbMeta, pbName, pbRow } from '../../pbTheme';
import PbIcon from './PbIcon';

type Props = {
  title: ReactNode;
  meta?: ReactNode;
  /** A <Dot> (status dot + label). */
  status?: ReactNode;
  /** Right side: a mono figure, a tag… */
  right?: ReactNode;
  icon?: string;
  /** A 64×80 photo (pass an <img> or a fallback); switches to the 96px row. */
  photo?: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Chevron; default on when the row is clickable. */
  chevron?: boolean;
  /** Sibling 44px action next to the row (e.g. a … menu button). */
  after?: ReactNode;
  tone?: 'review' | 'failed';
  'aria-label'?: string;
  'aria-current'?: 'page' | boolean;
  /** Lets a list return focus to the row that opened a detail view. */
  'data-open-id'?: string;
  style?: CSSProperties;
};

export function PbRowIcon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PB.tx2, flexShrink: 0 }}>
      <PbIcon name={name} size={20} />
    </span>
  );
}

export default function PbRow({ title, meta, status, right, icon, photo, onClick, href, chevron, after, tone, style, ...aria }: Props) {
  const clickable = !!(onClick || href);
  const look: CSSProperties = {
    ...pbRow,
    ...(photo ? { padding: 8, minHeight: 96 } : null),
    ...(tone === 'review' ? { background: PB.reviewBg, borderColor: PB.reviewBd } : tone === 'failed' ? { background: PB.failedBg, borderColor: PB.failedBd } : null),
    ...(clickable ? { cursor: 'pointer', font: 'inherit', textDecoration: 'none' } : null),
    ...(after ? { flex: 1 } : null),
    ...style,
  };
  const inner = (
    <>
      {photo ? <span style={{ width: 64, height: 80, borderRadius: PB.r.photo, overflow: 'hidden', background: PB.tile, flexShrink: 0, display: 'block' }}>{photo}</span>
        : icon ? <PbRowIcon name={icon} /> : null}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="pb-clamp2" style={pbName}>{title}</span>
        {meta != null && <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{meta}</span>}
        {status}
      </span>
      {right != null && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{right}</span>}
      {(chevron ?? clickable) && <span style={{ color: PB.tx3, display: 'inline-flex', flexShrink: 0 }}><PbIcon name="chevronRight" size={16} /></span>}
    </>
  );
  const row = href ? <a href={href} className="pb-tile" style={look} {...aria}>{inner}</a>
    : onClick ? <button type="button" onClick={onClick} className="pb-tile" style={look} {...aria}>{inner}</button>
      : <div style={look}>{inner}</div>;
  if (!after) return row;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{row}{after}</div>;
}
