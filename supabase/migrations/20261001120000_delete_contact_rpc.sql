-- Contacts: delete a contact that no document uses (owner's ask — "option to
-- delete contact if no cash challan or PO is made for that contact; should
-- leave no orphan").
--
-- WHY an RPC: a contact can be a customer AND a supplier (two masters), so
-- the delete must be one transaction, and the "is it unused?" check must
-- run in the same statement as the delete, not in the client a moment
-- earlier. Refuses when any challan, pending order or purchase order points
-- at the record, so nothing is ever left pointing at a missing contact
-- (cash_challans.customer_id is RESTRICT, cash_challan_orders.customer_id
-- is SET NULL, purchase_orders.vendor_id has no action — the check covers
-- all three the same way).
--
-- SECURITY INVOKER: RLS decides who may delete. Operators can delete a
-- customer (cash_challan_customers "Operator+ can write"), only admin /
-- manager a supplier ("pov delete"); a refused row makes the function raise,
-- which rolls the whole delete back. Messages stay under 80 characters
-- (name cut to 20) so friendlyError shows them as written.
-- Applied via MCP as delete_contact_rpc.

create or replace function public.delete_contact(p_customer_id uuid, p_vendor_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n int;
  v_name text;
begin
  if p_customer_id is null and p_vendor_id is null then
    raise exception 'Nothing to delete';
  end if;

  if p_customer_id is not null then
    select left(name, 20) into v_name from cash_challan_customers where id = p_customer_id;
    if v_name is null then raise exception 'Customer not found'; end if;
    select count(*) into v_n from cash_challans where customer_id = p_customer_id;
    if v_n > 0 then
      raise exception '% has % challan(s) — cannot delete', v_name, v_n;
    end if;
    select count(*) into v_n from cash_challan_orders where customer_id = p_customer_id;
    if v_n > 0 then
      raise exception '% has % pending order(s) — remove them first', v_name, v_n;
    end if;
  end if;

  if p_vendor_id is not null then
    select left(name, 20) into v_name from po_vendors where id = p_vendor_id;
    if v_name is null then raise exception 'Supplier not found'; end if;
    select count(*) into v_n from purchase_orders where vendor_id = p_vendor_id;
    if v_n > 0 then
      raise exception '% has % purchase order(s) — cannot delete', v_name, v_n;
    end if;
  end if;

  if p_customer_id is not null then
    delete from cash_challan_customers where id = p_customer_id;
    if not found then raise exception 'You cannot delete customers — ask an admin'; end if;
  end if;
  if p_vendor_id is not null then
    delete from po_vendors where id = p_vendor_id;
    if not found then raise exception 'Only an admin or manager can delete a supplier'; end if;
  end if;
end
$$;

comment on function public.delete_contact is 'Contacts screen: delete a customer and/or supplier in one transaction, refusing when any challan, pending order or PO references it. SECURITY INVOKER — RLS applies.';
revoke all on function public.delete_contact(uuid, uuid) from public, anon;
grant execute on function public.delete_contact(uuid, uuid) to authenticated;
