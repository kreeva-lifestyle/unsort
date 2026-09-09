// Catalog picker for RateCard Studio (From Master and Catalog downloads):
// a type-to-search box over the master sheet's CATALOG column, grouped by
// brand (the sheet tab — Dresstive first, then Arya Designs, owner's order)
// with the newest catalog first: whatever sits lowest on the sheet was added
// last. Only catalogs with at least one active design are listed (owner's
// rule for every flow). Catalog downloads may also search Dropbox for a
// name that is not on the sheet at all. Portaled list
// (AnchoredList) because iOS never renders <datalist>. The list itself is
// one cached server call per few minutes, shared across remounts.
import { useState, useEffect, useMemo } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import AnchoredList from '../../ui/AnchoredList';
import { catalogList, type Catalog } from '../catalogdl/api';

const TAB_LABEL: Record<string, string> = { ARYA: 'Arya Designs', DRESSTIVE: 'Dresstive' };
const TAB_ORDER = ['DRESSTIVE', 'ARYA'];
const labelOf = (tab: string) => TAB_LABEL[tab] || tab || 'Other';

export default function CatalogPicker({ shareToken, disabled, onPick, addToast, onlyActive = true, hint, allowSearch }: {
  shareToken?: string;
  disabled: boolean;
  onPick: (name: string) => void;
  addToast: (m: string, t?: string) => void;
  /** Hide catalogs with no active design (default) and say how many are active. */
  onlyActive?: boolean;
  hint?: string;
  /** Catalog downloads: a typed name that matches no listed catalog can still be searched in Dropbox. */
  allowSearch?: boolean;
}) {
  const [catalogs, setCatalogs] = useState<Catalog[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    catalogList(shareToken).then(l => { if (live) setCatalogs(l); }).catch(e => { if (live) { addToast(friendlyError(e), 'error'); setCatalogs([]); } });
    return () => { live = false; };
  }, [shareToken, addToast]);

  // Grouped, filtered, newest first within a brand. Items carry their group
  // index so the flat keyboard list and the headed visual list agree.
  const groups = useMemo(() => {
    const all = (catalogs || []).filter(c => !onlyActive || c.active > 0);
    const needle = q.trim().toLowerCase();
    const shown = needle ? all.filter(c => c.name.toLowerCase().includes(needle)) : all;
    const tabs = [...TAB_ORDER, ...[...new Set(shown.map(c => c.tab))].filter(t => !TAB_ORDER.includes(t))];
    return tabs.map(tab => ({ tab, items: shown.filter(c => c.tab === tab).sort((a, b) => b.last - a.last || a.name.localeCompare(b.name)) })).filter(g => g.items.length > 0);
  }, [catalogs, onlyActive, q]);
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const total = (catalogs || []).filter(c => !onlyActive || c.active > 0).length;
  // A typed name that is not on the list: Catalog downloads can still look
  // for that folder in Dropbox (a book that is not on the master sheet).
  const typed = q.trim();
  const searchRow = !!allowSearch && typed.length >= 2 && !(catalogs || []).some(c => c.name.toLowerCase() === typed.toLowerCase());
  const showList = open && (flat.length > 0 || searchRow);
  const rows = flat.length + (searchRow ? 1 : 0);

  const pick = (c: Catalog) => { setQ(c.name); setOpen(false); setHi(-1); onPick(c.name); };
  const pickTyped = () => { setOpen(false); setHi(-1); onPick(typed); };
  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % rows); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h <= 0 ? rows - 1 : h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hi >= 0 && flat[hi]) pick(flat[hi]); else if (searchRow && (hi === flat.length || hi < 0)) pickTyped(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setHi(-1); }
  };

  // No catalog column in the master (or none readable) — From Master's SKU box still works.
  if (catalogs && total === 0 && !allowSearch) return <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>No catalog has an active design right now.</div>;
  const countText = (c: Catalog) => onlyActive ? `${c.active} active of ${c.count}` : `${c.count} design${c.count === 1 ? '' : 's'}`;

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.fLabel}>Catalog</label>
      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5, pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input ref={setAnchor} value={q} disabled={disabled || !catalogs} role="combobox" aria-expanded={showList} aria-label="Catalog" autoComplete="off" autoCorrect="off" spellCheck={false}
          placeholder={!catalogs ? 'Loading catalogs…' : `Type to search ${total} catalogs…`}
          onChange={e => { setQ(e.target.value); setOpen(true); setHi(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setHi(-1); }, 150)}
          onKeyDown={keyDown}
          style={{ ...S.fSearch, width: '100%', paddingRight: q ? 34 : undefined, opacity: disabled ? 0.6 : 1 }} />
        {q && !disabled && (
          <button type="button" aria-label="Clear catalog" onMouseDown={e => { e.preventDefault(); setQ(''); setHi(-1); setOpen(true); anchor?.focus(); }}
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, border: 'none', background: 'none', color: T.tx3, fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>&#215;</button>
        )}
      </div>
      <AnchoredList anchor={anchor} open={showList}>
        {groups.map(g => (
          <div key={g.tab}>
            <div style={{ padding: '6px 12px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.ac2, background: T.s2, position: 'sticky', top: 0, borderBottom: `1px solid ${T.bd}` }}>{labelOf(g.tab)} · {g.items.length}</div>
            {g.items.map(c => { const i = flat.indexOf(c); return (
              <div key={`${c.tab}:${c.name}`} role="option" aria-selected={i === hi} onMouseDown={e => { e.preventDefault(); pick(c); }} onMouseEnter={() => setHi(i)}
                style={{ padding: '8px 12px', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', background: i === hi ? T.ac3 : 'transparent', borderBottom: `1px solid ${T.bd}` }}>
                <span style={{ fontSize: 12, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ fontSize: 10, color: onlyActive && c.active ? T.gr : T.tx3, flexShrink: 0, fontFamily: T.mono }}>{countText(c)}</span>
              </div>); })}
          </div>
        ))}
        {searchRow && (
          <div role="option" aria-selected={hi === flat.length} onMouseDown={e => { e.preventDefault(); pickTyped(); }} onMouseEnter={() => setHi(flat.length)}
            style={{ padding: '9px 12px', minHeight: 40, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: hi === flat.length ? T.ac3 : 'transparent', color: T.ac2, fontSize: 12 }}>
            Search Dropbox for “{typed}” <span style={{ fontSize: 10, color: T.tx3 }}>· not on the master sheet</span>
          </div>
        )}
      </AnchoredList>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{hint ?? 'Type to search — newest catalogs first, grouped by brand. Picking one loads its designs and names the card. Or type SKUs below.'}</div>
    </div>
  );
}
