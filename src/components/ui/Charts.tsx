// The small charts the module summaries (Jobwork, Purchase Orders) are
// drawn with. Plain divs, theme tokens only, thin marks on recessive
// tracks: a meter (one hue on its own lighter step), a stacked bar with a
// labelled count per segment (so no state rides on colour alone), a bar
// list in one hue, and a short column strip with its values written above.
// Marks carry a title, so hovering reads the exact figure; the figures are
// always printed too.
import { T, alpha } from '../../lib/theme';

const TRACK = 0.16;   // the unfilled part of a meter: same hue, lighter step

/** One ratio against its whole — `value` of `max`, filled in `color`. */
export function Meter({ value, max, color, title }: { value: number; max: number; color: string; title: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div title={title || undefined} role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}
      style={{ height: 6, borderRadius: 4, background: alpha(color, TRACK), overflow: 'hidden', opacity: max > 0 ? 1 : 0.5 }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, transition: 'width .3s ease' }} />
    </div>
  );
}

export interface Segment { key: string; label: string; count: number; color: string }

/** Part-to-whole: segments with a 2px surface gap, then a chip per segment
 *  (dot · count · label) — the legend and the direct labels in one. */
export function StackBar({ parts }: { parts: Segment[] }) {
  const total = parts.reduce((t, p) => t + p.count, 0);
  const shown = parts.filter(p => p.count > 0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden', background: total ? 'transparent' : T.s3 }}>
        {shown.map(p => <div key={p.key} title={`${p.count} ${p.label.toLowerCase()}`} style={{ flex: `${p.count} 1 0`, background: p.color, minWidth: 3 }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8 }}>
        {(shown.length ? shown : parts.slice(0, 1)).map(p => (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.tx3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: p.count ? p.color : T.s3, flexShrink: 0 }} />
            <b style={{ color: T.tx2, fontFamily: T.mono, fontWeight: 600 }}>{p.count}</b> {p.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

/** `value` sets the bar (one axis for every row); `valueText` is what the
 *  row prints, which may say more (e.g. meters, which the bar leaves out). */
export interface BarRow { key: string; label: string; value: number; valueText: string; sub?: string; pick?: boolean }

/** Magnitude, largest first: name · value, a bar in one hue underneath. */
export function BarList({ rows, color, onPick }: { rows: BarRow[]; color: string; onPick?: (key: string) => void }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map(r => {
        const Tag: 'button' | 'div' = onPick && r.pick ? 'button' : 'div';
        return (
          <Tag key={r.key} type={Tag === 'button' ? 'button' : undefined} onClick={Tag === 'button' ? () => onPick!(r.key) : undefined} title={`${r.label}: ${r.valueText}`}
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', minHeight: 44, textAlign: 'left', background: 'none', border: 'none', padding: '4px 0', cursor: Tag === 'button' ? 'pointer' : 'default', fontFamily: T.sans, color: T.tx }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              {r.sub && <span style={{ fontSize: 10, color: T.tx3, whiteSpace: 'nowrap' }}>{r.sub}</span>}
              <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.tx2, whiteSpace: 'nowrap' }}>{r.valueText}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: alpha(color, TRACK), marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', borderRadius: 4, background: color }} />
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

export interface Column { key: string; label: string; value: number; color: string }

/** A few columns side by side, value above each, label under. */
export function Columns({ cols }: { cols: Column[] }) {
  const max = Math.max(1, ...cols.map(c => c.value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'end' }}>
      {cols.map(c => (
        <div key={c.key} title={`${c.value} ${c.label.toLowerCase()}`} style={{ minWidth: 0, textAlign: 'center' }}>
          <div style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: c.value ? T.tx2 : T.tx3, marginBottom: 4 }}>{c.value}</div>
          <div style={{ height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ width: 'min(100%, 36px)', height: `${Math.max(c.value ? 6 : 2, (c.value / max) * 72)}px`, borderRadius: '4px 4px 2px 2px', background: c.value ? c.color : T.s3 }} />
          </div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}
