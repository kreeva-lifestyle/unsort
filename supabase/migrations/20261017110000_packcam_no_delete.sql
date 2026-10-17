-- Pack Cam: no deleting from the app.
--
-- The owner decided the team clears old clips themselves (PC clips folder,
-- Dropbox, Drive), so the bulk-delete feature goes: the three delete RPCs,
-- the delete columns and their index, and the 'deleted' status. The only
-- 'deleted' row is the edge-function smoke test from 2026-10-17. Also drops
-- packcam_set_camera_password, superseded by packcam_save_camera (camera
-- address + password in one transaction). Nothing in the app or the agent
-- uses any of these any more.
--
-- Run once in the Supabase SQL Editor (the deploy tooling cannot run drops
-- without an interactive confirmation).

drop function if exists packcam_request_delete(uuid[]);
drop function if exists packcam_request_delete_range(date, date, text);
drop function if exists packcam_cancel_delete(uuid[]);
drop function if exists packcam_set_camera_password(uuid, text);
drop index if exists packcam_clips_pending_delete;
delete from packcam_clips where status = 'deleted';
alter table packcam_clips
  drop column if exists delete_requested_at,
  drop column if exists delete_requested_by,
  drop column if exists deleted_at;
alter table packcam_clips drop constraint if exists packcam_clips_status_check;
alter table packcam_clips add constraint packcam_clips_status_check
  check (status in ('queued', 'cutting', 'uploading', 'done', 'failed', 'missing'));

insert into supabase_migrations.schema_migrations (version, name) values ('20261017110000', 'packcam_no_delete') on conflict do nothing;
