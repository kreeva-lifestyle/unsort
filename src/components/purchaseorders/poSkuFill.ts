// What a tap on an earlier order's fabric writes on a PO line, and how it is
// taken back (poSkuHistory has the look-up, POSkuHistory the screen part).
// The line remembers exactly what the tap wrote (FillMark) so that Clear, or
// changing the code to another design, removes that — and with it the vendor
// and the type when the same tap chose them — and nothing typed since. Pure.
import { skuKey, type SkuFabric } from './poSkuHistory';
import type { FormItem } from './POItemRows';
import type { PurchaseOrderType } from '../../types/database';

export interface FillMark {
  /** The design (SKU key) the line was filled for, and the order it was copied from. */
  key: string; po: number;
  /** What the tap wrote — and the unit the line had before it. */
  name: string; code: string; part: string; unit: string; unitWas: string;
  /** Only when the tap also chose them for the form: the vendor (its id; its name for an order without a contact) and the type. */
  vendor?: string; type?: PurchaseOrderType;
}

/** The line as an earlier order had it. The earlier order's unit wins over one the line got by itself ("Meter" on a
 *  fabric order, the vendor's usual unit); a part already chosen stays when the earlier order recorded none. */
export function lineFrom(f: SkuFabric, it: Pick<FormItem, 'sku' | 'unit' | 'component'>, chose: Pick<FillMark, 'vendor' | 'type'> = {}): Partial<FormItem> {
  const part = f.component || it.component, unit = f.unit || it.unit;
  return {
    item_name: f.item_name, fabric_code: f.fabric_code ?? '', component: part, ...(unit ? { unit } : {}),
    filled: { key: skuKey(it.sku), po: f.po_number, name: f.item_name, code: f.fabric_code ?? '', part, unit, unitWas: it.unit, ...chose },
  };
}

/** The line still holds what the tap wrote: the user has not made it their own. */
export const fillStands = (it: FormItem): boolean =>
  !!it.filled && it.item_name === it.filled.name && it.fabric_code === it.filled.code && it.component === it.filled.part;

/** Takes a fill back. `all` (Clear): name, code and part go whatever was typed over them. Otherwise (the code now names
 *  another design) they go only while they are still what the tap wrote. The unit returns to what it was if untouched. */
export function unfill(it: FormItem, all: boolean): Partial<FormItem> {
  const m = it.filled;
  if (!m) return {};
  return {
    filled: undefined,
    ...(all || fillStands(it) ? { item_name: '', fabric_code: '', component: '', ...(it.unit === m.unit ? { unit: m.unitWas } : {}) } : {}),
  };
}
