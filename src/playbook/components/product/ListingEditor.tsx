// One product on one website: edit title / description / SEO / handle / tags /
// price (each edit joins listing.locked so Regenerate keeps it), the search
// phrase it is written for and its questions (detail/ListingSeo.tsx), with
// what the checks found at the top; plus the actions in ListingActions
// (Regenerate, Approve, Publish / Update, Remove): the gradient one in the
// sheet footer, the others and Remove in the body.
import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { logSwallowed } from '../../../lib/errorLogger';
import type { AddToast } from '../PbToasts';
import { shopifyAdminUrl } from '../../data/pbFunctions';
import type { WebsiteLite } from '../../data/products';
import { getListing, listingBusy, updateListing, type ListingFull } from '../../data/listings';
import { compareAtPrice } from '../../data/websites';
import { PB, pbBtnSecondary, pbErrorBox, pbNum, pbTileReview } from '../../pbTheme';
import PbModal from './PbModal';
import ListingActions, { listingPrimary } from './ListingActions';
import ListingField from './detail/ListingField';
import { ListingChecks, ListingKeyword, ListingQuestions } from './detail/ListingSeo';
import { useListingSeo } from './detail/useListingSeo';
import { aiRupees } from '../../format';
import PbIcon from '../ui/PbIcon';
import { Dot, LISTING_STATUS, rupees, shortDate, splitList } from './status';
import { cleanDescriptionHtml } from './cleanHtml';

/** A note to act on that is not a failure: why a listing waits for review, or that a run holds it. */
const reviewBox = { ...pbTileReview, backdropFilter: undefined, WebkitBackdropFilter: undefined, borderRadius: PB.r.input, padding: '8px 12px', fontSize: 13, lineHeight: 1.5 } as const;
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
  const seo = useListingSeo(listing.id);
  const orig = toForm(l);
  const changed = [...(Object.keys(f) as (keyof Form)[]).filter(k => f[k].trim() !== orig[k].trim()), ...seo.changed];
  const set = (k: keyof Form) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const locked = listingBusy(l); // a run holds it: edits would be overwritten or published stale
  const reset = (next: ListingFull) => { setL(next); setF(toForm(next)); };

  // The product page's copy can be minutes old (a run may have written or published it since), and
  // "close and reopen in a minute" only works if opening reads the listing again. Fields already typed in stay.
  const opened = useRef({ listing, onChanged });
  useEffect(() => {
    const { listing: first, onChanged: tell } = opened.current;
    let live = true;
    getListing(first.id).then(next => {
      if (!live || next.updated_at === first.updated_at) return;
      const was = toForm(first), now = toForm(next);
      setL(next);
      setF(cur => Object.fromEntries((Object.keys(now) as (keyof Form)[]).map(k => [k, cur[k].trim() !== was[k].trim() ? cur[k] : now[k]])) as Form);
      tell(); // the tile behind the sheet is stale too
    }).catch(e => logSwallowed('pb listing reopen', e)); // the page's copy stays; a save still re-checks on the server
    return () => { live = false; };
  }, []);

  /** Save edits (if any). Returns false when they could not be saved. */
  const save = async (): Promise<boolean> => {
    if (!changed.length) return true;
    if (locked) { setErr('This listing is being written or published right now — reload it in a minute, then edit.'); return false; }
    if (seo.problem()) { setErr(seo.problem()); return false; }
    const price = f.price.trim() === '' ? null : Number(f.price);
    // 0 is refused everywhere on the server ("no price"), and a locked 0 would make Regenerate fail too.
    if (price != null && (!Number.isFinite(price) || price <= 0)) { setErr('Price must be a number above 0 — or leave it empty to let the website’s pricing set it'); return false; }
    const handle = f.handle.trim().toLowerCase();
    if (handle && !/^[a-z0-9-]{1,80}$/.test(handle)) { setErr('Handle: only a–z, 0–9 and "-", up to 80 characters'); return false; }
    const patch: Partial<ListingFull> = {};
    for (const k of changed.filter((x): x is keyof Form => x in f)) {
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
    try {
      await seo.save();
      if (Object.keys(patch).length) reset(await updateListing(l, patch));
      onChanged();
      return true;
    } catch (e) { setErr(friendlyError(e)); return false; }
  };

  const onSave = async () => {
    if (busy) return;
    setBusy('save');
    const phrase = seo.changed.includes('keyword'); // the phrase only shapes the next writing: say so
    if (await save()) addToast(phrase ? 'Saved — tap Regenerate to write the listing for this search phrase' : l.status === 'published' ? 'Saved — tap "Update on Shopify" to send it' : 'Saved', 'success');
    setBusy(null);
  };

  const st = LISTING_STATUS[l.status];
  const admin = site ? shopifyAdminUrl(site.shop_domain, l.shopify_product_id) : null;
  const field = (k: keyof Form, label: string, opts: { area?: number; max?: number; num?: boolean; mono?: boolean } = {}) => (
    <ListingField id={`pb-l-${k}`} label={label} value={f[k]} onChange={set(k)} disabled={locked} kept={l.locked.includes(k)} {...opts} />
  );

  const dirty = changed.length > 0 && !locked;
  const actions = { listing: l, dirty, busy, setBusy, save, onSave, onUpdated: (next: ListingFull) => { reset(next); seo.reload(); onChanged(); }, addToast };
  return (
    <PbModal open title={site?.name ?? 'Listing'} onClose={onClose} dirty={changed.length > 0} discardTitle="Discard changes to this listing?"
      footer={listingPrimary(l, dirty) ? <ListingActions part="primary" {...actions} /> : undefined}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', marginBottom: 16, fontSize: 12, color: PB.tx2 }}>
        <Dot color={st.color} label={st.label} />
        {l.compare_at_price != null && <span>Was <s style={pbNum}>{rupees(l.compare_at_price)}</s></span>}
        {l.generated_at && <span>Written <span style={{ color: PB.tx3 }}>{shortDate(l.generated_at)}</span></span>}
        {l.published_at && <span>Published <span style={{ color: PB.tx3 }}>{shortDate(l.published_at)}</span></span>}
        {l.ai_cost_usd != null && <span>AI cost <span style={{ ...pbNum, color: PB.tx }}>{aiRupees(l.ai_cost_usd)}</span></span>}
        {admin && (
          <a href={admin} target="_blank" rel="noreferrer" className="pb-pill pb-phone-full" style={{ ...pbBtnSecondary, marginLeft: 'auto' }}>
            Open on Shopify <PbIcon name="arrowUpRight" size={16} />
          </a>
        )}
      </div>
      {l.error && <div role="alert" style={{ ...(l.status === 'review' ? reviewBox : pbErrorBox), marginBottom: 16, overflowWrap: 'anywhere' }}>{l.error}</div>}
      {locked && (
        <div style={{ ...reviewBox, marginBottom: 16 }}>
          Being {l.status === 'generating' ? 'written' : 'published'} right now — editing is off. Close and reopen in a minute.
        </div>
      )}
      <ListingChecks s={seo} said={l.error} />
      {field('price', 'Price (₹)', { num: true })}
      <ListingKeyword s={seo} disabled={locked} />
      {field('title', 'Title', { max: site?.content?.title_max })}
      {field('description_html', 'Description (HTML: p, ul, li, h3, strong, em, br)', { area: 8, mono: true })}
      <ListingQuestions s={seo} disabled={locked} />
      {field('seo_title', 'SEO title', { max: site?.content?.meta_title_max })}
      {field('seo_description', 'SEO description', { area: 3, max: site?.content?.meta_desc_max })}
      {field('handle', 'Handle (URL)')}
      {field('tags', 'Tags (comma list)', { area: 2 })}
      {err && <div role="alert" style={{ ...pbErrorBox, marginBottom: 12 }}>{err}</div>}
      <ListingActions part="rest" {...actions} />
    </PbModal>
  );
}
