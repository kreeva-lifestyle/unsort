-- Playbook: a vendor can have several short names (owner, 2026-11-13: "Multiple short
-- names in vendor. For example code might start with KB or NKB").
--
-- WHY: one supplier's design codes can start with more than one set of letters
-- (Kashtbhanjan: KB 273 ..., NKB 25 ...), and pb_vendors.code held one value only.
--
-- HOW:
--   pb_vendors.codes text[]  the short names in the order typed: {KB,NKB}. Upper-case
--                            letters and digits, 1 to 10 characters each, at most 8.
--   pb_vendors.code          stays, now DERIVED: the same names joined for showing and
--                            searching ("KB, NKB"; null when there are none). The Vendors
--                            list keeps reading and searching it as before.
--   pb_short_names(text)     "kb, nkb / KB" -> {KB,NKB}: split on anything that is not a
--                            letter or digit, upper-cased, duplicates dropped, order kept.
--   pb_vendors_codes_sync    BEFORE INSERT/UPDATE: whichever of the two was written is
--                            cleaned into `codes`, and `code` is rebuilt from it. So the
--                            new screen (writes `codes`) and a phone still running an older
--                            copy of the app (writes the text into `code`) end up the same.
--
-- What uses them today: the Vendors screen, and the {vendor_code} tag placeholder, which
-- now gives the short name the product's own code starts with (pb-products tags.ts
-- vendorCode). Matching ("already added?", stock-out notices) does NOT read them: it
-- already keeps a code's own letters, so KB 25 and NKB 25 are two designs.
--
-- Additive: one column (existing rows get '{}'), two functions, one trigger.
-- pb_vendors has table-level grants and staff row policies, so the new column needs
-- no grant or policy of its own.

create or replace function public.pb_short_names(p_text text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(d.t order by d.ord), '{}')
  from (
    select x.t, min(x.ord) as ord
    from regexp_split_to_table(upper(coalesce(p_text, '')), '[^A-Z0-9]+') with ordinality as x(t, ord)
    where x.t <> ''
    group by x.t
  ) d
$$;
comment on function public.pb_short_names(text) is 'Playbook: a typed list of vendor short names ("kb, nkb") as a clean array ({KB,NKB}).';

alter table public.pb_vendors
  add column if not exists codes text[] not null default '{}'
  constraint pb_vendors_codes_format check (array_to_string(codes, ',') ~ '^([A-Z0-9]{1,10}(,[A-Z0-9]{1,10}){0,7})?$');
comment on column public.pb_vendors.codes is 'Short names: the letters this vendor''s design codes start with ({KB,NKB}). Upper-case letters/digits, 1-10 each, at most 8.';
comment on column public.pb_vendors.code is 'Derived from codes by pb_vendors_codes_sync: the short names joined for display and search ("KB, NKB"), null when none.';

create or replace function public.pb_vendors_codes_sync() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.codes := public.pb_short_names(case when cardinality(coalesce(new.codes, '{}')) > 0 then array_to_string(new.codes, ',') else new.code end);
  elsif new.codes is distinct from old.codes then
    new.codes := public.pb_short_names(array_to_string(coalesce(new.codes, '{}'), ','));
  elsif new.code is distinct from old.code then
    new.codes := public.pb_short_names(new.code); -- an older copy of the app still writes the text
  end if;
  new.code := nullif(array_to_string(new.codes, ', '), '');
  return new;
end $$;

create or replace trigger pb_vendors_codes_sync before insert or update on public.pb_vendors
  for each row execute function public.pb_vendors_codes_sync();

-- Vendors that already had a short code: the same value, as a list.
update public.pb_vendors set codes = public.pb_short_names(code) where btrim(coalesce(code, '')) <> '';
