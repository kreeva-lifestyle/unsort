-- Problem reports, fixes from the review of 20261020151536_issue_reports:
--
-- fix_sha: the exact commit of the prepared fix the admin approves. The
-- scheduled check merges only that commit (expectedHeadSha); any later
-- change sends the report back to fix_ready for a new approval.
--
-- issue_reports_stamp (BEFORE INSERT): the server, not the browser, decides
-- who filed it and when — reporter_name comes from profiles.full_name,
-- created_at / updated_at are now(), duplicate_of and fix_sha start empty.
--
-- set_issue_screenshot: the report row is saved first (so a picture that
-- fails to upload never loses the report), then the picture's path is
-- attached. SECURITY DEFINER because reporters have no UPDATE right on the
-- table; it only ever sets screenshot_path, only on the caller's own report,
-- only once, and only to a path inside the caller's own storage folder.
alter table public.issue_reports add column fix_sha text check (fix_sha is null or fix_sha ~ '^[0-9a-f]{40}$');

create or replace function public.issue_reports_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.reporter_name := (select full_name from public.profiles where id = new.created_by);
  new.created_at := now();
  new.updated_at := now();
  new.duplicate_of := null;
  new.fix_sha := null;
  return new;
end $$;
revoke all on function public.issue_reports_stamp() from public, anon, authenticated;
create trigger trg_issue_reports_stamp before insert on public.issue_reports for each row execute function public.issue_reports_stamp();

create or replace function public.set_issue_screenshot(p_id uuid, p_path text) returns void
 language plpgsql security definer set search_path = public as $$
begin
  if p_path is null or p_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Invalid picture path';
  end if;
  update public.issue_reports set screenshot_path = p_path
   where id = p_id and created_by = auth.uid() and screenshot_path is null;
  if not found then raise exception 'Report not found'; end if;
end $$;
revoke all on function public.set_issue_screenshot(uuid, text) from public, anon;
grant execute on function public.set_issue_screenshot(uuid, text) to authenticated;
