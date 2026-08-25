-- WHY: OTPs land on the owner's iPhone but STAFF need them. iOS gives no app
-- direct SMS access, so an iOS Shortcut automation ("message contains OTP ->
-- POST to the otp-inbox edge fn") forwards each OTP SMS, and the OTP Inbox
-- Mini shows it to staff live. Writes come ONLY through the edge fn (service
-- role, shared-secret authed); staff read and delete; 24-hour purge cron.
-- Applied 2026-08-25 via MCP as otp_inbox.

create table if not exists public.otp_inbox (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  code text,
  device text,
  received_at timestamptz not null default now()
);
create index if not exists otp_inbox_received_idx on public.otp_inbox (received_at desc);
alter table public.otp_inbox enable row level security;
create policy "Authenticated can read otp" on public.otp_inbox
  for select to authenticated using ((select auth.role()) = 'authenticated');
create policy "Authenticated can delete otp" on public.otp_inbox
  for delete to authenticated using ((select auth.role()) = 'authenticated');
alter publication supabase_realtime add table public.otp_inbox;
insert into public.app_secrets (key, value, updated_at)
values ('otp_push_secret', encode(extensions.gen_random_bytes(24), 'hex'), now())
on conflict (key) do nothing;
select cron.schedule('purge-otp-inbox', '50 3 * * *',
  $$delete from public.otp_inbox where received_at < now() - interval '24 hours'$$);
