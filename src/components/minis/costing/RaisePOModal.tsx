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
import { loadInhouse, saveInhouse, isInhouse } from './inhouse';
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
  // In-house work (stitching, cutting, ironing…) costs the product but gets
  // no PO. Shared list; "Mark in-house" / "Needs a PO" edit it right here.
  const [inhouse, setInhouse] = useState<string[]>([]);
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
    loadInhouse().then(({ names, error }) => { if (!alive) return; if (error) addToast(friendlyError(error), 'error'); setInhouse(names); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setInhouseFor = async (sup: string, on: boolean) => {
    const next = on ? [...inhouse, sup.trim().toUpperCase()] : inhouse.filter(n => n !== sup.trim().toUpperCase());
    const err = await saveInhouse(next);
    if (err) { addToast(friendlyError(err), 'error'); return; }
    setInhouse(next); addToast(on ? `${sup} marked in-house — no PO` : `${sup} will get a PO`, 'success');
  };
  const vendorSuppliers = suppliers.filter(s => !isInhouse(inhouse, s));
  const inhouseSuppliers = suppliers.filter(s => isInhouse(inhouse, s));

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
            One draft PO per supplier, filled from the purchase plan. Each opens in the PO form for you to check before saving — the PO links back to this costing. In-house work is listed at the bottom and gets no PO.
          </div>
          {vendorSuppliers.length === 0 && <div style={{ padding: '18px 0', textAlign: 'center', color: T.tx3, fontSize: 11 }}>Everything on this sheet is in-house — nothing to order.</div>}
          {vendorSuppliers.map(sup => {
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {!done && <button type="button" onClick={() => setInhouseFor(sup, true)} title="Work done by us — no PO" style={{ border: 'none', background: 'none', color: T.tx3, fontSize: 10, cursor: 'pointer', padding: '4px 2px', minHeight: 30 }}>Mark in-house</button>}
                    {done
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: T.gr, whiteSpace: 'nowrap' }}>PO #{done} drafted</span>
                      : <button onClick={() => setOpenFor(sup)} disabled={vendors === null} style={{ ...S.btnPrimary, minHeight: 36, whiteSpace: 'nowrap', opacity: vendors === null ? 0.5 : 1 }}>Create draft PO</button>}
                  </div>
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
          {inhouseSuppliers.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...S.fLabel, marginBottom: 6 }}>In-house · no PO</div>
              {inhouseSuppliers.map(sup => {
                const rows = lines.filter(l => l.supplier === sup);
                return (
                  <div key={sup} style={{ border: `1px dashed ${T.bd}`, borderRadius: 10, padding: '8px 12px', marginBottom: 8, opacity: 0.85 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.tx2 }}>{sup} <span style={{ fontSize: 10, color: T.tx3, fontWeight: 400 }}>· {rows.map(l => l.sub).join(', ')}</span></span>
                      <button type="button" onClick={() => setInhouseFor(sup, false)} style={{ border: 'none', background: 'none', color: T.ac2, fontSize: 10, cursor: 'pointer', padding: '4px 2px', minHeight: 30, whiteSpace: 'nowrap' }}>Needs a PO</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
