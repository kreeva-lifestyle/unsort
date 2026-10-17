-- Pack Cam: a packing video for every PackStation scan.
--
-- The office PC runs the Pack Cam agent (tools/packcam-agent). It records
-- each IP camera's RTSP stream to its own disk in one-minute pieces, and for
-- every scan cuts a clip on that scan's camera from the scan to the next scan
-- on the same camera (capped), at full quality (stream copy, no re-encode).
-- The clip is kept on the PC and/or uploaded to Dropbox / Google Drive,
-- whichever the admin turned on in Settings → Pack Cam.
--
-- This migration holds the shared state:
--   packtime_cameras  + ip / rtsp_port / rtsp_path / username: how the agent
--                       reaches each camera (not secret; every signed-in user
--                       could already read the camera list).
--   packcam_camera_secrets  the camera passwords. No policy for any client
--                       role: the browser can SET one (admin RPC) but never
--                       read it back. Only the packcam edge function (service
--                       role) hands them to the authenticated agent.
--   packcam_clips     one row per scan's clip: window, size, where it is
--                       stored, and its state. Written only by the edge
--                       function on the agent's behalf; staff read it.
--   delete requests   bulk delete marks clips (admin/manager RPCs); the agent
--                       deletes them from the PC, Dropbox and Drive, then
--                       reports back and the row is kept as 'deleted'.
-- The agent's access key lives in app_secrets.packcam_agent_token_hash
-- (sha-256 only); settings in app_settings.packcam, the agent's heartbeat in
-- app_settings.packcam_agent.

alter table packtime_cameras
  add column if not exists ip text,
  add column if not exists rtsp_port int not null default 554,
  add column if not exists rtsp_path text not null default '/Streaming/Channels/101',
  add column if not exists username text not null default 'admin';

create table if not exists packcam_camera_secrets (
  camera_id  uuid primary key references packtime_cameras(id) on delete cascade,
  password   text not null,
  updated_at timestamptz not null default now()
);
alter table packcam_camera_secrets enable row level security;
-- Deliberately no policy: anon and authenticated can neither read nor write
-- this table directly. RLS + no policy = locked; the RPCs below are the door.
revoke all on packcam_camera_secrets from anon, authenticated;

create table if not exists packcam_clips (
  id                  uuid primary key default gen_random_uuid(),
  scan_id             uuid unique references packtime_scans(id) on delete set null,
  awb                 text not null,
  courier             text,
  camera              text not null,
  scanned_at          timestamptz not null,
  clip_start          timestamptz,
  clip_end            timestamptz,
  duration_s          numeric,
  size_bytes          bigint,
  status              text not null default 'queued'
                      check (status in ('queued','cutting','uploading','done','failed','missing','deleted')),
  pc_path             text,
  dropbox_path        text,
  gdrive_file_id      text,
  gdrive_link         text,
  error               text,
  delete_requested_at timestamptz,
  delete_requested_by uuid references profiles(id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- The Pack Cam clip list filters by date (newest first), camera and status,
-- and PackStation history looks clips up by scan; AWB search uses awb.
create index if not exists packcam_clips_scanned on packcam_clips (scanned_at desc);
create index if not exists packcam_clips_awb on packcam_clips (awb);
create index if not exists packcam_clips_status on packcam_clips (status, scanned_at desc);
create index if not exists packcam_clips_pending_delete on packcam_clips (delete_requested_at) where delete_requested_at is not null and deleted_at is null;

alter table packcam_clips enable row level security;
create policy packcam_clips_read on packcam_clips for select to authenticated using (true);
revoke insert, update, delete on packcam_clips from anon, authenticated;

-- Admin only: set (or clear, with an empty string) a camera's password.
create or replace function packcam_set_camera_password(p_camera uuid, p_password text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active is not false) then
    raise exception 'Only an admin can set camera passwords';
  end if;
  if not exists (select 1 from packtime_cameras where id = p_camera) then raise exception 'Camera not found'; end if;
  -- An empty string clears it (a blank row reads as "no password").
  insert into packcam_camera_secrets (camera_id, password) values (p_camera, coalesce(p_password, ''))
  on conflict (camera_id) do update set password = excluded.password, updated_at = now();
end $$;
revoke execute on function packcam_set_camera_password(uuid, text) from public, anon;
grant execute on function packcam_set_camera_password(uuid, text) to authenticated;

-- Which cameras have a password stored (never the password itself).
create or replace function packcam_password_status() returns table (camera_id uuid, updated_at timestamptz)
language sql security definer set search_path = public stable as $$
  select s.camera_id, s.updated_at from packcam_camera_secrets s
  where s.password <> '' and exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager') and is_active is not false);
$$;
revoke execute on function packcam_password_status() from public, anon;
grant execute on function packcam_password_status() to authenticated;

-- Bulk delete by id (the clips ticked on screen, at most 1000 per call).
create or replace function packcam_request_delete(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager') and is_active is not false) then
    raise exception 'Only an admin or manager can delete packing videos';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 1000 then raise exception 'At most 1000 clips at a time'; end if;
  update packcam_clips set delete_requested_at = now(), delete_requested_by = auth.uid(), updated_at = now()
   where id = any(p_ids) and deleted_at is null and delete_requested_at is null;
  get diagnostics n = row_count;
  perform audit_write('packcam', 'DELETE_REQUEST', null, n || ' packing video(s) marked for deletion');
  return n;
end $$;
revoke execute on function packcam_request_delete(uuid[]) from public, anon;
grant execute on function packcam_request_delete(uuid[]) to authenticated;

-- Bulk delete by filter: every clip scanned in [p_from, p_to] (IST dates),
-- optionally one camera — for "clear everything from last month" without
-- ticking thousands of boxes.
create or replace function packcam_request_delete_range(p_from date, p_to date, p_camera text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager') and is_active is not false) then
    raise exception 'Only an admin or manager can delete packing videos';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a valid date range'; end if;
  update packcam_clips set delete_requested_at = now(), delete_requested_by = auth.uid(), updated_at = now()
   where deleted_at is null and delete_requested_at is null
     and scanned_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
     and scanned_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
     and (p_camera is null or camera = p_camera);
  get diagnostics n = row_count;
  perform audit_write('packcam', 'DELETE_REQUEST', null, n || ' packing video(s) from ' || p_from || ' to ' || p_to || coalesce(' on camera ' || p_camera, '') || ' marked for deletion');
  return n;
end $$;
revoke execute on function packcam_request_delete_range(date, date, text) from public, anon;
grant execute on function packcam_request_delete_range(date, date, text) to authenticated;

-- Undo a delete request the agent has not carried out yet.
create or replace function packcam_cancel_delete(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager') and is_active is not false) then
    raise exception 'Only an admin or manager can change packing videos';
  end if;
  update packcam_clips set delete_requested_at = null, delete_requested_by = null, updated_at = now()
   where id = any(p_ids) and deleted_at is null and delete_requested_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function packcam_cancel_delete(uuid[]) from public, anon;
grant execute on function packcam_cancel_delete(uuid[]) to authenticated;

comment on table packcam_clips is 'Pack Cam: one packing video per PackStation scan (cut on the office PC from the scan to the next scan on that camera). Written by the packcam edge function for the agent.';
comment on table packcam_camera_secrets is 'Pack Cam camera passwords. No client policy: set through packcam_set_camera_password, read only by the packcam edge function.';
