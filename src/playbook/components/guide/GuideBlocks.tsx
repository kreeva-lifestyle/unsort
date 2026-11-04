// Renders the guide's data (types.ts) in the dark app theme: paragraphs,
// sub-headings, numbered steps, bullets, tables (scroll sideways on phones),
// tip and caution boxes, and the **bold** / `code` inline marks.
import type { CSSProperties } from 'react';
import { T, S, alpha } from '../../../lib/theme';
import { splitInline, type GuideBlock, type GuideSection } from './types';

export function Rich({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((s, i) => s.t === 'b'
        ? <strong key={i} style={{ color: T.tx, fontWeight: 600 }}>{s.v}</strong>
        : s.t === 'code'
          ? <code key={i} style={{ fontFamily: T.mono, fontSize: '0.88em', background: T.glass2, border: `1px solid ${T.bd2}`, borderRadius: T.rXs, padding: '1px 5px', color: T.tx, overflowWrap: 'anywhere' }}>{s.v}</code>
          : <span key={i}>{s.v}</span>)}
    </>
  );
}

const text: CSSProperties = { fontSize: 13, lineHeight: 1.65, color: T.tx2, margin: '0 0 12px' };
const box = (c: string): CSSProperties => ({
  ...text, padding: '10px 12px', borderRadius: T.r, background: alpha(c, 0.08), border: `1px solid ${alpha(c, 0.22)}`, borderLeft: `3px solid ${c}`,
});

function Block({ b }: { b: GuideBlock }) {
  switch (b.kind) {
    case 'p': return <p style={text}><Rich text={b.text} /></p>;
    case 'h': return <h3 style={{ fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.tx, margin: '18px 0 8px' }}><Rich text={b.text} /></h3>;
    case 'tip': return <div style={box(T.gr)}><strong style={{ color: T.gr, marginRight: 6 }}>Tip</strong><Rich text={b.text} /></div>;
    case 'warn': return <div style={box(T.yl)}><strong style={{ color: T.yl, marginRight: 6 }}>Note</strong><Rich text={b.text} /></div>;
    case 'list': return (
      <ul style={{ ...text, paddingLeft: 20 }}>
        {b.items.map((it, i) => <li key={i} style={{ marginBottom: 6 }}><Rich text={it} /></li>)}
      </ul>
    );
    case 'steps': return (
      <ol style={{ ...text, listStyle: 'none', padding: 0 }}>
        {b.items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <span aria-hidden="true" style={{
              flexShrink: 0, width: 22, height: 22, borderRadius: 11, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: T.bg, background: `linear-gradient(135deg, ${T.yl}, ${T.re})`,
            }}>{i + 1}</span>
            <span style={{ minWidth: 0 }}><Rich text={it} /></span>
          </li>
        ))}
      </ol>
    );
    case 'table': return (
      <div style={{ ...S.tableWrap, marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: b.head.length > 2 ? 520 : 0 }}>
          <thead><tr>{b.head.map(c => <th key={c} style={{ ...S.thStyle, padding: '9px 12px' }}>{c}</th>)}</tr></thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => <td key={j} style={{ ...S.tdStyle, padding: '9px 12px', fontSize: 12, lineHeight: 1.55, verticalAlign: 'top' }}><Rich text={c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

export function GuideSectionView({ s, n }: { s: GuideSection; n: number }) {
  return (
    <section id={`pbg-${s.id}`} style={{ ...S.card, scrollMarginTop: 120, padding: '18px 16px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: s.lead ? 6 : 12 }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.yl, flexShrink: 0 }}>{String(n).padStart(2, '0')}</span>
        <h2 style={{ fontFamily: T.sora, fontSize: 17, fontWeight: 700, color: T.tx, margin: 0, letterSpacing: -0.2 }}>{s.title}</h2>
      </div>
      {s.lead && <p style={{ ...text, color: T.tx3, marginBottom: 14 }}><Rich text={s.lead} /></p>}
      {s.blocks.map((b, i) => <Block key={i} b={b} />)}
    </section>
  );
}
