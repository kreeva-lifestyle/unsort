// One product: photos, editable facts, what the AI read, and its listing on
// each website. Actions: Read again with AI, Check websites again, Archive / Restore.
// Device Back closes it (Products owns the useBackClose layer).
// V2 bento (desktop): header 12 · photos 8×2 + hero 4 + websites stat 4 ·
// facts 8 + AI read 4 · websites 6+6 (odd last 12). Phone: photo hero, name
// card, website tiles, facts, AI read, then the product actions.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import { useConfirm } from '../../components/ui/ConfirmModal';
import PbConfirm from '../components/ui/PbConfirm';
import type { AddToast } from '../components/PbToasts';
import { pbCall } from '../data/pbFunctions';
import { addPhotos, checkPhoto, getProduct, setProductStatus, type ProductDetail, type VendorLite, type WebsiteLite } from '../data/products';
import ProductFacts from '../components/product/ProductFacts';
import ProductListings from '../components/product/ProductListings';
import { Dot, PRODUCT_STATUS } from '../components/product/status';
import ProductActions, { PhoneActionsTile } from '../components/product/detail/ProductActions';
import { PhonePhotoHero, PhotosTile } from '../components/product/detail/ProductPhotos';
import WebMetaTile from '../components/product/detail/WebMetaTile';
import { AiReadTile, PhoneNameCard, ProductHero, WebsitesStat } from '../components/product/detail/ProductSummary';
import ProductStates from '../components/product/detail/ProductStates';
import { IntakeNotesTile, SourceLine } from '../components/product/detail/TelegramBits';
import { PbPageHeader, focusPageTitle } from '../components/ui';
import { pbMeta } from '../pbTheme';
import { useIsPhone } from '../hooks/useIsPhone';

type Props = {
  id: string; onClose: () => void; onChanged: () => void; addToast: AddToast;
  vendors: VendorLite[]; onVendorCreated: (v: VendorLite) => void; sites: WebsiteLite[]; categories: string[];
};

export default function ProductPage({ id, onClose, onChanged, addToast, vendors, onVendorCreated, sites, categories }: Props) {
  const [p, setP] = useState<ProductDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  // Opened from far down the list: start at the top (Playbook scrolls inside its own container).
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [id]);
  const { ask, modalProps } = useConfirm();

  const load = useCallback(async () => {
    try { setP(await getProduct(id)); setLoadErr(''); }
    catch (e) { const m = friendlyError(e); setLoadErr(m); addToast(m, 'error'); }
  }, [id, addToast]);
  useEffect(() => { void load(); }, [load]);
  const refresh = () => { void load(); onChanged(); };
  // Once the product shows, focus moves to its name (not <body>) for keyboard and screen-reader users.
  const loaded = !!p;
  useEffect(() => { if (loaded) focusPageTitle(); }, [loaded]);

  /** One busy key per screen. */
  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(key);
    try {
      // read_product / route_product answer ok with a `warning` when part of the job did not happen.
      const warning = (await fn() as { warning?: string } | undefined)?.warning;
      if (warning) addToast(`${done}, but: ${warning}`, 'error'); else addToast(done, 'success');
      refresh();
    }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setBusy(null); }
  };

  const pickPhotos = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = '';
    const bad = files.map(checkPhoto).filter(Boolean);
    if (bad.length) { addToast(bad.join(' · '), 'error'); return; }
    if (!files.length || !p) return;
    const next = p.pb_product_images.reduce((m, i) => Math.max(m, i.position + 1), 0);
    void act('photos', () => addPhotos(p.id, files, next), files.length === 1 ? 'Photo added' : `${files.length} photos added`);
  };

  const archive = async () => {
    if (!p) return;
    if (await ask({ title: 'Archive this product?', message: 'It leaves the list and is not routed any more. Listings already on Shopify stay as they are — remove them per website first if needed.', confirmLabel: 'Archive', danger: true })) {
      await act('archive', () => setProductStatus(p.id, 'archived'), 'Archived');
    }
  };

  if (!p) return (
    <div ref={top} style={{ scrollMarginTop: 140 }}>
      <ProductStates loadErr={loadErr} onBack={onClose} onRetry={() => { setLoadErr(''); void load(); }} />
    </div>
  );
  const st = PRODUCT_STATUS[p.status];
  const name = p.name || p.sku || 'Untitled product';
  const actionProps = {
    p, busy,
    onRead: () => act('read', () => pbCall('read_product', { product_id: p.id }), 'Read again by the AI'),
    onRoute: () => act('route', () => pbCall('route_product', { product_id: p.id }), 'Checked against every website’s rules'),
    onRestore: () => act('restore', () => setProductStatus(p.id, 'new'), 'Restored — the AI will read it again'),
    onArchive: archive,
  };
  const addPhoto = () => fileInput.current?.click();
  // The page's one gradient: Edit on the first listing waiting for approval, else Save facts.
  const waiting = p.pb_listings.some(l => l.status === 'review');
  const facts = (
    <ProductFacts key={p.updated_at} product={p} vendors={vendors} categories={categories} onVendorCreated={onVendorCreated}
      onSaved={refresh} addToast={addToast} primary={!waiting} />
  );
  const listings = <ProductListings listings={p.pb_listings} sites={sites} onChanged={refresh} addToast={addToast} busy={busy} primary={waiting} phone={phone} />;

  return (
    <div ref={top} style={{ scrollMarginTop: 140, display: 'flex', flexDirection: 'column', gap: phone ? 12 : 24, minWidth: 0 }}>
      {phone ? (
        <>
          <PhonePhotoHero images={p.pb_product_images} onAdd={addPhoto} busy={busy} onBack={onClose} />
          <PhoneNameCard p={p} vendors={vendors} />
          <IntakeNotesTile p={p} addToast={addToast} onChanged={refresh} />
          {listings}
          {facts}
          <WebMetaTile p={p} />
          <AiReadTile p={p} />
          <PhoneActionsTile {...actionProps} />
        </>
      ) : (
        <div>
          <PbPageHeader title={name} back={{ label: 'Products', onBack: onClose }}
            sub={<span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><Dot color={st.color} label={st.label} /><span style={pbMeta}>{st.hint}</span></span>
              <SourceLine p={p} />
            </span>}
            actions={<ProductActions {...actionProps} />} />
          <div className="pb-bento">
            <PhotosTile images={p.pb_product_images} onAdd={addPhoto} busy={busy} />
            <ProductHero p={p} vendors={vendors} />
            <WebsitesStat p={p} />
            <IntakeNotesTile p={p} span={12} addToast={addToast} onChanged={refresh} />
            {/* Facts 8 + AI 4 on their own 12-column grid: its lines match the outer grid at 12 and 6 columns, so the row stays full. */}
            <div className="pb-span-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 16 }}>
              <div style={{ gridColumn: 'span 8', display: 'grid', minWidth: 0 }}>{facts}</div>
              {/* The side column: what the AI read (stretching to the Facts height), and below it what the other store showed. */}
              <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                <div style={{ flex: '1 1 auto', display: 'grid', minWidth: 0 }}><AiReadTile p={p} /></div>
                <WebMetaTile p={p} />
              </div>
            </div>
          </div>
        </div>
      )}
      {!phone && listings}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => pickPhotos(e.target.files)} />
      <PbConfirm {...modalProps} />
    </div>
  );
}
