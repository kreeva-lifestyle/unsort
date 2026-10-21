// "Whose challan is it?" — the first step of receiving a challan from the
// list: the vendors with an open order, most orders first. Matched the way
// receive_po_challan matches a vendor: the vendor record, else the typed
// name (8 older orders have no vendor record).
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';

export const OPEN = ['approved', 'sent', 'partially_received'];
export type ChallanVendor = { id: string | null; name: string };

export default function POChallanVendors({ onPick, onError }: { onPick: (v: ChallanVendor) => void; onError: (e: unknown) => void }) {
  const [vendors, setVendors] = useState<{ v: ChallanVendor; count: number }[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('purchase_orders').select('vendor_id, vendor_name').in('status', OPEN).then(({ data, error }) => {
      if (!alive) return;
      if (error) { onError(error); setVendors([]); return; }
      const m = new Map<string, { v: ChallanVendor; count: number }>();
      for (const r of (data as { vendor_id: string | null; vendor_name: string }[] | null) ?? []) {
        const k = r.vendor_id ?? `n:${r.vendor_name.trim().toLowerCase()}`;
        const x = m.get(k) ?? { v: { id: r.vendor_id, name: r.vendor_name }, count: 0 };
        x.count++; m.set(k, x);
      }
      setVendors([...m.values()].sort((a, b) => b.count - a.count || a.v.name.localeCompare(b.v.name)));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once when the step opens
  }, []);
  const muted: React.CSSProperties = { fontSize: 12, color: T.tx3, padding: '20px 0', textAlign: 'center' };
  return (
    <>
      <div style={{ fontSize: 12, color: T.tx2, marginBottom: 10 }}>Whose challan is it?</div>
      {vendors === null && <div style={muted}>Loading…</div>}
      {vendors?.length === 0 && <div style={muted}>No vendor has an open order right now.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {vendors?.map(x => (
          <button key={x.v.id ?? x.v.name} type="button" onClick={() => onPick(x.v)}
            style={{ ...S.btnGhost, justifyContent: 'space-between', minHeight: 44, color: T.tx, background: T.glass1, borderColor: T.bd }}>
            <span style={{ fontWeight: 600 }}>{x.v.name}</span><span style={{ fontSize: 11, color: T.tx3 }}>{x.count} open order{x.count === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
    </>
  );
}
