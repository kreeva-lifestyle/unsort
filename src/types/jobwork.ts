// Jobwork types (jobwork_orders, jobwork_materials, jobwork_entries,
// jobwork_entry_lines, jobwork_payments, jobwork_order_summary view).
// Re-exported from database.ts — import from either.
// Writes go through the RPCs save_jobwork_order / add_jobwork_entry /
// set_jobwork_status; payments are a plain RLS-gated insert.

// --- jobwork_orders (21 cols) ---
export type JobworkStatus = 'open' | 'closed' | 'cancelled';
export const JOBWORK_STATUSES: JobworkStatus[] = ['open', 'closed', 'cancelled'];

export interface JobworkOrder {
  id: string;
  jw_number: number;
  /** po_vendors row — jobworkers share the Purchase Orders vendor master. */
  vendor_id: string | null;
  vendor_name: string;
  vendor_phone: string | null;
  job_type: string;
  sku: string;
  component: string | null;
  costing_product_id: string | null;
  pieces: number;
  /** Agreed rate per piece; bill = pieces received OK × rate. */
  rate: number;
  job_date: string;
  expected_date: string | null;
  status: JobworkStatus;
  notes: string | null;
  close_reason: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- jobwork_order_summary (view: order + totals) ---
export interface JobworkSummary extends Pick<JobworkOrder,
  'id' | 'jw_number' | 'vendor_id' | 'vendor_name' | 'vendor_phone' | 'job_type' | 'sku' | 'component' |
  'costing_product_id' | 'pieces' | 'rate' | 'job_date' | 'expected_date' | 'status' | 'notes' | 'close_reason' |
  'created_at' | 'updated_at'> {
  pcs_ok: number;
  pcs_rejected: number;
  pcs_rework: number;
  /** pieces − OK − rejected + sent back for rework (never below 0). */
  pcs_remaining: number;
  out_count: number;
  last_entry_date: string | null;
  bill: number;
  paid: number;
  due: number;
  last_pay_date: string | null;
}

// --- jobwork_materials (9 cols) ---
export interface JobworkMaterial {
  id: string;
  order_id: string;
  name: string;
  unit: string;
  /** Expected usage per finished piece — lets the balance say what should be left. */
  per_piece: number | null;
  sort_order: number;
  /** Taken off the job (soft) — kept so history never loses its name. */
  removed: boolean;
  created_at: string;
  updated_at: string;
}

// --- jobwork_entries (10 cols) ---
export type JobworkEntryKind = 'out' | 'in';
export interface JobworkEntry {
  id: string;
  order_id: string;
  kind: JobworkEntryKind;
  entry_date: string;
  pcs_ok: number;
  pcs_rejected: number;
  /** OUT only: rejected pieces sent back to be repaired. */
  pcs_rework: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// --- jobwork_entry_lines (5 cols) ---
export interface JobworkEntryLine {
  id: string;
  entry_id: string;
  material_id: string;
  qty: number;
  created_at: string;
}

// --- jobwork_payments (9 cols) ---
export type JobworkPayMode = 'cash' | 'bank' | 'upi' | 'cheque' | 'other';
export const JOBWORK_PAY_MODES: JobworkPayMode[] = ['cash', 'bank', 'upi', 'cheque', 'other'];
export interface JobworkPayment {
  id: string;
  order_id: string;
  pay_date: string;
  amount: number;
  mode: JobworkPayMode;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
export type JobworkPaymentInsert = {
  order_id: string;
  pay_date?: string;
  amount: number;
  mode: JobworkPayMode;
  reference?: string | null;
  note?: string | null;
};
