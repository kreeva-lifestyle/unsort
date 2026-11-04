// Search (name / SKU / details) + status, vendor and website filters for the product list.
import { T, S } from '../../../lib/theme';
import type { ProductFilter, VendorLite, WebsiteLite } from '../../data/products';
import { LISTING_STATUS, PRODUCT_STATUS } from './status';

const STATUS_OPTIONS: { v: string; label: string }[] = [
  { v: '', label: 'All (not archived)' },
  ...(['new', 'reading', 'needs_info', 'ready', 'archived'] as const).map(s => ({ v: s, label: PRODUCT_STATUS[s].label })),
  { v: 'l:queued,generating,publishing', label: 'Listing: In progress' },
  ...(['review', 'failed', 'publishing', 'published', 'skipped'] as const).map(s => ({ v: `l:${s}`, label: `Listing: ${LISTING_STATUS[s].label}` })),
];

export default function ProductFilters({ search, onSearch, filter, onFilter, vendors, websites }: {
  search: string; onSearch: (s: string) => void; filter: ProductFilter; onFilter: (f: Partial<ProductFilter>) => void;
  vendors: VendorLite[]; websites: WebsiteLite[];
}) {
  const sel = { ...S.fInput, width: 'auto', flex: '1 1 150px', minWidth: 0, minHeight: 44 };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      <div style={{ position: 'relative', flex: '2 1 240px', minWidth: 0 }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}>
          <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input type="search" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search name, SKU or details"
          aria-label="Search products" style={{ ...S.fSearch, minHeight: 44 }} />
      </div>
      <select aria-label="Status" value={filter.status} onChange={e => onFilter({ status: e.target.value })} style={sel}>
        {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <select aria-label="Vendor" value={filter.vendorId} onChange={e => onFilter({ vendorId: e.target.value })} style={sel}>
        <option value="">All vendors</option>
        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? '' : ' (inactive)'}</option>)}
      </select>
      <select aria-label="Website" value={filter.websiteId} onChange={e => onFilter({ websiteId: e.target.value })} style={sel}>
        <option value="">All websites</option>
        {websites.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </div>
  );
}
