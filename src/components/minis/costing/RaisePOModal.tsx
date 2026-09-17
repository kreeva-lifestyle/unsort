// Raise draft POs from a costing sheet's purchase plan (owner's ask): one
// supplier block = one PO. Each block opens the REAL PO form pre-filled —
// vendor (matched to the vendor list by name, else the name alone), type
// (fabric when every line is by the metre/yard, else material), the
// product SKU on every line, sub-material as item name, material code as
// fabric code, buy quantity, unit, costing rate, pieces — and the costing
// id, so the PO remembers where it came from. The user reviews and saves;
// nothing is written until they do.
import { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import { CostingProduct, purchasePlan, money } from './costingModel';
import type { POPrefill } from '../../purchaseorders/POForm';

const POForm = lazy(() => import('../../purchaseorders/POForm'));

type Vendor = { id: string; name: string; phone: string };
const FABRIC_UNITS = new Set(['Meter', 'Yard']);
const qty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function RaisePOModal({ product, pieces, onClose, addToast }: {
  product: CostingProduct;
  pieces: number;
  onClose: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { lines, suppliers } = purchasePlan(product.components, pieces);
  // Vendor list is small by nature; one fetch, matched case-insensitively.
  const [vendors, setVendors] = useState<Map<string, Vendor> | null>(null);
  const [raised, setRaised] = useState<Record<string, number>>({});
  const [openFor, setOpenFor] = useState<string | null>(null);
  useModalLock();
  useBackClose(!openFor, onClose);

  useEffect(() => {
    let alive = true;
    supabase.from('po_vendors').select('id, name, phone').or('is_active.is.null,is_active.eq.true').limit(500)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { addToast(friendlyError(error), 'error'); setVendors(new Map()); return; }
        setVendors(new Map(((data as Vendor[] | null) || []).map(v => [v.name.trim().toUpperCase(), v])));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendorFor = (sup: string) => vendors?.get(sup.trim().toUpperCase()) ?? null;
  const prefillFor = (sup: string): POPrefill => {
    const rows = lines.filter(l => l.supplier === sup);
    const v = vendorFor(sup);
    return {
      vendor_id: v?.id ?? null, vendor_name: v?.name ?? sup, vendor_phone: v?.phone ?? null,
      po_type: rows.every(l => FABRIC_UNITS.has(l.unit)) ? 'fabric' : 'material',
      for_pieces: pieces, costing_product_id: product.id,
      items: rows.map(l => ({ sku: product.sku, item_name: l.sub, fabric_code: l.materialCode || null, quantity: l.totalQty, unit: l.unit, rate: l.rate > 0 ? l.rate : null })),
    };
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 640, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Raise POs — {product.sku} × {pieces} pcs</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
            One draft PO per supplier, filled from the purchase plan. Each opens in the PO form for you to check before saving — the PO links back to this costing.
          </div>
          {suppliers.map(sup => {
            const rows = lines.filter(l => l.supplier === sup);
            const total = rows.reduce((t, l) => t + l.cost, 0);
            const v = vendorFor(sup);
            const done = raised[sup];
            return (
              <div key={sup} style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, marginBottom: 10, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>{sup}</div>
                    <div style={{ fontSize: 10, color: vendors === null ? T.tx3 : v ? T.gr : T.yl, marginTop: 2 }}>
                      {vendors === null ? 'Checking vendor list…' : v ? `Vendor on file${v.phone ? ` · ${v.phone}` : ''}` : 'Not on the vendor list yet — add the phone in the form'}
                    </div>
                  </div>
                  {done
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: T.gr, whiteSpace: 'nowrap' }}>PO #{done} drafted</span>
                    : <button onClick={() => setOpenFor(sup)} disabled={vendors === null} style={{ ...S.btnPrimary, minHeight: 36, whiteSpace: 'nowrap', opacity: vendors === null ? 0.5 : 1 }}>Create draft PO</button>}
                </div>
                {rows.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, padding: '4px 0', borderTop: `1px solid ${T.bd}` }}>
                    <span style={{ color: T.tx, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.sub}{l.materialCode && <span style={{ color: T.tx3, fontFamily: T.mono }}> · {l.materialCode}</span>}<span style={{ color: T.tx3 }}> ({l.component})</span></span>
                    <span style={{ fontFamily: T.mono, color: T.tx2, whiteSpace: 'nowrap' }}>{qty(l.totalQty)} {l.unit} × {money(l.rate)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, fontFamily: T.mono, color: T.tx2, paddingTop: 6, borderTop: `1px solid ${T.bd}` }}>{money(total)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Done</button>
        </div>
      </div>
      {openFor && (
        <Suspense fallback={null}>
          <POForm editing={null} prefill={prefillFor(openFor)} addToast={addToast} onClose={() => setOpenFor(null)}
            onSaved={r => { setRaised(prev => ({ ...prev, [openFor]: r.po_number })); addToast(`PO #${r.po_number} drafted for ${openFor}`, 'success'); setOpenFor(null); }} />
        </Suspense>
      )}
    </div>,
    document.body,
  );
}
