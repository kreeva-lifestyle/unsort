// Contacts data: both masters in one read, one RPC to save. The list and
// the merge rules are in contactsMerge.ts (pure); this file is the only one
// that talks to Supabase.
import { supabase } from '../../lib/supabase';
import { mergeContacts, type ContactRow, type ContactForm, type CustomerSrc, type VendorSrc } from './contactsMerge';

export async function loadContacts(): Promise<ContactRow[]> {
  const [c, v] = await Promise.all([
    supabase.from('cash_challan_customers').select('id, name, phone, address').order('name').limit(2000),
    supabase.from('po_vendors').select('id, name, phone, gstin, address, notes, is_active').order('name').limit(2000),
  ]);
  if (c.error) throw c.error;
  if (v.error) throw v.error;
  return mergeContacts((c.data || []) as CustomerSrc[], (v.data || []) as VendorSrc[]);
}

/** save_contact (SECURITY INVOKER): one transaction across both tables.
 *  Issued challans and POs are never touched — they keep their snapshot. */
export async function saveContact(existing: ContactRow | null, f: ContactForm): Promise<void> {
  const { error } = await supabase.rpc('save_contact', {
    p_customer_id: existing?.customerId ?? null, p_vendor_id: existing?.vendorId ?? null,
    p_as_customer: f.asCustomer, p_as_supplier: f.asSupplier,
    p_name: f.name, p_phone: f.phone, p_address: f.address, p_gstin: f.gstin, p_notes: f.notes, p_active: f.active,
  });
  if (error) throw error;
}
