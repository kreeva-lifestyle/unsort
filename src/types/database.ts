/**
 * Database types for Unsort.
 * Source of truth: Supabase schema documented in UNSORT-CLAUDE-CODE-CONTEXT.md
 *
 * When schema changes: update this file FIRST, then update consumers.
 * Do NOT redefine these types inline in feature files — import from here.
 */

// ─── profiles ────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── products ────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  total_components: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ─── components ──────────────────────────────────────────────────────────
export interface Component {
  id: string;
  product_id: string;
  component_code: string;
  name: string;
  description?: string;
  is_critical: boolean;
  created_at: string;
}

// ─── inventory_items ─────────────────────────────────────────────────────
export interface InventoryItem {
  id: string;
  product_id: string;
  serial_number?: string;
  batch_number: string;
  status: 'unsorted' | 'damaged' | 'complete' | 'repaired' | 'disposed';
  location?: string;
  notes?: string;
  reported_by?: string;
  created_at: string;
  updated_at: string;
}

// ─── item_components ─────────────────────────────────────────────────────
export interface ItemComponent {
  id: string;
  inventory_item_id: string;
  component_id: string;
  status: 'missing' | 'present' | 'damaged';
  notes?: string;
  checked_by?: string;
  checked_at?: string;
  created_at: string;
}

// ─── activity_logs ───────────────────────────────────────────────────────
export interface ActivityLog {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── notifications ───────────────────────────────────────────────────────
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── damage_reports ──────────────────────────────────────────────────────
export interface DamageReport {
  id: string;
  report_number: string;
  inventory_item_id: string;
  damage_type: string;
  damage_description: string;
  cause: string;
  estimated_loss: number;
  images: string[];
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  reported_by?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

// ─── Re-export helpers ───────────────────────────────────────────────────
export type Status = InventoryItem['status'];
export type ComponentStatus = ItemComponent['status'];
export type DamageReportStatus = DamageReport['status'];
