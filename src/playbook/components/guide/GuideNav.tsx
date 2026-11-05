// The guide's hero (title + the PDF, the page's one gradient tile) and its
// contents: numbered glass rows on phone, a sticky side list on desktop.
// Rows jump to the section; they hold no other action.
import { PB, pbHero, pbLabel, pbMeta, pbName, pbNum, pbRow, pbTile } from '../../pbTheme';
import PbIcon from '../ui/PbIcon';
import type { GuideSection } from './types';

type Meta = { title: string; brand: string; subtitle: string; updated: string; pdf: string };

const heroBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '0 16px', borderRadius: PB.r.btn,
  fontFamily: PB.sans, fontSize: 'var(--pb-btn-fs)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box',
} as const;

export function GuideHero({ meta, pages }: { meta: Meta; pages: number }) {
  return (
    <section id="pbg-top" aria-labelledby="pbg-title"
      style={{ ...pbHero, scrollMarginTop: 120, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, rowGap: 16 }}>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...pbLabel, color: PB.onBrand, marginBottom: 0 }}>{meta.brand}</span>
        <h2 id="pbg-title" style={{ fontFamily: PB.sora, fontWeight: 700, fontSize: 22, letterSpacing: -0.3, lineHeight: 1.25, margin: 0, color: PB.onBrand, overflowWrap: 'anywhere' }}>{meta.title}</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: PB.onBrand }}>{meta.subtitle}</p>
        <span style={{ fontSize: 12, lineHeight: 1.5, color: PB.onBrand }}><span style={pbNum}>{pages}</span> sections · updated {meta.updated}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: '1 1 300px', maxWidth: 420, minWidth: 0 }}>
        <a href={meta.pdf} download="Product-Directory-Guide.pdf" className="pb-pill" style={{ ...heroBtn, background: PB.onBrand, color: PB.onActive, flex: '1 1 auto' }}>
          <PbIcon name="file" size={18} />Download PDF
        </a>
        <a href={meta.pdf} target="_blank" rel="noopener" className="pb-pill" style={{ ...heroBtn, background: 'transparent', color: PB.onBrand, border: `1px solid ${PB.onBrandBd}`, flex: '1 1 auto' }}>
          <PbIcon name="link" size={18} />Open PDF
        </a>
      </div>
    </section>
  );
}

const num = (i: number) => String(i + 1).padStart(2, '0');
/** "Step 1 — Add and connect…" → "Add and connect…" (the number is already on the row). */
const sub = (s: GuideSection) => s.title.replace(/^Step \d+\s*[—-]\s*/, '');

/** Phone: one glass row per section (min 60, number, name, meta, chevron). */
export function GuideRows({ sections, onJump }: { sections: GuideSection[]; onJump: (id: string) => void }) {
  return (
    <nav aria-label="Guide contents">
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => onJump(s.id)} className="pb-tile" style={{ ...pbRow, cursor: 'pointer', font: 'inherit' }}>
              <span aria-hidden="true" style={{ ...pbNum, width: 24, flexShrink: 0, fontSize: 13, fontWeight: 500, color: PB.brandA }}>{num(i)}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="pb-clamp2" style={pbName}>{s.short}</span>
                <span className="pb-clamp2" style={pbMeta}>{sub(s)}</span>
              </span>
              <span style={{ color: PB.tx3, display: 'inline-flex', flexShrink: 0 }}><PbIcon name="chevronRight" size={16} /></span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Desktop: a sticky side list in one glass tile; the row you jumped to is not tracked (no scroll spy). */
export function GuideSideNav({ sections, onJump }: { sections: GuideSection[]; onJump: (id: string) => void }) {
  return (
    <nav aria-label="Guide contents" style={{ ...pbTile, padding: 12, position: 'sticky', top: 96, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <h2 style={{ ...pbLabel, margin: '4px 8px 8px' }}>Contents</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sections.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => onJump(s.id)} className="pb-pill pb-rowhover"
              style={{ width: '100%', minHeight: 'var(--pb-ctl-h)', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: PB.r.input, border: 'none', background: 'transparent', color: PB.tx, fontFamily: PB.sans, fontSize: 13, lineHeight: 1.4, textAlign: 'left', cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ ...pbNum, fontSize: 12, fontWeight: 500, color: PB.brandA, flexShrink: 0 }}>{num(i)}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{s.short}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
