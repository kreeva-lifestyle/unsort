// Rate card straight from the offline Master sheet: type SKUs → one free
// edge call (`ratecard_rows`, cached master read, zero AI) returns each SKU's
// master row + detected garment category → the owner picks which columns go
// on the card (SKU is locked on) → the same finalize pass as the other modes
// runs the GST/stats/blocker logic. One card = one category: SKUs that read
// as a different garment type error out here, before anything renders.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../../listingai/api';
import { parseSkuLines } from '../../listingai/skuInput';
import { finalizeRateRows, FinalizedSheet } from './finalizeRateRows';
import { norm, isPriceHeader, SKU_ALIASES } from './parseRateSheet';

interface MasterRow { sku: string; found: boolean; category: string | null; categoryLabel: string | null; values: Record<string, string> }
const COLS_KEY = 'ratecard_master_cols_v1';
const GST_BOUNDARY = 2500; // display formatting only — finalize re-checks the slab

// Build the FinalizedSheet from fetched rows + chosen columns. Bare-number
// prices are formatted to the card's standard "<n>/- +<slab>%(GST)" form;
// cells already carrying GST text keep it (finalize autocorrects a wrong %).
export const buildMasterSheet = (rows: MasterRow[], chosen: string[]): FinalizedSheet => {
  const columns = ['SKU', ...chosen];
  const priceCol = chosen.find(c => isPriceHeader(c)) || null;
  const objRows = rows.map(r => {
    const row: Record<string, string> = { SKU: r.sku };
    for (const c of chosen) {
      let v = r.values[c] || '';
      // The two master tabs may spell the price header differently ("PRICE"
      // vs "RATE"). The card keeps ONE price column, so a row whose price
      // lives under the other spelling falls back to any price-like key —
      // otherwise a fully-priced cross-tab card hits the missing-price
      // blocker for no real reason.
      if (c === priceCol && !v) v = Object.entries(r.values).find(([k]) => isPriceHeader(k))?.[1] || '';
      if (c === priceCol && /^\d+(?:\.\d+)?$/.test(v)) v = `${v}/- +${Number(v) > GST_BOUNDARY ? 18 : 5}%(GST)`;
      row[c] = v;
    }
    return row;
  });
  return finalizeRateRows(objRows, columns, 'SKU', priceCol);
};

// One card = one category: every DETECTED category must equal the majority
// one (undetected rows never block — warn only on positive evidence).
export const categoryGroups = (rows: MasterRow[]): { label: string; skus: string[] }[] => {
  const by = new Map<string, { label: string; skus: string[] }>();
  for (const r of rows) {
    if (!r.category) continue;
    const g = by.get(r.category) || { label: r.categoryLabel || r.category, skus: [] };
    g.skus.push(r.sku);
    by.set(r.category, g);
  }
  return [...by.values()].sort((a, b) => b.skus.length - a.skus.length);
};

export default function MasterRateCard({ onSheet, addToast }: {
  onSheet: (s: FinalizedSheet | null) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [skuText, setSkuText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetched, setFetched] = useState<{ columns: string[]; colCounts: Record<string, number>; rows: MasterRow[] } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);

  const found = fetched?.rows.filter(r => r.found) ?? [];
  const missing = fetched?.rows.filter(r => !r.found).map(r => r.sku) ?? [];
  const groups = categoryGroups(found);
  const mixed = groups.length > 1;
  // SKU-alias master columns are redundant on the picker — the card always
  // gets its SKU column from the typed list.
  const pickable = (fetched?.columns ?? []).filter(c => !SKU_ALIASES.includes(norm(c)));

  const emit = (rows: MasterRow[], cols: string[], isMixed: boolean) => {
    if (isMixed || !rows.length) { onSheet(null); return; }
    const sheet = buildMasterSheet(rows, cols);
    // A chosen column with master gaps still renders (as "—") — but say so
    // per SKU, so the owner fixes the master instead of wondering where the
    // data went. Price gaps already hit the all-or-nothing blocker.
    for (const c of cols) {
      if (c === sheet.priceCol) continue;
      const gaps = rows.filter(r => !(r.values[c] || '').trim()).map(r => r.sku);
      if (gaps.length) sheet.warnings.push(`${c} is empty in the master sheet for ${gaps.join(', ')} — shown as "—" on the card`);
    }
    onSheet(sheet);
  };

  const fetchRows = async () => {
    let skus = parseSkuLines(skuText).map(l => l.sku);
    if (skus.length === 0) { addToast('Type at least one SKU', 'error'); return; }
    // Server caps at 200 — cap here too so no SKU is ever dropped silently.
    if (skus.length > 200) { addToast(`Capped to the first 200 SKUs (of ${skus.length}) — split the rest into a second card`, 'error'); skus = skus.slice(0, 200); }
    setBusy(true);
    try {
      const { status, data } = await call({ action: 'ratecard_rows', skus });
      if (!data?.ok) throw new Error(String(data?.details || data?.error || `Fetch failed (${status})`));
      const rows = (data.rows || []) as MasterRow[];
      const columns = (data.columns || []) as string[];
      const colCounts = (data.colCounts || {}) as Record<string, number>;
      const okRows = rows.filter(r => r.found);
      // Restore the owner's last column picks, filtered to what exists now.
      let picks: string[] = [];
      try { const saved = JSON.parse(localStorage.getItem(COLS_KEY) || '[]') as string[]; picks = columns.filter(c => saved.includes(c)); } catch { picks = []; }
      if (!picks.length) { const p = columns.find(c => isPriceHeader(c)); picks = p ? [p] : []; }
      picks = picks.filter(c => !SKU_ALIASES.includes(norm(c)));
      setFetched({ columns, colCounts, rows });
      setChosen(picks);
      emit(okRows, picks, categoryGroups(okRows).length > 1);
      for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      if (okRows.length) addToast(`${okRows.length} SKU${okRows.length === 1 ? '' : 's'} loaded from the master sheet`, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); setFetched(null); onSheet(null); }
    setBusy(false);
  };

  const toggleCol = (c: string) => {
    const next = chosen.includes(c) ? chosen.filter(x => x !== c) : [...fetched!.columns.filter(x => (chosen.includes(x) || x === c) && !SKU_ALIASES.includes(norm(x)))];
    setChosen(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    emit(found, next, mixed);
  };

  // Chips show a data count when some fetched SKUs lack a value ("0/3" =
  // the column exists on the tab but is empty for every typed SKU) — a
  // column must never just vanish from the picker.
  const countOf = (c: string) => {
    const n = fetched?.colCounts?.[c];
    return n === undefined || n >= found.length ? '' : ` · ${n}/${found.length}`;
  };
  const chip = (c: string, on: boolean, locked: boolean) => (
    <button key={c} onClick={() => !locked && toggleCol(c)} aria-pressed={on}
      style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: locked ? 'default' : 'pointer', minHeight: 32,
        background: on ? 'oklch(0.55 0.22 265 / .10)' : 'rgba(255,255,255,.02)',
        border: `1px solid ${on ? 'oklch(0.55 0.22 265 / .35)' : T.bd}`, color: on ? T.ac2 : T.tx3 }}>
      {on ? '✓ ' : ''}{c}{locked ? ' (always)' : countOf(c)}
    </button>
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.fLabel}>SKUs — one per line</label>
      <textarea value={skuText} rows={3}
        onChange={e => { setSkuText(e.target.value); if (fetched) { setFetched(null); onSheet(null); } }}
        placeholder={'AD-1001\nAD-1002\nAD-1010'}
        style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 68, resize: 'vertical', fontFamily: T.mono, lineHeight: 1.6 }} />
      <button onClick={fetchRows} disabled={busy}
        style={{ ...S.btnGhost, marginTop: 8, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
        {busy ? 'Fetching…' : 'Fetch from Master'}
      </button>
      {(missing.length > 0 || mixed) && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 8, lineHeight: 1.6 }}>
          {missing.length > 0 && <div>• Not in the master sheet: <span style={{ fontFamily: T.mono }}>{missing.join(', ')}</span></div>}
          {mixed && <div>• SKUs span different categories — {groups.map(g => `${g.label}: ${g.skus.join(', ')}`).join(' · ')}. A rate card covers one category.</div>}
        </div>
      )}
      {fetched && found.length > 0 && !mixed && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...S.fLabel }}>Columns on the card{groups[0] ? ` — ${groups[0].label}` : ''}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chip('SKU', true, true)}
            {pickable.map(c => chip(c, chosen.includes(c), false))}
          </div>
        </div>
      )}
    </div>
  );
}
