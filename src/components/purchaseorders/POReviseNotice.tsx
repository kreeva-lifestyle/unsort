// "Rev 2 — tell the vendor": the newest revision of an order the vendor
// already has, while nobody has sent it yet. One tap opens WhatsApp with the
// revised order typed in (poWhatsApp.revisedText) and records that it went;
// "Already told" records that too. Gone once either is done, and never shown
// for a change the vendor does not see (rates, totals) or for an order that
// was sent to the vendor after the revision.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S, alpha } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { waLink, waPhone } from '../../lib/whatsapp';
import { revisedText, vendorVisible } from './poWhatsApp';
import type { PORevisionRow } from './poDetailData';
import type { AuditLog, PurchaseOrder, PurchaseOrderItem } from '../../types/database';

/** The revision the vendor still has to hear about, or null. The newest one
 *  the vendor would see decides — a rates-only revision after it never hides
 *  it — and once that one is sent its "order now" list covers older ones. */
export function pendingRevision(po: PurchaseOrder, revisions: PORevisionRow[] | null, audit: AuditLog[] | null | 'error'): PORevisionRow | null {
  const latest = revisions?.find(vendorVisible);
  if (!latest || latest.notified_at) return null;
  // Not yet with the vendor (the share / mark-sent carries the current order), or no longer an order to confirm.
  if (['draft', 'approved', 'cancelled', 'closed'].includes(po.status)) return null;
  const sent = Array.isArray(audit) ? audit.find(a => a.action === 'SENT') : null;
  if (sent?.created_at && sent.created_at > latest.created_at) return null;
  return latest;
}

export default function POReviseNotice({ po, items, rev, onDone, addToast }: {
  po: PurchaseOrder; items: PurchaseOrderItem[]; rev: PORevisionRow;
  onDone: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const text = revisedText(po, rev, items);
  if (!text) return null;
  const mark = async (how: 'whatsapp' | 'told') => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_po_revision_notified', { p_revision_id: rev.id, p_how: how });
    setBusy(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    if (how === 'told') addToast(`Noted — the vendor knows about Rev ${rev.revision}`, 'success');
    onDone();
  };
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', margin: '0 0 16px', borderRadius: 10, border: `1px solid ${alpha(T.gr, 0.25)}`, background: alpha(T.gr, 0.06) }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Rev {rev.revision} — tell {po.vendor_name}</div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
          {waPhone(po.vendor_phone) ? 'Sends the changes and the order as it now stands on WhatsApp.' : 'No phone on this order — pick the chat in WhatsApp.'}
        </div>
      </div>
      {/* The two answers stay together (on a phone they drop under the text as one row). */}
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
        <button type="button" onClick={() => mark('told')} style={{ ...S.btnGhost, minHeight: 44 }}>Already told</button>
        {/* A real link: the tap itself opens WhatsApp; the record follows. */}
        <a href={waLink(text, po.vendor_phone)} target="_blank" rel="noopener noreferrer" onClick={() => { void mark('whatsapp'); }}
          style={{ ...S.btnSuccessSolid, minHeight: 44, textDecoration: 'none' }}>
          Send on WhatsApp
        </a>
      </div>
    </div>
  );
}
