// One product on one website: edit title / description / SEO / handle / tags /
// price (each edit joins listing.locked so Regenerate keeps it), plus the
// actions in ListingActions (Regenerate, Approve, Publish / Update, Remove).
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import { shopifyAdminUrl } from '../../data/pbFunctions';
import type { WebsiteLite } from '../../data/products';
import { listingBusy, updateListing, type ListingFull } from '../../data/listings';
import { compareAtPrice } from '../../data/websites';
import PbModal from './PbModal';
import ListingActions from './ListingActions';
import { Dot, LISTING_STATUS, numKey, rupees, shortDate, splitList } from './status';
import { cleanDescriptionHtml } from './cleanHtml';

type Form = { title: string; description_html: string; seo_title: string; seo_description: string; handle: string; tags: string; price: string };
const toForm = (l: ListingFull): Form => ({
  title: l.title ?? '', description_html: l.description_html ?? '', seo_title: l.seo_title ?? '', seo_description: l.seo_description ?? '',
  handle: l.handle ?? '', tags: l.tags.join(', '), price: l.price == null ? '' : String(l.price),
});

export default function ListingEditor({ listing, site, onClose, onChanged, addToast }: {
  listing: ListingFull; site: WebsiteLite | undefined; onClose: () => void; onChanged: () => void; addToast: AddToast;
}) {
  const [l, setL] = useState(listing);
  const [f, setF] = useState<Form>(() => toForm(listing));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const orig = toForm(l);
  const changed = (Object.keys(f) as (keyof Form)[]).filter(k => f[k].trim() !== orig[k].trim());
  const set = (k: keyof Form) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const locked = listingBusy(l); // a run holds it: edits would be overwritten or published stale
  const reset = (next: ListingFull) => { setL(next); setF(toForm(next)); };

  /** Save edits (if any). Returns false when they could not be saved. */
  const save = async (): Promise<boolean> => {
    if (!changed.length) return true;
    if (locked) { setErr('This listing is being written or published right now — reload it in a minute, then edit.'); return false; }
    const price = f.price.trim() === '' ? null : Number(f.price);
    if (price != null && (!Number.isFinite(price) || price < 0)) { setErr('Price must be a number, 0 or more'); return false; }
    const handle = f.handle.trim().toLowerCase();
    if (handle && !/^[a-z0-9-]{1,80}$/.test(handle)) { setErr('Handle: only a–z, 0–9 and "-", up to 80 characters'); return false; }
    const patch: Partial<ListingFull> = {};
    for (const k of changed) {
      if (k === 'price') { // compare-at follows the typed price, as the server works it out
        patch.price = price;
        patch.compare_at_price = price != null && site?.pricing ? compareAtPrice(price, site.pricing) : null;
      }
      else if (k === 'tags') patch.tags = splitList(f.tags).map(t => t.slice(0, 255));
      else if (k === 'handle') patch.handle = handle || null;
      else if (k === 'description_html') patch.description_html = cleanDescriptionHtml(f.description_html) || null;
      else patch[k] = f[k].trim() || null;
    }
    setErr('');
    try { reset(await updateListing(l, patch)); onChanged(); return true; }
    catch (e) { setErr(friendlyError(e)); return false; }
  };

  const onSave = async () => {
    if (busy) return;
    setBusy('save');
    if (await save()) addToast(l.status === 'published' ? 'Saved — tap "Update on Shopify" to send it' : 'Saved', 'success');
    setBusy(null);
  };

  const st = LISTING_STATUS[l.status];
  const admin = site ? shopifyAdminUrl(site.shop_domain, l.shopify_product_id) : null;
  const lockTag = (k: string) => l.locked.includes(k) &&
    <span title="Edited by hand — Regenerate keeps it" style={{ ...S.badge, marginLeft: 6, background: T.glass2, color: T.tx3, textTransform: 'none', letterSpacing: 0 }}>kept</span>;
  const field = (k: keyof Form, label: string, opts: { area?: number; max?: number; num?: boolean } = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={`pb-l-${k}`} style={{ ...S.fLabel, display: 'flex', alignItems: 'center' }}>
        {label}{lockTag(k)}
        {opts.max ? <span style={{ marginLeft: 'auto', color: f[k].length > opts.max ? T.yl : T.tx3, textTransform: 'none', letterSpacing: 0 }}>{f[k].length}/{opts.max}</span> : null}
      </label>
      {opts.area
        ? <textarea id={`pb-l-${k}`} value={f[k]} rows={opts.area} disabled={locked} onChange={e => set(k)(e.target.value)} style={{ ...S.fInput, height: 'auto', resize: 'vertical', lineHeight: 1.5, fontFamily: k === 'description_html' ? T.mono : T.sans }} />
        : <input id={`pb-l-${k}`} value={f[k]} disabled={locked} onChange={e => set(k)(e.target.value)} style={{ ...S.fInput, minHeight: 44 }}
            {...(opts.num ? { type: 'number', inputMode: 'decimal' as const, min: 0, step: '0.01', onKeyDown: numKey } : {})} />}
    </div>
  );

  return (
    <PbModal open title={site?.name ?? 'Listing'} onClose={onClose} width={620}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12, fontSize: 11, color: T.tx3 }}>
        <Dot color={st.color} label={st.label} />
        {l.compare_at_price != null && <span>Compare-at {rupees(l.compare_at_price)}</span>}
        {l.generated_at && <span>Written {shortDate(l.generated_at)}{l.ai_model ? ` · ${l.ai_model.replace('claude-', '')}` : ''}</span>}
        {l.published_at && <span>Published {shortDate(l.published_at)}</span>}
        {admin && <a href={admin} target="_blank" rel="noreferrer" style={{ color: T.ac2, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Open in Shopify</a>}
      </div>
      {l.error && <div style={{ ...S.errorBox, marginBottom: 12 }}>{l.error}</div>}
      {locked && <div style={{ ...S.warningBox, marginBottom: 12, fontSize: 12 }}>Being {l.status === 'generating' ? 'written' : 'published'} right now — editing is off. Close and reopen in a minute.</div>}
      {field('price', 'Price (₹)', { num: true })}
      {field('title', 'Title', { max: site?.content?.title_max })}
      {field('description_html', 'Description (HTML: p, ul, li, strong, em, br)', { area: 8 })}
      {field('seo_title', 'SEO title', { max: site?.content?.meta_title_max })}
      {field('seo_description', 'SEO description', { area: 3, max: site?.content?.meta_desc_max })}
      {field('handle', 'Handle (URL)')}
      {field('tags', 'Tags (comma list)', { area: 2 })}
      {err && <div style={{ ...S.errorBox, marginBottom: 10 }}>{err}</div>}
      <ListingActions listing={l} dirty={changed.length > 0 && !locked} busy={busy} setBusy={setBusy} save={save} onSave={onSave}
        onUpdated={next => { reset(next); onChanged(); }} addToast={addToast} />
    </PbModal>
  );
}
