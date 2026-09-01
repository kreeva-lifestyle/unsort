// One-tap chips of the TOP-5 VENDORS of the last 30 days on the PO form.
// The ranking is precomputed by the pg_cron job 'po-top-vendors' every 4
// days into app_settings.po_top_vendors (owner: "design in a way that it
// doesn't load our server") — the form only reads that single row. Each
// chip carries the vendor's latest id/name/phone snapshot, so a tap fills
// the vendor exactly like picking from the dropdown.
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { S } from '../../lib/theme';

type V = { id: string | null; name: string; phone: string };

export default function TopVendorChips({ onPick }: { onPick: (v: V) => void }) {
  const [tops, setTops] = useState<V[]>([]);
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'po_top_vendors').maybeSingle()
      .then(({ data }) => {
        if (Array.isArray(data?.value)) setTops((data.value as V[]).filter(v => (v?.name || '').trim()));
      });
  }, []);
  if (tops.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {tops.map(v => (
        <button key={v.name} type="button" onClick={() => onPick({ id: v.id ?? null, name: v.name, phone: v.phone || '' })}
          aria-label={`Use vendor ${v.name}`}
          style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 12px', fontSize: 11, borderRadius: 999 }}>
          {v.name}
        </button>
      ))}
    </div>
  );
}
