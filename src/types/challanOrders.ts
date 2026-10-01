// ─── cash_challan_orders (13 cols) — Cash Challan "Pending Orders" ─────────
// Split out of database.ts (grandfathered over the size limit).

export type CashChallanOrderStatus = 'pending' | 'converted' | 'cancelled';

/** One ordered line: no price — prices are typed when the challan is made. */
export interface CashChallanOrderItem { sku: string; description: string; quantity: number }

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
