// The order as the PO sheet shows it (Motion Lab 06): when a re-read moves
// the order along its rail, everything on the sheet except the rail itself
// — the pill, the caption, the next-step buttons, the header and the lines —
// keeps showing the order as it was while the light travels, and takes the
// new order the moment the rail lands (`land`, or a safety timeout). A
// re-read that does not move the rail, or a different order, is shown at
// once. `holding` is true while the old order is shown, so its buttons wait.
import { useCallback, useEffect, useRef, useState } from 'react';
import { railState, travels, TRAVEL_MS } from './PORail';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

export interface OrderView { po: PurchaseOrder; items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[] }
/** Anything the rail can place: the detail's full order, or a list row (POListCard). */
type Placeable = { po: PurchaseOrder; items: Pick<PurchaseOrderItem, 'quantity' | 'received_qty'>[]; receipts: unknown };

export function useLandedOrder<V extends Placeable = OrderView>(live: V, audit: AuditLog[] | null | 'error'): { shown: V; holding: boolean; land: () => void } {
  const [held, setHeld] = useState(live);
  const liveRef = useRef(live); liveRef.current = live;
  const fly = held.po.id === live.po.id && travels(railState(held.po, held.items, audit), railState(live.po, live.items, audit));
  if (!fly && (held.po !== live.po || held.items !== live.items || held.receipts !== live.receipts)) setHeld(live);
  useEffect(() => {
    if (!fly) return;
    const t = window.setTimeout(() => setHeld(liveRef.current), TRAVEL_MS + 700);
    return () => window.clearTimeout(t);
  }, [fly]);
  const land = useCallback(() => setHeld(liveRef.current), []);
  return { shown: fly ? held : live, holding: fly, land };
}
