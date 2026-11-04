// The product's facts, editable. A field staff change joins `locked`, so the AI
// reader never overwrites it. Filling the missing cost / category of a
// "Needs info" product makes it Ready and sends it to the matching websites.
import { useState, type FormEvent } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbProduct } from '../../types';
import { pbCall } from '../../data/pbFunctions';
import { updateProduct, type ProductDetail, type VendorLite } from '../../data/products';
import VendorSelect from './VendorSelect';
import { numKey, splitList } from './status';

type Form = { name: string; sku: string; vendor_id: string; category: string; fabric: string; color: string; sizes: string; cost_price: string; raw_text: string };
// Fields the website rules or the price depend on (keywords look at name / sku / details).
const ROUTE_KEYS: string[] = ['cost_price', 'category', 'fabric', 'vendor_id', 'name', 'sku', 'raw_text'];
const toForm = (p: ProductDetail): Form => ({
  name: p.name ?? '', sku: p.sku ?? '', vendor_id: p.vendor_id ?? '', category: p.category ?? '', fabric: p.fabric ?? '',
  color: p.color ?? '', sizes: p.sizes.join(', '), cost_price: p.cost_price == null ? '' : String(p.cost_price), raw_text: p.raw_text ?? '',
});

export default function ProductFacts({ product, vendors, categories, onVendorCreated, onSaved, addToast }: {
  product: ProductDetail; vendors: VendorLite[]; categories: string[]; onVendorCreated: (v: VendorLite) => void;
  onSaved: () => void; addToast: AddToast;
}) {
  const [f, setF] = useState<Form>(() => toForm(product));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const orig = toForm(product);
  const changed = (Object.keys(f) as (keyof Form)[]).filter(k => f[k].trim() !== orig[k].trim());
  const set = (k: keyof Form) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const reading = product.status === 'reading'; // the AI reader would overwrite what is typed now
  // Needs info although cost and category are filled (e.g. the AI reader gave up): saving makes it Ready.
  const promote = product.status === 'needs_info' && product.cost_price != null && !!product.category;
  const off = saving || (!changed.length && !promote) || reading;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (off) return;
    const cost = f.cost_price.trim() === '' ? null : Number(f.cost_price);
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) { setErr('Cost price must be a number, 0 or more'); return; }
    const patch: Partial<PbProduct> = {};
    for (const k of changed) {
      if (k === 'cost_price') patch.cost_price = cost;
      else if (k === 'sizes') patch.sizes = splitList(f.sizes);
      else patch[k] = f[k].trim() || null;
    }
    // A cleared field is in `patch` as null — it must count as missing, not as "unchanged".
    const cost2 = 'cost_price' in patch ? patch.cost_price : product.cost_price;
    const cat2 = 'category' in patch ? patch.category : product.category;
    const complete = cost2 != null && !!cat2;
    const nowReady = product.status === 'needs_info' && complete;
    const lostInfo = product.status === 'ready' && !complete;
    if (nowReady) patch.status = 'ready';
    if (lostInfo) patch.status = 'needs_info';
    // A ready product whose routing / price inputs changed is checked against the websites again.
    const reroute = product.status === 'ready' && !lostInfo && changed.some(k => ROUTE_KEYS.includes(k));
    const costChanged = product.status === 'ready' && changed.includes('cost_price') && !lostInfo;
    const kept = product.pb_listings.filter(l => l.status === 'published' && l.locked.includes('price')).length;
    setSaving(true); setErr('');
    try {
      await updateProduct(product, patch, changed);
      if (nowReady || reroute) {
        try {
          const r = await pbCall<{ warning?: string; repriced?: number }>('route_product', { product_id: product.id });
          const done = nowReady ? 'Saved — sent to the matching websites'
            : `Saved — websites checked again${r.repriced ? ` (${r.repriced} published listing${r.repriced > 1 ? 's' : ''} re-priced and sent to Shopify)` : ''}`
              + (costChanged && kept ? `. ${kept} listing${kept > 1 ? 's have' : ' has'} a price typed by hand and keep${kept > 1 ? '' : 's'} it` : '');
          if (r.warning) addToast(`${done}, but: ${r.warning}`, 'error'); else addToast(done, 'success');
        } catch (e2) { addToast(`Saved, but checking the websites failed: ${friendlyError(e2)}`, 'error'); }
      } else addToast(lostInfo ? 'Saved — cost price or category is now missing, so it is back to Needs info' : 'Saved', 'success');
      onSaved();
    } catch (e2) { setErr(friendlyError(e2)); } finally { setSaving(false); }
  };

  const lock = (k: string) => product.locked.includes(k) &&
    <span title="Kept as typed — the AI will not change it" style={{ ...S.badge, marginLeft: 6, background: T.glass2, color: T.tx3, letterSpacing: 0, textTransform: 'none' }}>kept</span>;
  const input = (k: keyof Form, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <label htmlFor={`pb-f-${k}`} style={S.fLabel}>{label}{lock(k)}</label>
      <input id={`pb-f-${k}`} value={f[k]} onChange={e => set(k)(e.target.value)} style={{ ...S.fInput, minHeight: 44 }} {...extra} />
    </div>
  );
  const cats = f.category && !categories.includes(f.category) ? [f.category, ...categories] : categories;

  return (
    <form onSubmit={save} style={S.card}>
      <div style={{ ...S.sectionTitle, marginBottom: 12 }}>Facts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
        {input('name', 'Name', { maxLength: 200 })}
        {input('sku', 'SKU', { maxLength: 80 })}
        <div>
          <label htmlFor="pb-f-vendor" style={S.fLabel}>Vendor</label>
          <VendorSelect id="pb-f-vendor" value={f.vendor_id} vendors={vendors} onChange={set('vendor_id')} onCreated={onVendorCreated} />
        </div>
        {input('cost_price', 'Cost price (₹)', { type: 'number', inputMode: 'decimal', min: 0, step: '0.01', onKeyDown: numKey })}
        <div>
          <label htmlFor="pb-f-category" style={S.fLabel}>Category{lock('category')}</label>
          <select id="pb-f-category" value={f.category} onChange={e => set('category')(e.target.value)} style={{ ...S.fInput, minHeight: 44 }}>
            <option value="">— Not set —</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {input('fabric', 'Fabric', { maxLength: 120 })}
        {input('color', 'Colour', { maxLength: 120 })}
        {input('sizes', 'Sizes (comma list)', { placeholder: 'S, M, L' })}
      </div>
      <div style={{ marginTop: 10 }}>
        <label htmlFor="pb-f-raw" style={S.fLabel}>Details (vendor's post){lock('raw_text')}</label>
        <textarea id="pb-f-raw" value={f.raw_text} onChange={e => set('raw_text')(e.target.value)} rows={4} maxLength={8000}
          style={{ ...S.fInput, height: 'auto', minHeight: 90, resize: 'vertical', lineHeight: 1.5 }} />
      </div>
      {err && <div style={{ ...S.errorBox, marginTop: 10 }}>{err}</div>}
      {reading && <div style={{ fontSize: 11, color: T.tx3, marginTop: 10 }}>The AI is reading this product — wait a moment, then reload to edit.</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {changed.length > 0 && <button type="button" onClick={() => { setF(orig); setErr(''); }} style={{ ...S.btnGhost, minHeight: 44 }}>Undo changes</button>}
        <button type="submit" disabled={off}
          style={{ ...S.btnPrimary, minHeight: 44, opacity: off ? 0.5 : 1, pointerEvents: off ? 'none' : 'auto' }}>
          {saving ? 'Saving…' : !changed.length && promote ? 'Mark ready' : 'Save facts'}
        </button>
      </div>
    </form>
  );
}
