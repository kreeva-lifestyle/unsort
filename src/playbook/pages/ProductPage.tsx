// One product: photos, editable facts, what the AI read, and its listing on
// each website. Actions: Read again with AI, Check websites again, Archive / Restore.
// Device Back closes it (Products owns the useBackClose layer).
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import ConfirmModal, { useConfirm } from '../../components/ui/ConfirmModal';
import type { AddToast } from '../components/PbToasts';
import { pbCall, pbImageUrl } from '../data/pbFunctions';
import { addPhotos, checkPhoto, getProduct, setProductStatus, type ProductDetail, type VendorLite, type WebsiteLite } from '../data/products';
import ProductFacts from '../components/product/ProductFacts';
import ProductListings from '../components/product/ProductListings';
import { Dot, PRODUCT_STATUS, shortDate } from '../components/product/status';

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
  // Opened from far down the list: start at the top (Playbook scrolls inside its own container).
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [id]);
  const { ask, modalProps } = useConfirm();

  const load = useCallback(async () => {
    try { setP(await getProduct(id)); setLoadErr(''); }
    catch (e) { const m = friendlyError(e); setLoadErr(m); addToast(m, 'error'); }
  }, [id, addToast]);
  useEffect(() => { void load(); }, [load]);
  const refresh = () => { void load(); onChanged(); };

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); addToast(done, 'success'); refresh(); }
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

  const bstyle = (base = S.btnGhost) => ({ ...base, minHeight: 44, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' as const : 'auto' as const });
  if (!p) return (
    <div ref={top} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', scrollMarginTop: 140 }}>
      <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>&#8249; Products</button>
      {loadErr ? (
        <>
          <div style={{ ...S.errorBox, alignSelf: 'stretch' }}>Could not open this product: {loadErr}</div>
          <button type="button" onClick={() => { setLoadErr(''); void load(); }} style={{ ...S.btnPrimary, minHeight: 44 }}>Try again</button>
        </>
      ) : <div style={{ ...S.emptyState, alignSelf: 'stretch' }}>Loading…</div>}
    </div>
  );
  const st = PRODUCT_STATUS[p.status];
  const attrs = Object.entries(p.attributes ?? {}).filter(([, v]) => v != null && String(v).trim() !== '');

  return (
    <div ref={top} style={{ display: 'flex', flexDirection: 'column', gap: 14, scrollMarginTop: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>&#8249; Products</button>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.sku || 'Untitled product'}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <Dot color={st.color} label={st.label} />
            <span style={{ fontSize: 11, color: T.tx3 }}>{st.hint}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => act('read', () => pbCall('read_product', { product_id: p.id }), 'Read again by the AI')} style={bstyle(S.btnPrimary)}>
          {busy === 'read' ? 'Reading…' : 'Read again with AI'}
        </button>
        {p.status === 'ready' && (
          <button type="button" onClick={() => act('route', () => pbCall('route_product', { product_id: p.id }), 'Checked against every website’s rules')} style={bstyle()}>
            {busy === 'route' ? 'Checking…' : 'Check websites again'}
          </button>
        )}
        {p.status === 'archived'
          ? <button type="button" onClick={() => act('restore', () => setProductStatus(p.id, 'new'), 'Restored — the AI will read it again')} style={bstyle()}>{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
          : <button type="button" onClick={archive} style={bstyle(S.btnDanger)}>{busy === 'archive' ? 'Archiving…' : 'Archive'}</button>}
      </div>

      {p.ai_error && <div style={S.errorBox}>AI reader: {p.ai_error}</div>}

      <div style={S.card}>
        <div style={{ ...S.flexBetween, marginBottom: 10 }}>
          <div style={S.sectionTitle}>Photos</div>
          <button type="button" onClick={() => fileInput.current?.click()} style={{ ...bstyle(), ...S.btnSm, minHeight: 44 }}>{busy === 'photos' ? 'Uploading…' : '+ Add photos'}</button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => pickPhotos(e.target.files)} />
        </div>
        {p.pb_product_images.length === 0 ? <div style={{ fontSize: 12, color: T.tx3 }}>No photos yet.</div> : (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
            {p.pb_product_images.map((img, i) => (
              <a key={img.id} href={pbImageUrl(img.path)} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                <img src={pbImageUrl(img.path)} alt={`Photo ${i + 1}`} loading="lazy" style={{ width: 120, height: 150, objectFit: 'cover', borderRadius: T.r, border: `1px solid ${T.bd}` }} />
              </a>
            ))}
          </div>
        )}
      </div>

      <ProductFacts key={p.updated_at} product={p} vendors={vendors} categories={categories} onVendorCreated={onVendorCreated} onSaved={refresh} addToast={addToast} />

      {attrs.length > 0 && (
        <div style={S.card}>
          <div style={{ ...S.sectionTitle, marginBottom: 8 }}>What the AI read{p.ai_read_at ? <span style={{ fontSize: 11, color: T.tx3, fontWeight: 400, fontFamily: T.sans }}> · {shortDate(p.ai_read_at)}</span> : null}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '6px 14px' }}>
            {attrs.map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>
                <span style={{ ...S.fLabel, display: 'inline', marginRight: 6 }}>{k.replace(/_/g, ' ')}</span>{String(v)}
              </div>
            ))}
          </div>
        </div>
      )}

      <ProductListings listings={p.pb_listings} sites={sites} onChanged={refresh} addToast={addToast} />
      <ConfirmModal {...modalProps} />
    </div>
  );
}
