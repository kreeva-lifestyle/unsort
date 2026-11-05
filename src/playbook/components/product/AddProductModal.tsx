// "Add product": photos, vendor (pick or new), cost price, SKU, details (paste the
// vendor's post), optional category and sizes → saved as `new`; the AI reader takes it from there.
import { useRef, useState, type FormEvent } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import { createProduct, type VendorLite } from '../../data/products';
import PbModal from './PbModal';
import PhotoPicker from './PhotoPicker';
import VendorSelect from './VendorSelect';
import { numKey, splitList } from './status';

const BLANK = { vendorId: '', cost: '', sku: '', details: '', category: '', sizes: '' };

export default function AddProductModal({ open, onClose, onSaved, vendors, onVendorCreated, categories, addToast }: {
  open: boolean; onClose: () => void; onSaved: (id: string) => void; vendors: VendorLite[];
  onVendorCreated: (v: VendorLite) => void; categories: string[]; addToast: AddToast;
}) {
  const [f, setF] = useState(BLANK);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  // One id per form: a retry after a half-finished save completes that product instead of adding a second one.
  const pid = useRef(crypto.randomUUID());
  const set = (p: Partial<typeof BLANK>) => setF(x => ({ ...x, ...p }));
  const reset = () => { setF(BLANK); setFiles([]); setErr(''); pid.current = crypto.randomUUID(); };

  const close = () => { if (saving) return; reset(); onClose(); };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const cost = f.cost.trim() === '' ? null : Number(f.cost);
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) { setErr('Cost price must be a number, 0 or more'); return; }
    if (!files.length && !f.details.trim() && !f.sku.trim()) { setErr('Add at least a photo, the details text or a SKU'); return; }
    setSaving(true); setErr('');
    try {
      const { id, photoError, releaseError } = await createProduct(pid.current, {
        vendor_id: f.vendorId || null, cost_price: cost, sku: f.sku.trim(), raw_text: f.details.trim(),
        category: f.category, sizes: splitList(f.sizes),
      }, files);
      if (photoError) addToast(`Product saved, but the photos did not upload: ${friendlyError(photoError)}`, 'error');
      else if (releaseError) addToast(`Product saved, but it was not handed to the AI: ${friendlyError(releaseError)} — tap "Read again with AI"`, 'error');
      else addToast('Product added — the AI will read it within a minute', 'success');
      reset(); setSaving(false);
      onSaved(id);
    } catch (e2) { setErr(friendlyError(e2)); setSaving(false); }
  };

  const field = { marginBottom: 12 };
  const tall = { ...S.fInput, minHeight: 44 };
  return (
    <PbModal open={open} title="Add product" onClose={close} width={560}>
      <form onSubmit={submit}>
        <div style={field}>
          <span style={S.fLabel}>Photos</span>
          <PhotoPicker files={files} onChange={setFiles} onError={setErr} />
        </div>
        <div style={field}>
          <label htmlFor="pb-add-vendor" style={S.fLabel}>Vendor</label>
          <VendorSelect id="pb-add-vendor" value={f.vendorId} vendors={vendors} onChange={v => set({ vendorId: v })} onCreated={onVendorCreated} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, ...field }}>
          <div>
            <label htmlFor="pb-add-cost" style={S.fLabel}>Cost price (₹)</label>
            <input id="pb-add-cost" type="number" inputMode="decimal" min={0} step="0.01" value={f.cost} onKeyDown={numKey}
              onChange={e => set({ cost: e.target.value })} placeholder="Vendor's price" style={tall} />
          </div>
          <div>
            <label htmlFor="pb-add-sku" style={S.fLabel}>SKU</label>
            <input id="pb-add-sku" value={f.sku} onChange={e => set({ sku: e.target.value })} maxLength={80} placeholder="Optional" style={tall} />
          </div>
        </div>
        <div style={field}>
          <label htmlFor="pb-add-details" style={S.fLabel}>Details</label>
          <textarea id="pb-add-details" value={f.details} onChange={e => set({ details: e.target.value })} rows={5} maxLength={8000}
            placeholder="Paste the vendor's post: fabric, colour, sizes, work, price…" style={{ ...S.fInput, height: 'auto', minHeight: 110, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, ...field }}>
          <div>
            <label htmlFor="pb-add-cat" style={S.fLabel}>Category</label>
            <select id="pb-add-cat" value={f.category} onChange={e => set({ category: e.target.value })} style={tall}>
              <option value="">Let the AI decide</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pb-add-sizes" style={S.fLabel}>Sizes</label>
            <input id="pb-add-sizes" value={f.sizes} onChange={e => set({ sizes: e.target.value })} placeholder="S, M, L, XL" style={tall} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
          Anything you leave empty is read from the photos and details by the AI. What you type here is kept as you wrote it.
        </div>
        {err && <div style={{ ...S.errorBox, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={close} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
            {saving ? (files.length ? 'Uploading…' : 'Saving…') : 'Add product'}
          </button>
        </div>
      </form>
    </PbModal>
  );
}
