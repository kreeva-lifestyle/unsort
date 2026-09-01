import { T } from '../../lib/theme';

// The visible track stays 50x30 (44x26 for sm) so existing rows keep their
// layout; the surrounding button is padded out to a 44px tap target with
// negative margins so the extra hit area doesn't push neighbours around.
export default function Toggle({ on, onToggle, size = 'md', label }: { on: boolean; onToggle: () => void; size?: 'sm' | 'md'; label?: string }) {
  const w = size === 'sm' ? 44 : 50;
  const h = size === 'sm' ? 26 : 30;
  const dot = size === 'sm' ? 20 : 24;
  const pad = (h - dot) / 2;
  const hitPad = Math.max(0, (44 - h) / 2);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      style={{ background: 'none', border: 'none', padding: `${hitPad}px 0`, margin: `-${hitPad}px 0`, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', lineHeight: 0 }}
    >
      <span style={{ width: w, height: h, borderRadius: h, background: on ? T.gr : 'rgba(255,255,255,.12)', position: 'relative', display: 'block', transition: 'background .2s ease', boxShadow: on ? `0 0 12px oklch(0.72 0.19 145 / .25)` : 'inset 0 1px 3px rgba(0,0,0,.3)' }}>
        <span style={{ width: dot, height: dot, borderRadius: '50%', background: '#fff', position: 'absolute', top: pad, left: on ? w - dot - pad : pad, transition: 'left .2s cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
      </span>
    </button>
  );
}
