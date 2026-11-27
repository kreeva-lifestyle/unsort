// One-tap chips of the TOP-5 VENDORS of the last 30 days on the PO form.
// The ranking is precomputed by the pg_cron job 'po-top-vendors' every 4
// days into app_settings.po_top_vendors (owner: "design in a way that it
// doesn't load our server") — the form only reads that single row. Each
// chip carries the vendor's id and the name / phone of its latest order; a
// tap reads the contact itself, so the order gets the phone Contacts has
// today (the owner's rule of 27 Nov 2026 leans on that number).
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { S } from '../../lib/theme';

type V = { id: string | null; name: string; phone: string };

export default function TopVendorChips({ onPick }: { onPick: (v: V) => void }) {
  const [tops, setTops] = useState<V[]>([]);
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'po_top_vendors').maybeSingle()
      .then(({ data, error }) => {
        if (error) { logSwallowed('PO top vendors', error); return; } // chips are a convenience
        // Only vendors saved in Contacts: an order cannot be raised for a name without a record.
        if (Array.isArray(data?.value)) setTops((data.value as V[]).filter(v => (v?.name || '').trim() && v.id));
      });
  }, []);
  const use = async (v: V) => {
    const { data, error } = await supabase.from('po_vendors').select('id, name, phone').eq('id', v.id as string).maybeSingle();
    if (error) logSwallowed('PO top vendor contact', error); // the chip's own copy still fills the box
    // A contact removed since the chips were built: the name alone, so the form asks for it to be added.
    onPick(data ? { id: data.id, name: data.name, phone: data.phone || '' } : error ? { id: v.id ?? null, name: v.name, phone: v.phone || '' } : { id: null, name: v.name, phone: '' });
  };
  if (tops.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {tops.map(v => (
        <button key={v.name} type="button" className="touch44" onClick={() => { void use(v); }}
          aria-label={`Use vendor ${v.name}`}
          style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 12px', fontSize: 11, borderRadius: 999 }}>
          {v.name}
        </button>
      ))}
    </div>
  );
}
