// The product's facts, editable. A field staff change joins `locked`, so the AI
// reader never overwrites it. Filling the missing cost / category of a
// "Needs info" product makes it Ready and sends it to the matching websites —
// once its required tags are there too: after the save the database re-applies
// the gate (refreshGate → pb_products_refresh), which decides Ready / Needs info.
// V2: a glass tile (the page places it with `className`); Save is the page's
// gradient only when `primary` (no listing is waiting for approval) AND there
// is something to save. On phone the edited tile's Discard / Save ride in a
// sticky bar above the tab bar and the keyboard (mobile.md §5). Edited facts
// register as dirty (useDirty), so Back and the nav ask before leaving.
// The page reloads the product whenever a tag is chosen, a photo is added or
// the AI reads it again: what is typed here stays (carry), the other fields
// follow the fresh product, and our own save lines the whole form up again.
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
import ProductValues from './ProductValues';
import { refreshGate } from '../../data/tags';
import { missingAll, missingDetails } from '../../seoTypes';
import { photoCount } from './detail/needs';
import { numKey, splitList } from './status';

type Form = { name: string; sku: string; vendor_id: string; category: string; fabric: string; color: string; sizes: string; cost_price: string; raw_text: string };
// Fields the website rules, the price or the Shopify product depend on (keywords look at name / sku / details;
// the colour is in the written text; the sizes and the SKU are the choices and codes on Shopify).
const ROUTE_KEYS: string[] = ['cost_price', 'category', 'fabric', 'color', 'sizes', 'vendor_id', 'name', 'sku', 'raw_text'];
const toForm = (p: ProductDetail): Form => ({
  name: p.name ?? '', sku: p.sku ?? '', vendor_id: p.vendor_id ?? '', category: p.category ?? '', fabric: p.fabric ?? '',
  color: p.color ?? '', sizes: p.sizes.join(', '), cost_price: p.cost_price == null ? '' : String(p.cost_price), raw_text: p.raw_text ?? '',
});
/** The form after a reload: fields the user edited keep what was typed, the rest take the fresh value. */
const carry = (typed: Form, was: Form, now: Form): Form =>
  Object.fromEntries((Object.keys(now) as (keyof Form)[]).map(k => [k, typed[k].trim() !== was[k].trim() ? typed[k] : now[k]])) as Form;

export default function ProductFacts({ product, vendors, categories, onVendorCreated, onSaved, addToast, className, primary = true }: {
  product: ProductDetail; vendors: VendorLite[]; categories: string[]; onVendorCreated: (v: VendorLite) => void;
  onSaved: () => void; addToast: AddToast; className?: string; primary?: boolean;
}) {
  const [f, setF] = useState<Form>(() => toForm(product));
  const [base, setBase] = useState(product); // the product `f` is lined up with
  const [resync, setResync] = useState(false); // our own save went through: take the reloaded product whole
  if (base !== product) {
    setBase(product);
    setResync(false);
    setF(resync ? toForm(product) : carry(f, toForm(base), toForm(product)));
  }
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const phone = useIsPhone();
  const orig = toForm(product);
  const changed = (Object.keys(f) as (keyof Form)[]).filter(k => f[k].trim() !== orig[k].trim());
  const set = (k: keyof Form) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const reading = product.status === 'reading'; // the AI reader would overwrite what is typed now
  const photos = photoCount(product);
  // Needs info although nothing necessary is missing here (e.g. the AI reader gave up): saving lets the gate make it Ready.
  const promote = product.status === 'needs_info' && !missingDetails(product, photos).length;
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
    const lacks = missingDetails({ ...product, ...patch }, photos);
    let lostInfo = product.status === 'ready' && lacks.length > 0;
    if (lostInfo) patch.status = 'needs_info';
    const kept = product.pb_listings.filter(l => l.status === 'published' && l.locked.includes('price')).length;
    setSaving(true); setErr('');
    try {
      if (changed.length || lostInfo) await updateProduct(product, patch, changed);
      // The gate (price, category, fabric, colour, a photo AND a value for every attribute of the category) decides the status.
      const g = await refreshGate(product.id);
      // The status this save found, not the page's copy: a page opened as New can be Ready (and listed) by now.
      const was = lostInfo ? 'ready' : g?.was ?? product.status;
      const nowReady = was === 'needs_info' && g?.status === 'ready';
      lostInfo = lostInfo || (was === 'ready' && g?.status === 'needs_info');
      // A ready product whose routing / price inputs changed is checked against the websites again.
      const reroute = was === 'ready' && !lostInfo && changed.some(k => ROUTE_KEYS.includes(k));
      const costChanged = was === 'ready' && changed.includes('cost_price') && !lostInfo;
      const miss = missingAll(lacks, g?.missing);
      const still = (lostInfo || g?.status === 'needs_info') && miss.length ? ` — still needs ${miss.join(', ')}` : '';
      if ((nowReady || reroute) && !lostInfo) {
        try {
          // New sizes or a new SKU: the server sends listings already on Shopify again, so the choices and codes there follow.
          const r = await pbCall<{ warning?: string; repriced?: number; resent?: number }>('route_product', { product_id: product.id });
          const done = nowReady ? 'Saved — sent to the matching websites'
            : `Saved — websites checked again${r.repriced ? ` (${r.repriced} published listing${r.repriced > 1 ? 's' : ''} re-priced and sent to Shopify)` : ''}${r.resent ? ` (${r.resent} published listing${r.resent > 1 ? 's' : ''} sent to Shopify again)` : ''}`
              + (costChanged && kept ? `. ${kept} listing${kept > 1 ? 's have' : ' has'} a price typed by hand and keep${kept > 1 ? '' : 's'} it` : '');
          if (r.warning) addToast(`${done}, but: ${r.warning}`, 'error'); else addToast(done, 'success');
        } catch (e2) { addToast(`Saved, but checking the websites failed: ${friendlyError(e2)}`, 'error'); }
      } else addToast(lostInfo ? `Saved — back to Needs info${still || ': a necessary detail is missing'}` : `Saved${still}`, still ? 'info' : 'success');
      setResync(true);
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
      {/* Its own saves (product_values_set): the values are not part of the facts patch above. */}
      <ProductValues product={product} addToast={addToast} onSaved={onSaved} />
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
