// Catalog dropdown for the From-Master flow: pick a catalog and its designs
// load themselves (the card's name fills in too). The list comes from the
// master sheet's CATALOG column — bucket names that aren't real catalogs
// (Singles / Non-Catalog) are filtered out server-side.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../../listingai/api';

interface Catalog { name: string; count: number }

export default function CatalogPicker({ shareToken, disabled, onPick, addToast }: {
  shareToken?: string;
  disabled: boolean;
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
        const { status, data } = await call({ action: 'ratecard_catalogs', ...(shareToken ? { shareToken } : {}) });
        if (!data?.ok) throw new Error(String(data?.details || data?.error || `Could not load catalogs (${status})`));
        setCatalogs((data.catalogs || []) as Catalog[]);
      } catch (e) { addToast(friendlyError(e), 'error'); }
      setLoading(false);
    })();
  }, [shareToken, addToast]);

  // No catalog column in the master (or none readable) — the SKU box still works.
  if (!loading && catalogs.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.fLabel}>Catalog</label>
      <select defaultValue="" disabled={loading || disabled}
        onChange={e => { const v = e.target.value; if (v) onPick(v); e.target.value = ''; }}
        style={{ ...S.fInput, width: '100%', opacity: loading || disabled ? 0.6 : 1 }}>
        <option value="">{loading ? 'Loading catalogs…' : `Choose a catalog… (${catalogs.length})`}</option>
        {catalogs.map(c => <option key={c.name} value={c.name}>{c.name} — {c.count} design{c.count === 1 ? '' : 's'}</option>)}
      </select>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Picking a catalog loads its designs and names the card. Or type SKUs below.</div>
    </div>
  );
}
