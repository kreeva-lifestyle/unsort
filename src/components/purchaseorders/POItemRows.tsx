// The item cards of the PO form (split out of POForm so that file stops
// growing). One CARD per item — the costing-editor pattern the owner
// approved: a fixed structure that never free-wraps at phone width.
// Fabric POs get a "Fabric code" box next to the item name (compulsory,
// checked again by the RPC), offering codes used on earlier POs as you type.
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { numericKeyDown } from '../../lib/numericInput';
import SkuInput from '../ui/SkuInput';
import SuggestInput from '../ui/SuggestInput';
import ItemNameChips, { useRecentItemNames } from './ItemNameChips';
import type { PurchaseOrderType } from '../../types/database';

export type FormItem = { sku: string; item_name: string; fabric_code: string; quantity: string; unit: string; rate: string };
export const blankItem = (): FormItem => ({ sku: '', item_name: '', fabric_code: '', quantity: '1', unit: '', rate: '' });
const UNIT_OPTIONS = ['Meter', 'Piece'];
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

export default function POItemRows({ items, poType, onChange, onRemove, onAdd }: {
  items: FormItem[];
  poType: PurchaseOrderType | '';
  onChange: (i: number, patch: Partial<FormItem>) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  const fabric = poType === 'fabric';
  const skuRequired = fabric || poType === 'material';
  const recentNames = useRecentItemNames(poType);
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
          return (
            <div key={i} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.015)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                {/* sizes off (owner's call): POs order fabric/job work at
                    the parent-design level. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SkuInput value={it.sku} onChange={v => onChange(i, { sku: v })} sizes={false} placeholder={skuRequired ? 'SKU *' : 'SKU'} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                </div>
                <button onClick={() => onRemove(i)} disabled={items.length === 1} style={{ border: 'none', background: 'none', cursor: items.length === 1 ? 'not-allowed' : 'pointer', color: T.re, opacity: items.length === 1 ? 0.25 : 0.7, fontSize: 18, padding: '8px 10px', lineHeight: 1, flexShrink: 0 }} aria-label="Remove item">&times;</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: fabric ? '1fr 1fr' : '1fr', gap: 6, marginBottom: 8 }}>
                <input value={it.item_name} onChange={e => onChange(i, { item_name: e.target.value })} placeholder={fabric ? 'Fabric name *' : 'Item name *'} style={{ ...S.fInput, width: '100%', minWidth: 0 }} />
                {fabric && (
                  <SuggestInput value={it.fabric_code} onChange={v => onChange(i, { fabric_code: v })} options={codes || []} placeholder="Fabric code *"
                    style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} inputProps={{ 'aria-label': 'Fabric code' }} />
                )}
              </div>
              {!it.item_name.trim() && <ItemNameChips names={recentNames} onPick={n => onChange(i, { item_name: n })} />}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <input value={it.quantity} onChange={e => onChange(i, { quantity: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="Qty" style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} />
                <select value={it.unit} onChange={e => onChange(i, { unit: e.target.value })} style={{ ...S.fInput, width: '100%', minWidth: 0, color: it.unit ? T.tx : T.tx3 }}>
                  <option value="">Unit</option>
                  {it.unit && !UNIT_OPTIONS.includes(it.unit) && <option value={it.unit}>{it.unit}</option>}
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={it.rate} onChange={e => onChange(i, { rate: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="Rate" style={{ ...S.fInput, width: '100%', minWidth: 0, fontFamily: T.mono }} />
              </div>
              {amt > 0 && <div style={{ textAlign: 'right', fontSize: 12, fontFamily: T.mono, color: T.tx2, marginTop: 6 }}>= ₹{amt.toLocaleString('en-IN')}</div>}
            </div>
          );
        })}
      </div>
      <button onClick={onAdd} style={{ ...S.btnGhost, ...S.btnSm, marginTop: 8, borderStyle: 'dashed', minHeight: 36 }}>+ Add item</button>
    </>
  );
}
