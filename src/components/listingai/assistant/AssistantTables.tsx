// Result tables under a Master Assistant answer. Complete data (the AI only
// narrates) — collapsible, horizontally scrollable on mobile, and exportable
// as CSV so a "not uploaded" list can go straight to the seller.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';

export interface AssistantTable { title: string; columns: string[]; rows: string[][] }

const csvCell = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export default function AssistantTables({ tables }: { tables: AssistantTable[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!tables.length) return null;

  const exportCsv = (t: AssistantTable) => {
    const csv = [t.columns.map(csvCell).join(','), ...t.rows.map(r => r.map(csvCell).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${t.title.replace(/[^\w-]+/g, '_').slice(0, 60)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {tables.map((t, ti) => (
        <div key={ti} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 6, background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
            <button onClick={() => setOpen(o => ({ ...o, [ti]: !o[ti] }))}
              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: T.tx2, fontSize: 11, fontWeight: 600, minHeight: 28 }}>
              {open[ti] ? '▾' : '▸'} {t.title}
            </button>
            {t.rows.length > 0 && <button onClick={() => exportCsv(t)} style={{ ...S.btnGhost, ...S.btnSm }}>CSV</button>}
          </div>
          {open[ti] && (t.rows.length === 0
            ? <div style={{ padding: '4px 12px 10px', fontSize: 11, color: T.tx3 }}>Empty.</div>
            : <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 8px 8px' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead><tr>{t.columns.map((c, i) => <th key={i} style={{ ...S.thStyle, padding: '6px 10px' }}>{c}</th>)}</tr></thead>
                  <tbody>
                    {t.rows.slice(0, 200).map((r, ri) => (
                      <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ ...S.tdStyle, padding: '5px 10px', fontSize: 11, fontFamily: ci === 0 ? T.mono : T.sans }}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                {t.rows.length > 200 && <div style={{ fontSize: 10, color: T.tx3, padding: '6px 4px' }}>Showing first 200 of {t.rows.length} — the CSV export has all of them.</div>}
              </div>)}
        </div>
      ))}
    </div>
  );
}
