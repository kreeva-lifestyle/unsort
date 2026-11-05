// The product's facts, editable. A field staff change joins `locked`, so the AI
// reader never overwrites it. Filling the missing cost / category of a
// "Needs info" product makes it Ready and sends it to the matching websites.
// V2: a glass tile (the page places it with `className`); Save is the page's
// gradient only when `primary` (no listing is waiting for approval).
import { useState, type FormEvent } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbProduct } from '../../types';
import { pbCall } from '../../data/pbFunctions';
import { updateProduct, type ProductDetail, type VendorLite } from '../../data/products';
import { pbErrorBox, pbInput, pbLabel, pbMeta, pbNum, pbTextarea, pbTile, pbTileTitle } from '../../pbTheme';
import PbButton from '../ui/PbButton';
import { KeptTag } from './detail/ListingField';
import VendorSelect from './VendorSelect';
import { numKey, splitList } from './status';

type Form = { name: string; sku: string; vendor_id: string; category: string; fabric: string; color: string; sizes: string; cost_price: string; raw_text: string };
// Fields the website rules or the price depend on (keywords look at name / sku / details).
const ROUTE_KEYS: string[] = ['cost_price', 'category', 'fabric', 'vendor_id', 'name', 'sku', 'raw_text'];
const toForm = (p: ProductDetail): Form => ({
  name: p.name ?? '', sku: p.sku ?? '', vendor_id: p.vendor_id ?? '', category: p.category ?? '', fabric: p.fabric ?? '',
  color: p.color ?? '', sizes: p.sizes.join(', '), cost_price: p.cost_price == null ? '' : String(p.cost_price), raw_text: p.raw_text ?? '',
});

export default function ProductFacts({ product, vendors, categories, onVendorCreated, onSaved, addToast, className, primary = true }: {
  product: ProductDetail; vendors: VendorLite[]; categories: string[]; onVendorCreated: (v: VendorLite) => void;
  onSaved: () => void; addToast: AddToast; className?: string; primary?: boolean;
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

  const label = (k: string, text: string, htmlFor = `pb-f-${k}`) => (
    <label htmlFor={htmlFor} style={{ ...pbLabel, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {text}{product.locked.includes(k) && <KeptTag hint="You changed this. The AI will not overwrite it." />}
    </label>
  );
  const input = (k: keyof Form, text: string, extra: Record<string, unknown> = {}, mono = false) => (
    <div style={{ minWidth: 0 }}>
      {label(k, text)}
      <input id={`pb-f-${k}`} value={f[k]} onChange={e => set(k)(e.target.value)} className="pb-input" style={{ ...pbInput, ...(mono ? pbNum : null) }} {...extra} />
    </div>
  );
  const cats = f.category && !categories.includes(f.category) ? [f.category, ...categories] : categories;

  return (
    <form onSubmit={save} className={className} aria-labelledby="pb-facts-title"
      style={{ ...pbTile, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="pb-facts-title" style={pbTileTitle}>Facts</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 }}>
        {input('name', 'Name', { maxLength: 200, autoCapitalize: 'sentences' })}
        {input('sku', 'SKU', { maxLength: 80, autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false }, true)}
        <div style={{ minWidth: 0 }}>
          {label('vendor_id', 'Vendor', 'pb-f-vendor')}
          <VendorSelect id="pb-f-vendor" value={f.vendor_id} vendors={vendors} onChange={set('vendor_id')} onCreated={onVendorCreated} />
        </div>
        {input('cost_price', 'Cost price (₹)', { type: 'number', inputMode: 'decimal', min: 0, step: '0.01', onKeyDown: numKey }, true)}
        <div style={{ minWidth: 0 }}>
          {label('category', 'Category')}
          <select id="pb-f-category" value={f.category} onChange={e => set('category')(e.target.value)} className="pb-input" style={pbInput}>
            <option value="">— Not set —</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {input('fabric', 'Fabric', { maxLength: 120 })}
        {input('color', 'Colour', { maxLength: 120 })}
        {input('sizes', 'Sizes (comma list)', { placeholder: 'e.g. S, M, L' })}
      </div>
      <div style={{ minWidth: 0 }}>
        {label('raw_text', 'Details (vendor’s post)', 'pb-f-raw')}
        <textarea id="pb-f-raw" value={f.raw_text} onChange={e => set('raw_text')(e.target.value)} rows={4} maxLength={8000} className="pb-input"
          style={{ ...pbTextarea, height: 'auto', minHeight: 112 }} />
      </div>
      {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      {reading && <div style={pbMeta}>The AI is reading this product — wait a moment, then reload to edit.</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {changed.length > 0 && <PbButton dim={saving} onClick={() => { setF(orig); setErr(''); }}>Discard changes</PbButton>}
        <PbButton type="submit" kind={primary ? 'primary' : 'secondary'} disabled={off && !saving} busy={saving} busyLabel="Saving…"
          style={{ minWidth: 140, ...(off && !saving ? { pointerEvents: 'none' } : null) }}>
          {!changed.length && promote ? 'Mark ready' : 'Save facts'}
        </PbButton>
      </div>
    </form>
  );
}
