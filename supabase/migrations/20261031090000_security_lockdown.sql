-- Security lockdown after the 2026-10-31 audit (reports/security-audit-2026-10-31).
--
-- WHY: public Supabase sign-up was open and every new account became an active
-- 'viewer'. Many tables treated "signed in" as "trusted staff", so an outsider
-- with an email address could read live OTP codes, cash/PO/jobwork/attendance
-- records, swap the customer payment QR, and more. This migration:
--   1. closes self sign-up at the database (only accounts made by the
--      admin-users function, or a dashboard invite, get a profile);
--   2. makes confirm_user_email admin-only;
--   3. stops anonymous reads of the staff directory (profiles);
--   4. limits OTP inbox reads to the people who can open Minis;
--   5. adds a staff-only (admin/manager/operator, active) guard on every
--      money / purchase / jobwork / attendance / costing / pricing read;
--   6. makes the payment UPI / QR settings and the payment-qr bucket admin-only;
--   7. limits costing-images writes to active staff;
--   8. removes anonymous EXECUTE from definer functions that must not be public.
-- Nothing here changes what today's staff (1 admin, 5 managers) can do.

-- ── helpers ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can read profiles without recursing into its RLS.
create or replace function public.app_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = (select auth.uid())
      and p.is_active is not false
      and p.role in ('admin', 'manager', 'operator')
  )
$$;
revoke all on function public.app_is_staff() from public, anon;
grant execute on function public.app_is_staff() to authenticated, service_role;

-- Mirrors canAccessTab(role, 'minis') in src/lib/tabs.ts: admins always;
-- managers unless an admin switched Minis off for them; operators never by default.
create or replace function public.app_can_open_minis()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = (select auth.uid())
      and p.is_active is not false
      and (p.role = 'admin'
           or (p.role = 'manager' and coalesce(p.module_access ->> 'minis', 'true') <> 'false'))
  )
$$;
revoke all on function public.app_can_open_minis() from public, anon;
grant execute on function public.app_can_open_minis() to authenticated, service_role;

-- ── 1. close self sign-up ───────────────────────────────────────────────────
-- A public /auth/v1/signup can set only user_metadata. Accounts made by the
-- admin-users function carry app_metadata.created_by_admin; dashboard invites
-- carry invited_at. Anything else (after the very first, bootstrap admin) is
-- refused, so the auth user is never created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles)
     and coalesce(new.raw_app_meta_data ->> 'created_by_admin', '') = ''
     and new.invited_at is null then
    raise exception 'Sign-up is closed. Ask an admin to invite you.' using errcode = '42501';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'viewer' end);
  return new;
end;
$$;

-- ── 2. confirm_user_email: admins only ──────────────────────────────────────
create or replace function public.confirm_user_email(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active is not false) then
    raise exception 'Only an admin can confirm accounts' using errcode = '42501';
  end if;
  update auth.users set email_confirmed_at = now() where id = target_user_id and email_confirmed_at is null;
end;
$$;
revoke all on function public.confirm_user_email(uuid) from public, anon;
grant execute on function public.confirm_user_email(uuid) to authenticated;

-- ── 3. profiles: signed-in only ─────────────────────────────────────────────
drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Signed-in users can view profiles" on public.profiles
  for select to authenticated using (true);
revoke all on public.profiles from anon;

-- ── 4. otp_inbox: only people who can open Minis ────────────────────────────
-- RLS also gates realtime delivery, so the live feed follows the same rule.
drop policy if exists "Authenticated can read otp" on public.otp_inbox;
create policy "Minis users can read otp" on public.otp_inbox
  for select to authenticated using ((select public.app_can_open_minis()));

-- ── 5. staff-only reads on business records ─────────────────────────────────
-- RESTRICTIVE: combines (AND) with the existing read policies, so nothing a
-- staff member could read before changes; viewers / inactive / unknown
-- accounts read nothing.
do $$
declare t text;
begin
  foreach t in array array[
    'cash_challans','cash_challan_items','cash_challan_payments','cash_challan_customers',
    'cash_challan_orders','cash_challan_order_deliveries','cash_expenses','cash_handovers','cash_book_balances',
    'purchase_orders','purchase_order_items','purchase_order_receipts','purchase_order_revisions','po_vendors',
    'jobwork_orders','jobwork_entries','jobwork_entry_lines','jobwork_materials','jobwork_payments','jobwork_drafts',
    'attendance_employees','attendance_entries','attendance_advances','attendance_penalties',
    'attendance_salaries','attendance_salary_payments',
    'costing_products','pricing_ai_suggestions'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "staff only read" on public.%I', t);
      execute format('create policy "staff only read" on public.%I as restrictive for select to authenticated using ((select public.app_is_staff()))', t);
    end if;
  end loop;
end $$;

-- ── 6. payment settings + payment-qr bucket: admins only ────────────────────
drop policy if exists app_settings_payment_admin_insert on public.app_settings;
create policy app_settings_payment_admin_insert on public.app_settings as restrictive for insert to authenticated
  with check (key not in ('payment_upi_id', 'payment_qr_url')
    or exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));
drop policy if exists app_settings_payment_admin_update on public.app_settings;
create policy app_settings_payment_admin_update on public.app_settings as restrictive for update to authenticated
  using (key not in ('payment_upi_id', 'payment_qr_url')
    or exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false))
  with check (key not in ('payment_upi_id', 'payment_qr_url')
    or exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));

drop policy if exists "Auth upload payment-qr" on storage.objects;
drop policy if exists "Auth update payment-qr" on storage.objects;
drop policy if exists "Auth delete payment-qr" on storage.objects;
create policy "payment-qr admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr'
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));
create policy "payment-qr admin update" on storage.objects for update to authenticated
  using (bucket_id = 'payment-qr'
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));
create policy "payment-qr admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr'
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));

-- ── 7. costing-images writes: active staff only (table writes already are) ──
drop policy if exists "costing-images staff insert" on storage.objects;
drop policy if exists "costing-images staff update" on storage.objects;
drop policy if exists "costing-images staff delete" on storage.objects;
create policy "costing-images staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'costing-images' and (select public.app_is_staff()));
create policy "costing-images staff update" on storage.objects for update to authenticated
  using (bucket_id = 'costing-images' and (select public.app_is_staff()));
create policy "costing-images staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'costing-images' and (select public.app_is_staff()));

-- ── 8. definer functions that must not be callable from the browser ─────────
-- record_link_click is called only by the short-track function (service role);
-- the old 8-argument overload has no caller left. Trigger functions run
-- regardless of EXECUTE grants. master_sheet_touch stays anon-callable (the
-- Apps Script push uses it by design).
drop function if exists public.record_link_click(text, text, text, text, text, text, text, text);
revoke all on function public.record_link_click(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_link_click(text, text, text, text, text, text, text, text, text) to service_role;
revoke all on function public.cleanup_old_link_clicks() from public, anon, authenticated;
revoke all on function public.increment_link_clicks() from public, anon, authenticated;
revoke all on function public.check_profile_admin_fields() from public, anon, authenticated;
revoke all on function public.packtime_cameras_guard_connection() from public, anon, authenticated;
revoke all on function public.packtime_sheet_enqueue() from public, anon, authenticated;
revoke all on function public.get_shared_program(text) from public, anon, authenticated;
revoke all on function public.check_pin_exists() from public, anon;
grant execute on function public.check_pin_exists() to authenticated;
