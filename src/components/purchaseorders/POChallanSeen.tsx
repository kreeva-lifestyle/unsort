// "This challan number is already entered" (owner's pick, 27 Nov 2026): as
// the number is typed on a receive sheet, the vendor's earlier receipts are
// asked for it (po_challan_seen: challan no., and the remarks older receipts
// kept it in). A note, never a block — one challan often covers several
// orders, entered one at a time. The lookup is a hint: if it fails, receiving
// goes on without it.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { T, alpha } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { shortDate } from './POHeaderInfo';

export interface ChallanSeen { po_number: number; receipt_date: string | null }
const SHOW = 4;

/** The orders this vendor's challan number was already entered on, newest first; [] while typing, and when there are none. */
export function useChallanSeen(vendor: { id: string | null; name: string } | null, challanNo: string): ChallanSeen[] {
  const [seen, setSeen] = useState<ChallanSeen[]>([]);
  const no = challanNo.trim(), id = vendor?.id ?? null, name = (vendor?.name ?? '').trim();
  useEffect(() => {
    setSeen([]);
    if (!no || !name) return;
    let alive = true;
    const t = window.setTimeout(() => {
      supabase.rpc('po_challan_seen', { p_vendor_id: id, p_vendor_name: name, p_challan_no: no }).then(({ data, error }) => {
        if (!alive) return;
        if (error) { logSwallowed('PO challan already entered', error); return; }
        setSeen((data as ChallanSeen[] | null) ?? []);
      });
    }, 450);
    return () => { alive = false; window.clearTimeout(t); };
  }, [no, id, name]);
  return seen;
}

export default function ChallanSeenNote({ no, seen }: { no: string; seen: ChallanSeen[] }) {
  if (!seen.length) return null;
  const when = shortDate(seen.map(s => s.receipt_date).filter((d): d is string => !!d).sort().pop());
  return (
    <div role="status" style={{ marginTop: 8, background: alpha(T.yl, 0.08), border: `1px solid ${alpha(T.yl, 0.25)}`, borderRadius: 6, padding: '8px 10px', fontSize: 11, lineHeight: 1.5, color: T.yl }}>
      Challan <b style={{ fontFamily: T.mono }}>{no.trim()}</b> is already entered for this vendor — {seen.slice(0, SHOW).map(s => `PO #${s.po_number}`).join(', ')}{seen.length > SHOW ? ` and ${seen.length - SHOW} more` : ''}{when ? ` (last on ${when})` : ''}.
      {' '}Check this is not the same delivery typed twice.
    </div>
  );
}
