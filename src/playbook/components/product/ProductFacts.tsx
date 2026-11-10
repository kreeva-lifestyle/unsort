// The product's facts, editable. A field staff change joins `locked`, so the AI
// reader never overwrites it. Filling the missing cost / category of a
// "Needs info" product makes it Ready and sends it to the matching websites.
// V2: a glass tile (the page places it with `className`); Save is the page's
// gradient only when `primary` (no listing is waiting for approval) AND there
// is something to save. On phone the edited tile's Discard / Save ride in a
// sticky bar above the tab bar and the keyboard (mobile.md §5). Edited facts
// register as dirty (useDirty), so Back and the nav ask before leaving.
import { useState, type FormEvent } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbProduct } from '../../types';
import { pbCall } from '../../data/pbFunctions';
import { updateProduct, type ProductDetail, type VendorLite } from '../../data/products';
import { pbErrorBox, pbInput, pbLabel, pbMeta, pbNum, pbTextarea, pbTile, pbTileTitle } from '../../pbTheme';
import { useDirty } from '../../hooks/useDirty';
import { useIsPhone } from '../../hooks/useIsPhone';
import SaveBar from '../website/shell/SaveBar';
import GrowArea from './detail/GrowArea';
import PbButton from '../ui/PbButton';
import { KeptTag } from './detail/ListingField';
import { LessLine } from './detail/TelegramBits';
import { SellPriceLine } from './detail/SellPriceLine';
import VendorSelect from './VendorSelect';
import ProductTags from './ProductTags';
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
  const phone = useIsPhone();
  const orig = toForm(product);
  const changed = (Object.keys(f) as (keyof Form)[]).filter(k => f[k].trim() !== orig[k].trim());
  const set = (k: keyof Form) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const reading = product.status === 'reading'; // the AI reader would overwrite what is typed now
  // A product imported from a website sells at its copied price, so it needs no cost to be Ready.
  const priced = (cost: number | null) => cost != null || product.sell_price != null;
  // Needs info although price and category are filled (e.g. the AI reader gave up): saving makes it Ready.
  const promote = product.status === 'needs_info' && priced(product.cost_price) && !!product.category;
  const off = saving || (!changed.length && !promote) || reading;
  useDirty(changed.length > 0 && !saving, 'Discard changes to this product?');

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
    const complete = priced(cost2 ?? null) && !!cat2;
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

  const lessFirst = Number(product.less_amount) > 0;
  const sells = product.sell_price != null;
  const costInput = (
    <div style={{ minWidth: 0 }}>
      {input('cost_price', sells ? 'Cost price (₹) — optional' : 'Cost price (₹)', { type: 'number', inputMode: 'decimal', min: 0, step: '0.01', onKeyDown: numKey, 'aria-describedby': sells ? 'pb-f-cost-hint' : undefined }, true)}
      {sells && <span id="pb-f-cost-hint" style={{ ...pbMeta, display: 'block', marginTop: 4 }}>Not needed to publish: the selling price below is used.</span>}
    </div>
  );
  return (
    <form onSubmit={save} className={className} aria-labelledby="pb-facts-title"
      style={{ ...pbTile, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="pb-facts-title" style={pbTileTitle}>Facts</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          {label('name', 'Name')}
          {/* Grows to a second line for a long name (mobile.md §8); Enter still saves. */}
          <GrowArea id="pb-f-name" single value={f.name} onChange={set('name')} maxLength={200} autoCapitalize="sentences" className="pb-input" style={pbTextarea} />
        </div>
        {input('sku', 'SKU', { maxLength: 80, autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false }, true)}
        <div style={{ minWidth: 0 }}>
          {label('vendor_id', 'Vendor', 'pb-f-vendor')}
          <VendorSelect id="pb-f-vendor" value={f.vendor_id} vendors={vendors} onChange={set('vendor_id')} onCreated={onVendorCreated} />
        </div>
        {!lessFirst && costInput}
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
        {/* With a Telegram "Less", the cost sits last so its Rate − Less = Cost line is right under it. */}
        {lessFirst && <>{costInput}<div style={{ gridColumn: '1 / -1', minWidth: 0 }}><LessLine p={product} /></div></>}
        {sells && <div style={{ gridColumn: '1 / -1', minWidth: 0 }}><SellPriceLine p={product} /></div>}
      </div>
      <div style={{ minWidth: 0 }}>
        {label('raw_text', 'Details (vendor’s post)', 'pb-f-raw')}
        <GrowArea id="pb-f-raw" value={f.raw_text} onChange={set('raw_text')} rows={4} maxLength={8000} autoCapitalize="sentences" className="pb-input" style={pbTextarea} />
      </div>
      {/* Its own Save (set_product_tags): the tags are not part of the facts patch above; unsaved chips survive Save facts. */}
      <ProductTags product={product} addToast={addToast} onSaved={onSaved} />
      {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      {reading && <div style={pbMeta}>The AI is reading this product — wait a moment, then reload to edit.</div>}
      {phone && changed.length > 0 ? (
        <SaveBar dirty={!saving} saving={saving} err="" primary={primary} saveLabel="Save facts" style={{ marginTop: 0 }}
          onDiscard={() => { setF(orig); setErr(''); }} onSave={() => void save()} />
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {!changed.length && !promote && !reading && !saving && <span style={pbMeta}>No changes to save</span>}
          {changed.length > 0 && <PbButton dim={saving} onClick={() => { setF(orig); setErr(''); }}>Discard changes</PbButton>}
          {/* Gradient only when there is something to save: a greyed-out gradient reads as broken. */}
          <PbButton type="submit" kind={primary && (changed.length > 0 || promote) ? 'primary' : 'secondary'} disabled={off && !saving} busy={saving} busyLabel="Saving…"
            style={{ minWidth: 140, ...(off && !saving ? { pointerEvents: 'none' } : null) }}>
            {!changed.length && promote ? 'Mark ready' : 'Save facts'}
          </PbButton>
        </div>
      )}
    </form>
  );
}
