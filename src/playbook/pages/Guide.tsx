// Guide: the Product Directory user guide inside the app, plus the same guide
// as a PDF (public/playbook/product-directory-guide.pdf). The text lives once,
// as data, in components/guide/content/* — scripts/playbook-guide-pdf.cjs
// prints the HTML + PDF from it, so re-run that script after editing.
import { T, S, Icon } from '../../lib/theme';
import type { AddToast } from '../components/PbToasts';
import { GUIDE_META, GUIDE_SECTIONS } from '../components/guide/content';
import { GuideSectionView } from '../components/guide/GuideBlocks';

const linkBtn = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', flex: '1 1 150px', maxWidth: 220 } as const;

export default function Guide(_props: { addToast: AddToast }) {
  const jump = (id: string) => document.getElementById(`pbg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820, margin: '0 auto' }}>
      <div id="pbg-top" style={{ scrollMarginTop: 120 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.yl }}>{GUIDE_META.brand}</div>
        <h1 style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: T.tx, margin: '6px 0 6px' }}>{GUIDE_META.title}</h1>
        <div style={{ fontSize: 13, color: T.tx3, lineHeight: 1.5 }}>{GUIDE_META.subtitle}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <a href={GUIDE_META.pdf} download="Product-Directory-Guide.pdf" style={{ ...S.btnPrimary, ...linkBtn }}>
            <Icon name="file" size={15} />Download PDF
          </a>
          <a href={GUIDE_META.pdf} target="_blank" rel="noopener" style={{ ...S.btnGhost, ...linkBtn }}>
            <Icon name="link" size={15} />Open PDF
          </a>
        </div>
      </div>

      <nav aria-label="Guide contents" style={S.card}>
        <div style={{ ...S.fLabel, marginBottom: 8 }}>Contents</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: 6 }}>
          {GUIDE_SECTIONS.map((s, i) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)}
              style={{ minHeight: 44, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.r, color: T.tx2, fontFamily: T.sans, fontSize: 13, cursor: 'pointer' }}>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.yl, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ minWidth: 0 }}>{s.short}</span>
            </button>
          ))}
        </div>
      </nav>

      {GUIDE_SECTIONS.map((s, i) => <GuideSectionView key={s.id} s={s} n={i + 1} />)}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 11, color: T.tx3 }}>
        <span>{GUIDE_META.brand} · updated {GUIDE_META.updated}</span>
        <button type="button" onClick={() => jump('top')} style={{ ...S.btnGhost, minHeight: 44 }}>&#8593; Back to top</button>
      </div>
    </div>
  );
}
