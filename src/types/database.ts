/**
 * Database types for Unsort.
 * Source of truth: DATABASE-SCHEMA.md (derived from live Supabase schema).
 *
 * Covers the 8 core tables, the 2 inventory_extras* tables, and the 6 cash_*
 * tables used by the invoicing / cash-book modules.
 *
 * Each table has two types:
 *   - Xxx:        Row shape as returned by SELECT. Nullable DB columns are `| null`.
 *   - XxxInsert:  Shape for INSERT. Auto-generated fields and fields with DB defaults
 *                 are optional. Required fields are plain strings.
 *
 * Naming note: the `components` table is exported as `ProductComponent` (not `Component`)
 * to avoid colliding with `React.Component` in files that import both.
 *
 * When schema changes: update DATABASE-SCHEMA.md first, then this file, then consumers.
 * Do NOT redefine these types inline in feature files — import from here.
 */

// ─── profiles (9 cols) ───────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'manager' | 'operator' | 'viewer' | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  cash_pin: string | null;
  phone: string | null;
}

export type ProfileInsert = {
  id: string;
  email: string;
  full_name?: string | null;
  role?: 'admin' | 'manager' | 'operator' | 'viewer' | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  cash_pin?: string | null;
  phone?: string | null;
};

// ─── products (10 cols) ──────────────────────────────────────────────────

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  total_components: number | null;
  is_active: boolean | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type ProductInsert = {
  id?: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  total_components?: number | null;
  is_active?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ─── components (7 cols) ─────────────────────────────────────────────────
// Exported as ProductComponent to avoid clashing with React.Component.

export interface ProductComponent {
  id: string;
  product_id: string;
  component_code: string;
  name: string;
  description: string | null;
  is_critical: boolean | null;
  created_at: string | null;
}

export type ProductComponentInsert = {
  id?: string;
  product_id: string;
  component_code: string;
  name: string;
  description?: string | null;
  is_critical?: boolean | null;
  created_at?: string | null;
};

// ─── inventory_items (20 cols) ───────────────────────────────────────────

export interface InventoryItem {
  id: string;
  product_id: string;
  batch_number: string | null;
  serial_number: string | null;
  status: 'unsorted' | 'damaged' | 'complete' | 'repaired' | 'disposed' | null;
  damage_type: string | null;
  damage_description: string | null;
  damage_severity: string | null;
  location: string | null;
  notes: string | null;
  reported_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  order_id: string | null;
  marketplace: string | null;
  ticket_id: string | null;
  link: string | null;
  paired_with: string | null;
  size: string | null;
  status_changed_at: string | null;
}

export type InventoryItemInsert = {
  id?: string;
  product_id: string;
  batch_number?: string | null;
  serial_number?: string | null;
  status?: 'unsorted' | 'damaged' | 'complete' | 'repaired' | 'disposed' | null;
  damage_type?: string | null;
  damage_description?: string | null;
  damage_severity?: string | null;
  location?: string | null;
  notes?: string | null;
  reported_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  order_id?: string | null;
  marketplace?: string | null;
  ticket_id?: string | null;
  link?: string | null;
  paired_with?: string | null;
  size?: string | null;
  status_changed_at?: string | null;
};

// ─── item_components (6 cols) ────────────────────────────────────────────

export interface ItemComponent {
  id: string;
  inventory_item_id: string;
  component_id: string;
  status: 'missing' | 'present' | 'damaged' | null;
  notes: string | null;
  updated_at: string | null;
}

export type ItemComponentInsert = {
  id?: string;
  inventory_item_id: string;
  component_id: string;
  status?: 'missing' | 'present' | 'damaged' | null;
  notes?: string | null;
  updated_at?: string | null;
};

// ─── activity_logs (9 cols) ──────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  description: string | null;
  created_at: string | null;
}

export type ActivityLogInsert = {
  id?: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  description?: string | null;
  created_at?: string | null;
};

// ─── notifications (9 cols) ──────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  // TODO: tighten to union once notification types are finalized
  type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

export type NotificationInsert = {
  id?: string;
  user_id?: string | null;
  title: string;
  message: string;
  type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
};

// ─── damage_reports (12 cols) ────────────────────────────────────────────

export interface DamageReport {
  id: string;
  inventory_item_id: string;
  report_number: string | null;
  damage_date: string | null;
  damage_type: string;
  cause: string | null;
  estimated_loss: number | null;
  action_taken: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'closed' | null;
  reported_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type DamageReportInsert = {
  id?: string;
  inventory_item_id: string;
  report_number?: string | null;
  damage_date?: string | null;
  damage_type: string;
  cause?: string | null;
  estimated_loss?: number | null;
  action_taken?: string | null;
  status?: 'open' | 'investigating' | 'resolved' | 'closed' | null;
  reported_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ─── inventory_extras (12 cols) ──────────────────────────────────────────

export interface InventoryExtra {
  id: string;
  product_id: string;
  product_name: string;
  component_id: string;
  component_name: string;
  sku: string;
  size: string;
  quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type InventoryExtraInsert = {
  id?: string;
  product_id: string;
  product_name: string;
  component_id: string;
  component_name: string;
  sku: string;
  size: string;
  quantity: number;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ─── inventory_extras_history (9 cols) ───────────────────────────────────

export interface InventoryExtraHistory {
  id: string;
  extra_id: string | null;
  action: string;
  quantity_change: number;
  quantity_after: number;
  reason: string | null;
  related_inventory_item_id: string | null;
  user_id: string | null;
  created_at: string | null;
}

export type InventoryExtraHistoryInsert = {
  id?: string;
  extra_id?: string | null;
  action: string;
  quantity_change: number;
  quantity_after: number;
  reason?: string | null;
  related_inventory_item_id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
};

// ─── cash_book_balances (4 cols) ─────────────────────────────────────────

export interface CashBookBalance {
  id: string;
  date: string;
  opening_balance: number;
  created_at: string | null;
}

export type CashBookBalanceInsert = {
  id?: string;
  date: string;
  opening_balance: number;
  created_at?: string | null;
};

// ─── cash_expenses (7 cols) ──────────────────────────────────────────────

export interface CashExpense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  paid_by: string | null;
  created_at: string | null;
}

export type CashExpenseInsert = {
  id?: string;
  date: string;
  amount: number;
  category: string;
  description?: string | null;
  paid_by?: string | null;
  created_at?: string | null;
};

// ─── cash_handovers (15 cols) ────────────────────────────────────────────
// Immutable once created — no updated_at column.

export interface CashHandover {
  id: string;
  date: string;
  amount: number;
  from_user_id: string | null;
  from_user_name: string;
  to_user_id: string | null;
  to_user_name: string;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'expired';
  confirmed_at: string | null;
  created_at: string | null;
  period_from: string | null;
  period_to: string | null;
  // jsonb — app casts to a local Breakdown view type
  breakdown: Record<string, unknown> | null;
  reason: string | null;
}

export type CashHandoverInsert = {
  id?: string;
  date: string;
  amount: number;
  from_user_id?: string | null;
  from_user_name: string;
  to_user_id?: string | null;
  to_user_name: string;
  notes?: string | null;
  status: 'pending' | 'confirmed' | 'expired';
  confirmed_at?: string | null;
  created_at?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  breakdown?: Record<string, unknown> | null;
  reason?: string | null;
};

// ─── cash_challans (25 cols) ─────────────────────────────────────────────

export interface CashChallan {
  id: string;
  challan_number: number;
  customer_id: string | null;
  customer_name: string;
  status: 'paid' | 'partial' | 'pending' | 'void';
  subtotal: number;
  discount_type: string | null;
  discount_value: number | null;
  discount_amount: number | null;
  round_off: number | null;
  total: number;
  amount_paid: number | null;
  // TODO: tighten to union once payment modes are finalised
  payment_mode: string | null;
  payment_date: string | null;
  notes: string | null;
  tags: string[] | null;
  created_by: string | null;
  modified_by: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  shipping_charges: number | null;
  is_return: boolean | null;
  source_challan_id: string | null;
}

export type CashChallanInsert = {
  id?: string;
  challan_number: number;
  customer_id?: string | null;
  customer_name: string;
  status: 'paid' | 'partial' | 'pending' | 'void';
  subtotal: number;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  round_off?: number | null;
  total: number;
  amount_paid?: number | null;
  payment_mode?: string | null;
  payment_date?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  created_by?: string | null;
  modified_by?: string | null;
  voided_by?: string | null;
  voided_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  shipping_charges?: number | null;
  is_return?: boolean | null;
  source_challan_id?: string | null;
};

// ─── cash_challan_items (11 cols) ────────────────────────────────────────

export interface CashChallanItem {
  id: string;
  challan_id: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  price: number;
  total: number;
  sort_order: number | null;
  // TODO: tighten to union once discount types are finalised (likely 'percent' | 'flat')
  discount_type: string | null;
  discount_value: number | null;
  discount_amount: number | null;
}

export type CashChallanItemInsert = {
  id?: string;
  challan_id?: string | null;
  sku?: string | null;
  description: string;
  quantity: number;
  price: number;
  total: number;
  sort_order?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount?: number | null;
};

// ─── cash_challan_customers (5 cols) ─────────────────────────────────────

export interface CashChallanCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string | null;
}

export type CashChallanCustomerInsert = {
  id?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  created_at?: string | null;
};

// ─── Status enum helpers ─────────────────────────────────────────────────

export type InventoryStatus = NonNullable<InventoryItem['status']>;
export type ComponentStatus = NonNullable<ItemComponent['status']>;
export type DamageReportStatus = NonNullable<DamageReport['status']>;
export type UserRole = NonNullable<Profile['role']>;
export type CashChallanStatus = NonNullable<CashChallan['status']>;
export type CashHandoverStatus = NonNullable<CashHandover['status']>;

// Constant arrays for dropdowns / validation
export const INVENTORY_STATUSES: InventoryStatus[] = ['unsorted', 'damaged', 'complete', 'repaired', 'disposed'];
export const COMPONENT_STATUSES: ComponentStatus[] = ['missing', 'present', 'damaged'];
export const DAMAGE_REPORT_STATUSES: DamageReportStatus[] = ['open', 'investigating', 'resolved', 'closed'];
export const USER_ROLES: UserRole[] = ['admin', 'manager', 'operator', 'viewer'];
export const CASH_CHALLAN_STATUSES: CashChallanStatus[] = ['paid', 'partial', 'pending', 'void'];
export const CASH_HANDOVER_STATUSES: CashHandoverStatus[] = ['pending', 'confirmed', 'expired'];
