-- Delivery-sheet automation (owner's ask, 2026-08-25): courier SMS that
-- carry a delivery-sheet link (e.g. Shadowfax) get the sheet fetched
-- server-side, rebuilt as a PDF and filed into the owner's chosen Dropbox
-- folder. These two columns let the otp-inbox edge function report what
-- happened on each row, and the UI show it live via realtime UPDATEs.
alter table public.otp_inbox
  add column if not exists sheet_status text,
  add column if not exists sheet_file text;
