-- Pack Cam: save one camera's connection in one transaction.
--
-- Settings → Pack Cam → Cameras edits the address (packtime_cameras) and the
-- password (packcam_camera_secrets) in one Save. Two tables in one user
-- action go through one function so a half-saved camera (new IP, old
-- password) cannot happen. Admin only, like the password RPC it supersedes
-- for this screen. p_password null keeps the stored password; '' clears it.

create or replace function packcam_save_camera(
  p_camera uuid, p_ip text, p_port int, p_path text, p_username text, p_password text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active is not false) then
    raise exception 'Only an admin can change camera connections';
  end if;
  if v_ip is not null and v_ip !~ '^[A-Za-z0-9.-]{1,253}$' then raise exception 'Enter the camera IP address like 192.168.1.64'; end if;
  if p_port is null or p_port < 1 or p_port > 65535 then raise exception 'RTSP port must be between 1 and 65535'; end if;
  if coalesce(p_path, '') !~ '^/[^[:space:]]{0,200}$' then raise exception 'Stream path must start with / and have no spaces'; end if;
  update packtime_cameras
     set ip = v_ip, rtsp_port = p_port, rtsp_path = p_path, username = left(btrim(coalesce(p_username, '')), 64)
   where id = p_camera;
  if not found then raise exception 'Camera not found'; end if;
  if p_password is not null then
    insert into packcam_camera_secrets (camera_id, password) values (p_camera, p_password)
    on conflict (camera_id) do update set password = excluded.password, updated_at = now();
  end if;
  perform audit_write('packcam', 'CAMERA', p_camera::text, 'Pack Cam camera connection saved' || case when p_password is not null then ' (password changed)' else '' end);
end $$;
revoke execute on function packcam_save_camera(uuid, text, int, text, text, text) from public, anon;
grant execute on function packcam_save_camera(uuid, text, int, text, text, text) to authenticated;
