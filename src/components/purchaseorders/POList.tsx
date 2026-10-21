// PO list — search + collapsible filters, the orders sorted into sections
// (poSections: Overdue first) as Jobwork's list — POListTable on a desktop,
// POListCards on a phone, POSectionStrip counting them — and the pager.
// Parent owns all state & data; this is a pure presentational component.
import { useMemo } from 'react';
import { T, S } from '../../lib/theme';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useProgressive } from '../../hooks/useProgressive';
import Empty from '../ui/Empty';
import { SkeletonRows } from '../ui/Skeleton';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';
import POFilters, { type POFiltersProps } from './POFilters';
import { fileDate } from '../../lib/exportName';
import { sectionsOf } from './poSections';
import POListTable from './POListTable';
import POListCards from './POListCards';
import POSectionStrip from './POSectionStrip';

export type PORow = PurchaseOrder & {
  purchase_order_items?: Array<Pick<PurchaseOrderItem, 'sku' | 'item_name' | 'fabric_code' | 'quantity' | 'received_qty' | 'unit'> & Partial<Pick<PurchaseOrderItem, 'cancelled_at'>>>;
  /** The costing this PO was raised from (embedded via costing_product_id). */
  costing_products?: { sku: string } | null;
};

interface Props extends POFiltersProps {
  pos: PORow[];
  loading: boolean;
  totalCount: number;
  search: string;
  onSearchChange: (v: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  pageSize: number;
  onPageSizeChange: (v: number) => void;
  onOpenEmpty: () => void;
  canCreate: boolean;
  onOpenDetail: (po: PORow) => void;
  onPrint: (po: PORow) => void;
  /** Opens the vendor pendency report (vendor picked inside). */
  onPendency: () => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number | ((prev: number) => number)) => void;
  /** Something is narrowing the list (search, filters, a summary slice): an empty result is "no match", not "no orders yet". */
  narrowed: boolean;
  /** The other tab's name and how many orders it holds under the same search and filters. */
  otherTab: { label: string; count: number | null };
}

export default function POList(p: Props) {
  const filterActive = p.statusFilter || p.typeFilter || p.creatorFilter || p.dateFrom || p.dateTo;
  // Only the layout on screen is built: the table on a desktop, the
  // swipeable cards on a phone.
  const phone = useIsPhone();
  const shown = useProgressive(p.pos, p.loading);
  // Sections come from the whole page, so the order never reshuffles as rows
  // arrive; the first paint shows the first rows of that order, the rest follow.
  const all = useMemo(() => sectionsOf(p.pos, fileDate()), [p.pos]);
  const sections = useMemo(() => {
    let left = shown.length;
    return all.map(s => { const rows = s.rows.slice(0, Math.max(0, left)); left -= rows.length; return { ...s, rows }; }).filter(s => s.rows.length);
  }, [all, shown.length]);
  return (
    <>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input type="text" value={p.search} onChange={e => { p.onSearchChange(e.target.value); p.onResetPage(); }} placeholder="Search vendor, PO #, SKU or fabric code…" style={{ ...S.fSearch, background: 'transparent', border: 'none', width: '100%' }} />
        </div>
        <button onClick={p.onToggleFilters} style={{ ...S.btnGhost, color: p.showFilters || filterActive ? T.ac2 : T.tx3, borderColor: p.showFilters || filterActive ? T.ac3 : T.bd2, background: p.showFilters ? T.ac3 : 'rgba(255,255,255,0.03)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
          Filters{filterActive ? ` (${[p.statusFilter, p.typeFilter, p.creatorFilter, p.dateFrom, p.dateTo].filter(Boolean).length})` : ''}
        </button>
        <button onClick={p.onPendency} title="Pending orders per vendor — print or share" style={{ ...S.btnGhost, color: T.tx3, borderColor: T.bd2, background: 'rgba(255,255,255,0.03)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          Pending
        </button>
      </div>

      {p.showFilters && <POFilters {...p} filterActive={!!filterActive} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: phone ? 4 : 10 }}>
        <div style={{ fontSize: 9, color: T.tx3 }}>{p.totalCount} record{p.totalCount === 1 ? '' : 's'}{p.totalPages > 1 ? ' · counts below are for this page' : ''}</div>
        {!phone && !p.loading && <POSectionStrip sections={all} phone={false} />}
      </div>
      {phone && !p.loading && <POSectionStrip sections={all} phone />}

      {p.loading && <SkeletonRows rows={4} />}
      {!p.loading && p.pos.length === 0 && (p.otherTab.count
        ? <Empty icon="search" title={`Nothing here — ${p.otherTab.count} on ${p.otherTab.label}`} message={`The ${p.otherTab.label} tab above has ${p.otherTab.count} order${p.otherTab.count === 1 ? '' : 's'} that match.`} />
        : p.narrowed
        ? <Empty icon="search" title="No orders match" message="Clear the search, chips or filters above to see every order." />
        : <Empty icon="clipboard" title="No purchase orders yet" message="Raise your first PO — pick a vendor, add the items you're buying, and track them from draft through to fully received." cta={p.canCreate ? '+ New Purchase Order' : undefined} onCta={p.canCreate ? p.onOpenEmpty : undefined} />)}

      {!p.loading && p.pos.length > 0 && (phone
        ? <POListCards sections={sections} onOpen={p.onOpenDetail} onPrint={p.onPrint} />
        : <POListTable sections={sections} onOpen={p.onOpenDetail} onPrint={p.onPrint} />)}

      {p.totalPages > 0 && (
        <div className="pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {p.totalPages > 1 && <>
              <button onClick={() => p.onPageChange((prev: number) => Math.max(0, prev - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: p.page === 0 ? 0.3 : 1, pointerEvents: p.page === 0 ? 'none' : 'auto' } as React.CSSProperties} disabled={p.page === 0}>Prev</button>
              <span style={{ fontSize: 10, color: T.tx3 }}>{p.page + 1} / {p.totalPages}</span>
              <button onClick={() => p.onPageChange((prev: number) => Math.min(p.totalPages - 1, prev + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: p.page >= p.totalPages - 1 ? 0.3 : 1, pointerEvents: p.page >= p.totalPages - 1 ? 'none' : 'auto' } as React.CSSProperties} disabled={p.page >= p.totalPages - 1}>Next</button>
            </>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: T.tx3 }}>{p.totalCount} items</span>
            <select value={p.pageSize} onChange={e => { p.onPageSizeChange(Number(e.target.value)); p.onResetPage(); }} style={{ padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.05)', color: T.tx2, cursor: 'pointer' }}>
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
