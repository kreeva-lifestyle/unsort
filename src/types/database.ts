/**
 * Database types for Unsort.
 * Source of truth: DATABASE-SCHEMA.md (derived from live Supabase schema).
 *
 * Covers the 8 core tables, the 2 inventory_extras* tables, the 6 cash_*
 * tables used by the invoicing / cash-book modules, the brand_tags catalogue,
 * the cross-module audit_log, the brands directory, and the 3 packtime_*
 * tables used by the Pack Station scanning workflow.
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

// ─── profiles (11 cols) ──────────────────────────────────────────────────

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
  module_access: Record<string, boolean> | null;
  // PIN brute-force tracking — written only by the verify_own_pin RPC
  // (SECURITY DEFINER); not client-readable, present here for completeness.
  pin_failed_attempts: number;
  pin_locked_until: string | null;
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
  module_access?: Record<string, boolean> | null;
  pin_failed_attempts?: number;
  pin_locked_until?: string | null;
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
  status: 'unsorted' | 'damaged' | 'dry_clean' | 'complete' | 'completed' | null;
  damage_type: string | null;
  damage_description: string | null;
  damage_severity: 'minor' | 'moderate' | 'severe' | 'critical' | null;
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
  manufacturer: string;
}

export type InventoryItemInsert = {
  id?: string;
  product_id: string;
  batch_number?: string | null;
  serial_number?: string | null;
  status?: 'unsorted' | 'damaged' | 'dry_clean' | 'complete' | 'completed' | null;
  damage_type?: string | null;
  damage_description?: string | null;
  damage_severity?: 'minor' | 'moderate' | 'severe' | 'critical' | null;
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
  manufacturer: string;
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
  type: 'info' | 'success' | 'warning' | 'error' | 'pair_complete' | null;
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
  type?: 'info' | 'success' | 'warning' | 'error' | 'pair_complete' | null;
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
  location: string;
  manufacturer: string;
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
  action: 'created' | 'added' | 'removed' | 'used';
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
  action: 'created' | 'added' | 'removed' | 'used';
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

// ─── cash_handovers (20 cols) ────────────────────────────────────────────
// Immutable once confirmed — no updated_at column (trigger
// prevent_confirmed_handover_mutation enforces it).
// 'disputed' is set by the recipient via Reject; 'cancelled' by the sender
// while still pending. Completeness of both enforced by CHECK constraints.

export interface CashHandover {
  id: string;
  handover_number: number;
  date: string;
  amount: number;
  from_user_id: string | null;
  from_user_name: string;
  to_user_id: string | null;
  to_user_name: string;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'disputed' | 'cancelled';
  confirmed_at: string | null;
  created_at: string | null;
  period_from: string | null;
  period_to: string | null;
  // jsonb — app casts to a local Breakdown view type
  breakdown: Record<string, unknown> | null;
  reason: string | null;
  reject_reason: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

export type CashHandoverInsert = {
  id?: string;
  // handover_number omitted — DB default supplies it via sequence
  date: string;
  amount: number;
  from_user_id?: string | null;
  from_user_name: string;
  to_user_id?: string | null;
  to_user_name: string;
  notes?: string | null;
  status: 'pending' | 'confirmed' | 'disputed' | 'cancelled';
  confirmed_at?: string | null;
  created_at?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  breakdown?: Record<string, unknown> | null;
  reason?: string | null;
  reject_reason?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
};

// ─── cash_challans (25 cols) ─────────────────────────────────────────────

export interface CashChallan {
  id: string;
  challan_number: number;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  status: 'paid' | 'unpaid' | 'partial' | 'voided';
  subtotal: number;
  discount_type: 'flat' | 'percentage' | null;
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
  inventory_deducted: boolean;
  handover_id: string | null;
}

export type CashChallanInsert = {
  id?: string;
  challan_number: number;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  status: 'paid' | 'unpaid' | 'partial' | 'voided';
  subtotal: number;
  discount_type?: 'flat' | 'percentage' | null;
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
  inventory_deducted?: boolean;
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
  discount_type: 'flat' | 'percentage' | null;
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
  discount_type?: 'flat' | 'percentage' | null;
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

// ─── brand_tags (16 cols) ────────────────────────────────────────────────

export interface BrandTag {
  id: string;
  brand: string;
  ean: string;
  sku: string;
  qty: string;
  mrp: number;
  size: string;
  product: string;
  color: string;
  mktd: string;
  jio_code: string;
  copies: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Populated by a DB trigger; clients filter on this via ilike. Do not set on insert.
  search_text: string | null;
}

export type BrandTagInsert = {
  id?: string;
  brand: string;
  ean: string;
  sku: string;
  qty: string;
  mrp: number;
  size: string;
  product: string;
  color: string;
  mktd: string;
  jio_code: string;
  copies: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  search_text?: string | null;
};

// ─── audit_log (9 cols) ──────────────────────────────────────────────────
// Cross-module audit trail distinct from activity_logs.
// `changes` stores structured before/after diffs for field-level tracking.
// `user_email` is repurposed to store the user's display name.

export interface AuditLog {
  id: string;
  action: string;
  module: string;
  record_id: string | null;
  details: string | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

export type AuditLogInsert = {
  id?: string;
  action: string;
  module: string;
  record_id?: string | null;
  details?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  created_at?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
};

// ─── brands (4 cols) ─────────────────────────────────────────────────────

export interface Brand {
  id: string;
  name: string;
  is_active: boolean | null;
  created_at: string | null;
}

export type BrandInsert = {
  id?: string;
  name: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

// ─── packtime_cameras (4 cols) ───────────────────────────────────────────

export interface PackTimeCamera {
  id: string;
  number: string;
  is_active: boolean | null;
  created_at: string | null;
}

export type PackTimeCameraInsert = {
  id?: string;
  number: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

// ─── packtime_couriers (6 cols) ──────────────────────────────────────────

export interface PackTimeCourier {
  id: string;
  name: string;
  sheet_name: string;
  is_active: boolean | null;
  created_at: string | null;
  brand: string | null;
}

export type PackTimeCourierInsert = {
  id?: string;
  name: string;
  sheet_name: string;
  is_active?: boolean | null;
  created_at?: string | null;
  brand?: string | null;
};

// ─── packtime_scans (9 cols) ─────────────────────────────────────────────

export interface PackTimeScan {
  id: string;
  session_id: string;
  awb: string;
  courier: string;
  camera: string;
  sheet_name: string;
  scanned_at: string | null;
  user_id: string | null;
  brand: string | null;
}

export type PackTimeScanInsert = {
  id?: string;
  session_id: string;
  awb: string;
  courier: string;
  camera: string;
  sheet_name: string;
  scanned_at?: string | null;
  user_id?: string | null;
  brand?: string | null;
};

// ─── packtime_shortcuts (5 cols) ────────────────────────────────────────

export interface PackTimeShortcut {
  id: string;
  user_id: string;
  courier: string;
  camera: string;
  brand: string;
  used_at: string;
}

export type PackTimeShortcutInsert = {
  id?: string;
  user_id: string;
  courier: string;
  camera: string;
  brand: string;
  used_at?: string;
};

// ─── Status enum helpers ─────────────────────────────────────────────────

export type InventoryStatus = NonNullable<InventoryItem['status']>;
export type ComponentStatus = NonNullable<ItemComponent['status']>;
export type DamageReportStatus = NonNullable<DamageReport['status']>;
export type DamageSeverity = NonNullable<InventoryItem['damage_severity']>;
export type UserRole = NonNullable<Profile['role']>;
export type CashChallanStatus = NonNullable<CashChallan['status']>;
export type CashHandoverStatus = NonNullable<CashHandover['status']>;

// ─── cash_challan_payments (9 cols) ─────────────────────────────────────
export interface CashChallanPayment {
  id: string;
  challan_id: string;
  amount: number;
  payment_mode: string;
  payment_date: string;
  paid_by: string | null;
  notes: string | null;
  is_reversal: boolean;
  created_at: string | null;
  batch_id: string | null;
}

export type CashChallanPaymentInsert = {
  id?: string;
  challan_id: string;
  amount: number;
  payment_mode: string;
  payment_date: string;
  paid_by?: string | null;
  notes?: string | null;
  is_reversal: boolean;
  created_at?: string | null;
  batch_id?: string | null;
};

// Constant arrays for dropdowns / validation
export const INVENTORY_STATUSES: InventoryStatus[] = ['unsorted', 'damaged', 'dry_clean', 'complete', 'completed'];
export const COMPONENT_STATUSES: ComponentStatus[] = ['missing', 'present', 'damaged'];
export const DAMAGE_REPORT_STATUSES: DamageReportStatus[] = ['open', 'investigating', 'resolved', 'closed'];
export const DAMAGE_SEVERITIES: DamageSeverity[] = ['minor', 'moderate', 'severe', 'critical'];
export const USER_ROLES: UserRole[] = ['admin', 'manager', 'operator', 'viewer'];
export const CASH_CHALLAN_STATUSES: CashChallanStatus[] = ['paid', 'unpaid', 'partial', 'voided'];
export const CASH_HANDOVER_STATUSES: CashHandoverStatus[] = ['pending', 'confirmed', 'disputed'];

// ─── address_labels (10 cols) ───────────────────────────────────────────

export interface AddressLabel {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type AddressLabelInsert = {
  id?: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ─── virtual_stock (6 cols) ─────────────────────────────────────────

export interface VirtualStockRow {
  id: string;
  sku: string;
  quantity: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type VirtualStockInsert = {
  id?: string;
  sku: string;
  quantity: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ─── short_links (8 cols) ─────────────────────────────────────────────

export interface ShortLink {
  id: string;
  short_code: string;
  long_url: string;
  title: string | null;
  clicks: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type ShortLinkInsert = {
  id?: string;
  short_code: string;
  long_url: string;
  title?: string | null;
  clicks?: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ─── link_clicks (10 cols) ────────────────────────────────────────────

export interface LinkClick {
  id: string;
  link_id: string;
  clicked_at: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  country: string | null;
  city: string | null;
  visitor_hash: string | null;
}

// ─── print_queue (12 cols) ──────────────────────────────────────────────

export type PrintSlot = 'label_small' | 'label_large' | 'document';
export const PRINT_SLOTS: PrintSlot[] = ['label_small', 'label_large', 'document'];
export type PrintJobStatus = 'pending' | 'printing' | 'done' | 'failed';

export interface PrintJob {
  id: string;
  printer_slot: PrintSlot;
  html: string;
  page_size: Record<string, unknown> | string;
  copies: number;
  title: string | null;
  status: PrintJobStatus;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  printed_at: string | null;
  printed_by_station: string | null;
}

export type PrintJobInsert = Pick<PrintJob, 'printer_slot' | 'html' | 'page_size'> & {
  copies?: number;
  title?: string | null;
  created_by?: string | null;
};

// ─── link_check_approvals (6 cols) ──────────────────────────────────────

// Owner-approved (sku, url) pairs the Link Check scan must not flag as
// WRONG LINK. Keyed to the exact url: a changed link re-flags, and
// DELETED/EMPTY problems are never suppressed.
export interface LinkCheckApproval {
  id: string;
  sku: string;
  url: string;
  tab: string | null;
  approved_by: string | null;
  created_at: string;
}

export type LinkCheckApprovalInsert = Pick<LinkCheckApproval, 'sku' | 'url'> & {
  tab?: string | null;
  approved_by?: string | null;
};
