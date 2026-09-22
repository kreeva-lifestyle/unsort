// Purchase Orders types (po_vendors, purchase_orders, purchase_order_items,
// purchase_order_receipts) and the RPC payloads. Split out of database.ts,
// which re-exports everything here — import from either.
// ─── Purchase Orders ────────────────────────────────────────────────────
// Vendor master (only name + phone are mandatory).
export interface POVendor {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  /** Nullable live (default true, never set by the app to null). */
  is_active: boolean | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type POVendorInsert = {
  id?: string;
  name: string;
  phone: string;
  gstin?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
};

export type PurchaseOrderStatus =
  | 'draft' | 'approved' | 'sent' | 'partially_received' | 'completed' | 'closed' | 'cancelled';
export type PurchaseOrderType = 'fabric' | 'job_work' | 'material';

// purchase_orders header. Money fields are recomputed server-side in the RPCs.
export interface PurchaseOrder {
  id: string;
  po_number: number;
  vendor_id: string | null;
  vendor_name: string;
  vendor_phone: string | null;
  po_type: PurchaseOrderType;
  status: PurchaseOrderStatus;
  po_date: string | null;
  expected_date: string | null;
  payment_terms: string | null;
  notes: string | null;
  /** Internal: how many finished pieces this purchase is for. Never printed or shared. NULL only on a lump-sum order. */
  for_pieces: number | null;
  /** Priced as a whole — "For how many pcs" is optional on such an order. */
  lump_sum: boolean;
  /** The product costing this PO was raised from (explicit link, set null if the costing is deleted). */
  costing_product_id: string | null;
  subtotal: number | null;
  discount_type: 'flat' | 'percentage' | null;
  discount_value: number | null;
  discount_amount: number | null;
  tax_percent: number | null;
  tax_amount: number | null;
  other_charges: number | null;
  round_off: number | null;
  grand_total: number | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  /** Short-close: the undelivered balance was written off, with a reason. */
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  item_name: string;
  sku: string | null;
  /** Fabric POs only: the vendor's fabric code (compulsory there, null elsewhere). */
  fabric_code: string | null;
  quantity: number;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  received_qty: number;
  sort_order: number | null;
  created_at: string | null;
}

export interface PurchaseOrderReceipt {
  id: string;
  po_id: string;
  po_item_id: string;
  received_qty: number;
  receipt_date: string | null;
  remarks: string | null;
  received_by: string | null;
  created_at: string | null;
}

// Payloads passed to the create/update RPCs (money left to the server).
export type POItemInput = {
  item_name: string;
  sku?: string | null;
  fabric_code?: string | null;
  quantity: number;
  unit?: string | null;
  rate?: number | null;
  sort_order?: number;
};

export type POHeaderInput = {
  vendor_id?: string | null;
  vendor_name: string;
  vendor_phone?: string | null;
  po_type?: PurchaseOrderType;
  po_date?: string | null;
  expected_date?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  for_pieces?: number | null;
  lump_sum?: boolean;
  costing_product_id?: string | null;
  discount_type?: 'flat' | 'percentage' | null;
  discount_value?: number | null;
  tax_percent?: number | null;
  other_charges?: number | null;
  round_off?: number | null;
};

export const PO_STATUSES: PurchaseOrderStatus[] =
  ['draft', 'approved', 'sent', 'partially_received', 'completed', 'closed', 'cancelled'];
export const PO_TYPES: PurchaseOrderType[] = ['fabric', 'job_work', 'material'];
export const PO_TYPE_LABELS: Record<PurchaseOrderType, string> =
  { fabric: 'Fabric', job_work: 'Job Work', material: 'Material' };
export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft', approved: 'Approved', sent: 'Sent',
  partially_received: 'Partially Received', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled',
};
