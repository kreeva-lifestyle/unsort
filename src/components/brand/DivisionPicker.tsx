// The division choice on the login card: two tiles, the remembered one
// selected. Signing in (password or Face ID) opens the division picked here.
import { T } from '../../lib/theme';
import { DIVISIONS, setDivision, useDivision } from '../../lib/division';
import { DailyWorkMark, PlaybookMark } from './DivisionLogos';

export default function DivisionPicker() {
  const current = useDivision();
  return (
    <div role="radiogroup" aria-label="Division" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
      {DIVISIONS.map(d => {
        const on = current === d.id;
        const tone = d.id === 'playbook' ? T.yl : T.ac2;
        return (
          <button key={d.id} type="button" role="radio" aria-checked={on} onClick={() => setDivision(d.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px 12px', minHeight: 44, borderRadius: 14, cursor: 'pointer', fontFamily: T.sans,
              background: on ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)', border: `1.5px solid ${on ? tone : 'rgba(255,255,255,.08)'}`,
              boxShadow: on ? `0 8px 24px rgba(0,0,0,.35)` : 'none', opacity: on ? 1 : 0.7, transition: 'all .18s ease' }}>
            {d.id === 'playbook' ? <PlaybookMark size={38} /> : <DailyWorkMark size={38} />}
            <span style={{ fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: on ? T.tx : T.tx2, letterSpacing: -0.2 }}>{d.name}</span>
            <span style={{ fontSize: 10, color: T.tx3, lineHeight: 1.3, textAlign: 'center' }}>{d.tagline}</span>
          </button>
        );
      })}
    </div>
  );
}
