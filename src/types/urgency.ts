// The Urgent flag shared by purchase orders, jobwork orders and cash-challan
// orders (migration 20261025090000_urgent_flag): the same four columns on
// each table, written only through the set_urgent RPC.
export interface Urgent {
  is_urgent: boolean;
  /** Why — in-house only, never on a shared message. */
  urgent_reason: string | null;
  /** Needed-by date (yyyy-mm-dd), optional. */
  urgent_by: string | null;
  urgent_at: string | null;
}

/** The audit_log module names, as set_urgent takes them. */
export type UrgentModule = 'purchase_order' | 'jobwork' | 'cash_challan_order';
