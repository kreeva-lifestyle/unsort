// Manual rate-card builder: a small in-app sheet. SKU is fixed as the first
// column; PRICE (or any alias) is optional — removing it is exactly how the
// owner makes a price-less card. Other columns (FABRIC, SIZE…) are free.
// Every change re-runs the same finalize pass the Excel import uses, so GST
// autocorrect / duplicate checks / the all-or-nothing price rule behave
// identically. The draft auto-saves to localStorage (device-local) so a
// refresh never loses typed rows.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { finalizeRateRows, FinalizedSheet } from './finalizeRateRows';
import { norm, PRICE_ALIASES } from './parseRateSheet';

const DRAFT_KEY = 'ratecard_manual_draft_v1';
const ROW_CAP = 200; // canvas + localStorage sanity
const EMPTY = { columns: ['SKU', 'PRICE'], rows: [['', '']] };

const loadDraft = (): { columns: string[]; rows: string[][] } => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || '');
    if (Array.isArray(d?.columns) && d.columns.length > 0 && d.columns[0] === 'SKU'
      && Array.isArray(d?.rows) && d.rows.every((r: unknown) => Array.isArray(r))) {
      return { columns: d.columns.map(String), rows: d.rows.map((r: unknown[]) => d.columns.map((_: unknown, i: number) => String((r as unknown[])[i] ?? ''))) };
    }
  } catch { /* corrupt or absent — start fresh */ }
  return { columns: [...EMPTY.columns], rows: EMPTY.rows.map(r => [...r]) };
};

export default function ManualRateEditor({ onSheet, addToast }: {
  onSheet: (s: FinalizedSheet | null) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [draft, setDraft] = useState(loadDraft);
  const [newCol, setNewCol] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const { columns, rows } = draft;

  // Persist + re-finalize on every change. Rows with an empty SKU are kept in
  // the grid (mid-typing) but excluded from the sheet handed to the renderer.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota — draft just won't survive */ }
    const filled = rows.filter(r => (r[0] || '').trim());
    if (!filled.length) { onSheet(null); return; }
    const objRows = filled.map(r => Object.fromEntries(columns.map((c, i) => [c, (r[i] || '').trim()])));
    const priceCol = columns.find(c => PRICE_ALIASES.includes(norm(c))) || null;
    onSheet(finalizeRateRows(objRows, columns, 'SKU', priceCol));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const setCell = (ri: number, ci: number, v: string) =>
    setDraft(d => ({ ...d, rows: d.rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? v : c) : r) }));
  const addRow = () => {
    if (rows.length >= ROW_CAP) { addToast(`Row limit ${ROW_CAP} reached — split into a second card`, 'error'); return; }
    setDraft(d => ({ ...d, rows: [...d.rows, d.columns.map(() => '')] }));
  };
  const delRow = (ri: number) =>
    setDraft(d => ({ ...d, rows: d.rows.length > 1 ? d.rows.filter((_, i) => i !== ri) : [d.columns.map(() => '')] }));
  const addColumn = () => {
    const label = newCol.trim().toUpperCase();
    if (!label) return;
    if (columns.includes(label)) { addToast(`Column "${label}" already exists`, 'error'); return; }
    setDraft(d => ({ columns: [...d.columns, label], rows: d.rows.map(r => [...r, '']) }));
    setNewCol('');
  };
  const delColumn = (ci: number) => {
    if (ci === 0) return; // SKU is fixed
    setDraft(d => ({ columns: d.columns.filter((_, i) => i !== ci), rows: d.rows.map(r => r.filter((_, i) => i !== ci)) }));
  };
  const clearAll = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraft({ columns: [...EMPTY.columns], rows: EMPTY.rows.map(r => [...r]) });
    setConfirmClear(false);
  };

  const cell: React.CSSProperties = { ...S.fInput, width: '100%', minWidth: 0, borderRadius: 6 };
  return (
    <div style={{ marginBottom: 10 }}>
      <div ref={gridRef} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 8 }}>
        <div style={{ minWidth: columns.length * 118 + 40 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(110px, 1fr)) 32px`, gap: 6, marginBottom: 6 }}>
            {columns.map((c, ci) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ ...S.fLabel, marginBottom: 0 }}>{c}</span>
                {ci > 0 && <button onClick={() => delColumn(ci)} title={`Remove the ${c} column`} aria-label={`Remove the ${c} column`}
                  style={{ background: 'none', border: 'none', color: T.tx3, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '2px 4px' }}>&#215;</button>}
              </div>
            ))}
            <span />
          </div>
          {rows.map((r, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(110px, 1fr)) 32px`, gap: 6, marginBottom: 6 }}>
              {columns.map((c, ci) => (
                <input key={ci} value={r[ci] || ''} onChange={e => setCell(ri, ci, e.target.value)}
                  placeholder={ci === 0 ? 'e.g. D-101' : c === 'PRICE' ? 'e.g. 2450/- +5%(GST)' : ''}
                  onKeyDown={e => { if (e.key === 'Enter' && ri === rows.length - 1 && ci === columns.length - 1) { e.preventDefault(); addRow(); } }}
                  style={{ ...cell, fontFamily: ci === 0 ? T.mono : T.sans }} />
              ))}
              <button onClick={() => delRow(ri)} title="Remove row" aria-label={`Remove row ${ri + 1}`}
                style={{ background: 'none', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx3, cursor: 'pointer', fontSize: 13, minHeight: 36 }}>&#215;</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={addRow} style={{ ...S.btnGhost, minHeight: 44 }}>+ Row</button>
        <input value={newCol} onChange={e => setNewCol(e.target.value)} placeholder="New column (e.g. FABRIC)"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColumn(); } }}
          style={{ ...S.fInput, flex: '1 1 140px', minWidth: 120 }} />
        <button onClick={addColumn} style={{ ...S.btnGhost, minHeight: 44 }}>+ Column</button>
        {!confirmClear
          ? <button onClick={() => setConfirmClear(true)} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 44 }}>Clear</button>
          : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.tx2 }}>Erase all rows?</span>
              <button onClick={clearAll} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 44 }}>Erase</button>
              <button onClick={() => setConfirmClear(false)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44 }}>Keep</button>
            </span>}
      </div>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, lineHeight: 1.5 }}>
        SKU is required per row. Keep the PRICE column and fill every price — or remove it (×) for a card without prices. Enter in the last cell adds a row. The draft saves on this device automatically.
      </div>
    </div>
  );
}
