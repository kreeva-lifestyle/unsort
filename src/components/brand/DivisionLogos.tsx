// Logos of the two divisions (owner, 2026-11-04). Original marks, drawn in
// SVG from the theme colours so they stay sharp at any size.
//  DailyWork — a day's arc closing into a tick: the day's work, done.
//  Playbook  — the 'bento P': blocks forming a P with a play button in its bowl.
import { useId } from 'react';
import { T } from '../../lib/theme';
import type { Division } from '../../lib/division';

/** decorative: hide from screen readers when a visible name sits next to the mark. */
type MarkProps = { size?: number; title?: string; decorative?: boolean };

export function DailyWorkMark({ size = 40, title = 'DailyWork', decorative }: MarkProps) {
  const g = useId();
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title })} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: T.ac }} /><stop offset="1" style={{ stopColor: T.bl }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${g})`} />
      {/* the day: three-quarters of a sun's path */}
      <path d="M32.4 14A13 13 0 1 0 37 24" fill="none" stroke={T.tx} strokeOpacity=".55" strokeWidth="3.2" strokeLinecap="round" />
      {/* the work: a tick that finishes the circle */}
      <path d="M17 24.5l5 5L37 14" fill="none" stroke={T.tx} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Playbook's "bento P" (DESIGN.md §9, 2026-11-05): three white blocks forming
// a P on the amber-to-coral brand gradient, a play triangle in its bowl. The
// gradient stops are the Playbook brand tokens (PB.brandA / PB.brandB); they
// are spelled out here because shared code must not import from src/playbook/.
const PB_BRAND_A = 'oklch(0.84 0.15 78)';
const PB_BRAND_B = 'oklch(0.64 0.21 28)';
const MARK_WHITE = 'oklch(1 0 0)';

export function PlaybookMark({ size = 40, title = 'Playbook', decorative }: MarkProps) {
  const g = useId();
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title })} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: PB_BRAND_A }} /><stop offset="1" style={{ stopColor: PB_BRAND_B }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${g})`} />
      <rect x="10" y="10" width="11" height="28" rx="4" fill={MARK_WHITE} />
      <rect x="24" y="10" width="14" height="13" rx="4" fill={MARK_WHITE} fillOpacity=".72" />
      <path d="M25.5 27.6v8.8c0 .8.9 1.3 1.6.9l7-4.4c.6-.4.6-1.3 0-1.7l-7-4.4c-.7-.5-1.6 0-1.6.8z" fill={MARK_WHITE} fillOpacity=".9" />
    </svg>
  );
}

/** Mark + wordmark ("Daily" + gradient "Work"). */
export function DivisionLogo({ division, size = 36, sub }: { division: Division; size?: number; sub?: string }) {
  const play = division === 'playbook';
  const [a, b] = play ? ['Play', 'book'] : ['Daily', 'Work'];
  const grad = play ? `linear-gradient(135deg, ${PB_BRAND_A}, ${PB_BRAND_B})` : `linear-gradient(135deg, ${T.ac2}, ${T.bl})`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.3), minWidth: 0 }}>
      {play ? <PlaybookMark size={size} decorative /> : <DailyWorkMark size={size} decorative />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.sora, fontWeight: 700, fontSize: Math.round(size * 0.5), letterSpacing: -0.4, color: T.tx, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          {a}<span style={{ background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{b}</span>
        </div>
        {sub && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
    </div>
  );
}
