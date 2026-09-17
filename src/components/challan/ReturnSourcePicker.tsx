// "Select original invoice" on a Return — split out of ChallanForm so that
// file stops growing. The search matches challan #, customer name or a
// SKU that was sold (owner's ask), and when the operator has already typed
// the customer, it looks only at that customer's invoices: type the SKU,
// land on the invoice it was sold on. The RPC lives in the parent
// (searchReturnSource); this is render + debounce only.
import { useRef } from 'react';
import { T } from '../../lib/theme';
import type { CashChallan } from '../../types/database';

// Same shape the page passes (its list embed carries the items).
type Challan = Omit<CashChallan, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string; cash_challan_items?: Array<{ sku?: string | null }> };

const skuLine = (c: Challan) => {
  const skus = (c.cash_challan_items || []).map(it => (it.sku || '').trim()).filter(Boolean);
  if (skus.length === 0) return '';
  return skus.slice(0, 4).join(' · ') + (skus.length > 4 ? ` +${skus.length - 4}` : '');
};

export default function ReturnSourcePicker({ query, onQueryChange, results, onSearch, onSelect, customerName, style, labelStyle }: {
  query: string;
  onQueryChange: (v: string) => void;
  results: Challan[];
  onSearch: (q: string) => void;
  onSelect: (c: Challan) => void;
  /** Customer already typed on the form — the search is scoped to them. */
  customerName: string;
  style: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const t = useRef<ReturnType<typeof setTimeout>>();
  const scoped = customerName.trim();
  return (
    <div style={{ background: 'oklch(0.63 0.22 25 / .04)', border: '1px solid oklch(0.63 0.22 25 / .15)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <label style={{ ...labelStyle, color: T.re }}>Select Original Invoice *</label>
      <input type="text" value={query} onChange={e => { onQueryChange(e.target.value); clearTimeout(t.current); t.current = setTimeout(() => onSearch(e.target.value), 300); }}
        placeholder={scoped ? `Search ${scoped}'s invoices by challan # or SKU…` : 'Search by challan #, customer name or SKU…'} style={style} autoFocus />
      {results.length > 0 && <div style={{ marginTop: 6, border: `1px solid ${T.bd}`, borderRadius: 6, maxHeight: 220, overflowY: 'auto' }}>
        {results.map(c => {
          const skus = skuLine(c);
          return (
            <div key={c.id} onClick={() => onSelect(c)} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 44 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2 }}>#{c.challan_number}</span>
                <span style={{ marginLeft: 8, fontSize: 11, color: T.tx }}>{c.customer_name}</span>
                {skus && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skus}</div>}
              </div>
              <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.tx, flexShrink: 0 }}>₹{Number(c.total).toLocaleString('en-IN')}</span>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
