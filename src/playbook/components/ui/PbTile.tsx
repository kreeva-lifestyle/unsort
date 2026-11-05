// Glass tile — the one surface of Playbook V2 (DESIGN.md §5). Never put a
// tile inside a tile. Inside a .pb-bento grid, `span` / `rows` / `phoneHalf`
// place it (12 columns; 6 at ≤1099px; phone stacks, phoneHalf = 2 per row).
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { pbHero, pbTile, pbTileFailed, pbTileFlat, pbTileReview } from '../../pbTheme';

export type PbTileVariant = 'default' | 'hero' | 'review' | 'failed';
export type PbSpan = 12 | 9 | 8 | 6 | 4 | 3;

/** className for bento placement; use it on anything that sits in a .pb-bento grid. */
export const bentoClass = (span?: PbSpan, rows?: 2, phoneHalf?: boolean, extra?: string) =>
  [span && `pb-span-${span}`, rows && 'pb-rows-2', phoneHalf && 'pb-phone-half', extra].filter(Boolean).join(' ') || undefined;

type Props = {
  variant?: PbTileVariant;
  /** No backdrop blur: cards in a results grid, tiles in long lists. Phone never blurs anyway. */
  flat?: boolean;
  as?: 'div' | 'section' | 'article' | 'button' | 'a' | 'li';
  span?: PbSpan; rows?: 2; phoneHalf?: boolean;
  className?: string; style?: CSSProperties; children?: ReactNode;
  onClick?: () => void; href?: string; target?: string; rel?: string;
  type?: 'button' | 'submit';
  'aria-label'?: string; 'aria-labelledby'?: string; 'aria-pressed'?: boolean; 'aria-busy'?: boolean; 'aria-current'?: 'page' | boolean;
  id?: string; title?: string; disabled?: boolean;
  /** Lets a list return focus to the item that opened a detail view. */
  'data-open-id'?: string;
};

export default function PbTile({ variant = 'default', flat, as, span, rows, phoneHalf, className, style, children, type, ...rest }: Props) {
  const Tag = (as ?? (rest.href ? 'a' : 'div')) as ElementType;
  const clickable = Tag === 'button' || Tag === 'a';
  const base = variant === 'hero' ? pbHero : variant === 'review' ? pbTileReview : variant === 'failed' ? pbTileFailed : flat ? pbTileFlat : pbTile;
  const look: CSSProperties = {
    ...base,
    ...(variant !== 'default' && flat ? { backdropFilter: undefined, WebkitBackdropFilter: undefined } : null),
    ...(clickable ? { display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', textDecoration: 'none' } : null),
  };
  const cls = [clickable && 'pb-tile', bentoClass(span, rows, phoneHalf), className].filter(Boolean).join(' ') || undefined;
  return (
    <Tag className={cls} style={{ ...look, ...style }} {...(Tag === 'button' ? { type: type ?? 'button' } : null)} {...rest}>
      {children}
    </Tag>
  );
}
