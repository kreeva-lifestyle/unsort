// Result tables under a Master Assistant answer. Complete data (the AI only
// narrates) — collapsible, horizontally scrollable on mobile, and exportable
// as CSV so a "not uploaded" list can go straight to the seller.
import { useState, useMemo } from 'react';
import { T, S } from '../../../lib/theme';
import { exportName, fileDate } from '../../../lib/exportName';

export interface AssistantTable { title: string; columns: string[]; rows: string[][] }

// Quote AND neutralise formula injection: seller-sheet cells flow into this
// CSV and Excel executes a leading = + - @ on open.
const csvCell = (v: string) => {
  const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The edge fn emits cross-tab status combinations BEFORE the four tables the
// owner actually acts on, so the useful ones used to sit at the bottom of a
// long collapsed list. Rank by title here rather than changing the edge fn.
const RANK: [RegExp, number][] = [
  [/^Not uploaded by seller/, 0],
  [/^Matched - in master/, 1],
  [/^Unknown SKUs/, 2],
  [/^Fuzzy matches/, 3],
];
const rankOf = (title: string) => (RANK.find(([re]) => re.test(title)) || [null, 9])[1] as number;

export default function AssistantTables({ tables }: { tables: AssistantTable[] }) {
  // Sorted view, but the ORIGINAL index rides along: the CSV filename uses it,
  // and cross-tab titles share their first 40 chars, so reusing the sorted
  // position would make two exports collide on one filename.
  const ordered = useMemo(
    () => tables.map((t, i) => ({ t, i })).sort((a, b) => rankOf(a.t.title) - rankOf(b.t.title) || a.i - b.i),
    [tables],
  );
  // The top table opens by default — an answer followed by nothing but collapsed
  // rows made the owner hunt for the data the answer was describing.
  const [open, setOpen] = useState<Record<number, boolean>>(() => (ordered.length ? { [ordered[0].i]: true } : {}));
  if (!tables.length) return null;

  const exportCsv = (t: AssistantTable, ti: number) => {
    const csv = [t.columns.map(csvCell).join(','), ...t.rows.map(r => r.map(csvCell).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = exportName('Master-Assistant', [t.title, `t${ti + 1}`, fileDate()], 'csv');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); // sync revoke breaks Safari/Firefox
  };

  const isNum = (v: string) => /^-?[\d,]+(\.\d+)?$/.test((v || '').trim());

  return (
    <div style={{ marginTop: 8 }}>
      {ordered.map(({ t, i: ti }) => (
        <div key={ti} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 6, background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
            <button onClick={() => setOpen(o => ({ ...o, [ti]: !o[ti] }))}
              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: T.tx2, fontSize: 11, fontWeight: 600, minHeight: 28 }}>
              {open[ti] ? '▾' : '▸'} {t.title}
            </button>
            {t.rows.length > 0 && <button onClick={() => exportCsv(t, ti)} style={{ ...S.btnGhost, ...S.btnSm }}>CSV</button>}
          </div>
          {open[ti] && (t.rows.length === 0
            ? <div style={{ padding: '4px 12px 10px', fontSize: 11, color: T.tx3 }}>Empty.</div>
            : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420, WebkitOverflowScrolling: 'touch', padding: '0 8px 8px' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  {/* Sticky header: these tables run to 200 rows, and scrolling
                      past the header left every column unlabelled. */}
                  <thead><tr>{t.columns.map((c, i) => (
                    <th key={i} style={{ ...S.thStyle, padding: '6px 10px', position: 'sticky', top: 0, background: T.s2, zIndex: 1 }}>{c}</th>
                  ))}</tr></thead>
                  <tbody>
                    {t.rows.slice(0, 200).map((r, ri) => (
                      <tr key={ri} style={{ background: ri % 2 ? T.glass1 : 'transparent' }}>
                        {r.map((c, ci) => (
                          <td key={ci} style={{ ...S.tdStyle, padding: '5px 10px', fontSize: 11, fontFamily: ci === 0 || isNum(c) ? T.mono : T.sans, textAlign: ci > 0 && isNum(c) ? 'right' : 'left' }}>{c}</td>
                        ))}
                      </tr>
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
