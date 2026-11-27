// The item cards of the PO form (split out of POForm so that file stops
// growing). One CARD per item — the costing-editor pattern the owner
// approved: a fixed structure that never free-wraps at phone width.
// Fabric POs get a "Fabric code" box next to the item name (compulsory,
// checked again by the RPC), offering codes used on earlier POs as you type,
// and "Fabric is for" (POComponentField): the part of the design it is for.
// A code ordered before fills the line from that order, or offers the
// design's earlier fabrics for one tap (POSkuHistory).
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { numericKeyDown } from '../../lib/numericInput';
import SkuInput from '../ui/SkuInput';
import SuggestInput from '../ui/SuggestInput';
import ItemNameChips, { useRecentItemNames } from './ItemNameChips';
import POComponentField from './POComponentField';
import { touchedRow, partOptional } from './poFormSave';
import POSkuHistory from './POSkuHistory';
import { skuKey, type SkuFabric } from './poSkuHistory';
import type { PurchaseOrderType } from '../../types/database';

/** `id` / `received` / `ordered`: an existing line on a revision — it keeps its id, and a cut stops at what arrived on it.
 *  `buffer`: the part of the quantity ordered as buffer over the costing plan (set in Raise POs, kept on edits).
 *  `component`: what a fabric line is for ("LEHENGA, BLOUSE"); `hadPart`: an existing line came with one (a revision may not blank it).
 *  `autoSku`: the code this line was filled for from an earlier order (it is not filled a second time for the same code). */
export type FormItem = { id?: string; received?: number; ordered?: number; buffer?: number; hadPart?: boolean; autoSku?: string; sku: string; item_name: string; fabric_code: string; component: string; quantity: string; unit: string; rate: string };
// The quantity starts empty: over a pre-filled "1", typing 50 gave 150.
export const blankItem = (): FormItem => ({ sku: '', item_name: '', fabric_code: '', component: '', quantity: '', unit: '', rate: '' });
const UNIT_OPTIONS = ['Meter', 'Piece', 'Dozen'];
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });

type Vendor = { id: string | null; name: string; phone: string };

export default function POItemRows({ items, poType, forPieces, amend, tried, vendor, onVendor, onType, onChange, onRemove, onAdd }: {
  items: FormItem[];
  poType: PurchaseOrderType | '';
  forPieces: string;
  /** A revision: a line already on the order without "Fabric is for" may stay so (older orders have none). */
  amend: boolean;
  /** Save was tried and refused: what is still missing shows red. */
  tried: boolean;
  /** The form's vendor and type: a line filled from an earlier order also picks these when they are still empty. */
  vendor: Vendor; onVendor: (v: Vendor) => void; onType: (t: PurchaseOrderType) => void;
  onChange: (i: number, patch: Partial<FormItem>) => void;
  onRemove: (i: number) => void;
  /** A new line — blank, or already holding another fabric of the same design. */
  onAdd: (patch?: Partial<FormItem>) => void;
}) {
  const fabric = poType === 'fabric';
  const skuRequired = fabric || poType === 'material';
  const recentNames = useRecentItemNames(poType);
  // An earlier order's fabric as this form holds it; the unit a line already has is kept.
  const asLine = (f: SkuFabric, sku: string, unit = ''): Partial<FormItem> => ({ item_name: f.item_name, fabric_code: f.fabric_code ?? '', component: f.component ?? '', unit: unit || f.unit || '', autoSku: skuKey(sku) });
  const fill = (i: number, f: SkuFabric) => {
    onChange(i, asLine(f, items[i].sku, items[i].unit));
    if (!poType) onType(f.po_type);
    // The vendor too, when none is chosen yet and Contacts has this one with a phone.
    if (!vendor.id && !vendor.name.trim() && f.vendor_id && (f.vendor_phone ?? '').replace(/\D/g, '').length >= 10) onVendor({ id: f.vendor_id, name: f.vendor_name, phone: f.vendor_phone ?? '' });
  };
  // Previously used fabric codes, fetched once the first time the form is a
  // fabric PO (never on a job-work form). Best-effort: without the list the
  // box is still a plain text field.
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    if (!fabric || codes !== null) return;
    let alive = true;
    supabase.rpc('po_fabric_codes').then(({ data, error }) => {
      if (!alive) return;
      if (error) { logSwallowed('PO fabric code suggestions', error); setCodes([]); return; }
      setCodes(((data as string[] | null) || []).filter(Boolean));
    });
    return () => { alive = false; };
  }, [fabric, codes]);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {items.map((it, i) => {
          const amt = num(it.quantity) * num(it.rate);
          // A line with goods in stays (its balance is cancelled from the order instead).
          const locked = items.length === 1 || !!it.received;
          return (
            <div key={i} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.015)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                {/* sizes off (owner's call): POs order fabric/job work at
                    the parent-design level. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SkuInput value={it.sku} onChange={v => onChange(i, { sku: v })} sizes={false} placeholder={skuRequired ? 'SKU *' : 'SKU'} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                </div>
                <button onClick={() => onRemove(i)} disabled={locked} title={it.received ? 'Goods already arrived on this line — cancel its balance from the order' : undefined} style={{ border: 'none', background: 'none', cursor: locked ? 'not-allowed' : 'pointer', color: T.re, opacity: locked ? 0.25 : 0.7, fontSize: 18, padding: '8px 10px', lineHeight: 1, flexShrink: 0 }} aria-label="Remove item">&times;</button>
              </div>
              <POSkuHistory row={it} rows={items} last={items.map(x => skuKey(x.sku)).lastIndexOf(skuKey(it.sku)) === i} vendorId={vendor.id} pieces={forPieces}
                onFill={f => fill(i, f)} onAdd={f => onAdd({ sku: it.sku, ...asLine(f, it.sku) })} onQty={q => onChange(i, { quantity: q })}
                onClear={() => onChange(i, { item_name: '', fabric_code: '', component: '' })} />
              <div style={{ display: 'grid', gridTemplateColumns: fabric ? '1fr 1fr' : '1fr', gap: 6, marginBottom: 8 }}>
                <input value={it.item_name} onChange={e => onChange(i, { item_name: e.target.value })} placeholder={fabric ? 'Fabric name *' : 'Item name *'} style={{ ...S.fInput, width: '100%', minWidth: 0 }} />
                {fabric && (
                  <SuggestInput value={it.fabric_code} onChange={v => onChange(i, { fabric_code: v })} options={codes || []} placeholder="Fabric code *"
                    style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} inputProps={{ 'aria-label': 'Fabric code' }} />
                )}
              </div>
              {!it.item_name.trim() && <ItemNameChips names={recentNames} onPick={n => onChange(i, { item_name: n })} />}
              {fabric && <POComponentField sku={it.sku} value={it.component} onChange={v => onChange(i, { component: v })} missing={tried && touchedRow(it) && !it.component.trim() && !partOptional(it, amend)} />}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <input value={it.quantity} onChange={e => onChange(i, { quantity: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="Qty" style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} />
                <select value={it.unit} onChange={e => onChange(i, { unit: e.target.value })} style={{ ...S.fInput, width: '100%', minWidth: 0, color: it.unit ? T.tx : T.tx3 }}>
                  <option value="">Unit</option>
                  {it.unit && !UNIT_OPTIONS.includes(it.unit) && <option value={it.unit}>{it.unit}</option>}
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={it.rate} onChange={e => onChange(i, { rate: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="Rate" style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} />
              </div>
              {!!it.buffer && num(it.quantity) > 0 && (
                <div style={{ fontSize: 12, color: T.ac2, marginTop: 6 }}>
                  {fmt(Math.max(0, num(it.quantity) - it.buffer))} {it.unit} for {forPieces.trim() ? `${forPieces} pcs` : 'the plan'} + {fmt(Math.min(it.buffer, num(it.quantity)))} buffer = {fmt(num(it.quantity))} {it.unit}
                </div>
              )}
              {(!!it.received || amt > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginTop: 6 }}>
                  <span style={{ color: T.gr }}>{it.received ? `${it.received} already received — a cut stops there` : ''}</span>
                  {amt > 0 && <span style={{ fontFamily: T.mono, color: T.tx2 }}>= ₹{amt.toLocaleString('en-IN')}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={() => onAdd()} style={{ ...S.btnGhost, ...S.btnSm, marginTop: 8, borderStyle: 'dashed', minHeight: 36 }}>+ Add item</button>
    </>
  );
}
