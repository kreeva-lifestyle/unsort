// Icons for Playbook: the shared Icon set (src/lib/theme.tsx) plus the few
// shapes the V2 chrome needs that it lacks (home, chevrons, plus, more…),
// drawn the same way (24×24, stroke currentColor 1.8). Always aria-hidden:
// put the meaning in a visible label or the button's aria-label.
// TODO(shared): move these paths into Icon in src/lib/theme.tsx in a
// reviewed shared-layer change, then make PbIcon a thin alias.
import { Icon } from '../../../lib/theme';

const EXTRA: Record<string, string> = {
  home: 'M3 10.5L12 3l9 7.5M5 9v11a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9',
  globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6L6 18M6 6l12 12',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  refresh: 'M21 12a9 9 0 01-15.5 6.2L3 16M3 12a9 9 0 0115.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  arrowUpRight: 'M7 17L17 7M8 7h9v9',
  book: 'M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14zM4 19.5A2.5 2.5 0 006.5 22H20v-5',
  photo: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 16l-5-5-9 8',
  trash: 'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6',
  copy: 'M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  key: 'M15.5 7.5a3 3 0 11-6 0 3 3 0 016 0zM12.5 10.5L4 19v2h3v-2h2v-2h2l1.5-1.5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M3 3l18 18M10.6 10.6A3 3 0 0013.4 13.4M9.9 5.2A10.5 10.5 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1',
  merge: 'M7 4v7a4 4 0 004 4h6M17 15l-3-3M17 15l-3 3M7 4L4 7M7 4l3 3',
};

export default function PbIcon({ name, size = 16 }: { name: string; size?: number }) {
  const d = EXTRA[name];
  if (!d) return <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}><Icon name={name} size={size} /></span>;
  const dots = name === 'more';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      style={{ flexShrink: 0, display: 'block', fill: 'none', stroke: 'currentColor', strokeWidth: dots ? 3 : 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d={d} />
    </svg>
  );
}
