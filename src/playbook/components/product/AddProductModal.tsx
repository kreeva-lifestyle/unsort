// "Add product": photos, vendor (pick or new), cost price, SKU, details (paste the
// vendor's post), optional category and sizes → saved as `new`; the AI reader takes it from there.
// V2 (mobile.md §6): PbModal sheet on phone / centred modal on desktop; the
// footer (PbModal `footer`, outside the scrolling body) holds the one gradient
// button (full width on phone; Cancel beside it on desktop, the × on phone).
// A filled form is guarded: a scrim tap or swipe-down does not wipe it.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import { createProduct, type VendorLite } from '../../data/products';
import { PB, pbErrorBox, pbInput, pbLabel, pbMeta, pbNum, pbTextarea } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbButton from '../ui/PbButton';
import PbModal from './PbModal';
import PhotoPicker from './PhotoPicker';
import VendorSelect from './VendorSelect';
import { numKey, splitList } from './status';

const BLANK = { vendorId: '', cost: '', sku: '', details: '', category: '', sizes: '' };

/** Two fields side by side while each stays `min` wide; otherwise stacked. */
const Pair = ({ children, min = 140 }: { children: ReactNode; min?: number }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>
);

export default function AddProductModal({ open, onClose, onSaved, vendors, onVendorCreated, categories, addToast }: {
  open: boolean; onClose: () => void; onSaved: (id: string) => void; vendors: VendorLite[];
  onVendorCreated: (v: VendorLite) => void; categories: string[]; addToast: AddToast;
}) {
  const [f, setF] = useState(BLANK);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const phone = useIsPhone();
  // One id per form: a retry after a half-finished save completes that product instead of adding a second one.
  const pid = useRef(crypto.randomUUID());
  // On a phone the message sits low in the sheet: bring it into view when it appears.
  const errBox = useRef<HTMLDivElement>(null);
  useEffect(() => { if (err) errBox.current?.scrollIntoView({ block: 'nearest' }); }, [err]);
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

  const col = { display: 'flex', flexDirection: 'column' as const, minWidth: 0 };
  return (
    <PbModal open={open} title="Add product" onClose={close} guard={files.length > 0 || Object.values(f).some(Boolean)}
      footer={
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {!phone && <PbButton onClick={close} dim={saving}>Cancel</PbButton>}
          <PbButton kind="primary" type="submit" form="pb-add-form" block={phone} busy={saving} busyLabel={files.length ? 'Uploading…' : 'Saving…'}>Add product</PbButton>
        </div>
      }>
      <form id="pb-add-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={col}>
          <span style={pbLabel}>Photos</span>
          <PhotoPicker files={files} onChange={setFiles} onError={setErr} />
        </div>
        <div style={col}>
          <label htmlFor="pb-add-vendor" style={pbLabel}>Vendor</label>
          <VendorSelect id="pb-add-vendor" value={f.vendorId} vendors={vendors} onChange={v => set({ vendorId: v })} onCreated={onVendorCreated} />
        </div>
        <Pair>
          <div style={col}>
            <label htmlFor="pb-add-cost" style={pbLabel}>Cost price (₹)</label>
            <div style={{ position: 'relative' }}>
              <span aria-hidden="true" style={{ ...pbNum, position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: PB.tx2, fontSize: 'var(--pb-input-fs)', pointerEvents: 'none' }}>₹</span>
              <input id="pb-add-cost" type="number" inputMode="decimal" min={0} step="0.01" value={f.cost} onKeyDown={numKey} enterKeyHint="next"
                onChange={e => set({ cost: e.target.value })} placeholder="e.g. 1200" className="pb-input" style={{ ...pbInput, ...pbNum, paddingLeft: 32 }} />
            </div>
          </div>
          <div style={col}>
            <label htmlFor="pb-add-sku" style={pbLabel}>SKU</label>
            <input id="pb-add-sku" value={f.sku} onChange={e => set({ sku: e.target.value })} maxLength={80} placeholder="e.g. SB-1000" enterKeyHint="next" aria-describedby="pb-add-sku-hint"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="pb-input" style={{ ...pbInput, ...pbNum }} />
            <span id="pb-add-sku-hint" style={{ ...pbMeta, marginTop: 4 }}>Optional</span>
          </div>
        </Pair>
        <div style={col}>
          <label htmlFor="pb-add-details" style={pbLabel}>Details</label>
          <textarea id="pb-add-details" value={f.details} onChange={e => set({ details: e.target.value })} rows={5} maxLength={8000} autoCapitalize="sentences"
            placeholder="Paste the vendor's post: fabric, colour, sizes, work, price…" className="pb-input" style={{ ...pbTextarea, minHeight: 120 }} />
        </div>
        <Pair min={200}>
          <div style={col}>
            <label htmlFor="pb-add-cat" style={pbLabel}>Category</label>
            <select id="pb-add-cat" value={f.category} onChange={e => set({ category: e.target.value })} className="pb-input" style={pbInput}>
              <option value="">Let the AI decide</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={col}>
            <label htmlFor="pb-add-sizes" style={pbLabel}>Sizes</label>
            <input id="pb-add-sizes" value={f.sizes} onChange={e => set({ sizes: e.target.value })} placeholder="S, M, L, XL" enterKeyHint="done"
              autoCapitalize="characters" autoCorrect="off" className="pb-input" style={pbInput} />
          </div>
        </Pair>
        <div style={pbMeta}>
          Anything you leave empty is read from the photos and details by the AI. What you type here is kept as you wrote it.
        </div>
        {err && <div ref={errBox} role="alert" style={pbErrorBox}>{err}</div>}
      </form>
    </PbModal>
  );
}
