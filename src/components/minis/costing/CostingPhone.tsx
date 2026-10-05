// The phone editor (≤768px, picked by CostingEditor at runtime): compact
// header → three tabs (Components · Pricing · Notes) → the bottom Save bar
// that CostingEditor keeps. A component opens as its own full-screen page
// (device Back returns to the list) instead of unfolding in place, so a
// 16-line sheet never becomes one long scroll. All state and gating stay in
// useCostingSheet; a problem tap first reveals the view that holds the field.
import { useState, type MutableRefObject } from 'react';
import { T, S } from '../../../lib/theme';
import { useBackClose } from '../../../hooks/useBackClose';
import { CostingLibrary, componentCost, money, selectedSupplier, subProblems } from './costingModel';
import type { useCostingSheet } from './useCostingSheet';
import ComponentCard from './ComponentCard';
import CostingPhoneHeader from './CostingPhoneHeader';
import CostingPhonePricing from './CostingPhonePricing';
import CostingAttachments from './CostingAttachments';
import SheetProblems, { jumpTo } from './SheetProblems';
import { SubPreset } from './SubChips';

type Tab = 'components' | 'pricing' | 'notes';
type Sheet = ReturnType<typeof useCostingSheet>;

export default function CostingPhone({ s, saved, library, topSubs, categories, addToast, jumpRef }: {
  s: Sheet; saved: boolean; library: CostingLibrary; topSubs: SubPreset[]; categories: string[];
  addToast: (m: string, t?: string) => void;
  /** Filled with reveal() so the bottom bar's "to fix" sheet can use it. */
  jumpRef: MutableRefObject<((t: string) => void) | undefined>;
}) {
  const { p } = s;
  const [tab, setTab] = useState<Tab>('components');
  const [openComp, setOpenComp] = useState<number | null>(null);
  // A new (or duplicated) sheet opens straight onto SKU + category — the
  // first thing a costing needs — instead of a red header nobody tapped.
  const [headerOpen, setHeaderOpen] = useState(!saved && !p.sku.trim());
  useBackClose(openComp !== null, () => setOpenComp(null));

  const skuBad = s.errors.some(e => e.target === 'cost-f-sku'), catBad = s.errors.some(e => e.target === 'cost-f-category');
  /** Open the view that holds the field, then jump (SheetProblems.jumpTo). */
  const reveal = (target: string) => {
    const m = target.match(/^cost-f-(\d+)/);
    if (target === 'cost-f-sku' || target === 'cost-f-category') setHeaderOpen(true);
    else if (m) { setTab('components'); setOpenComp(Number(m[1])); }
    else if (target === 'cost-f-selling') { setTab('pricing'); setOpenComp(null); }
    setTimeout(() => jumpTo(target), 120);
  };
  jumpRef.current = reveal;
  const addComp = () => { const i = p.components.length; s.addComp(); setOpenComp(i); };
  const nAtt = p.attachments?.length ?? 0;
  const problems = <SheetProblems problems={s.errors} onJump={reveal} />;

  // ── one component, full screen ──
  const comp = openComp !== null ? p.components[openComp] : null;
  if (comp && openComp !== null) {
    return (
      <div>
        <button type="button" onClick={() => setOpenComp(null)} style={{ ...S.btnGhost, minHeight: 44, marginBottom: 10 }}>‹ Components</button>
        {problems}
        <ComponentCard key={openComp} comp={comp} idx={openComp} library={library} topSubs={topSubs} defaultOpen bare
          openRequest={s.errorComps.has(openComp) ? s.errVersion : 0}
          onChange={next => s.patchComp(openComp, next)} onRemove={() => { s.removeComp(openComp); setOpenComp(null); }} />
      </div>
    );
  }

  const tabBtn = (k: Tab, label: string) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      style={{ flex: 1, minHeight: 44, border: 'none', borderBottom: `2px solid ${tab === k ? T.ac : 'transparent'}`, background: 'none', color: tab === k ? T.ac2 : T.tx3, fontSize: 12, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer' }}>{label}</button>
  );
  return (
    <div>
      <CostingPhoneHeader p={p} uploading={s.uploading} categories={categories} problems={{ sku: skuBad, category: catBad }}
        open={headerOpen} onOpen={() => setHeaderOpen(true)} onClose={() => setHeaderOpen(false)}
        onSku={v => s.patch({ sku: v })} onCategory={v => s.patch({ category: v })} onFile={s.uploadImage} />
      <div className="cost-ph-tabs" style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 5, background: T.bg, borderBottom: `1px solid ${T.bd}`, margin: '10px 0 12px' }}>
        {tabBtn('components', `Components · ${p.components.length}`)}{tabBtn('pricing', 'Pricing')}{tabBtn('notes', `Notes${nAtt ? ` · ${nAtt}` : ''}`)}
      </div>
      {problems}

      {tab === 'components' && (
        <div>
          {p.components.map((c, i) => {
            // Red only once a failed Save named this component; before that
            // a half-done component is just quietly incomplete.
            const flagged = s.errorComps.has(i);
            const incomplete = !c.name.trim() || c.subs.length === 0 || c.subs.some(x => Object.values(subProblems(x)).some(Boolean));
            const real = c.subs.filter(x => x.name.trim() || String(x.qty).trim()).length;
            const sups = [...new Set(c.subs.map(x => selectedSupplier(x)?.name.trim()).filter(Boolean))];
            return (
              <div key={i} data-fx={`cost-f-${i}`} onClick={() => setOpenComp(i)} role="button"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', minHeight: 60, marginBottom: 8, border: `1px solid ${flagged ? 'oklch(0.63 0.22 25 / .45)' : T.bd}`, borderRadius: T.rXl, background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c.name.trim() ? T.tx : flagged ? T.re : T.tx2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name.trim() || `Component ${i + 1} — tap to name it`}</div>
                  <div style={{ fontSize: 10, color: flagged ? T.re : T.tx3, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {real ? `${real} line${real === 1 ? '' : 's'}` : 'no lines yet'}{sups.length ? ` · ${sups.join(', ')}` : ''}{flagged && incomplete ? ' · needs attention' : ''}
                  </div>
                </div>
                <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 14, color: T.ac2, flexShrink: 0 }}>{money(componentCost(c))}</span>
                <span style={{ color: T.tx3, fontSize: 18 }}>›</span>
              </div>
            );
          })}
          {p.components.length === 0 && <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 12, color: T.tx3 }}>No components yet — a garment is costed as TOP, PANT, DUPATTA… each with its material lines.</div>}
          <button type="button" onClick={addComp} style={{ ...S.btnGhost, borderStyle: 'dashed', width: '100%', minHeight: 44 }}>+ Add main component</button>
        </div>
      )}
      {tab === 'pricing' && (
        <CostingPhonePricing components={p.components} maintenancePct={p.maintenance_pct} onMaintenance={v => s.patch({ maintenance_pct: v })}
          pieces={s.pieces} onPieces={s.setPieces} sellingPrice={p.selling_price} masterPrice={s.masterPrice} onSelling={v => s.patch({ selling_price: v })} />
      )}
      {tab === 'notes' && (
        <div>
          <textarea className="cost-note" value={p.notes} onChange={e => s.patch({ notes: e.target.value })} aria-label="Notes"
            placeholder="Notes — anything to remember about costing this product: wastage, minimums, vendor terms…"
            rows={4} style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 96, resize: 'vertical', lineHeight: 1.5 }} />
          <CostingAttachments costingId={p.id} saved={saved} list={p.attachments ?? []} addToast={addToast} onChange={next => s.patch({ attachments: next })} />
        </div>
      )}
    </div>
  );
}
