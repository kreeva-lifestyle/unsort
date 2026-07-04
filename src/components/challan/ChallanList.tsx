// Challan list — search/filter row + collapsible filter bar + per-row table.
// Extracted from CashChallan.tsx; parent owns state & action callbacks.
import { T, S } from '../../lib/theme';
import Empty from '../ui/Empty';
import SwipeRow from '../ui/SwipeRow';
import { SkeletonRows } from '../ui/Skeleton';
import type { CashChallan, CashChallanItem as DbCashChallanItem } from '../../types/database';

type Challan = Omit<CashChallan, 'created_at' | 'updated_at'> & {
  created_at: string;
  updated_at: string;
  cash_challan_items?: Array<Partial<DbCashChallanItem>>;
};

interface Props {
  challans: Challan[];
  loading: boolean;
  totalCount: number;
  statusColors: Record<string, { bg: string; color: string }>;
  // Search + filters
  search: string;
  onSearchChange: (v: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  tagFilter: string;
  onTagFilterChange: (v: string) => void;
  allTags: string[];
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  pageSize: number;
  onPageSizeChange: (v: number) => void;
  onClearFilters: () => void;
  onExport: () => void;
  onResetPage: () => void;
  // Bulk
  bulkMode: boolean;
  onToggleBulkMode: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  // Row actions
  onOpenEmpty: () => void;
  onOpenDetail: (c: Challan) => void;
  onPrint: (c: Challan) => void;
  onRemind: (c: Challan) => void;
  onCreateReturn: (c: Challan) => void;
  onVoid: (c: Challan) => void;
  // Inventory deducted
  invFilter: string;
  onInvFilterChange: (v: string) => void;
  onToggleInventoryDeducted: (id: string, value: boolean) => void;
  // Pagination
  page: number;
  totalPages: number;
  onPageChange: (p: number | ((prev: number) => number)) => void;
}

export default function ChallanList(p: Props) {
  const filterActive = p.statusFilter || p.tagFilter || p.dateFrom || p.dateTo || p.invFilter;
  const idToNum = new Map(p.challans.map(c => [c.id, c.challan_number]));
  const srcNum = (c: Challan) => c.source_challan_id ? idToNum.get(c.source_challan_id) ?? null : null;
  return (
    <>
      <div className="challan-filters" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input type="text" value={p.search} onChange={e => { p.onSearchChange(e.target.value); p.onResetPage(); }} placeholder="Search name or #..." style={{ ...S.fSearch, background: 'transparent', border: 'none', width: '100%' }} />
        </div>
        <div className="challan-filter-btns" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={p.onToggleFilters} style={{ ...S.btnGhost, color: p.showFilters || filterActive ? T.ac2 : T.tx3, borderColor: p.showFilters || filterActive ? T.ac3 : T.bd2, background: p.showFilters ? T.ac3 : 'rgba(255,255,255,0.03)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filters{filterActive ? ` (${[p.statusFilter, p.tagFilter, p.dateFrom, p.dateTo, p.invFilter].filter(Boolean).length})` : ''}
          </button>
          <button onClick={p.onExport} style={{ ...S.btnGhost, color: T.gr, borderColor: 'rgba(34,197,94,.25)', background: 'rgba(34,197,94,.06)' }}>Export</button>
          <button onClick={p.onToggleBulkMode} style={{ ...S.btnGhost, color: p.bulkMode ? T.ac2 : T.tx3, borderColor: p.bulkMode ? T.ac3 : T.bd2, background: p.bulkMode ? T.ac3 : 'rgba(255,255,255,0.03)' }}>{p.bulkMode ? 'Cancel' : '☑ Select'}</button>
        </div>
      </div>

      {p.showFilters && (
        <div className="challan-filter-row" style={{ marginBottom: 8, padding: 14, background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg }}>
          <div className="challan-filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div>
              <label style={S.fLabel}>Status</label>
              <select value={p.statusFilter} onChange={e => { p.onStatusFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
                <option value="">All</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="voided">Voided</option>
              </select>
            </div>
            {p.allTags.length > 0 && (
              <div>
                <label style={S.fLabel}>Tag</label>
                <select value={p.tagFilter} onChange={e => { p.onTagFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
                  <option value="">All</option>{p.allTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={S.fLabel}>From</label>
              <input type="date" value={p.dateFrom} onChange={e => { p.onDateFromChange(e.target.value); p.onResetPage(); }} style={{ ...S.fDate, width: '100%' }} />
            </div>
            <div>
              <label style={S.fLabel}>To</label>
              <input type="date" value={p.dateTo} onChange={e => { p.onDateToChange(e.target.value); p.onResetPage(); }} style={{ ...S.fDate, width: '100%' }} />
            </div>
            <div>
              <label style={S.fLabel}>Inventory</label>
              <select value={p.invFilter} onChange={e => { p.onInvFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
                <option value="">All</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
            <div>
              <label style={S.fLabel}>Per page</label>
              <select value={p.pageSize} onChange={e => { p.onPageSizeChange(Number(e.target.value)); p.onResetPage(); }} style={{ padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.05)', color: T.tx2, cursor: 'pointer' }}>
                <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </div>
          </div>
          {filterActive && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={p.onClearFilters} style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3, border: `1px solid ${T.bd2}`, background: T.glass1 }}>Clear filters</button>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{p.totalCount} records</div>

      {p.loading && <SkeletonRows rows={4} />}
      {!p.loading && p.challans.length === 0 && <div style={{ padding: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}><Empty icon="receipt" title="No challans yet" message="Create your first challan — invoice customers, record payments, and track outstanding amounts all from one place." cta="+ New Challan" onCta={p.onOpenEmpty} /></div>}

      {/* ── Desktop table ────────────────────────────────────────────── */}
      {!p.loading && p.challans.length > 0 && <div className="desktop-only" style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960, tableLayout: 'fixed' }}>
          <colgroup>
            {p.bulkMode && <col style={{ width: 36 }} />}
            <col style={{ width: '7%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>
            {p.bulkMode && <th style={{ ...S.thStyle, padding: '11px 8px' }} />}
            <th style={S.thStyle}>#</th>
            <th style={S.thStyle}>Customer</th>
            <th style={S.thStyle}>Items</th>
            <th style={S.thStyle}>Age</th>
            <th style={{ ...S.thStyle, textAlign: 'center' }}>Inv</th>
            <th style={{ ...S.thStyle, textAlign: 'right' }}>Total</th>
            <th style={{ ...S.thStyle, textAlign: 'right' }}>Balance</th>
            <th style={{ ...S.thStyle, textAlign: 'center' }}>Status</th>
            <th style={S.thStyle} />
          </tr></thead>
          <tbody>
            {p.challans.map(c => {
              const sc = p.statusColors[c.status] || p.statusColors.unpaid;
              const items = c.cash_challan_items || [];
              const itemCount = items.length;
              const totalQty = items.reduce((s, it) => s + (it.quantity || 0), 0);
              const skuPreview = items.map(it => it.sku).filter(Boolean).join(', ');
              const isRet = !!c.is_return;
              const isSelected = p.selectedIds.has(c.id);
              const canSelect = c.status !== 'voided';
              const paid = Number(c.amount_paid || 0);
              const due = Math.max(0, Number(c.total || 0) - paid);
              return (
                <tr key={c.id} onClick={() => { if (p.bulkMode) { if (canSelect) p.onToggleSelect(c.id); } else p.onOpenDetail(c); }} style={{ borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,.06)' : 'transparent', transition: 'background .1s' }} onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,.03)'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(99,102,241,.06)' : 'transparent'; }}>
                  {p.bulkMode && <td style={{ ...S.tdStyle, padding: '11px 8px' }}><div onClick={e => { e.stopPropagation(); if (canSelect) p.onToggleSelect(c.id); }} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${canSelect ? (isSelected ? T.ac : T.bd2) : T.bd}`, background: isSelected ? T.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSelect ? 'pointer' : 'not-allowed', opacity: canSelect ? 1 : 0.3 }}>{isSelected && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: '#fff', strokeWidth: 3 }}><polyline points="20 6 9 17 4 12" /></svg>}</div></td>}
                  <td style={S.tdStyle}>
                    <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.ac2 }}>#{c.challan_number}</span>
                    <div style={{ fontSize: 9, color: T.tx3, marginTop: 1 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                  </td>
                  <td style={S.tdStyle}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.tx }}>{c.customer_name}</div>
                    {c.customer_phone && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>+91 {c.customer_phone.replace(/^91/, '').replace(/(\d{5})(\d{5})/, '$1 $2')}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      {isRet && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>Return{srcNum(c) ? ` of #${srcNum(c)}` : ''}</span>}
                      {(c.tags || []).map(t => <span key={t} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: T.ac3, color: T.ac2, fontWeight: 600 }}>{t}</span>)}
                      {c.notes && <span title={c.notes} style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.4 }}><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.tx3, strokeWidth: 2 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg></span>}
                    </div>
                  </td>
                  <td style={S.tdStyle}>
                    <span style={{ fontSize: 12, color: T.tx2 }}>{itemCount} item{itemCount !== 1 ? 's' : ''}{totalQty > itemCount ? ` · ${totalQty} qty` : ''}</span>
                    {skuPreview && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skuPreview}</div>}
                  </td>
                  <td style={S.tdStyle}>
                    <span style={{ fontSize: 12, color: T.tx2 }}>{(() => { const d = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000); return d === 0 ? 'Today' : d === 1 ? '1d ago' : `${d}d ago`; })()}</span>
                  </td>
                  <td style={{ ...S.tdStyle, textAlign: 'center' }}>
                    {c.status !== 'voided' && <button onClick={e => { e.stopPropagation(); p.onToggleInventoryDeducted(c.id, !c.inventory_deducted); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, border: `1px solid ${c.inventory_deducted ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, background: c.inventory_deducted ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.06)', color: c.inventory_deducted ? T.gr : T.re, fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', letterSpacing: 0.3 }} aria-label={c.inventory_deducted ? (c.is_return ? 'Inventory added back' : 'Inventory deducted') : 'Inventory pending'}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.inventory_deducted ? T.gr : T.re }} />
                      {c.inventory_deducted ? (c.is_return ? 'Added' : 'Deducted') : 'Pending'}
                    </button>}
                  </td>
                  <td style={{ ...S.tdStyle, textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: c.status === 'voided' ? T.tx3 : isRet ? T.re : T.tx, textDecoration: c.status === 'voided' ? 'line-through' : 'none' }}>{isRet ? '−' : ''}₹{Number(c.total).toLocaleString('en-IN')}</div>
                    {c.payment_mode && c.status !== 'voided' && <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' }}>{c.payment_mode}</div>}
                  </td>
                  <td style={{ ...S.tdStyle, textAlign: 'right' }}>
                    {due > 0 && c.status !== 'voided' ? <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.re }}>₹{due.toLocaleString('en-IN')}</span> : c.status === 'paid' ? <span style={{ fontSize: 11, color: T.gr, fontWeight: 500 }}>Settled</span> : null}
                  </td>
                  <td style={{ ...S.tdStyle, textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color }} />
                      {c.status === 'paid' ? 'Paid' : c.status === 'unpaid' ? 'Unpaid' : c.status === 'partial' ? 'Partial' : 'Voided'}
                    </span>
                  </td>
                  <td style={{ ...S.tdStyle, padding: '11px 8px' }}>
                    <div className="challan-row-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={e => { e.stopPropagation(); p.onPrint(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, opacity: 0.5 }} title="Print" aria-label="Print">
                        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                      </button>
                      {(c.status === 'unpaid' || c.status === 'partial') && <button onClick={e => { e.stopPropagation(); p.onRemind(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, opacity: 0.6 }} title="Send WhatsApp reminder" aria-label="Remind">
                        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2 }}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
                      </button>}
                      {!isRet && c.status !== 'voided' && <button onClick={e => { e.stopPropagation(); p.onCreateReturn(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, opacity: 0.6 }} title="Create return" aria-label="Create return">
                        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5H8" /></svg>
                      </button>}
                      {c.status !== 'voided' && (isRet || c.status !== 'paid') && <button onClick={e => { e.stopPropagation(); p.onVoid(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, opacity: 0.4 }} title="Void" aria-label="Void">
                        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>}

      {/* ── Mobile cards ──────────────────────────────────────────────── */}
      {!p.loading && p.challans.length > 0 && <div className="mobile-only" style={{ flexDirection: 'column', gap: 6, width: '100%' }}>
        {p.challans.map((c, i) => {
          const sc = p.statusColors[c.status] || p.statusColors.unpaid;
          const items = c.cash_challan_items || [];
          const itemCount = items.length;
          const isRet = !!c.is_return;
          const isSelected = p.selectedIds.has(c.id);
          const canSelect = c.status !== 'voided';
          const paid = Number(c.amount_paid || 0);
          const due = Math.max(0, Number(c.total || 0) - paid);
          const swipeActions = [
            { label: 'Print', color: '#3B82F6', onClick: () => p.onPrint(c) },
            ...((c.status === 'unpaid' || c.status === 'partial') ? [{ label: 'Remind', color: '#22C55E', onClick: () => p.onRemind(c) }] : []),
            ...(c.status !== 'voided' && (c.is_return || c.status !== 'paid') ? [{ label: 'Void', color: '#EF4444', onClick: () => p.onVoid(c) }] : []),
          ];
          return (
            <SwipeRow key={c.id} actions={swipeActions} hint={i === 0} hintKey="challan">
              <div onClick={() => { if (p.bulkMode) { if (canSelect) p.onToggleSelect(c.id); } else p.onOpenDetail(c); }} style={{ background: isSelected ? 'rgba(99,102,241,.08)' : 'rgba(255,255,255,0.025)', border: `1px solid ${isSelected ? T.ac + '44' : T.bd2}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }}>
                {/* Top: number + name left, total + status right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {p.bulkMode && <div onClick={e => { e.stopPropagation(); if (canSelect) p.onToggleSelect(c.id); }} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${canSelect ? (isSelected ? T.ac : T.bd2) : T.bd}`, background: isSelected ? T.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canSelect ? 'pointer' : 'not-allowed', opacity: canSelect ? 1 : 0.3 }}>{isSelected && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: '#fff', strokeWidth: 3 }}><polyline points="20 6 9 17 4 12" /></svg>}</div>}
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>#{c.challan_number}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: c.status === 'voided' ? T.tx3 : isRet ? T.re : T.tx, textDecoration: c.status === 'voided' ? 'line-through' : 'none' }}>{isRet ? '−' : ''}₹{Number(c.total).toLocaleString('en-IN')}</div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: sc.bg, color: sc.color, marginTop: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.color }} />
                      {c.status === 'paid' ? 'Paid' : c.status === 'unpaid' ? 'Unpaid' : c.status === 'partial' ? 'Partial' : 'Voided'}
                    </span>
                  </div>
                </div>
                {/* Meta: items · age · payment mode · INV */}
                <div style={{ fontSize: 11, color: T.tx3, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{(() => { const d = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000); return d === 0 ? 'Today' : d === 1 ? '1d ago' : `${d}d ago`; })()}</span>
                  {c.payment_mode && c.status !== 'voided' && <><span>·</span><span>{c.payment_mode}</span></>}
                  {c.status !== 'voided' && <><span>·</span><button className="inv-chip" onClick={e => { e.stopPropagation(); p.onToggleInventoryDeducted(c.id, !c.inventory_deducted); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, border: `1px solid ${c.inventory_deducted ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, background: c.inventory_deducted ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.06)', color: c.inventory_deducted ? T.gr : T.re, fontSize: 10, fontWeight: 600, cursor: 'pointer' }} aria-label={c.inventory_deducted ? (c.is_return ? 'Inventory added back' : 'Inventory deducted') : 'Inventory pending'}><span style={{ width: 5, height: 5, borderRadius: '50%', background: c.inventory_deducted ? T.gr : T.re }} />{c.inventory_deducted ? (c.is_return ? 'Added' : 'Deducted') : 'Pending'}</button></>}
                  {isRet && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase', marginLeft: 2 }}>Return{srcNum(c) ? ` of #${srcNum(c)}` : ''}</span>}
                  {c.notes && <span style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.4, marginLeft: 2 }} title={c.notes}><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.tx3, strokeWidth: 2 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg></span>}
                </div>
                {/* Balance due */}
                {due > 0 && c.status !== 'voided' && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: T.tx3 }}>Balance due</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.re }}>₹{due.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            </SwipeRow>
          );
        })}
      </div>}

      {p.totalPages > 0 && (
        <div className="pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {p.totalPages > 1 && <>
              <button onClick={() => p.onPageChange((prev: number) => Math.max(0, prev - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: p.page === 0 ? 0.3 : 1, pointerEvents: p.page === 0 ? 'none' : 'auto', cursor: 'pointer' } as React.CSSProperties} aria-label="Previous page" disabled={p.page === 0}>Prev</button>
              <span style={{ fontSize: 10, color: T.tx3 }}>{p.page + 1} / {p.totalPages}</span>
              <button onClick={() => p.onPageChange((prev: number) => Math.min(p.totalPages - 1, prev + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: p.page >= p.totalPages - 1 ? 0.3 : 1, pointerEvents: p.page >= p.totalPages - 1 ? 'none' : 'auto', cursor: 'pointer' } as React.CSSProperties} aria-label="Next page" disabled={p.page >= p.totalPages - 1}>Next</button>
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
