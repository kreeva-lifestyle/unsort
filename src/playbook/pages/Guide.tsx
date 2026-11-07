// Guide: the Product Directory user guide inside the app, plus the same guide
// as a PDF (public/playbook/product-directory-guide.pdf). The text lives once,
// as data, in components/guide/content/* — scripts/playbook-guide-pdf.cjs
// prints the HTML + PDF from it, so re-run that script after editing.
// V2 layout: desktop = hero (12) / sticky contents side list (3) + sections
// (9); phone = hero, numbered section rows, then the sections.
import { useEffect } from 'react';
import type { AddToast } from '../components/PbToasts';
import { GUIDE_META, GUIDE_SECTIONS } from '../components/guide/content';
import { GuideSectionView } from '../components/guide/GuideBlocks';
import { GuideHero, GuideRows, GuideSideNav } from '../components/guide/GuideNav';
import { PbButton, PbPageHeader } from '../components/ui';
import { useIsPhone } from '../hooks/useIsPhone';
import { PB, pbMeta, pbSheet } from '../pbTheme';

export default function Guide({ onBack, at }: { addToast: AddToast; onBack?: () => void; at?: string | null }) {
  const phone = useIsPhone();
  // Jump to a section and move focus there (smooth only without reduced motion).
  const jump = (id: string) => {
    const el = document.getElementById(`pbg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  // Opened at a section (e.g. from Settings → Telegram → How to set it up).
  useEffect(() => {
    if (!at) return;
    const r = requestAnimationFrame(() => jump(at));
    return () => cancelAnimationFrame(r);
  }, [at]); // jump only reads the DOM

  const sections = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {GUIDE_SECTIONS.map((s, i) => <GuideSectionView key={s.id} s={s} n={i + 1} />)}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={pbMeta}>{GUIDE_META.brand} · updated {GUIDE_META.updated}</span>
        <PbButton onClick={() => jump('top')}>Back to top</PbButton>
      </div>
    </div>
  );

  return (
    <>
      <PbPageHeader title="Guide" sub="How the Product Directory works, step by step" back={onBack ? { label: 'More', onBack } : undefined} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: phone ? 12 : 16, minWidth: 0, color: PB.tx }}>
        <GuideHero meta={GUIDE_META} pages={GUIDE_SECTIONS.length} />
        {phone ? (
          <>
            <GuideRows sections={GUIDE_SECTIONS} onJump={jump} />
            {sections}
            {/* 14 sections inline make a very long page: a sticky way back to the contents, above the tab bar (mobile.md §5 offset). */}
            <div style={{ position: 'sticky', bottom: 'calc(var(--pb-bar) + env(safe-area-inset-bottom) + 8px)', display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none', marginTop: -8 }}>
              <PbButton icon="book" onClick={() => jump('contents')} style={{ ...pbSheet, pointerEvents: 'auto', borderRadius: PB.r.pill }}>Contents</PbButton>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
            <div style={{ flex: '0 0 280px', alignSelf: 'stretch' }}>
              <GuideSideNav sections={GUIDE_SECTIONS} onJump={jump} />
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>{sections}</div>
          </div>
        )}
      </div>
    </>
  );
}
