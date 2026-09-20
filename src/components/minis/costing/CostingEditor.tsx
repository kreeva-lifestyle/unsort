// One costing sheet, owner-approved redesign: hero (photo · SKU · cost/pc)
// with a selling-price + margin strip, collapsible component cards whose
// rows open the LineSheet, and Save in the sticky total bar. Compulsory
// fields still enforced at SAVE — a half-filled sheet is never stored.
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import {
  CostingProduct, CostingLibrary, SheetProblem, blankComponent, totalCost,
  validateSheetDetailed, pruneBlank, subProblems, num,
} from './costingModel';
import ComponentCard from './ComponentCard';
import CostingHero from './CostingHero';
import { canonicalizeNames } from './costingNames';
import { SubPreset } from './SubChips';
import TotalsCard from './TotalsCard';
import SheetProblems from './SheetProblems';
import { optimizeImage } from './imageResize';
import PrintPreview from './PrintPreview';
import { purchasePlanHtml } from './purchasePlan';
import RaisePOModal from './RaisePOModal';
import { costingSheetHtml } from './costingSheet';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import { useSettingsCategories } from './useSettingsCategories';
import { useProductCatalog, resolveSku } from '../../../hooks/useProductCatalog';

export default function CostingEditor({ product, saved, library, topSubs, onSaved, onBack, addToast }: {
  product: CostingProduct;
  saved: boolean;
  library: CostingLibrary;
  topSubs: SubPreset[];
  onSaved: (p: CostingProduct) => void;
  onBack: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [p, setP] = useState<CostingProduct>(product);
  const [errors, setErrors] = useState<SheetProblem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [raiseOpen, setRaiseOpen] = useState(false);
  // Owner's flow: pieces to make -> totals and purchase plan use the same number.
  const [pieces, setPieces] = useState('');
  const { ask, modalProps } = useConfirm();
  const { categories } = useSettingsCategories(addToast);
  // The master sheet's PRICE EXC GST is the final selling price when it
  // exists (owner's rule): it fills the field, locks it, and is saved with
  // the sheet so the Price Projector and reports agree.
  const { index } = useProductCatalog();
  const masterHit = resolveSku(index, p.sku)?.product ?? null;
  const masterPrice = masterHit && masterHit.price_exc_gst != null && Number(masterHit.price_exc_gst) > 0 ? Number(masterHit.price_exc_gst) : null;
  useEffect(() => { if (masterPrice && num(p.selling_price ?? '') !== masterPrice) setP(prev => ({ ...prev, selling_price: masterPrice })); }, [masterPrice, p.selling_price]);
  // A saved, complete component starts folded (compact overview); anything
  // new or with problems starts open. Computed once at mount.
  const [openDefaults] = useState<boolean[]>(() => product.components.map(c =>
    !saved || !c.name.trim() || c.subs.length === 0 ||
    c.subs.some(s => Object.values(subProblems(s)).some(Boolean))));

  // Delete lives INSIDE the open costing (owner's call) - the list cards
  // stay clean. Only offered for a costing that exists in the DB.
  const deleteCosting = async () => {
    if (!await ask({ title: `Delete product costing ${p.sku || product.sku}?`, confirmLabel: 'Delete', danger: true })) return;
    const { error } = await supabase.from('costing_products').delete().eq('id', p.id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(`${p.sku || product.sku} deleted`, 'success');
    onSaved(p);
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      // Phone photos are 3-8 MB; resize + re-encode BEFORE upload (~200 KB).
      const { blob, type } = await optimizeImage(file);
      const path = `${p.id}.jpg`;
      // A year of caching is safe: the ?v= below gives every replacement a
      // new url, so a cached one can never show a replaced photo.
      const { error } = await supabase.storage.from('costing-images').upload(path, blob, { contentType: type, upsert: true, cacheControl: '31536000' });
      if (error) throw error;
      const { data } = supabase.storage.from('costing-images').getPublicUrl(path);
      // Cache-buster: upsert keeps the URL, else the old photo sticks around.
      const url = `${data.publicUrl}?v=${Date.now()}`;
      setP(prev => ({ ...prev, image_url: url }));
      addToast('Photo uploaded — remember to Save', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setUploading(false);
  };

  const save = async () => {
    if (saving) return;
    // Untouched leftover lines are dropped (never a save blocker) and names
    // snap to their one existing spelling ("cups" == "CUPS" == "Cups").
    const comps = canonicalizeNames(pruneBlank(p.components), library);
    setP(prev => ({ ...prev, components: comps }));
    const errs = validateSheetDetailed(p.sku, comps, p.category);
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        id: p.id, sku: p.sku.trim().toUpperCase(), image_url: p.image_url,
        maintenance_pct: num(p.maintenance_pct), components: comps,
        notes: p.notes, created_by: user?.id, updated_at: new Date().toISOString(),
        category: (p.category || '').trim(),
        selling_price: String(p.selling_price ?? '').trim() ? num(p.selling_price ?? '') : null,
      };
      const { error } = await supabase.from('costing_products').upsert(row);
      // Same SKU on another sheet: the unique index refuses it (this is what
      // makes Duplicate safe) - say so in plain words, not a DB error.
      if (error) throw (error.code === '23505'
        ? new Error(`A product costing for ${row.sku} already exists - change the SKU (duplicates must get a new code)`)
        : error);
      addToast(`${row.sku} saved`, 'success');
      onSaved({ ...p, sku: row.sku, components: comps });
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const patchComp = (i: number, next: ReturnType<typeof blankComponent>) =>
    setP(prev => ({ ...prev, components: prev.components.map((c, j) => (j === i ? next : c)) }));

  // Both PDFs need a valid sheet; the purchase plan and Raise POs also need
  // pieces, and Raise POs needs a SAVED sheet (the POs link back to its id).
  const openPdf = (which: 'sheet' | 'plan' | 'raise') => {
    if (which !== 'sheet' && !(Math.floor(num(pieces)) > 0)) { addToast('Enter "Pieces to make" first — the plan is calculated from it', 'error'); return; }
    if (which === 'raise' && !saved) { addToast('Save the costing first — the POs link back to it', 'error'); return; }
    const comps = canonicalizeNames(pruneBlank(p.components), library);
    setP(prev => ({ ...prev, components: comps }));
    const errs = validateSheetDetailed(p.sku, comps, p.category);
    if (errs.length) { setErrors(errs); addToast('Fix the highlighted fields first', 'error'); return; }
    setErrors([]);
    (which === 'plan' ? setPlanOpen : which === 'raise' ? setRaiseOpen : setSheetOpen)(true);
  };

  const total = totalCost(p.components, p.maintenance_pct);
  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <CostingHero p={p} total={total} uploading={uploading} categories={categories} masterPrice={masterPrice}
        onSku={v => setP(prev => ({ ...prev, sku: v }))}
        onCategory={v => setP(prev => ({ ...prev, category: v }))}
        onSelling={v => setP(prev => ({ ...prev, selling_price: v }))}
        onFile={uploadImage} />

      {p.components.map((c, i) => (
        <ComponentCard key={i} comp={c} idx={i} library={library} topSubs={topSubs}
          defaultOpen={openDefaults[i] ?? true}
          onChange={next => patchComp(i, next)}
          onRemove={() => setP(prev => ({ ...prev, components: prev.components.filter((_, j) => j !== i) }))} />
      ))}
      <button onClick={() => setP(prev => ({ ...prev, components: [...prev.components, blankComponent()] }))}
        style={{ ...S.btnPrimary, minHeight: 40 }}>+ Add main component</button>

      <TotalsCard components={p.components} maintenancePct={p.maintenance_pct}
        onMaintenance={v => setP(prev => ({ ...prev, maintenance_pct: v }))}
        pieces={pieces} onPieces={setPieces} />

      <div style={{ marginTop: 12 }}>
        <label style={S.fLabel}>Notes</label>
        <textarea value={p.notes} onChange={e => setP(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Anything to remember about costing this product — wastage, minimums, vendor terms…"
          rows={3} style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 64, resize: 'vertical', lineHeight: 1.5 }} />
      </div>

      <SheetProblems problems={errors} />

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...S.btnGhost, minHeight: 44 }}>Back</button>
        {saved && <button onClick={deleteCosting} style={{ ...S.btnDanger, minHeight: 44 }}>Delete</button>}
        <button onClick={() => openPdf('sheet')} style={{ ...S.btnGhost, minHeight: 44, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)' }}>Costing PDF</button>
        <button onClick={() => openPdf('plan')} style={{ ...S.btnGhost, minHeight: 44, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)' }}>Purchase plan (PDF)</button>
        <button onClick={() => openPdf('raise')} style={{ ...S.btnGhost, minHeight: 44, color: T.ac2 }}>Raise POs</button>
        <button onClick={save} disabled={saving}
          style={{ ...S.btnPrimary, flex: 1, minWidth: 140, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {planOpen && (
        <PrintPreview title={`Purchase plan — ${p.sku} × ${Math.floor(num(pieces))} pcs`}
          html={purchasePlanHtml(p.sku, p.image_url, p.components, Math.floor(num(pieces)), p.maintenance_pct)}
          onClose={() => setPlanOpen(false)} />
      )}
      {sheetOpen && (
        <PrintPreview title={`Product costing — ${p.sku}`} html={costingSheetHtml(p)} onClose={() => setSheetOpen(false)} />
      )}
      {raiseOpen && <RaisePOModal product={p} pieces={Math.floor(num(pieces))} onClose={() => setRaiseOpen(false)} addToast={addToast} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
