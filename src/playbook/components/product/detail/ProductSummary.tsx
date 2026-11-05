// Summary tiles of the product page. Desktop: the hero (status, next step,
// cost — the page's one hero) and the "On websites" stat tile. Phone: the
// glass name card under the photo. Plus "What the AI read" (both).
import type { ProductDetail, VendorLite } from '../../../data/products';
import { PB, pbLabel, pbMeta, pbNum, pbPageTitle, pbTileTitle } from '../../../pbTheme';
import PbStatTile from '../../ui/PbStatTile';
import PbTile from '../../ui/PbTile';
import { Dot, LISTING_STATUS, PRODUCT_STATUS, rupees, shortDate } from '../status';

type P = { p: ProductDetail; vendors: VendorLite[] };
const vendorName = ({ p, vendors }: P) => vendors.find(v => v.id === p.vendor_id)?.name ?? null;
const cost = (p: ProductDetail) => (p.cost_price == null ? null : rupees(p.cost_price));

export function ProductHero({ p, vendors }: P) {
  const st = PRODUCT_STATUS[p.status];
  const vendor = vendorName({ p, vendors });
  return (
    <PbTile variant="hero" as="section" span={4} aria-label={`Status: ${st.label}. ${st.hint}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{st.label}</span>
        {(vendor || p.sku) && (
          <span style={{ fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>
            {vendor}{vendor && p.sku && ' · '}{p.sku && <span style={pbNum}>{p.sku}</span>}
          </span>
        )}
      </div>
      <span style={{ fontSize: 13, lineHeight: 1.5 }}>{st.hint}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Cost price</span>
        <span style={{ ...pbNum, fontSize: cost(p) ? 'clamp(28px, 3vw, 40px)' : 17, fontWeight: 500, lineHeight: 1.1, overflowWrap: 'anywhere' }}>
          {cost(p) ?? 'Not set — add it in Facts'}
        </span>
      </div>
    </PbTile>
  );
}

export function WebsitesStat({ p }: { p: ProductDetail }) {
  const ls = p.pb_listings;
  const counts = Object.entries(LISTING_STATUS).map(([k, s]) => [ls.filter(l => l.status === k).length, s.label] as const).filter(([n]) => n > 0);
  return (
    <PbStatTile span={4} label="On websites"
      value={<>{ls.filter(l => l.status === 'published').length}<span style={{ fontSize: 20, color: PB.tx2 }}> / {ls.length}</span></>}
      meta={counts.length ? counts.map(([n, label]) => `${n} ${label.toLowerCase()}`).join(' · ') : 'Not listed anywhere yet'} />
  );
}

export function PhoneNameCard({ p, vendors }: P) {
  const st = PRODUCT_STATUS[p.status];
  const bits = [vendorName({ p, vendors }), p.category, p.fabric].filter(Boolean);
  return (
    <PbTile as="section" variant={st.tint ?? 'default'} aria-labelledby="pb-product-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 id="pb-product-title" tabIndex={-1} style={{ ...pbPageTitle, lineHeight: 1.5, outline: 'none' }}>{p.name || p.sku || 'Untitled product'}</h1>
      <div style={{ ...pbMeta, overflowWrap: 'anywhere' }}>
        {bits.join(' · ')}{bits.length > 0 && ' · '}<span style={{ ...pbNum, color: PB.tx }}>{cost(p) ?? 'No cost price'}</span>
        {p.sku && <> · <span style={{ ...pbNum, display: 'inline-block' }}>{p.sku}</span></>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Dot color={st.color} label={st.label} /><span style={pbMeta}>{st.hint}</span>
      </div>
    </PbTile>
  );
}

export function AiReadTile({ p }: { p: ProductDetail }) {
  const attrs = Object.entries(p.attributes ?? {}).filter(([, v]) => v != null && String(v).trim() !== '');
  return (
    <PbTile as="section" variant={p.ai_error ? 'failed' : 'default'} aria-labelledby="pb-ai-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 id="pb-ai-title" style={pbTileTitle}>What the AI read</h2>
        {p.ai_read_at && <span style={{ fontSize: 12, color: PB.tx3 }}>{shortDate(p.ai_read_at)}</span>}
      </div>
      {p.ai_error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Dot color={PB.failed} label="AI reader problem" />
          <span style={{ fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' }}>{p.ai_error}</span>
        </div>
      )}
      {attrs.length === 0 ? <span style={pbMeta}>Nothing extra read yet.</span> : (
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attrs.map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <dt style={{ ...pbLabel, marginBottom: 2 }}>{k.replace(/_/g, ' ')}</dt>
              <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' }}>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </PbTile>
  );
}
