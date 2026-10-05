-- Jobwork module, part 1: helpers. jw_role() reads the caller's role for
-- RLS policies and RPC checks; jw_today() is the IST business date (a UTC
-- date stamps the previous day before 05:30 IST).
create or replace function public.jw_role()
 returns text language sql stable security invoker set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function public.jw_today()
 returns date language sql stable set search_path = public
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
