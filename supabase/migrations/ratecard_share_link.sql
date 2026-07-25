-- ratecard_share: the single shared link sellers use to build their own rate
-- cards from the master sheet (RateCard Studio "From Master" mode only).
-- The token is the whole credential, so it is rotatable: rotating flips the
-- old row's is_active to false and inserts a new token, which instantly kills
-- every copy of the old URL without touching anything else.
-- anon gets NOTHING here - the listing-ai edge fn validates the token with the
-- service role (same shape as short_links), so the table is never exposed.
create table if not exists public.ratecard_share (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count bigint not null default 0
);

comment on table public.ratecard_share is
  'Shared seller link for RateCard Studio (From Master). Token validated server-side by the listing-ai edge fn; rotate by deactivating and inserting a new row.';

-- Only one link is meant to be live at a time; this makes that explicit.
create unique index if not exists ratecard_share_one_active
  on public.ratecard_share (is_active) where is_active;

alter table public.ratecard_share enable row level security;

-- Admin/manager manage the link from RateCard Studio. No anon policy at all.
drop policy if exists ratecard_share_read on public.ratecard_share;
create policy ratecard_share_read on public.ratecard_share
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.is_active and p.role in ('admin', 'manager')));

drop policy if exists ratecard_share_insert on public.ratecard_share;
create policy ratecard_share_insert on public.ratecard_share
  for insert to authenticated
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.is_active and p.role in ('admin', 'manager')));

drop policy if exists ratecard_share_update on public.ratecard_share;
create policy ratecard_share_update on public.ratecard_share
  for update to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.is_active and p.role in ('admin', 'manager')));

-- Usage stamp, called by the edge fn with the service role after a token
-- validates. SECURITY DEFINER so the counter can be bumped without granting
-- anyone UPDATE; REVOKEd from anon/authenticated so only service_role calls it.
create or replace function public.bump_ratecard_share_use(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ratecard_share
     set use_count = use_count + 1, last_used_at = now()
   where id = p_id;
$$;

revoke all on function public.bump_ratecard_share_use(uuid) from anon, authenticated, public;
grant execute on function public.bump_ratecard_share_use(uuid) to service_role;
