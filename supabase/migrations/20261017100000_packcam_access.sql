-- Pack Cam: tighter write access, and clips keep their scan id.
--
-- 1. scan_id stops being a foreign key. When a PackStation scan is undone
--    after its clip was cut, the old ON DELETE SET NULL made every later
--    clip report from the PC fail on that row (the agent keeps sending the
--    scan id) and lost the link the agent plays PC clips by. The clip keeps
--    the scan id it was cut for; it stays unique.
-- 2. app_settings lets any operator write any key. The Pack Cam keys steer
--    the office PC (recording on/off, where clips go) and carry the PC's
--    address used in play links, so writing them is admin only. RESTRICTIVE
--    policies are ANDed with the existing permissive ones: other keys are
--    unchanged; the edge function (service role) bypasses RLS.
-- 3. packtime_cameras: managers may still add cameras and switch them on or
--    off (Settings → PackStation), but the connection columns (ip, port,
--    path, user name) are admin only, through packcam_save_camera. Otherwise
--    a manager could point a camera at their own device and the PC would
--    send it the camera password.

-- 1 ──────────────────────────────────────────────────────────────────────
alter table packcam_clips drop constraint if exists packcam_clips_scan_id_fkey;

-- 2 ──────────────────────────────────────────────────────────────────────
create policy app_settings_packcam_admin_insert on app_settings as restrictive for insert to authenticated
  with check (key not in ('packcam', 'packcam_agent')
    or exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));
create policy app_settings_packcam_admin_update on app_settings as restrictive for update to authenticated
  using (key not in ('packcam', 'packcam_agent')
    or exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false))
  with check (key not in ('packcam', 'packcam_agent')
    or exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin' and is_active is not false));

-- 3 ──────────────────────────────────────────────────────────────────────
create or replace function packtime_cameras_guard_connection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- No signed-in user (service role, SQL editor) or an admin: allowed.
  if auth.uid() is null or exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active is not false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.ip is not null then raise exception 'Only an admin can set a camera''s connection (Settings → Pack Cam)'; end if;
  elsif new.ip is distinct from old.ip or new.rtsp_port is distinct from old.rtsp_port
     or new.rtsp_path is distinct from old.rtsp_path or new.username is distinct from old.username then
    raise exception 'Only an admin can change a camera''s connection (Settings → Pack Cam)';
  end if;
  return new;
end $$;
drop trigger if exists packtime_cameras_guard_connection on packtime_cameras;
create trigger packtime_cameras_guard_connection before insert or update on packtime_cameras
  for each row execute function packtime_cameras_guard_connection();
