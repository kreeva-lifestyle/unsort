// Catalog dropdown for the From-Master flow: pick a catalog and its designs
// load themselves (the card's name fills in too). The list comes from the
// master sheet's CATALOG column — bucket names that aren't real catalogs
// (Singles / Non-Catalog) are filtered out server-side.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../../listingai/api';

export interface Catalog { name: string; count: number; active?: number }

export default function CatalogPicker({ shareToken, disabled, onPick, addToast, onlyActive, hint, source }: {
  shareToken?: string;
  disabled: boolean;
  /** Catalog Downloads: hide catalogs with no active design and say how many are active. */
  onlyActive?: boolean;
  hint?: string;
  /** Where the list comes from; default is listing-ai's ratecard_catalogs. */
  source?: () => Promise<Catalog[]>;
  onPick: (name: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    (async () => {
      try {
        if (source) { setCatalogs(await source()); }
        else {
          const { status, data } = await call({ action: 'ratecard_catalogs', ...(shareToken ? { shareToken } : {}) });
          if (!data?.ok) throw new Error(String(data?.details || data?.error || `Could not load catalogs (${status})`));
          setCatalogs((data.catalogs || []) as Catalog[]);
        }
      } catch (e) { addToast(friendlyError(e), 'error'); }
      setLoading(false);
    })();
  }, [shareToken, addToast, source]);

  const shown = onlyActive ? catalogs.filter(c => (c.active ?? 0) > 0) : catalogs;
  // No catalog column in the master (or none readable) — the SKU box still works.
  if (!loading && shown.length === 0) return onlyActive ? <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>No catalog has an active design right now.</div> : null;

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.fLabel}>Catalog</label>
      <select defaultValue="" disabled={loading || disabled}
        onChange={e => { const v = e.target.value; if (v) onPick(v); e.target.value = ''; }}
        style={{ ...S.fInput, width: '100%', opacity: loading || disabled ? 0.6 : 1 }}>
        <option value="">{loading ? 'Loading catalogs…' : `Choose a catalog… (${shown.length})`}</option>
        {shown.map(c => <option key={c.name} value={c.name}>{c.name} — {onlyActive ? `${c.active} active of ${c.count}` : `${c.count} design${c.count === 1 ? '' : 's'}`}</option>)}
      </select>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{hint ?? 'Picking a catalog loads its designs and names the card. Or type SKUs below.'}</div>
    </div>
  );
}
