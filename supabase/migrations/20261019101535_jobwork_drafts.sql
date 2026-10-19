-- Jobwork: "Save as draft" on the New job form.
--
-- Why a table of its own instead of a 'draft' status on jobwork_orders: a
-- draft is a half-filled form (no pieces yet, maybe no jobworker), while every
-- jobwork_orders row is a real job — it gets a JW number, counts in the
-- summary, the Open tab, Share pending, auto-close and the RPC checks
-- (pieces > 0, SKU / jobworker / job type required). Keeping drafts apart
-- means none of that can ever see one; "Create job" from a draft goes through
-- save_jobwork_order like any new job and then removes the draft.
--
-- form = the form exactly as typed (JobDraft fields, quantities as text) plus
-- materials: [{ name, unit, per_piece }]. Shared with the team like jobs
-- (anyone who can create a job can finish or discard a draft).

create table public.jobwork_drafts (
  id uuid primary key default gen_random_uuid(),
  form jsonb not null check (jsonb_typeof(form) = 'object'),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) default auth.uid(),
  updated_at timestamptz not null default now()
);
create index jobwork_drafts_updated_idx on public.jobwork_drafts (updated_at desc);

alter table public.jobwork_drafts enable row level security;
create policy "jw drafts read" on public.jobwork_drafts for select to authenticated using (true);
create policy "jw drafts insert" on public.jobwork_drafts for insert to authenticated
  with check ((select public.jw_role()) in ('admin', 'manager', 'operator'));
create policy "jw drafts update" on public.jobwork_drafts for update to authenticated
  using ((select public.jw_role()) in ('admin', 'manager', 'operator'))
  with check ((select public.jw_role()) in ('admin', 'manager', 'operator'));
create policy "jw drafts delete" on public.jobwork_drafts for delete to authenticated
  using ((select public.jw_role()) in ('admin', 'manager', 'operator'));

-- Who saved it last, and when, are stamped server-side.
create or replace function public.jobwork_drafts_touch()
 returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger trg_jobwork_drafts_touch before update on public.jobwork_drafts
  for each row execute function public.jobwork_drafts_touch();
