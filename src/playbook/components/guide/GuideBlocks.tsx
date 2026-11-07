// Renders the guide's data (types.ts) in the V2 glass look: paragraphs,
// sub-headings, numbered steps, bullets, tables (GuideTable: a table on
// desktop, stacked rows on phone), tip and caution boxes, and the **bold** /
// `code` inline marks. Each section is a flat glass tile (no blur: there are
// 14 of them, over the blur budget).
import type { CSSProperties } from 'react';
import { PB, pbName, pbNum, pbTileFlat, pbTileTitle } from '../../pbTheme';
import type { GuideBlock, GuideSection } from './types';
import GuideTable from './GuideTable';
import { Rich, guideText } from './GuideRich';

const box = (c: string, bg: string, bd: string): CSSProperties => ({
  ...guideText, color: PB.tx, padding: '12px 16px', borderRadius: PB.r.input, background: bg, border: `1px solid ${bd}`, boxShadow: `inset 3px 0 0 ${c}`,
});

function Block({ b }: { b: GuideBlock }) {
  switch (b.kind) {
    case 'p': return <p style={guideText}><Rich text={b.text} /></p>;
    case 'h': return <h3 style={{ ...pbName, margin: '20px 0 8px' }}><Rich text={b.text} /></h3>;
    case 'tip': return <div style={box(PB.live, PB.liveBg, PB.liveBd)}><strong style={{ color: PB.live, marginRight: 8 }}>Tip</strong><Rich text={b.text} /></div>;
    case 'warn': return <div style={box(PB.review, PB.reviewBg, PB.reviewBd)}><strong style={{ color: PB.review, marginRight: 8 }}>Note</strong><Rich text={b.text} /></div>;
    case 'list': return (
      <ul style={{ ...guideText, paddingLeft: 20 }}>
        {b.items.map((it, i) => <li key={i} style={{ marginBottom: 8 }}><Rich text={it} /></li>)}
      </ul>
    );
    case 'steps': return (
      <ol style={{ ...guideText, listStyle: 'none', padding: 0 }}>
        {b.items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <span aria-hidden="true" style={{
              ...pbNum, flexShrink: 0, width: 24, height: 24, borderRadius: PB.r.pill, marginTop: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: PB.brandA, background: PB.ctl, border: `1px solid ${PB.ctlBd}`,
            }}>{i + 1}</span>
            <span className="pb-sr">Step {i + 1}: </span>
            <span style={{ minWidth: 0 }}><Rich text={it} /></span>
          </li>
        ))}
      </ol>
    );
    case 'table': return <GuideTable head={b.head} rows={b.rows} />;
  }
}

export function GuideSectionView({ s, n }: { s: GuideSection; n: number }) {
  return (
    <section id={`pbg-${s.id}`} aria-labelledby={`pbg-${s.id}-h`} className="pb-guide-sec" style={{ ...pbTileFlat, scrollMarginTop: 120 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: s.lead ? 8 : 16, minWidth: 0 }}>
        <span aria-hidden="true" style={{ ...pbNum, fontSize: 13, fontWeight: 500, color: PB.brandA, flexShrink: 0 }}>{String(n).padStart(2, '0')}</span>
        <h2 id={`pbg-${s.id}-h`} style={{ ...pbTileTitle, minWidth: 0, overflowWrap: 'anywhere' }}>{s.title}</h2>
      </div>
      {s.lead && <p style={{ ...guideText, color: PB.tx, marginBottom: 16 }}><Rich text={s.lead} /></p>}
      {s.blocks.map((b, i) => <Block key={i} b={b} />)}
    </section>
  );
}
