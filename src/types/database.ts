/**
 * Database types for Unsort.
 * Source of truth: DATABASE-SCHEMA.md (derived from live Supabase schema).
 *
 * Each table has two types:
 *   - Xxx:        Row shape as returned by SELECT. Nullable DB columns are `| null`.
 *   - XxxInsert:  Shape for INSERT. Auto-generated fields and fields with DB defaults
 *                 are optional. Required fields are plain strings.
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

export interface Component {
  id: string;
  product_id: string;
  component_code: string;
  name: string;
  description: string | null;
  is_critical: boolean | null;
  created_at: string | null;
}

export type ComponentInsert = {
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

// ─── Status enum helpers ─────────────────────────────────────────────────

export type InventoryStatus = NonNullable<InventoryItem['status']>;
export type ComponentStatus = NonNullable<ItemComponent['status']>;
export type DamageReportStatus = NonNullable<DamageReport['status']>;
export type UserRole = NonNullable<Profile['role']>;

// Constant arrays for dropdowns / validation
export const INVENTORY_STATUSES: InventoryStatus[] = ['unsorted', 'damaged', 'complete', 'repaired', 'disposed'];
export const COMPONENT_STATUSES: ComponentStatus[] = ['missing', 'present', 'damaged'];
export const DAMAGE_REPORT_STATUSES: DamageReportStatus[] = ['open', 'investigating', 'resolved', 'closed'];
export const USER_ROLES: UserRole[] = ['admin', 'manager', 'operator', 'viewer'];
