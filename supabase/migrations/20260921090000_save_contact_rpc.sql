-- Contacts (owner's ask): one screen, shared by Cash Challan and Purchase
-- Orders, to add and edit customers and suppliers. The two masters stay
-- separate tables (challans → cash_challan_customers, POs → po_vendors, each
-- with its own FKs, RLS and unique indexes); a contact that is BOTH is one
-- row on screen backed by a row in each table. Saving such a contact touches
-- two tables, so it goes through this SECURITY INVOKER function: one
-- transaction, RLS still applied (operator+ per the existing policies).
--
-- Deliberately NOT touched: cash_challans / purchase_orders. Issued documents
-- keep the name and phone they were printed with (snapshot columns); an edit
-- here changes what NEW documents pick up.
create or replace function public.save_contact(
  p_customer_id uuid, p_vendor_id uuid,
  p_as_customer boolean, p_as_supplier boolean,
  p_name text, p_phone text, p_address text, p_gstin text, p_notes text, p_active boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cid uuid := p_customer_id;
  v_vid uuid := p_vendor_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_addr text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if v_name = '' then raise exception 'Contact needs a name' using errcode = '23514'; end if;
  if v_phone <> '' and length(v_phone) < 10 then raise exception 'Phone needs 10 digits' using errcode = '23514'; end if;
  if not coalesce(p_as_customer, false) and not coalesce(p_as_supplier, false) then
    raise exception 'Pick at least one role — customer or supplier' using errcode = '23514';
  end if;
  if coalesce(p_as_supplier, false) and v_phone = '' then raise exception 'A supplier needs a phone' using errcode = '23514'; end if;

  if coalesce(p_as_customer, false) then
    if v_cid is null then
      insert into cash_challan_customers (name, phone, address) values (v_name, nullif(v_phone, ''), v_addr) returning id into v_cid;
    else
      update cash_challan_customers set name = v_name, phone = nullif(v_phone, ''), address = v_addr where id = v_cid;
      if not found then raise exception 'Customer not found'; end if;
    end if;
  end if;

  if coalesce(p_as_supplier, false) then
    if v_vid is null then
      insert into po_vendors (name, phone, gstin, address, notes, is_active, created_by)
      values (v_name, v_phone, nullif(btrim(coalesce(p_gstin, '')), ''), v_addr, nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_active, true), auth.uid())
      returning id into v_vid;
    else
      update po_vendors set name = v_name, phone = v_phone, gstin = nullif(btrim(coalesce(p_gstin, '')), ''), address = v_addr,
        notes = nullif(btrim(coalesce(p_notes, '')), ''), is_active = coalesce(p_active, true), updated_at = now()
      where id = v_vid;
      if not found then raise exception 'Supplier not found'; end if;
    end if;
  end if;

  return jsonb_build_object('customer_id', v_cid, 'vendor_id', v_vid);
end
$$;

comment on function public.save_contact is 'Contacts screen: add/edit a customer and/or supplier in one transaction. SECURITY INVOKER — RLS on both tables applies. Never touches issued challans/POs (snapshot columns).';
revoke all on function public.save_contact(uuid, uuid, boolean, boolean, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_contact(uuid, uuid, boolean, boolean, text, text, text, text, text, boolean) to authenticated;
