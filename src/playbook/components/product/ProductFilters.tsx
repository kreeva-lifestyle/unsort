// The Products toolbar tile (12 wide): search (name / SKU / details), status
// chips for the statuses staff act on, and picker chips for the other
// statuses, the vendor, the website and the source (Telegram, typed in, or the
// website a product was copied from). Same filter values as before
// (data/products.ts `ProductFilter`); only the controls changed.
// Desktop: [search ……… vendor · website · source] / [status chips · more statuses · Clear].
// Phone: search, then one sideways-scrolling chip row (mobile.md §9).
import type { ProductFilter, VendorLite, WebsiteLite } from '../../data/products';
import { PB, pbInput } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import { PbChip, PbChipRow } from '../ui/PbChip';
import PbIcon from '../ui/PbIcon';
import PbTile from '../ui/PbTile';
import SelectChip from './list/SelectChip';
import { MORE_STATUSES, STATUS_CHIPS } from './list/productListUtil';

export default function ProductFilters({ search, onSearch, filter, onFilter, vendors, websites, sources, onClear }: {
  search: string; onSearch: (s: string) => void; filter: ProductFilter; onFilter: (f: Partial<ProductFilter>) => void;
  vendors: VendorLite[]; websites: WebsiteLite[];
  /** Where products came from: Telegram, typed in, and each website they were copied from. */
  sources: { v: string; label: string }[];
  /** Resets search + every filter; shown as "Clear" while any is on. */
  onClear?: () => void;
}) {
  const phone = useIsPhone();
  const any = !!(search || filter.status || filter.vendorId || filter.websiteId || filter.source);
  const more = MORE_STATUSES.find(o => o.v === filter.status);
  const vendor = vendors.find(v => v.id === filter.vendorId);
  const site = websites.find(w => w.id === filter.websiteId);

  const searchBox = (
    <div style={{ position: 'relative', flex: phone ? 'none' : '2 1 320px', minWidth: 0 }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: PB.tx3, display: 'inline-flex', pointerEvents: 'none' }}>
        <PbIcon name="search" size={16} />
      </span>
      <input type="search" className="pb-input" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search name, SKU or details"
        aria-label="Search products" enterKeyHint="search" autoCorrect="off" spellCheck={false}
        style={{ ...pbInput, minHeight: 48, paddingLeft: 40, paddingRight: search ? 48 : 14 }} />
      {search && (
        <button type="button" onClick={() => onSearch('')} aria-label="Clear search" className="pb-pill"
          style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, border: 'none', background: 'transparent', color: PB.tx2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: PB.r.input }}>
          <PbIcon name="x" size={16} />
        </button>
      )}
    </div>
  );

  const statusChips = STATUS_CHIPS.map(o => (
    <PbChip key={o.v || 'all'} pressed={filter.status === o.v} onClick={() => onFilter({ status: o.v })}>{o.label}</PbChip>
  ));
  const moreChip = (
    <SelectChip label="More statuses" value={filter.status} text={more?.label ?? 'More statuses'} active={!!more}
      placeholder="More statuses" options={MORE_STATUSES} onChange={v => onFilter({ status: v })} />
  );
  const vendorChip = (
    <SelectChip label="Vendor" value={filter.vendorId} text={vendor?.name ?? 'All vendors'} active={!!filter.vendorId}
      options={[{ v: '', label: 'All vendors' }, ...vendors.map(v => ({ v: v.id, label: v.name + (v.active ? '' : ' (inactive)') }))]}
      onChange={v => onFilter({ vendorId: v })} />
  );
  const siteChip = (
    <SelectChip label="Website" value={filter.websiteId} text={site?.name ?? 'All websites'} active={!!filter.websiteId}
      options={[{ v: '', label: 'All websites' }, ...websites.map(w => ({ v: w.id, label: w.name }))]}
      onChange={v => onFilter({ websiteId: v })} />
  );
  const sourceChip = (
    <SelectChip label="Source" value={filter.source} text={sources.find(o => o.v === filter.source)?.label ?? 'All sources'} active={!!filter.source}
      options={[{ v: '', label: 'All sources' }, ...sources]} onChange={v => onFilter({ source: v })} />
  );
  const clear = any && onClear && (
    <PbChip onClick={onClear} icon="x" aria-label="Clear search and filters">Clear</PbChip>
  );

  // Phone: on the backdrop, no tile, so the chip row runs edge to edge (DESIGN.md §7).
  if (phone) return (
    <section aria-label="Search and filters" className="pb-span-12" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {searchBox}
      <PbChipRow label="Filter products">{statusChips}{moreChip}{vendorChip}{siteChip}{sourceChip}{clear}</PbChipRow>
    </section>
  );
  return (
    <PbTile span={12} as="section" aria-label="Search and filters" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        {searchBox}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>{vendorChip}{siteChip}{sourceChip}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <div style={{ minWidth: 0, maxWidth: '100%' }}><PbChipRow label="Filter by status">{statusChips}</PbChipRow></div>
        {moreChip}
        {clear && <div style={{ marginLeft: 'auto' }}>{clear}</div>}
      </div>
    </PbTile>
  );
}
