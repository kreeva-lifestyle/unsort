// The costing editor's state and every gated action, in one hook so the
// screen (CostingEditor + CostingRail + CostingSaveBar) is layout only.
// Rules that must survive any redesign: validation only at Save / before a
// document, with a tappable problem list; Purchase plan and Raise POs need
// "Pieces to make"; Raise POs needs a SAVED sheet; the master sheet's PRICE
// EXC GST locks the selling price; a failed attempt re-opens every folded
// component that holds a problem (errVersion) so a tapped error always
// finds its row.
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/friendlyError';
import { useCrumb } from '../../../hooks/useBreadcrumb';
import { useProductCatalog, resolveSku } from '../../../hooks/useProductCatalog';
import {
  CostingProduct, CostingLibrary, CostingComponent, SheetProblem, blankComponent, totalCost,
  validateSheetDetailed, pruneBlank, num,
} from './costingModel';
import { canonicalizeNames } from './costingNames';
import { uploadProductPhoto } from './costingThumbs';

export type DocKind = 'sheet' | 'plan' | 'raise';
type Ask = (o: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;

export function useCostingSheet({ product, saved, library, onSaved, addToast, ask }: {
  product: CostingProduct;
  saved: boolean;
  library: CostingLibrary;
  onSaved: (p: CostingProduct) => void;
  addToast: (m: string, t?: string) => void;
  ask: Ask;
}) {
  const [p, setP] = useState<CostingProduct>(product);
  // Header crumb from the SKU as typed: "Minis / Product Costing / FD-1".
  useCrumb(p.sku.trim().toUpperCase() || 'New costing');
  const [errors, setErrors] = useState<SheetProblem[]>([]);
  const [errVersion, setErrVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Owner's flow: pieces to make -> totals, purchase plan and POs use the same number.
  const [pieces, setPieces] = useState('');
  const [doc, setDoc] = useState<DocKind | null>(null);
  // The master sheet's PRICE EXC GST is the final selling price when it
  // exists (owner's rule): it fills the field, locks it, and is saved with
  // the sheet so the Price Projector and reports agree.
  const { index } = useProductCatalog();
  const masterHit = resolveSku(index, p.sku)?.product ?? null;
  const masterPrice = masterHit && masterHit.price_exc_gst != null && Number(masterHit.price_exc_gst) > 0 ? Number(masterHit.price_exc_gst) : null;
  useEffect(() => { if (masterPrice && num(p.selling_price ?? '') !== masterPrice) setP(prev => ({ ...prev, selling_price: masterPrice })); }, [masterPrice, p.selling_price]);

  const patch = (q: Partial<CostingProduct>) => setP(prev => ({ ...prev, ...q }));
  const pcs = Math.floor(num(pieces));
  const total = totalCost(p.components, p.maintenance_pct);
  // Component indices named by the problems (cost-f-{ci} / cost-f-{ci}-{si}).
  const errorComps = new Set(errors.map(e => e.target.match(/^cost-f-(\d+)/)).filter(Boolean).map(m => Number(m![1])));

  const failValidation = (errs: SheetProblem[]) => {
    setErrors(errs);
    setErrVersion(v => v + 1);
    addToast(`${errs.length} thing${errs.length === 1 ? '' : 's'} to fix — tap one`, 'error');
    requestAnimationFrame(() => document.querySelector('[data-fx="cost-problems"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  /** Prune untouched lines, snap names to their one spelling, validate.
   *  Returns the cleaned components, or null after listing the problems. */
  const check = (): CostingComponent[] | null => {
    const comps = canonicalizeNames(pruneBlank(p.components), library);
    setP(prev => ({ ...prev, components: comps }));
    const errs = validateSheetDetailed(p.sku, comps, p.category);
    if (errs.length) { failValidation(errs); return null; }
    setErrors([]);
    return comps;
  };

  const save = async () => {
    if (saving) return;
    const comps = check();
    if (!comps) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        id: p.id, sku: p.sku.trim().toUpperCase(), image_url: p.image_url,
        maintenance_pct: num(p.maintenance_pct), components: comps,
        notes: p.notes, created_by: user?.id, updated_at: new Date().toISOString(),
        category: (p.category || '').trim(), attachments: p.attachments ?? [],
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

  // Every document needs a valid sheet; the plan and Raise POs also need
  // pieces, and Raise POs needs a SAVED sheet (the POs link back to its id).
  const openDoc = (which: DocKind) => {
    if (which !== 'sheet' && !(pcs > 0)) { addToast('Enter "Pieces to make" first — the plan is calculated from it', 'error'); return; }
    if (which === 'raise' && !saved) { addToast('Save the costing first — the POs link back to it', 'error'); return; }
    if (!check()) return;
    setDoc(which);
  };

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
      // Phone photos are 3-8 MB; resized + re-encoded BEFORE upload (~200 KB)
      // with a 112 px thumb for the list (costingThumbs.ts).
      const url = await uploadProductPhoto(p.id, file);
      patch({ image_url: url });
      addToast('Photo uploaded — remember to Save', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setUploading(false);
  };

  const patchComp = (i: number, next: CostingComponent) => setP(prev => ({ ...prev, components: prev.components.map((c, j) => (j === i ? next : c)) }));
  const addComp = () => setP(prev => ({ ...prev, components: [...prev.components, blankComponent()] }));
  const removeComp = (i: number) => setP(prev => ({ ...prev, components: prev.components.filter((_, j) => j !== i) }));

  return {
    p, patch, errors, errVersion, errorComps, saving, uploading, pieces, setPieces, pcs, total, masterPrice,
    doc, closeDoc: () => setDoc(null), save, openDoc, deleteCosting, uploadImage, patchComp, addComp, removeComp,
  };
}
