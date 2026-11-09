// The division choice on the login card: two tiles, the remembered one
// selected. Signing in (password or Face ID) opens the division picked here.
import type { KeyboardEvent } from 'react';
import { T } from '../../lib/theme';
import { DIVISIONS, setDivision, useDivision } from '../../lib/division';
import { DailyWorkMark, PlaybookMark } from './DivisionLogos';

export default function DivisionPicker() {
  const current = useDivision();
  // Radio-group keys: the arrows move the choice (and focus) between tiles.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = DIVISIONS[(DIVISIONS.findIndex(d => d.id === current) + 1) % DIVISIONS.length].id;
    setDivision(next);
    (e.currentTarget.querySelector(`[data-division="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Division" onKeyDown={onKey} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
      {DIVISIONS.map(d => {
        const on = current === d.id;
        const tone = d.id === 'playbook' ? T.yl : T.ac2;
        return (
          <button key={d.id} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-division={d.id} onClick={() => setDivision(d.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px 12px', minHeight: 44, borderRadius: 14, cursor: 'pointer', fontFamily: T.sans,
              background: on ? T.glass2 : T.glass1, border: `1.5px solid ${on ? tone : T.bd2}`,
              boxShadow: on ? `0 8px 24px rgba(0,0,0,.35)` : 'none', opacity: on ? 1 : 0.7, transition: 'all .18s ease' }}>
            {d.id === 'playbook' ? <PlaybookMark size={38} decorative /> : <DailyWorkMark size={38} decorative />}
            <span style={{ fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: on ? T.tx : T.tx2, letterSpacing: -0.2 }}>{d.name}</span>
            <span style={{ fontSize: 11, color: T.tx3, lineHeight: 1.3, textAlign: 'center' }}>{d.tagline}</span>
          </button>
        );
      })}
    </div>
  );
}
