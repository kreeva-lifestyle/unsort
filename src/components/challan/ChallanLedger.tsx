// Customer ledger list + detail — extracted from CashChallan.tsx for
// god-component split (audit P0). Parent owns the data fetch; this
// component just renders.
import { T, S } from '../../lib/theme';
import type { CashChallan } from '../../types/database';

type Challan = Omit<CashChallan, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string };

export type LedgerCustomer = { name: string; total: number; paid: number; outstanding: number; count: number; aging: { current: number; d30: number; d60: number; d90plus: number } };

export default function ChallanLedger({
  detailName,
  customers,
  detailChallans,
  search,
  onSearchChange,
  onSearchSubmit,
  onOpenCustomer,
  onOpenChallan,
  onExportPdf,
  onLoadMore,
  statusColors,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onDateApply,
}: {
  detailName: string | null;
  customers: LedgerCustomer[];
  detailChallans: Challan[];
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: (v: string) => void;
  onOpenCustomer: (name: string) => void;
  onOpenChallan: (c: Challan) => void;
  onExportPdf: (name: string) => void;
  onLoadMore: () => void;
  statusColors: Record<string, { bg: string; color: string }>;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onDateApply: (from?: string, to?: string) => void;
}) {
  // Detail screen
  if (detailName) {
    const cust = customers.find(c => c.name === detailName);
    return (
      <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>{detailName}</span>
            {cust && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{dateFrom || dateTo ? `${detailChallans.length} in range` : `${cust.count} challans`} | Outstanding: <span style={{ color: cust.outstanding > 0 ? T.re : T.gr, fontWeight: 600 }}>₹{cust.outstanding.toLocaleString('en-IN')}</span></div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onExportPdf(detailName)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer', fontFamily: T.sans }}>Export PDF</button>
          </div>
        </div>
        <div className="challan-ledger-dates" style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 8, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} style={S.fDate} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 8, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase' }}>To</label>
            <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} style={S.fDate} />
          </div>
          <button onClick={() => onDateApply()} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', height: 30 }}>Apply</button>
          {(dateFrom || dateTo) && <button onClick={() => { onDateFromChange(''); onDateToChange(''); onDateApply('', ''); }} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer', height: 30 }}>Clear</button>}
        </div>
        {cust && (
          <div className="challan-ledger-kpis" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 7, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 2 }}>Total Billed</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.sora, color: T.ac2 }}>₹{cust.total.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.12)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 7, color: T.gr, letterSpacing: 1, textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 2 }}>Paid</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.sora, color: T.gr }}>₹{cust.paid.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: cust.outstanding > 0 ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)', border: `1px solid ${cust.outstanding > 0 ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)'}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 7, color: cust.outstanding > 0 ? T.re : T.gr, letterSpacing: 1, textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 2 }}>Outstanding</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.sora, color: cust.outstanding > 0 ? T.re : T.gr }}>₹{cust.outstanding.toLocaleString('en-IN')}</div>
            </div>
          </div>
        )}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {detailChallans.map(c => {
            const sc = statusColors[c.status] || statusColors.unpaid;
            const isRet = !!c.is_return;
            return (
              <div key={c.id} onClick={() => onOpenChallan(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{c.challan_number}</span>
                    <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'uppercase' as const }}>{c.status}</span>
                    {isRet && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' as const }}>↩ Return</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: isRet ? T.re : T.tx }}>{isRet ? '−' : ''}₹{Number(c.total).toLocaleString('en-IN')}</div>
                  {Number(c.amount_paid || 0) > 0 && <div style={{ fontSize: 9, color: T.gr, fontFamily: T.mono }}>₹{Number(c.amount_paid).toLocaleString('en-IN')} paid</div>}
                  {!isRet && Number(c.total) - Number(c.amount_paid || 0) > 0 && c.status !== 'draft' && <div style={{ fontSize: 9, color: T.re, fontFamily: T.mono }}>₹{(Number(c.total) - Number(c.amount_paid || 0)).toLocaleString('en-IN')} due</div>}
                </div>
              </div>
            );
          })}
          {detailChallans.length === 0 && <div style={{ padding: 16, textAlign: 'center' as const, color: T.tx3, fontSize: 11 }}>No challans found.</div>}
        </div>
      </div>
    );
  }

  // List screen
  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Customer Ledger</span>
        {customers.filter(c => c.outstanding > 0).length > 0 && (
          <button onClick={() => {
            const due = customers.filter(c => c.outstanding > 0);
            const csv = 'Customer,Billed,Paid,Outstanding,Challans\n' + due.map(c => `"${c.name}",${c.total},${c.paid},${c.outstanding},${c.count}`).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Outstanding_Customers_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
          }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', color: T.re, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Export Outstanding</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input type="text" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Enter customer name..."
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '8px 12px', outline: 'none', boxSizing: 'border-box', height: 36 }} />
        <button onClick={() => onSearchSubmit(search)} style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Search</button>
      </div>
      <div style={{ fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 6 }}>{search ? 'Search Results' : 'Recent Customers'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: T.tx3 }}>{customers.length} customers</span>
        <span style={{ fontSize: 10, color: totalOutstanding > 0 ? T.re : T.gr, fontWeight: 600 }}>Total Outstanding: ₹{totalOutstanding.toLocaleString('en-IN')}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        {customers.map(c => (
          <div key={c.name} onClick={() => onOpenCustomer(c.name)} style={{ padding: '10px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, marginBottom: 2 }}>{c.name}</div>
                <div style={{ fontSize: 9, color: T.tx3 }}>{c.count} challans | Billed: ₹{c.total.toLocaleString('en-IN')} | Paid: ₹{c.paid.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: c.outstanding > 0 ? T.re : T.gr }}>₹{c.outstanding.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase' as const }}>{c.outstanding > 0 ? 'Due' : 'Clear'}</div>
              </div>
            </div>
            {c.outstanding > 0 && (c.aging.current > 0 || c.aging.d30 > 0 || c.aging.d60 > 0 || c.aging.d90plus > 0) && (
              <div className="challan-aging-pills" style={{ display: 'flex', gap: 4, marginTop: 5, fontSize: 8, fontWeight: 600, fontFamily: T.mono }}>
                {c.aging.current > 0 && <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,.1)', color: T.gr }}>0-30d: ₹{c.aging.current.toLocaleString('en-IN')}</span>}
                {c.aging.d30 > 0 && <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,.1)', color: T.yl }}>31-60d: ₹{c.aging.d30.toLocaleString('en-IN')}</span>}
                {c.aging.d60 > 0 && <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(251,146,60,.12)', color: '#FB923C' }}>61-90d: ₹{c.aging.d60.toLocaleString('en-IN')}</span>}
                {c.aging.d90plus > 0 && <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.1)', color: T.re }}>90+d: ₹{c.aging.d90plus.toLocaleString('en-IN')}</span>}
              </div>
            )}
          </div>
        ))}
        {customers.length === 0 && <div style={{ padding: 24, textAlign: 'center' as const, color: T.tx3, fontSize: 12 }}>No customers found. Search by name or click "Load More" below.</div>}
        <button onClick={onLoadMore} style={{ width: '100%', padding: '8px', border: 'none', background: 'rgba(99,102,241,.06)', color: T.ac2, fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: '0 0 8px 8px' }}>Load More Customers</button>
      </div>
    </div>
  );
}
