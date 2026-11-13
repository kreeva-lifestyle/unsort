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
import { getAiCost } from '../data/listingSeo';
import { dupName, getDupMatches, sourceText, type DupMatch } from '../data/duplicates';
import { useAuth } from '../../hooks/useAuth';
import DupTile from '../components/product/detail/DupTile';
import { logSwallowed } from '../../lib/errorLogger';
import type { PbAiCost } from '../seoTypes';
import { getProduct, setProductStatus, type ProductDetail, type VendorLite, type WebsiteLite } from '../data/products';
import ProductFacts from '../components/product/ProductFacts';
import ProductListings from '../components/product/ProductListings';
import { Dot, PRODUCT_STATUS } from '../components/product/status';
import ProductActions, { PhoneActionsTile } from '../components/product/detail/ProductActions';
import { PhonePhotoHero, PhotosTile } from '../components/product/detail/ProductPhotos';
import { usePhotoActions } from '../components/product/detail/usePhotoActions';
import WebMetaTile from '../components/product/detail/WebMetaTile';
import { AiReadTile, PhoneNameCard, ProductHero, WebsitesStat } from '../components/product/detail/ProductSummary';
import ProductStates from '../components/product/detail/ProductStates';
import { statusHint } from '../components/product/detail/needs';
import { IntakeNotesTile, SourceLine } from '../components/product/detail/TelegramBits';
import StockTile from '../components/product/detail/StockTile';
import { PbPageHeader, focusPageTitle } from '../components/ui';
import { pbMeta } from '../pbTheme';
import { useIsPhone } from '../hooks/useIsPhone';

type Props = {
  id: string; onClose: () => void; onChanged: () => void; addToast: AddToast;
  /** Open another product from here (a match in "Already added?"); asks first when the facts hold unsaved typing. */
  onOpenOther: (id: string) => void;
  /** The product was deleted for good: close this page (nothing is left to save) and reload the list. */
  onDeleted: () => void;
  vendors: VendorLite[]; onVendorCreated: (v: VendorLite) => void; sites: WebsiteLite[]; categories: string[];
};

export default function ProductPage({ id, onClose, onChanged, onOpenOther, onDeleted, addToast, vendors, onVendorCreated, sites, categories }: Props) {
  const [p, setP] = useState<ProductDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const top = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  // Opened from far down the list: start at the top (Playbook scrolls inside its own container).
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [id]);
  const { ask, modalProps } = useConfirm();

  const [cost, setCost] = useState<PbAiCost | null>(null);
  const [dups, setDups] = useState<DupMatch[]>([]);
  const load = useCallback(async () => {
    try { setP(await getProduct(id)); setLoadErr(''); }
    catch (e) { const m = friendlyError(e); setLoadErr(m); addToast(m, 'error'); }
    getAiCost(id).then(setCost).catch(e => logSwallowed('pb ai cost', e)); // a figure beside the listings: the page does not wait for it
    getDupMatches([id]).then(setDups).catch(e => logSwallowed('pb copies', e)); // "Already added?": the gate has judged already, this only explains it
  }, [id, addToast]);
  useEffect(() => { void load(); }, [load]);
  const refresh = () => { void load(); onChanged(); };
  // Once the product shows, focus moves to its name (not <body>) for keyboard and screen-reader users.
  const loaded = !!p;
  useEffect(() => { if (loaded) focusPageTitle(); }, [loaded]);

  /** One busy key per screen. `done`: the success toast, or how to word it from the server's answer. */
  const act = async (key: string, fn: () => Promise<unknown>, done: string | ((r: unknown) => string)) => {
    if (busy) return;
    setBusy(key);
    try {
      // read_product / route_product / photos_set answer ok with a `warning` when part of the job did not happen.
      const r = await fn(), warning = (r as { warning?: string } | undefined)?.warning;
      const said = typeof done === 'function' ? done(r) : done;
      if (warning) addToast(`${said}, but: ${warning}`, 'error'); else addToast(said, 'success');
      onChanged();
      await load(); // the page stays busy until it shows the new state: no second change on top of the old one
    }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setBusy(null); }
  };
  // Photos: add, make main, move, remove (the viewer's buttons).
  const { addPhoto, edit: photoEdit, input: photoInput } = usePhotoActions(p, { busy, act, ask, addToast });

  // Delete for good: admin / manager only (the server checks again). One pop-up says what goes and what that means.
  const { profile } = useAuth();
  const canDelete = profile?.role === 'admin' || profile?.role === 'manager';
  const remove = async () => {
    if (!p || busy) return;
    const from = sourceText(p.source, p.source_ref);
    const again = p.source === 'import' ? ` A later import from ${from || 'that website'} will add it again as a new product.` : '';
    if (!await ask({ title: 'Delete this product for good?', message: `Its facts, photos, tags, listings and history are removed from Playbook and cannot be brought back. Archive it instead if you may need it again.${again}`, confirmLabel: 'Delete', danger: true })) return;
    setBusy('delete');
    try {
      const r = await pbCall<{ photos_left?: number }>('delete_product', { product_id: p.id });
      if (r.photos_left) addToast(`Deleted, but ${r.photos_left} photo file${r.photos_left === 1 ? '' : 's'} could not be removed from storage. Nothing points to ${r.photos_left === 1 ? 'it' : 'them'} any more`, 'error');
      else addToast('Deleted', 'success');
      onDeleted();
    } catch (e) { addToast(friendlyError(e), 'error'); setBusy(null); }
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
    onArchive: archive, onDelete: canDelete ? remove : undefined,
  };
  // The page's one gradient: Edit on the first listing waiting for approval, else Save facts.
  const waiting = p.pb_listings.some(l => l.status === 'review'), owed = p.pb_listings.filter(l => l.stock_due).length;
  const facts = (
    <ProductFacts key={p.id} product={p} vendors={vendors} categories={categories} onVendorCreated={onVendorCreated}
      onSaved={refresh} addToast={addToast} primary={!waiting} />
  );
  const heldAs = dups.find(m => m.product_id === p.id && m.kind === 'held');
  const copyOf = heldAs ? dupName(heldAs) : undefined;
  const dupTile = (span?: 12) => <DupTile productId={p.id} matches={dups.filter(m => m.product_id === p.id)} span={span} onChanged={refresh} onOpen={onOpenOther} addToast={addToast} />;
  const listings = <ProductListings listings={p.pb_listings} sites={sites} onChanged={refresh} addToast={addToast} busy={busy} primary={waiting} phone={phone} cost={cost} />;

  return (
    <div ref={top} style={{ scrollMarginTop: 140, display: 'flex', flexDirection: 'column', gap: phone ? 12 : 24, minWidth: 0 }}>
      {phone ? (
        <>
          <PhonePhotoHero images={p.pb_product_images} onAdd={addPhoto} busy={busy} edit={photoEdit} onBack={onClose} />
          <PhoneNameCard p={p} vendors={vendors} copyOf={copyOf} />
          {dupTile()}
          <IntakeNotesTile p={p} addToast={addToast} onChanged={refresh} />
          <StockTile p={p} owed={owed} addToast={addToast} onChanged={refresh} />
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
              <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><Dot color={st.color} label={st.label} /><span style={pbMeta}>{statusHint(p, copyOf)}</span></span>
              <SourceLine p={p} />
            </span>}
            actions={<ProductActions {...actionProps} />} />
          <div className="pb-bento">
            <PhotosTile images={p.pb_product_images} onAdd={addPhoto} busy={busy} edit={photoEdit} />
            <ProductHero p={p} vendors={vendors} copyOf={copyOf} />
            <WebsitesStat p={p} />
            {dupTile(12)}
            <IntakeNotesTile p={p} span={12} addToast={addToast} onChanged={refresh} />
            <StockTile p={p} owed={owed} span={12} addToast={addToast} onChanged={refresh} />
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
      {photoInput}
      <PbConfirm {...modalProps} />
    </div>
  );
}
