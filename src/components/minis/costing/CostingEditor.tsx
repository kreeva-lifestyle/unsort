// One costing sheet (owner-approved redesign, Oct 2026): a bounded editor
// — hero (photo · SKU · category), the component cards whose rows open the
// LineSheet, "+ Add main component", Notes & attachments folded away — with
// the money and the actions in a sticky rail beside it on desktop and in a
// fixed bottom bar on the phone. State and every gated action live in
// useCostingSheet; this file is layout. On a phone (useIsPhone) the body is
// CostingPhone — header, tabs, full-screen component pages — under the same
// bottom bar; the desktop two-column layout is untouched.
import { useState, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { CostingProduct, CostingLibrary, subProblems, num } from './costingModel';
import { useCostingSheet } from './useCostingSheet';
import { useIsPhone } from '../../../hooks/useIsPhone';
import ComponentCard from './ComponentCard';
import CostingHero from './CostingHero';
import CostingRail from './CostingRail';
import CostingSaveBar from './CostingSaveBar';
import CostingPhone from './CostingPhone';
import { SubPreset } from './SubChips';
import PrintPreview from './PrintPreview';
import { purchasePlanHtml } from './purchasePlan';
import RaisePOModal from './RaisePOModal';
import CostingAttachments from './CostingAttachments';
import { costingSheetHtml } from './costingSheet';
import { shareCostingImage } from './costingShare';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import { useSettingsCategories } from './useSettingsCategories';

export default function CostingEditor({ product, saved, library, topSubs, onSaved, onBack, addToast }: {
  product: CostingProduct;
  saved: boolean;
  library: CostingLibrary;
  topSubs: SubPreset[];
  onSaved: (p: CostingProduct) => void;
  onBack: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { ask, modalProps } = useConfirm();
  const { categories } = useSettingsCategories(addToast);
  const s = useCostingSheet({ product, saved, library, onSaved, addToast, ask });
  const { p } = s;
  // A saved, complete component starts folded (compact overview); anything
  // new or with problems starts open. Computed once at mount.
  const [openDefaults] = useState<boolean[]>(() => product.components.map(c =>
    !saved || !c.name.trim() || c.subs.length === 0 ||
    c.subs.some(x => Object.values(subProblems(x)).some(Boolean))));
  // Notes & attachments start open only when the sheet already has some.
  const [extrasOpen] = useState(() => !!product.notes?.trim() || (product.attachments?.length ?? 0) > 0);

  const actions = { saved, saving: s.saving, deleting: s.deleting, onSave: s.save, onDoc: s.openDoc, onBack, onDelete: s.deleteCosting };
  const nAtt = p.attachments?.length ?? 0;
  const phone = useIsPhone();
  // The phone layout reveals the view holding a field before jumping to it.
  const phoneJump = useRef<(t: string) => void>();
  return (
    <div className="cost-editor" style={{ fontFamily: T.sans, color: T.tx }}>
      {phone && <CostingPhone s={s} saved={saved} library={library} topSubs={topSubs} categories={categories} addToast={addToast} jumpRef={phoneJump} />}
      {!phone && <div className="cost-layout">
        <div className="cost-main">
          <CostingHero p={p} uploading={s.uploading} categories={categories}
            onSku={v => s.patch({ sku: v })} onCategory={v => s.patch({ category: v })} onFile={s.uploadImage} />

          <div style={{ height: 14 }} />
          {p.components.map((c, i) => (
            <ComponentCard key={i} comp={c} idx={i} library={library} topSubs={topSubs}
              defaultOpen={openDefaults[i] ?? true} openRequest={s.errorComps.has(i) ? s.errVersion : 0}
              onChange={next => s.patchComp(i, next)} onRemove={() => s.removeComp(i)} />
          ))}
          <button onClick={s.addComp} style={{ ...S.btnGhost, borderStyle: 'dashed', width: '100%', minHeight: 44 }}>+ Add main component</button>
        </div>

        <CostingRail components={p.components} maintenancePct={p.maintenance_pct} onMaintenance={v => s.patch({ maintenance_pct: v })}
          pieces={s.pieces} onPieces={s.setPieces} pcs={s.pcs} sellingPrice={p.selling_price} masterPrice={s.masterPrice}
          onSelling={v => s.patch({ selling_price: v })} errors={s.errors} {...actions} />

        <details className="challan-extras cost-extras" open={extrasOpen} style={{ marginTop: 14 }}>
          <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, padding: '6px 0' }}>
            {/* The count shows only while folded; open, the attachments block carries its own. */}
            <span style={{ ...S.fLabel, margin: 0 }}>Notes & attachments{nAtt > 0 && <span className="x-closed"> · {nAtt}</span>}</span>
            <span style={{ fontSize: 14, color: T.tx3 }}><span className="x-closed">+</span><span className="x-open">−</span></span>
          </summary>
          <textarea className="cost-note" value={p.notes} onChange={e => s.patch({ notes: e.target.value })} aria-label="Notes"
            placeholder="Notes — anything to remember about costing this product: wastage, minimums, vendor terms…"
            rows={3} style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 64, resize: 'vertical', lineHeight: 1.5, marginTop: 8 }} />
          <CostingAttachments costingId={p.id} saved={saved} list={p.attachments ?? []} addToast={addToast}
            onChange={next => s.patch({ attachments: next })} />
        </details>
      </div>}

      <CostingSaveBar sku={p.sku} total={s.total} sell={num(p.selling_price ?? '')} pcs={s.pcs} errors={s.errors} {...actions}
        onJump={phone ? t => phoneJump.current?.(t) : undefined} />

      {s.doc === 'plan' && (
        <PrintPreview title={`Purchase plan — ${p.sku} × ${s.pcs} pcs`}
          html={purchasePlanHtml(p.sku, p.image_url, p.components, s.pcs, p.maintenance_pct)} onClose={s.closeDoc} />
      )}
      {s.doc === 'sheet' && (
        <PrintPreview title={`Product costing — ${p.sku}`} html={costingSheetHtml(p)} onClose={s.closeDoc} onShare={() => shareCostingImage(p, addToast)} />
      )}
      {s.doc === 'raise' && <RaisePOModal product={p} pieces={s.pcs} onClose={s.closeDoc} addToast={addToast} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
