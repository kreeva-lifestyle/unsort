// PO list — search + collapsible filters, desktop table, mobile cards, pager.
// Parent owns all state & data; this is a pure presentational component.
import { T, S } from '../../lib/theme';
import Empty from '../ui/Empty';
import SwipeRow from '../ui/SwipeRow';
import { SkeletonRows } from '../ui/Skeleton';
import { PO_TYPE_LABELS } from '../../types/database';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';
import POFilters, { type POFiltersProps } from './POFilters';
import { StatusPill, itemsLabel, pendingDays, PendingSince, progress } from './poListParts';

export type PORow = PurchaseOrder & {
  purchase_order_items?: Array<Pick<PurchaseOrderItem, 'sku' | 'item_name' | 'fabric_code' | 'quantity' | 'received_qty'>>;
  /** The costing this PO was raised from (embedded via costing_product_id). */
  costing_products?: { sku: string } | null;
};

interface Props extends POFiltersProps {
  pos: PORow[];
  loading: boolean;
  totalCount: number;
  statusColors: Record<string, { bg: string; color: string }>;
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
}

export default function POList(p: Props) {
  const filterActive = p.statusFilter || p.typeFilter || p.creatorFilter || p.dateFrom || p.dateTo;
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

      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{p.totalCount} record{p.totalCount === 1 ? '' : 's'}</div>

      {p.loading && <SkeletonRows rows={4} />}
      {!p.loading && p.pos.length === 0 && <Empty icon="clipboard" title="No purchase orders yet" message="Raise your first PO — pick a vendor, add the items you're buying, and track them from draft through to fully received." cta={p.canCreate ? '+ New Purchase Order' : undefined} onCta={p.canCreate ? p.onOpenEmpty : undefined} />}

      {/* Desktop table */}
      {!p.loading && p.pos.length > 0 && <div className="desktop-only" style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '9%' }} /><col style={{ width: '18%' }} /><col style={{ width: '10%' }} /><col style={{ width: '17%' }} /><col style={{ width: '11%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: 44 }} /></colgroup>
            <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>
              <th style={S.thStyle}>PO #</th><th style={S.thStyle}>Vendor</th><th style={S.thStyle}>Type</th><th style={S.thStyle}>Items</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Total</th><th style={S.thStyle}>Received</th><th style={{ ...S.thStyle, textAlign: 'center' }}>Status</th><th style={S.thStyle} />
            </tr></thead>
            <tbody>
              {p.pos.map(po => {
                const sc = p.statusColors[po.status] || p.statusColors.draft;
                const pr = progress(po);
                return (
                  <tr key={po.id} onClick={() => p.onOpenDetail(po)} style={{ borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }} onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'oklch(0.55 0.22 265 / .03)')} onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                    <td style={S.tdStyle}><span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.ac2 }}>#{po.po_number}</span><div style={{ fontSize: 9, color: T.tx3, marginTop: 1 }}>{po.po_date ? new Date(po.po_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div></td>
                    <td style={S.tdStyle}><div style={{ fontWeight: 600, fontSize: 13, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendor_name}</div>{po.vendor_phone && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{po.vendor_phone}</div>}</td>
                    <td style={S.tdStyle}><span style={{ fontSize: 12, color: T.tx2 }}>{PO_TYPE_LABELS[po.po_type] || po.po_type}</span></td>
                    <td style={S.tdStyle}>{(() => { const il = itemsLabel(po); return (<>
                      <div style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{il.head}</div>
                      {il.sub && <div style={{ fontSize: 9, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{il.sub}</div>}
                      {po.for_pieces != null && po.for_pieces > 0 && <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, whiteSpace: 'nowrap' }}>for {po.for_pieces} pcs</div>}
                      {po.lump_sum && <div style={{ fontSize: 9, color: T.tx3, whiteSpace: 'nowrap' }}>lump sum</div>}
                    </>); })()}</td>
                    <td style={{ ...S.tdStyle, textAlign: 'right' }}><span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(po.grand_total || 0).toLocaleString('en-IN')}</span></td>
                    <td style={S.tdStyle}>
                      {(po.status === 'partially_received' || po.status === 'completed') ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.glass2, overflow: 'hidden', minWidth: 30 }}><div style={{ width: `${pr.pct}%`, height: '100%', background: pr.pct >= 100 ? T.gr : T.yl }} /></div>
                          <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{pr.pct}%</span>
                        </div>
                      ) : <span style={{ fontSize: 11, color: T.tx3 }}>—</span>}
                    </td>
                    <td style={{ ...S.tdStyle, textAlign: 'center' }}><StatusPill status={po.status} sc={sc} /><PendingSince po={po} /></td>
                    <td style={{ ...S.tdStyle, padding: '11px 8px', textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); p.onPrint(po); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, opacity: 0.5 }} title="Print" aria-label="Print">
                        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Mobile cards */}
      {!p.loading && p.pos.length > 0 && <div className="mobile-only" style={{ flexDirection: 'column', gap: 6, width: '100%' }}>
        {p.pos.map((po, i) => {
          const sc = p.statusColors[po.status] || p.statusColors.draft;
          const pr = progress(po);
          return (
            <SwipeRow key={po.id} actions={[{ label: 'Print', color: '#3B82F6', onClick: () => p.onPrint(po) }]} hint={i === 0} hintKey="po">
              <div onClick={() => p.onOpenDetail(po)} style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${T.bd2}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>#{po.po_number}</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendor_name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(po.grand_total || 0).toLocaleString('en-IN')}</div>
                    <div style={{ marginTop: 3 }}><StatusPill status={po.status} sc={sc} /></div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.tx3, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{PO_TYPE_LABELS[po.po_type] || po.po_type}</span><span>·</span>
                  {(() => { const il = itemsLabel(po); return <span style={{ color: T.tx2 }}>{il.head}{il.sub ? ` · ${il.sub}` : ''}</span>; })()}
                  {po.for_pieces != null && po.for_pieces > 0 && <><span>·</span><span>for {po.for_pieces} pcs</span></>}
                  {po.lump_sum && <><span>·</span><span>lump sum</span></>}
                  {po.po_date && <><span>·</span><span>{new Date(po.po_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span></>}
                  {(po.status === 'partially_received' || po.status === 'completed') && <><span>·</span><span style={{ color: pr.pct >= 100 ? T.gr : T.yl }}>{pr.pct}% received</span></>}
                  {pendingDays(po) !== null && <><span>·</span><PendingSince po={po} inline /></>}
                </div>
              </div>
            </SwipeRow>
          );
        })}
      </div>}

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
