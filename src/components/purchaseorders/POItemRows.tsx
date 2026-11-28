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
import POComponentField, { cleanComponent } from './POComponentField';
import { touchedRow, partOptional } from './poFormSave';
import POSkuHistory from './POSkuHistory';
import { skuKey, type SkuFabric } from './poSkuHistory';
import { lineFrom, unfill, fillStands, type FillMark } from './poSkuFill';
import type { PurchaseOrderType } from '../../types/database';

/** `id` / `received` / `ordered`: an existing line on a revision — it keeps its id, and a cut stops at what arrived on it.
 *  `buffer`: the part of the quantity ordered as buffer over the costing plan (set in Raise POs, kept on edits).
 *  `component`: what a fabric line is for ("LEHENGA, BLOUSE"); `hadPart`: an existing line came with one (a revision may not blank it).
 *  `filled`: what a tap on an earlier order's fabric wrote on this line (poSkuFill), so Clear can take exactly that back.
 *  `uid`: the card's own key — removing a line must not hand its look-up and state to the next one. */
export type FormItem = { uid?: string; id?: string; received?: number; ordered?: number; buffer?: number; hadPart?: boolean; filled?: FillMark; sku: string; item_name: string; fabric_code: string; component: string; quantity: string; unit: string; rate: string };
// The quantity starts empty: over a pre-filled "1", typing 50 gave 150.
let uidSeq = 0;
export const blankItem = (): FormItem => ({ uid: `line${++uidSeq}`, sku: '', item_name: '', fabric_code: '', component: '', quantity: '', unit: '', rate: '' });
const UNIT_OPTIONS = ['Meter', 'Piece', 'Dozen'];
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });

type Vendor = { id: string | null; name: string; phone: string };

export default function POItemRows({ items, poType, forPieces, lumpSum, amend, tried, vendor, onVendor, onType, onChange, onRemove, onAdd }: {
  items: FormItem[];
  poType: PurchaseOrderType | '';
  forPieces: string;
  /** Priced as a whole: no piece count, so last time's quantity is offered as it was. */
  lumpSum: boolean;
  /** A revision: a line already on the order without "Fabric is for" may stay so (older orders have none). */
  amend: boolean;
  /** Save was tried and refused: what is still missing shows red. */
  tried: boolean;
  /** The form's vendor and type: a line filled from an earlier order also picks these when they are still empty. */
  vendor: Vendor; onVendor: (v: Vendor) => void; onType: (t: PurchaseOrderType | '') => void;
  onChange: (i: number, patch: Partial<FormItem>) => void;
  onRemove: (i: number) => void;
  /** A new line — blank, or already holding another fabric of the same design. */
  onAdd: (patch?: Partial<FormItem>) => void;
}) {
  const fabric = poType === 'fabric';
  const skuRequired = fabric || poType === 'material';
  const recentNames = useRecentItemNames(poType);
  // A tap on an earlier order's fabric fills the line — and, only while they are still empty, the form's type and
  // vendor (the row tapped showed that vendor's name; never one switched off in Contacts). An order without a contact
  // gives the name alone: the save asks for the rest.
  const fill = (i: number, f: SkuFabric) => {
    const setsVendor = !vendor.id && !vendor.name.trim() && !!f.vendor_name.trim() && f.vendor_active !== false;
    onChange(i, lineFrom(f, items[i], { ...(poType ? {} : { type: f.po_type }), ...(setsVendor ? { vendor: f.vendor_id ?? f.vendor_name } : {}) }));
    if (!poType) onType(f.po_type);
    if (setsVendor) onVendor({ id: f.vendor_id, name: f.vendor_name, phone: f.vendor_id ? f.vendor_phone ?? '' : '' });
  };
  // Clear (`all`), or the code now names another design: what the tap wrote goes, and with it the vendor and the
  // type the same tap chose — unless another line has been built on them since (more than a code typed on it).
  const builtOn = (x: FormItem) => !!(x.id || x.item_name.trim() || x.fabric_code.trim() || x.component.trim() || x.quantity.trim() || x.rate.trim());
  const takeBack = (i: number, all: boolean, more: Partial<FormItem> = {}) => {
    const it = items[i], m = it.filled, undo = unfill(it, all);
    const back = !!m && (all || fillStands(it)) && !items.some((x, j) => j !== i && builtOn(x));
    const dropType = back && !!m?.type && poType === m.type;
    if (undo.unit === '' && fabric && !dropType) undo.unit = 'Meter'; // the form stays a fabric order: fabric is bought by the meter
    onChange(i, { ...undo, ...more });
    if (dropType) onType('');
    if (back && m?.vendor && (vendor.id ?? vendor.name) === m.vendor) onVendor({ id: null, name: '', phone: '' });
  };
  const changeSku = (i: number, v: string) => (items[i].filled && skuKey(v) !== items[i].filled.key ? takeBack(i, false, { sku: v }) : onChange(i, { sku: v }));
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
            <div key={it.uid ?? i} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.015)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                {/* sizes off (owner's call): POs order fabric/job work at
                    the parent-design level. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SkuInput value={it.sku} onChange={v => changeSku(i, v)} sizes={false} placeholder={skuRequired ? 'SKU *' : 'SKU'} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                </div>
                <button onClick={() => onRemove(i)} disabled={locked} title={it.received ? 'Goods already arrived on this line — cancel its balance from the order' : undefined} style={{ border: 'none', background: 'none', cursor: locked ? 'not-allowed' : 'pointer', color: T.re, opacity: locked ? 0.25 : 0.7, fontSize: 18, padding: '8px 10px', lineHeight: 1, flexShrink: 0 }} aria-label="Remove item">&times;</button>
              </div>
              <POSkuHistory row={it} rows={items} last={items.map(x => skuKey(x.sku)).lastIndexOf(skuKey(it.sku)) === i} vendor={vendor} poType={poType} pieces={forPieces} lumpSum={lumpSum}
                onFill={f => fill(i, f)} onAdd={f => onAdd({ sku: it.sku, ...lineFrom(f, { sku: it.sku, unit: '', component: '' }) })}
                onQty={(q, unit) => onChange(i, { quantity: q, ...(unit ? { unit } : {}), ...(it.filled ? { filled: { ...it.filled, qty: q } } : {}) })} onClear={() => takeBack(i, true)} />
              <div style={{ display: 'grid', gridTemplateColumns: fabric ? '1fr 1fr' : '1fr', gap: 6, marginBottom: 8 }}>
                <input value={it.item_name} onChange={e => onChange(i, { item_name: e.target.value })} placeholder={fabric ? 'Fabric name *' : 'Item name *'} style={{ ...S.fInput, width: '100%', minWidth: 0 }} />
                {fabric && (
                  <SuggestInput value={it.fabric_code} onChange={v => onChange(i, { fabric_code: v })} options={codes || []} placeholder="Fabric code *"
                    style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} inputProps={{ 'aria-label': 'Fabric code' }} />
                )}
              </div>
              {!it.item_name.trim() && <ItemNameChips names={recentNames} onPick={n => onChange(i, { item_name: n })} />}
              {fabric && <POComponentField sku={it.sku} value={it.component} onChange={v => onChange(i, { component: v })} missing={tried && touchedRow(it, true) && !cleanComponent(it.component) && !partOptional(it, amend)} />}
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
