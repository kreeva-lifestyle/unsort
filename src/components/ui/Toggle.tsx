import { T } from '../../lib/theme';

export default function Toggle({ on, onToggle, size = 'md' }: { on: boolean; onToggle: () => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 36 : 44;
  const h = size === 'sm' ? 20 : 24;
  const dot = size === 'sm' ? 16 : 20;
  return (
    <div onClick={onToggle} style={{ width: w, height: h, borderRadius: h, background: on ? T.gr : 'rgba(255,255,255,.1)', cursor: 'pointer', position: 'relative', transition: 'background .25s ease', flexShrink: 0, border: `1px solid ${on ? 'rgba(34,197,94,.3)' : T.bd}` }}>
      <div style={{ width: dot, height: dot, borderRadius: '50%', background: '#fff', position: 'absolute', top: (h - dot) / 2 - 1, left: on ? w - dot - (h - dot) / 2 : (h - dot) / 2 - 1, transition: 'left .25s cubic-bezier(.4,0,.2,1)', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
    </div>
  );
}
