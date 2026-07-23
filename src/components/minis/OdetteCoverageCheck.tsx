import { useState } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';

const ODETTE_EDGE_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';

interface ReconcileResult {
  columns: string[];
  missing: Record<string, string>[];
  counts: { active: number; odette: number; missing: number };
  tabsRead: { name: string; count: number }[];
  warnings?: string[];
}

// Normalize old (missing: string[]) and new (missing: object[] + columns)
// response shapes so the UI is safe regardless of edge-deploy order.
function toResult(data: any): ReconcileResult {
  if (Array.isArray(data.columns)) return data as ReconcileResult;
  return {
    columns: ['SKU', 'Status'],
    missing: (data.missing || []).map((s: string) => ({ SKU: s, Status: 'Not on Odette' })),
    counts: data.counts,
    tabsRead: data.tabsRead || [],
    warnings: data.warnings,
  };
}

// Coverage Check — active (master) SKUs that aren't on the Odette ARYA STOCK
// sheet yet. The edge function reads both Google Sheets server-side and diffs;
// this component is just the button + results. No file upload.
export default function OdetteCoverageCheck({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [search, setSearch] = useState('');

  const reconcile = async () => {
    setLoading(true);
    try {
      const resp = await fetch(ODETTE_EDGE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'reconcile' }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) { addToast(friendlyError(data.details || data.error || 'Reconcile failed'), 'error'); setLoading(false); return; }
      setResult(toResult(data));
      setSearch('');
      (data.warnings || []).forEach((w: string) => addToast(w, 'info'));
      addToast(`${data.counts.missing} size variant${data.counts.missing === 1 ? '' : 's'} not on Odette (of ${data.counts.active} active variants)`, 'success');
    } catch (e: any) { addToast(friendlyError(e), 'error'); }
    setLoading(false);
  };

  const exportXls = () => {
    if (!result || result.missing.length === 0) { addToast('Nothing to export', 'error'); return; }
    const ws = XLSX.utils.json_to_sheet(result.missing, { header: result.columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Missing from Odette');
    XLSX.writeFile(wb, `Odette_Missing_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const q = search.toLowerCase();
  const filtered = result ? result.missing.filter(r => !q || Object.values(r).some(v => String(v).toLowerCase().includes(q))) : [];

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={reconcile} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto' }}>{loading ? 'Checking…' : 'Reconcile vs Odette'}</button>
        {result && result.missing.length > 0 && <button onClick={exportXls} style={{ ...S.btnGhost, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)' }}>Export {result.missing.length}</button>}
        {result && result.tabsRead.map(t => (
          <span key={t.name} style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: 'rgba(255,255,255,.04)', color: T.tx2, border: `1px solid ${T.bd}` }}>{t.name}: {t.count}</span>
        ))}
      </div>

      {result && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { label: 'Active', count: result.counts.active, color: T.ac2 },
            { label: 'On Odette', count: result.counts.odette, color: T.gr },
            { label: 'Not on Odette', count: result.counts.missing, color: T.re },
          ]).map(s => (
            <div key={s.label} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {result.missing.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.gr, fontSize: 12 }}>All active SKUs are on Odette 🎉</div>
        ) : <>
          <div style={{ position: 'relative', marginBottom: 10, maxWidth: 280 }}>
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round' as const, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...S.fSearch, width: '100%' }} />
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
              <thead><tr>{result.columns.map(c => <th key={c} style={{ ...S.thStyle, whiteSpace: 'nowrap' as const }}>{c}</th>)}</tr></thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i}>
                    {result.columns.map(c => (
                      <td key={c} style={{ ...S.tdStyle, whiteSpace: 'nowrap' as const, ...(/sku/i.test(c) ? { fontFamily: T.mono, fontWeight: 600 } : {}) }}>{row[c] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
      </>}

      {!result && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Click "Reconcile vs Odette" to find active SKUs missing from the Odette sheet.</div>}
    </div>
  );
}
