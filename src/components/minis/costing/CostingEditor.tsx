// One costing sheet: SKU + photo + main components + totals card, mirroring
// the owner's reference screenshot. Everything is editable; the compulsory
// fields (main/sub/supplier/qty/unit/rate) are enforced at SAVE, with the
// problems listed — a half-filled sheet is never silently stored.
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import {
  CostingProduct, CostingLibrary, blankComponent, sheetCost, totalCost, money, validateSheet, num,
} from './costingModel';
import ComponentCard from './ComponentCard';
import { optimizeImage } from './imageResize';
import PrintPreview from './PrintPreview';
import { purchasePlanHtml } from './purchasePlan';
import { costingSheetHtml } from './costingSheet';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';

export default function CostingEditor({ product, saved, library, onSaved, onBack, addToast }: {
  product: CostingProduct;
  saved: boolean;
  library: CostingLibrary;
  onSaved: (p: CostingProduct) => void;
  onBack: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [p, setP] = useState<CostingProduct>(product);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Owner's flow: pieces to make -> totals and purchase plan use the same number.
  const [pieces, setPieces] = useState('');
  const { ask, modalProps } = useConfirm();

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
      const { error } = await supabase.storage.from('costing-images').upload(path, blob, { contentType: type, upsert: true });
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
    const errs = validateSheet(p.sku, p.components);
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        id: p.id, sku: p.sku.trim().toUpperCase(), image_url: p.image_url,
        maintenance_pct: num(p.maintenance_pct), components: p.components,
        notes: p.notes, created_by: user?.id, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('costing_products').upsert(row);
      // Same SKU on another sheet: the unique index refuses it (this is what
      // makes Duplicate safe) - say so in plain words, not a DB error.
      if (error) throw (error.code === '23505'
        ? new Error(`A product costing for ${row.sku} already exists - change the SKU (duplicates must get a new code)`)
        : error);
      addToast(`${row.sku} saved`, 'success');
      onSaved({ ...p, sku: row.sku });
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const patchComp = (i: number, next: ReturnType<typeof blankComponent>) =>
    setP(prev => ({ ...prev, components: prev.components.map((c, j) => (j === i ? next : c)) }));

  // Both PDFs need a valid sheet; the purchase plan additionally needs pieces.
  const openPdf = (which: 'sheet' | 'plan') => {
    if (which === 'plan' && !(Math.floor(num(pieces)) > 0)) { addToast('Enter "Pieces to make" first — the plan is calculated from it', 'error'); return; }
    const errs = validateSheet(p.sku, p.components);
    if (errs.length) { setErrors(errs); addToast('Fix the highlighted fields first', 'error'); return; }
    setErrors([]);
    (which === 'plan' ? setPlanOpen : setSheetOpen)(true);
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        {/* Photo + SKU strip */}
        <label style={{ width: 92, height: 92, borderRadius: 10, border: `1.5px dashed ${T.bd2}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
          <input type="file" accept="image/*"
            style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
            onChange={e => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
          {p.image_url
            ? <img src={p.image_url} alt={p.sku || 'product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 10, color: T.tx3, textAlign: 'center', lineHeight: 1.4 }}>{uploading ? 'Uploading…' : '+ Add\nimage'}</span>}
        </label>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={S.fLabel}>SKU <span style={{ color: T.re }}>*</span></label>
          <input value={p.sku} onChange={e => setP(prev => ({ ...prev, sku: e.target.value }))}
            placeholder="e.g. DRS210" style={{ ...S.fInput, width: '100%', textTransform: 'uppercase', fontFamily: T.mono }} />
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Tap the square to add or replace the product photo.</div>
        </div>
      </div>

      {/* One datalist each, referenced by every row input below - the
          "auto-saved" names from all sheets, offered as you type. */}
      <datalist id="costing-main-suggest">{library.mains.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="costing-sub-suggest">{library.subs.map(n => <option key={n} value={n} />)}</datalist>

      {p.components.map((c, i) => (
        <ComponentCard key={i} comp={c} library={library}
          onChange={next => patchComp(i, next)}
          onRemove={() => setP(prev => ({ ...prev, components: prev.components.filter((_, j) => j !== i) }))} />
      ))}
      <button onClick={() => setP(prev => ({ ...prev, components: [...prev.components, blankComponent()] }))}
        style={{ ...S.btnPrimary, minHeight: 40 }}>+ Add main component</button>

      {/* Totals card, right-aligned like the reference */}
      <div style={{ maxWidth: 340, marginLeft: 'auto', marginTop: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx2, padding: '4px 0' }}>
          <span>Cost</span><span style={{ fontFamily: T.mono }}>{money(sheetCost(p.components))}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: T.tx2, padding: '4px 0' }}>
          <span>Maintenance (%)</span>
          <input value={p.maintenance_pct} onChange={e => setP(prev => ({ ...prev, maintenance_pct: e.target.value }))}
            onKeyDown={e => numericKeyDown(e)} type="number" inputMode="decimal"
            style={{ ...S.fInput, width: 84, textAlign: 'right' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: T.tx, padding: '6px 0 0', borderTop: `1px solid ${T.bd}`, marginTop: 4 }}>
          <span>Total cost / pc</span><span style={{ fontFamily: T.mono, color: T.ac2 }}>{money(totalCost(p.components, p.maintenance_pct))}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: T.tx2, padding: '8px 0 0', borderTop: `1px solid ${T.bd}`, marginTop: 8 }}>
          <span>Pieces to make</span>
          <input value={pieces} onChange={e => setPieces(e.target.value)} onKeyDown={e => numericKeyDown(e)}
            type="number" min="1" inputMode="numeric" placeholder="e.g. 48"
            style={{ ...S.fInput, width: 84, textAlign: 'right' }} />
        </div>
        {num(pieces) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: T.tx, padding: '6px 0 0' }}>
            <span>Total for {Math.floor(num(pieces))} pcs</span>
            <span style={{ fontFamily: T.mono, color: T.gr }}>{money(totalCost(p.components, p.maintenance_pct) * Math.floor(num(pieces)))}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={S.fLabel}>Notes</label>
        <textarea value={p.notes} onChange={e => setP(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Anything to remember about costing this product — wastage, minimums, vendor terms…"
          rows={3} style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 64, resize: 'vertical', lineHeight: 1.5 }} />
      </div>

      {errors.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 12, lineHeight: 1.7 }}>
          {errors.slice(0, 8).map((e, i) => <div key={i}>• {e}</div>)}
          {errors.length > 8 && <div>…and {errors.length - 8} more</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...S.btnGhost, minHeight: 44 }}>Back</button>
        {saved && <button onClick={deleteCosting} style={{ ...S.btnDanger, minHeight: 44 }}>Delete</button>}
        <button onClick={() => openPdf('sheet')} style={{ ...S.btnGhost, minHeight: 44, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)' }}>Costing PDF</button>
        <button onClick={() => openPdf('plan')} style={{ ...S.btnGhost, minHeight: 44, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)' }}>Purchase plan (PDF)</button>
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
      <ConfirmModal {...modalProps} />
    </div>
  );
}
