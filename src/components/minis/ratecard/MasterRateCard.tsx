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
import { FinalizedSheet, MAX_CARD_ROWS } from './finalizeRateRows';
import { norm, isPriceHeader, SKU_ALIASES } from './parseRateSheet';
import { MasterRow, buildMasterSheet, categoryGroups } from './masterSheetBuild';
import CatalogPicker from './CatalogPicker';

const COLS_KEY = 'ratecard_master_cols_v1';

export default function MasterRateCard({ onSheet, addToast, shareToken, onCatalogName }: {
  onSheet: (s: FinalizedSheet | null) => void;
  addToast: (m: string, t?: string) => void;
  shareToken?: string; // seller link: authorises the master read server-side
  onCatalogName?: (name: string) => void; // picking a catalog names the card
}) {
  const [skuText, setSkuText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetched, setFetched] = useState<{ columns: string[]; colCounts: Record<string, number>; rows: MasterRow[] } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [showEmpty, setShowEmpty] = useState(false);

  const found = fetched?.rows.filter(r => r.found) ?? [];
  const missing = fetched?.rows.filter(r => !r.found).map(r => r.sku) ?? [];
  const groups = categoryGroups(found);
  const mixed = groups.length > 1;
  // SKU-alias master columns are redundant on the picker — the card always
  // gets its SKU column from the typed list.
  const allPickable = (fetched?.columns ?? []).filter(c => !SKU_ALIASES.includes(norm(c)));
  // Columns with NO value for any fetched SKU are hidden - they would only add
  // a column of dashes. They stay reachable behind "+ N empty" so a column can
  // never silently disappear (the DRS199 lesson).
  const hasData = (c: string) => (fetched?.colCounts?.[c] ?? 0) > 0;
  const pickable = allPickable.filter(hasData);
  const emptyCols = allPickable.filter(c => !hasData(c));

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

  // catalog set => the server resolves that catalog's SKUs; otherwise the
  // typed list is used.
  const fetchRows = async (catalog?: string) => {
    let skus = catalog ? [] : parseSkuLines(skuText).map(l => l.sku);
    if (!catalog && skus.length === 0) { addToast('Type at least one SKU', 'error'); return; }
    // Owner's rule: the card's design cap. Cap BEFORE the fetch, loudly —
    // no SKU is ever dropped silently (the server caps at the same number).
    if (!catalog && skus.length > MAX_CARD_ROWS) { addToast(`A rate card holds at most ${MAX_CARD_ROWS} SKUs — capped to the first ${MAX_CARD_ROWS} (of ${skus.length}); split the rest into a second card`, 'error'); skus = skus.slice(0, MAX_CARD_ROWS); }
    setBusy(true);
    try {
      const { status, data } = await call({ action: 'ratecard_rows', ...(catalog ? { catalog } : { skus }), ...(shareToken ? { shareToken } : {}) });
      if (!data?.ok) throw new Error(String(data?.details || data?.error || `Fetch failed (${status})`));
      const rows = (data.rows || []) as MasterRow[];
      const columns = (data.columns || []) as string[];
      const colCounts = (data.colCounts || {}) as Record<string, number>;
      const okRows = rows.filter(r => r.found);
      // Restore the owner's last column picks, filtered to what exists now.
      let picks: string[] = [];
      try { const saved = JSON.parse(localStorage.getItem(COLS_KEY) || '[]') as string[]; picks = columns.filter(c => saved.includes(c)); } catch { picks = []; }
      if (!picks.length) { const p = columns.find(c => isPriceHeader(c)); picks = p ? [p] : []; }
      picks = picks.filter(c => !SKU_ALIASES.includes(norm(c)) && (colCounts[c] ?? 0) > 0);
      setFetched({ columns, colCounts, rows });
      setChosen(picks);
      emit(okRows, picks, categoryGroups(okRows).length > 1);
      for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      if (catalog) {
        // Show what was loaded so it stays editable, and name the card.
        setSkuText(rows.map(r => r.sku).join('\n'));
        onCatalogName?.(catalog);
      }
      if (okRows.length) addToast(`${okRows.length} design${okRows.length === 1 ? '' : 's'} loaded${catalog ? ` from ${catalog}` : ' from the master sheet'}`, 'success');
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
      <CatalogPicker shareToken={shareToken} disabled={busy} addToast={addToast} onPick={c => fetchRows(c)} />
      <label style={S.fLabel}>SKUs — one per line</label>
      <textarea value={skuText} rows={3}
        onChange={e => { setSkuText(e.target.value); if (fetched) { setFetched(null); onSheet(null); } }}
        placeholder={'AD-1001\nAD-1002\nAD-1010'}
        style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 68, resize: 'vertical', fontFamily: T.mono, lineHeight: 1.6 }} />
      <button onClick={() => fetchRows()} disabled={busy}
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
            {emptyCols.length > 0 && !showEmpty && (
              <button onClick={() => setShowEmpty(true)}
                title={`No data in the master for these SKUs: ${emptyCols.join(', ')}`}
                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 32, background: 'transparent', border: `1px dashed ${T.bd2}`, color: T.tx3 }}>
                + {emptyCols.length} empty
              </button>
            )}
            {showEmpty && emptyCols.map(c => chip(c, chosen.includes(c), false))}
          </div>
          {showEmpty && emptyCols.length > 0 && (
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Greyed columns have no data in the master for these SKUs — picking one leaves it off the card.</div>
          )}
        </div>
      )}
    </div>
  );
}
