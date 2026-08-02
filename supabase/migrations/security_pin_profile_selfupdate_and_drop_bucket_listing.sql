-- Security Stage 2B (applied via apply_migration on 2026-08-02).
--
-- M3: The "Users can update own profile" policy pinned only `role` in its
-- WITH CHECK, so on paper a user could self-update is_active (re-activate after
-- being deactivated) or module_access (self-grant module visibility) on their
-- own row. (In practice the check_profile_admin_fields() trigger already blocks
-- this — verified — so this is defense-in-depth that also makes the policy
-- self-documenting.) Recreate the policy to pin is_active and module_access to
-- their current values too. Admins keep full control via the separate
-- "Admins can update any profile" policy. The subselects read the committed
-- (pre-update) row, exactly as the existing role pin already relies on.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to public
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
    and is_active is not distinct from (select p.is_active from public.profiles p where p.id = auth.uid())
    and module_access is not distinct from (select p.module_access from public.profiles p where p.id = auth.uid())
  );

-- M4b: Remove file-listing/enumeration on the two public buckets. Objects stay
-- reachable by their public URL (the bucket public flag serves those without
-- RLS), but the storage API can no longer enumerate every file — closing the
-- "harvest every employee's payment QR by listing the bucket" path. No app code
-- lists or authenticated-reads these buckets (only upload / remove / getPublicUrl).
drop policy if exists "employee-qr public read" on storage.objects;
drop policy if exists "auth_voice_read" on storage.objects;
