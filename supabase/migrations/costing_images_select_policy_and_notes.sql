-- WHY (owner-reported bug, reproduced in SQL): uploading a costing photo
-- failed with a permission error even for admins. The storage client uploads
-- with upsert (INSERT .. ON CONFLICT DO UPDATE), and under RLS that statement
-- also requires the row to be VISIBLE - a SELECT policy - which the bucket's
-- original insert/update/delete trio did not include. Reproduced exactly: the
-- upsert shape raised "new row violates row-level security" as role
-- authenticated while a plain insert passed; adding the SELECT policy makes
-- the same statement pass (verified). Also adds the notes column the owner
-- asked for. Applied 2026-08-20 via MCP as costing_images_select_policy_and_notes.
create policy "costing-images auth read" on storage.objects
  for select to authenticated using (bucket_id = 'costing-images');
alter table public.costing_products add column if not exists notes text not null default '';
