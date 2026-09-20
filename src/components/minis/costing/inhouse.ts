// In-house "suppliers" on a costing sheet — stitching, cutting, ironing,
// packing done by Arya Designs itself. They cost the product but nobody
// raises a PO for them (owner's ask). One shared list in app_settings
// (costing_inhouse_suppliers, upper-cased names), editable from the Raise
// POs sheet; ARYA DESIGNS is the seed.
import { supabase } from '../../../lib/supabase';

export const INHOUSE_KEY = 'costing_inhouse_suppliers';
const DEFAULT = ['ARYA DESIGNS'];
export const norm = (s: string) => s.trim().toUpperCase();

export async function loadInhouse(): Promise<{ names: string[]; error: unknown }> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', INHOUSE_KEY).maybeSingle();
  if (error) return { names: DEFAULT, error };
  const v = Array.isArray(data?.value) ? (data!.value as unknown[]).map(x => norm(String(x))).filter(Boolean) : DEFAULT;
  return { names: v, error: null };
}

export async function saveInhouse(names: string[]): Promise<unknown> {
  const value = [...new Set(names.map(norm).filter(Boolean))];
  const { error } = await supabase.from('app_settings').upsert({ key: INHOUSE_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error;
}

export const isInhouse = (names: string[], supplier: string) => names.includes(norm(supplier));
