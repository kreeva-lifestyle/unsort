// Challan list — search/filter row + collapsible filter bar + per-row table.
// Extracted from CashChallan.tsx; parent owns state & action callbacks.
import { T } from '../../lib/theme';
import Empty from '../ui/Empty';
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
}

export default function ChallanList(p: Props) {
  const filterActive = p.statusFilter || p.tagFilter || p.dateFrom || p.dateTo;
  return (
    <>
      <div className="challan-filters" style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" value={p.search} onChange={e => { p.onSearchChange(e.target.value); p.onResetPage(); }} placeholder="Search name or #..." style={{ flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '8px 12px', outline: 'none', height: 36, boxSizing: 'border-box' }} />
        <div className="challan-filter-btns" style={{ display: 'flex', gap: 6 }}>
          <button onClick={p.onToggleFilters} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${p.showFilters || filterActive ? T.ac + '44' : T.bd2}`, background: p.showFilters ? 'rgba(99,102,241,.08)' : 'rgba(255,255,255,0.03)', color: p.showFilters || filterActive ? T.ac2 : T.tx3, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filters{filterActive ? ` (${[p.statusFilter, p.tagFilter, p.dateFrom, p.dateTo].filter(Boolean).length})` : ''}
          </button>
          <button onClick={p.onExport} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)', color: T.gr, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Export</button>
          <button onClick={p.onToggleBulkMode} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${p.bulkMode ? T.ac + '44' : T.bd2}`, background: p.bulkMode ? 'rgba(99,102,241,.1)' : 'rgba(255,255,255,0.03)', color: p.bulkMode ? T.ac2 : T.tx3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{p.bulkMode ? 'Cancel' : '☑ Select'}</button>
        </div>
      </div>

      {p.showFilters && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 6 }}>
          <select value={p.statusFilter} onChange={e => { p.onStatusFilterChange(e.target.value); p.onResetPage(); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }}>
            <option value="">All Status</option><option value="draft">Draft</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="voided">Voided</option>
          </select>
          {p.allTags.length > 0 && <select value={p.tagFilter} onChange={e => { p.onTagFilterChange(e.target.value); p.onResetPage(); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }}>
            <option value="">All Tags</option>{p.allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: T.tx3, fontWeight: 600 }}>From</span>
            <input type="date" value={p.dateFrom} onChange={e => { p.onDateFromChange(e.target.value); p.onResetPage(); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '4px 6px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: T.tx3, fontWeight: 600 }}>To</span>
            <input type="date" value={p.dateTo} onChange={e => { p.onDateToChange(e.target.value); p.onResetPage(); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '4px 6px', outline: 'none' }} />
          </div>
          <select value={p.pageSize} onChange={e => { p.onPageSizeChange(Number(e.target.value)); p.onResetPage(); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '5px 6px', outline: 'none', width: 48 }}>
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select>
          {filterActive && <button onClick={p.onClearFilters} style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>Clear all</button>}
        </div>
      )}

      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{p.totalCount} records</div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        {p.loading && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading...</div>}
        {!p.loading && p.challans.length === 0 && <div style={{ padding: 14 }}><Empty icon="🧾" title="No challans yet" message="Create your first challan — invoice customers, record payments, and track outstanding amounts all from one place." cta="+ New Challan" onCta={p.onOpenEmpty} /></div>}
        {p.challans.map(c => {
          const sc = p.statusColors[c.status] || p.statusColors.unpaid;
          const skus = (c.cash_challan_items || []).map(i => i.sku).filter(Boolean).join(', ');
          const pendingDays = (!c.is_return && (c.status === 'unpaid' || c.status === 'partial')) ? Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) : 0;
          const isRet = !!c.is_return;
          const isSelected = p.selectedIds.has(c.id);
          const canSelect = c.status !== 'voided' && c.status !== 'draft';
          const rowBg = isSelected ? 'rgba(99,102,241,.08)' : isRet ? 'rgba(239,68,68,.04)' : undefined;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: rowBg, transition: 'background .15s' }} onClick={() => { if (p.bulkMode) { if (canSelect) p.onToggleSelect(c.id); } else { p.onOpenDetail(c); } }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isRet ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.02)'; }} onMouseLeave={e => { e.currentTarget.style.background = (isSelected ? 'rgba(99,102,241,.08)' : isRet ? 'rgba(239,68,68,.04)' : '') }}>
              {p.bulkMode && <div onClick={e => { e.stopPropagation(); if (canSelect) p.onToggleSelect(c.id); }} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${canSelect ? (isSelected ? T.ac : T.bd2) : T.bd}`, background: isSelected ? T.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canSelect ? 'pointer' : 'not-allowed', opacity: canSelect ? 1 : 0.3 }}>
                {isSelected && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: '#fff', strokeWidth: 3 }}><polyline points="20 6 9 17 4 12" /></svg>}
              </div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{c.challan_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name}</span>
                  {isRet && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>↩ Return</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</span>
                  {pendingDays > 0 && <span style={{ fontSize: 8, color: T.re, fontWeight: 600 }}>({pendingDays}d pending)</span>}
                  {(c.tags || []).map(t => <span key={t} style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: 'rgba(99,102,241,.08)', color: T.ac2 }}>{t}</span>)}
                </div>
                {skus && <div style={{ fontSize: 9, fontFamily: T.mono, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skus}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: isRet ? T.re : T.tx }}>{isRet ? '−' : ''}₹{Number(c.total).toLocaleString('en-IN')}</div>
                {(c.status === 'paid' || c.status === 'partial') && Number(c.amount_paid || 0) > 0 && (() => {
                  const paid = Number(c.amount_paid);
                  const due = Math.max(0, Number(c.total) - paid);
                  return (
                    <div style={{ fontSize: 9, fontFamily: T.mono, marginTop: 2, color: c.status === 'paid' ? T.gr : T.yl }}>
                      ₹{paid.toLocaleString('en-IN')} paid{c.status === 'partial' && due > 0 ? ` · ₹${due.toLocaleString('en-IN')} due` : ''}
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); p.onPrint(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                </button>
                {(c.status === 'unpaid' || c.status === 'partial') && <button onClick={e => { e.stopPropagation(); p.onRemind(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }} title="Send WhatsApp reminder">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2 }}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
                </button>}
                {!isRet && c.status !== 'voided' && c.status !== 'draft' && <button onClick={e => { e.stopPropagation(); p.onCreateReturn(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }} title="Create return for this challan">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5H8" /></svg>
                </button>}
                {c.status !== 'voided' && <button onClick={e => { e.stopPropagation(); p.onVoid(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }} title="Void">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
