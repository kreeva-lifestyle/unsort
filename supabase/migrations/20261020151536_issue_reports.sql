-- "Report a problem": staff send a bug or UI/UX issue from any screen with
-- one tap. A scheduled Claude Code session (twice a day) reads the new
-- reports, opens a PR with the fix, and sets status 'fix_ready' with a plain
-- summary. Nothing goes live until an admin taps Approve in Settings →
-- Problem reports (status 'approved'); the next run merges and deploys it
-- and sets 'fixed', and the reporter is notified (notifications table).
-- Why a table and not GitHub issues: no GitHub token in the app or server.
-- page_text: the visible text of the screen (the scheduled session cannot
-- download screenshots, so this is what it reads); screenshot_path: the
-- optional picture in the private bucket, for the admin.
create table public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  reporter_name text,
  kind text not null default 'broken' check (kind in ('broken', 'looks_wrong', 'slow', 'error', 'idea')),
  note text check (char_length(note) <= 2000),
  page text check (char_length(page) <= 300),
  page_text text check (char_length(page_text) <= 6000),
  context jsonb not null default '{}'::jsonb,
  screenshot_path text,
  status text not null default 'new' check (status in ('new', 'working', 'fix_ready', 'approved', 'fixed', 'declined', 'not_a_bug', 'needs_info', 'duplicate')),
  summary text,
  pr_url text,
  duplicate_of uuid references public.issue_reports(id) on delete set null,
  admin_note text,
  updated_at timestamptz not null default now()
);
create index issue_reports_status_idx on public.issue_reports (status, created_at);
create index issue_reports_created_by_idx on public.issue_reports (created_by, created_at desc);

alter table public.issue_reports enable row level security;
create policy "issue_reports insert own new" on public.issue_reports for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'new' and summary is null and pr_url is null and admin_note is null);
create policy "issue_reports read own or admin" on public.issue_reports for select to authenticated
  using (created_by = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
create policy "issue_reports admin update" on public.issue_reports for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

create or replace function public.issue_reports_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_issue_reports_touch before update on public.issue_reports for each row execute function public.issue_reports_touch();

-- Screenshots: private; each person uploads into their own folder
-- (<user id>/...), reads their own; admins read all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-reports', 'issue-reports', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "issue-reports own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "issue-reports own or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'issue-reports' and ((storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')));
