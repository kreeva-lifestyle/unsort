// One contact list from two masters (pure — no React, no Supabase, so the
// harness can drive it). A customer (cash_challan_customers) and a supplier
// (po_vendors) are the SAME contact when their phones match or their names
// match ignoring case and spacing; such a contact is one row carrying both
// ids. Everything else is a customer-only or supplier-only row.
export interface ContactRow {
  key: string;
  name: string;
  phone: string;
  customerId: string | null;
  vendorId: string | null;
  address: string;
  gstin: string;
  notes: string;
  active: boolean;
}
export type CustomerSrc = { id: string; name: string; phone: string | null; address: string | null };
export type VendorSrc = { id: string; name: string; phone: string; gstin: string | null; address: string | null; notes: string | null; is_active: boolean };

export const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');
const nameKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export function mergeContacts(customers: CustomerSrc[], vendors: VendorSrc[]): ContactRow[] {
  const byPhone = new Map<string, VendorSrc>();
  const byName = new Map<string, VendorSrc>();
  for (const v of vendors) {
    const p = digits(v.phone);
    if (p.length >= 10 && !byPhone.has(p)) byPhone.set(p, v);
    const n = nameKey(v.name);
    if (n && !byName.has(n)) byName.set(n, v);
  }
  const used = new Set<string>();
  const out: ContactRow[] = [];
  for (const c of customers) {
    const p = digits(c.phone);
    const hit = (p.length >= 10 ? byPhone.get(p) : undefined) || byName.get(nameKey(c.name)) || null;
    const v = hit && !used.has(hit.id) ? hit : null;
    if (v) used.add(v.id);
    out.push({
      key: c.id, name: c.name, phone: c.phone || v?.phone || '', customerId: c.id, vendorId: v?.id ?? null,
      address: c.address || v?.address || '', gstin: v?.gstin || '', notes: v?.notes || '', active: v ? v.is_active : true,
    });
  }
  for (const v of vendors) {
    if (used.has(v.id)) continue;
    out.push({ key: v.id, name: v.name, phone: v.phone, customerId: null, vendorId: v.id, address: v.address || '', gstin: v.gstin || '', notes: v.notes || '', active: v.is_active });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type Role = 'all' | 'customer' | 'supplier';
export function filterContacts(rows: ContactRow[], q: string, role: Role): ContactRow[] {
  const t = q.trim().toLowerCase();
  const d = digits(q);
  return rows.filter(r =>
    (role === 'all' || (role === 'customer' ? !!r.customerId : !!r.vendorId)) &&
    (!t || r.name.toLowerCase().includes(t) || (d.length >= 3 && digits(r.phone).includes(d)) || r.address.toLowerCase().includes(t)));
}

export interface ContactForm { name: string; phone: string; asCustomer: boolean; asSupplier: boolean; address: string; gstin: string; notes: string; active: boolean }
export const formOf = (c: ContactRow | null): ContactForm => c
  ? { name: c.name, phone: c.phone, asCustomer: !!c.customerId, asSupplier: !!c.vendorId, address: c.address, gstin: c.gstin, notes: c.notes, active: c.active }
  : { name: '', phone: '', asCustomer: true, asSupplier: false, address: '', gstin: '', notes: '', active: true };

/** Client-side copy of the RPC's checks so the form can point at the field. */
export function validateForm(f: ContactForm): string {
  if (!f.name.trim()) return 'Contact needs a name';
  if (!f.asCustomer && !f.asSupplier) return 'Pick at least one role — customer or supplier';
  const p = digits(f.phone);
  if (f.asSupplier && !p) return 'A supplier needs a phone';
  if (p && p.length < 10) return 'Phone needs 10 digits';
  return '';
}
