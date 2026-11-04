// Logos of the two divisions (owner, 2026-11-04). Original marks, drawn in
// SVG from the theme colours so they stay sharp at any size.
//  DailyWork — a day's arc closing into a tick: the day's work, done.
//  Playbook  — an open book whose spine is a play button: the plan, in motion.
import { useId } from 'react';
import { T } from '../../lib/theme';
import type { Division } from '../../lib/division';

type MarkProps = { size?: number; title?: string };

export function DailyWorkMark({ size = 40, title = 'DailyWork' }: MarkProps) {
  const g = useId();
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={title} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: T.ac }} /><stop offset="1" style={{ stopColor: T.bl }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${g})`} />
      {/* the day: three-quarters of a sun's path */}
      <path d="M32.4 14A13 13 0 1 0 37 24" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3.2" strokeLinecap="round" />
      {/* the work: a tick that finishes the circle */}
      <path d="M17 24.5l5 5L37 14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlaybookMark({ size = 40, title = 'Playbook' }: MarkProps) {
  const g = useId();
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={title} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: T.yl }} /><stop offset="1" style={{ stopColor: T.re }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${g})`} />
      {/* open book: two pages meeting at the spine */}
      <path d="M24 15.5c-3.6-2.4-8-3-13-2.4v19.6c5-.6 9.4 0 13 2.4" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M24 15.5c3.6-2.4 8-3 13-2.4v19.6c-5-.6-9.4 0-13 2.4" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
      {/* the spine is a play button */}
      <path d="M20.5 19.2v11.6c0 .9 1 1.4 1.7.9l8.3-5.8c.6-.4.6-1.4 0-1.8l-8.3-5.8c-.7-.5-1.7 0-1.7.9z" fill="#fff" />
    </svg>
  );
}

/** Mark + wordmark ("Daily" + gradient "Work"). */
export function DivisionLogo({ division, size = 36, sub }: { division: Division; size?: number; sub?: string }) {
  const play = division === 'playbook';
  const [a, b] = play ? ['Play', 'book'] : ['Daily', 'Work'];
  const grad = play ? `linear-gradient(135deg, ${T.yl}, ${T.re})` : `linear-gradient(135deg, ${T.ac2}, ${T.bl})`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.3), minWidth: 0 }}>
      {play ? <PlaybookMark size={size} /> : <DailyWorkMark size={size} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.sora, fontWeight: 700, fontSize: Math.round(size * 0.5), letterSpacing: -0.4, color: T.tx, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          {a}<span style={{ background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{b}</span>
        </div>
        {sub && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
    </div>
  );
}
