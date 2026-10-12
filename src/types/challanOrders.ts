// ─── cash_challan_orders (13 cols) — Cash Challan "Orders" ─────────────────
// Split out of database.ts (grandfathered over the size limit).

/** 'converted' = every piece has gone out on a challan (shown as Completed). */
export type CashChallanOrderStatus = 'pending' | 'converted' | 'cancelled';

/** One ordered line: no price — prices are typed when the challan is made.
 *  `delivered` = pieces already on a challan (absent = 0), written by
 *  create_challan_from_order and handed back when that challan is voided. */
export interface CashChallanOrderItem { sku: string; description: string; quantity: number; delivered?: number }

// ─── cash_challan_order_deliveries (7 cols) ───────────────────────────────
/** One challan made from an order and what it took. reversed_at = that challan was voided. */
export interface CashChallanOrderDelivery {
  id: string;
  order_id: string;
  challan_id: string;
  lines: { sku: string; description: string; qty: number }[];
  reversed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CashChallanOrder {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  items: CashChallanOrderItem[];
  notes: string | null;
  status: CashChallanOrderStatus;
  /** The challan this order became (status 'converted'). */
  challan_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  converted_at: string | null;
  converted_by: string | null;
}

export type CashChallanOrderInsert = {
  id?: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  items: CashChallanOrderItem[];
  notes?: string | null;
  status?: CashChallanOrderStatus;
  challan_id?: string | null;
  created_by?: string | null;
  updated_at?: string;
};
