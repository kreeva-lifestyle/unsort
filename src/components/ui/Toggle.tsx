import { T } from '../../lib/theme';

export default function Toggle({ on, onToggle, size = 'md' }: { on: boolean; onToggle: () => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 44 : 50;
  const h = size === 'sm' ? 26 : 30;
  const dot = size === 'sm' ? 20 : 24;
  const pad = (h - dot) / 2;
  return (
    <div onClick={onToggle} style={{ width: w, height: h, borderRadius: h, background: on ? T.gr : 'rgba(255,255,255,.12)', cursor: 'pointer', position: 'relative', transition: 'background .2s ease', flexShrink: 0, boxShadow: on ? `0 0 12px rgba(34,197,94,.25)` : 'inset 0 1px 3px rgba(0,0,0,.3)' }}>
      <div style={{ width: dot, height: dot, borderRadius: '50%', background: '#fff', position: 'absolute', top: pad, left: on ? w - dot - pad : pad, transition: 'left .2s cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
    </div>
  );
}
