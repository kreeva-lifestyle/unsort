// PO list — search + collapsible filters, desktop table, mobile cards, pager.
// Parent owns all state & data; this is a pure presentational component.
import { T, S } from '../../lib/theme';
import Empty from '../ui/Empty';
import SwipeRow from '../ui/SwipeRow';
import { SkeletonRows } from '../ui/Skeleton';
import { PO_TYPE_LABELS, PO_STATUS_LABELS, PO_STATUSES } from '../../types/database';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

export type PORow = PurchaseOrder & { purchase_order_items?: Array<Pick<PurchaseOrderItem, 'quantity' | 'received_qty'>> };

interface Props {
  pos: PORow[];
  loading: boolean;
  totalCount: number;
  statusColors: Record<string, { bg: string; color: string }>;
  search: string;
  onSearchChange: (v: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  pageSize: number;
  onPageSizeChange: (v: number) => void;
  onClearFilters: () => void;
  onResetPage: () => void;
  onOpenEmpty: () => void;
  canCreate: boolean;
  onOpenDetail: (po: PORow) => void;
  onPrint: (po: PORow) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number | ((prev: number) => number)) => void;
}

const StatusPill = ({ status, sc }: { status: string; sc: { bg: string; color: string } }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color }} />
    {PO_STATUS_LABELS[status as keyof typeof PO_STATUS_LABELS] || status}
  </span>
);

const progress = (po: PORow) => {
  const its = po.purchase_order_items || [];
  const ordered = its.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const received = its.reduce((s, it) => s + Number(it.received_qty || 0), 0);
  return { count: its.length, ordered, received, pct: ordered > 0 ? Math.min(100, Math.round(received / ordered * 100)) : 0 };
};

export default function POList(p: Props) {
  const filterActive = p.statusFilter || p.typeFilter || p.dateFrom || p.dateTo;
  return (
    <>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input type="text" value={p.search} onChange={e => { p.onSearchChange(e.target.value); p.onResetPage(); }} placeholder="Search vendor or PO #..." style={{ ...S.fSearch, background: 'transparent', border: 'none', width: '100%' }} />
        </div>
        <button onClick={p.onToggleFilters} style={{ ...S.btnGhost, color: p.showFilters || filterActive ? T.ac2 : T.tx3, borderColor: p.showFilters || filterActive ? T.ac3 : T.bd2, background: p.showFilters ? T.ac3 : 'rgba(255,255,255,0.03)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
          Filters{filterActive ? ` (${[p.statusFilter, p.typeFilter, p.dateFrom, p.dateTo].filter(Boolean).length})` : ''}
        </button>
      </div>

      {p.showFilters && (
        <div style={{ marginBottom: 8, padding: 14, background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div>
              <label style={S.fLabel}>Status</label>
              <select value={p.statusFilter} onChange={e => { p.onStatusFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
                <option value="">All</option>{PO_STATUSES.map(s => <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={S.fLabel}>Type</label>
              <select value={p.typeFilter} onChange={e => { p.onTypeFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
                <option value="">All</option>{(Object.keys(PO_TYPE_LABELS) as (keyof typeof PO_TYPE_LABELS)[]).map(t => <option key={t} value={t}>{PO_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div><label style={S.fLabel}>From</label><input type="date" value={p.dateFrom} onChange={e => { p.onDateFromChange(e.target.value); p.onResetPage(); }} style={{ ...S.fDate, width: '100%' }} /></div>
            <div><label style={S.fLabel}>To</label><input type="date" value={p.dateTo} onChange={e => { p.onDateToChange(e.target.value); p.onResetPage(); }} style={{ ...S.fDate, width: '100%' }} /></div>
          </div>
          {filterActive && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button onClick={p.onClearFilters} style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3, border: `1px solid ${T.bd2}`, background: T.glass1 }}>Clear filters</button></div>}
        </div>
      )}

      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{p.totalCount} record{p.totalCount === 1 ? '' : 's'}</div>

      {p.loading && <SkeletonRows rows={4} />}
      {!p.loading && p.pos.length === 0 && <Empty icon="clipboard" title="No purchase orders yet" message="Raise your first PO — pick a vendor, add the items you're buying, and track them from draft through to fully received." cta={p.canCreate ? '+ New Purchase Order' : undefined} onCta={p.canCreate ? p.onOpenEmpty : undefined} />}

      {/* Desktop table */}
      {!p.loading && p.pos.length > 0 && <div className="desktop-only" style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '9%' }} /><col style={{ width: '22%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: 44 }} /></colgroup>
            <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>
              <th style={S.thStyle}>PO #</th><th style={S.thStyle}>Vendor</th><th style={S.thStyle}>Type</th><th style={S.thStyle}>Items</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Total</th><th style={S.thStyle}>Received</th><th style={{ ...S.thStyle, textAlign: 'center' }}>Status</th><th style={S.thStyle} />
            </tr></thead>
            <tbody>
              {p.pos.map(po => {
                const sc = p.statusColors[po.status] || p.statusColors.draft;
                const pr = progress(po);
                return (
                  <tr key={po.id} onClick={() => p.onOpenDetail(po)} style={{ borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }} onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,.03)')} onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                    <td style={S.tdStyle}><span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.ac2 }}>#{po.po_number}</span><div style={{ fontSize: 9, color: T.tx3, marginTop: 1 }}>{po.po_date ? new Date(po.po_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div></td>
                    <td style={S.tdStyle}><div style={{ fontWeight: 600, fontSize: 13, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendor_name}</div>{po.vendor_phone && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{po.vendor_phone}</div>}</td>
                    <td style={S.tdStyle}><span style={{ fontSize: 12, color: T.tx2 }}>{PO_TYPE_LABELS[po.po_type] || po.po_type}</span></td>
                    <td style={S.tdStyle}><span style={{ fontSize: 12, color: T.tx2 }}>{pr.count} item{pr.count === 1 ? '' : 's'}</span></td>
                    <td style={{ ...S.tdStyle, textAlign: 'right' }}><span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(po.grand_total || 0).toLocaleString('en-IN')}</span></td>
                    <td style={S.tdStyle}>
                      {(po.status === 'partially_received' || po.status === 'completed') ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.glass2, overflow: 'hidden', minWidth: 30 }}><div style={{ width: `${pr.pct}%`, height: '100%', background: pr.pct >= 100 ? T.gr : T.yl }} /></div>
                          <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{pr.pct}%</span>
                        </div>
                      ) : <span style={{ fontSize: 11, color: T.tx3 }}>—</span>}
                    </td>
                    <td style={{ ...S.tdStyle, textAlign: 'center' }}><StatusPill status={po.status} sc={sc} /></td>
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
                  <span>{pr.count} item{pr.count === 1 ? '' : 's'}</span>
                  {po.po_date && <><span>·</span><span>{new Date(po.po_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span></>}
                  {(po.status === 'partially_received' || po.status === 'completed') && <><span>·</span><span style={{ color: pr.pct >= 100 ? T.gr : T.yl }}>{pr.pct}% received</span></>}
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
