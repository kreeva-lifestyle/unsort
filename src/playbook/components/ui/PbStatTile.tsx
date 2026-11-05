// KPI / stat tile (data-and-charts.md §6): 11px label → mono value → one
// meta line. A tile that filters a list passes onClick + pressed (a real
// button with aria-pressed; selected = frosted active). Zero shows 0;
// unknown shows —. Screen readers hear "Label: value".
import type { CSSProperties, ReactNode } from 'react';
import { PB, pbActive, pbLabel, pbMeta, pbNum } from '../../pbTheme';
import PbTile, { type PbSpan } from './PbTile';
import { Dot } from '../product/status';

type Props = {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  /** Status colour for a dot before the label (always with the label). */
  dot?: string;
  tone?: 'review' | 'failed';
  onClick?: () => void;
  pressed?: boolean;
  span?: PbSpan; rows?: 2; phoneHalf?: boolean;
  style?: CSSProperties;
};

export default function PbStatTile({ label, value, meta, dot, tone, onClick, pressed, span, rows, phoneHalf, style }: Props) {
  const body = (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', justifyContent: 'space-between', minWidth: 0 }}>
      <span style={{ ...pbLabel, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {dot ? <Dot color={dot} label={label} style={{ fontSize: 11, color: PB.tx2 }} /> : label}
        <span className="pb-sr">: </span>
      </span>
      <span style={{ ...pbNum, fontSize: 'clamp(28px, 2.4vw, 32px)', fontWeight: 500, lineHeight: 1.1, color: PB.tx, overflowWrap: 'anywhere' }}>{value}</span>
      {meta != null && <span style={pbMeta}>{meta}</span>}
    </span>
  );
  return (
    <PbTile as={onClick ? 'button' : 'div'} onClick={onClick} aria-pressed={onClick && pressed != null ? pressed : undefined}
      variant={tone ?? 'default'} span={span} rows={rows} phoneHalf={phoneHalf}
      style={{ ...(pressed ? pbActive : null), ...(pressed ? { borderRadius: 'var(--pb-r-tile)', padding: 'var(--pb-pad-tile)' } : null), ...style }}>
      {body}
    </PbTile>
  );
}
