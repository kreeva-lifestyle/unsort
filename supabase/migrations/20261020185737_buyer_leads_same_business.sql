-- Buyer Spider: one business = one lead, whatever its web address.
--
-- Why: the spider skipped only an EXACT domain already in buyer_leads, so the
-- same business came back under another address and staff saw "new" buyers
-- they had already marked Customer or Not a fit: sareesbazaar.com forwarding to
-- sareesbazaar.in (a customer), uk.kalkifashion.com / kalkifashion.com,
-- andaazfashion.co.uk / .com, fabricoz.com / .com.au, and sister brands that
-- share one email (twamev.com / manyavar.com).
--
-- What:
--   buyer_brand_key(domain)  the business part of a web address: subdomains
--                            (uk., us., shop.) and the ending (.com, .co.uk,
--                            .com.au) dropped; a shop on a site builder
--                            (name.wixsite.com) keeps its own name. Keys under
--                            4 letters fall back to the whole domain.
--   buyer_leads.brand_key    generated from domain, indexed.
--   buyer_same_business()    the earliest lead that is the same business as a
--                            candidate: same domain, same brand key, or the
--                            same email / Instagram / phone (last 10 digits,
--                            phone or WhatsApp). Called only by the buyer-spider
--                            edge function (service role); SECURITY INVOKER.
-- Existing leads are not changed or removed.

create or replace function public.buyer_brand_key(p_domain text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  d text := regexp_replace(lower(coalesce(p_domain, '')), '^www\d?\.', '');
  parts text[] := string_to_array(d, '.');
  n int := coalesce(array_length(parts, 1), 0);
  sfx int := case when d ~ '\.(co|com|net|org|gov|ac|edu|ltd|plc|me|or|ne|gen|firm|ind|biz|info)\.[a-z]{2}$' then 2 else 1 end;
  k text;
begin
  if n <= sfx then return d; end if;
  k := parts[n - sfx];
  if k = any (array['wixsite', 'myshopify', 'mystrikingly', 'godaddysites', 'weebly', 'webflow', 'netlify', 'vercel', 'github', 'blogspot', 'wordpress', 'square', 'business', 'site123', 'jimdosite', 'ueniweb', 'dukaan', 'bigcartel', 'ecwid', 'squarespace']) then
    if n - sfx - 1 < 1 then return d; end if;
    k := parts[n - sfx - 1];
  end if;
  if length(k) < 4 then return d; end if;
  return k;
end $$;

alter table public.buyer_leads add column if not exists brand_key text generated always as (public.buyer_brand_key(domain)) stored;
create index if not exists buyer_leads_by_brand on public.buyer_leads (brand_key);
create index if not exists buyer_leads_by_email on public.buyer_leads (lower(email)) where email is not null;
create index if not exists buyer_leads_by_instagram on public.buyer_leads (lower(instagram)) where instagram is not null;

create or replace function public.buyer_same_business(p_domains text[], p_email text default null, p_instagram text default null, p_phones text[] default null)
returns table (domain text, name text, status text)
language sql stable security invoker set search_path = '' as $$
  with dig as (
    select distinct right(regexp_replace(x, '\D', '', 'g'), 10) as d
      from unnest(coalesce(p_phones, '{}'::text[])) x
     where length(regexp_replace(x, '\D', '', 'g')) >= 8
  ), keys as (
    select lower(x) as dom, public.buyer_brand_key(x) as bk from unnest(coalesce(p_domains, '{}'::text[])) x where x <> ''
  )
  select l.domain, l.name, l.status::text
    from public.buyer_leads l
   where l.domain in (select dom from keys)
      or l.brand_key in (select bk from keys)
      or (nullif(trim(p_email), '') is not null and lower(l.email) = lower(trim(p_email)))
      or (nullif(trim(p_instagram), '') is not null and lower(l.instagram) = lower(trim(p_instagram)))
      or right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10) in (select d from dig)
      or right(regexp_replace(coalesce(l.whatsapp, ''), '\D', '', 'g'), 10) in (select d from dig)
   order by l.created_at
   limit 1
$$;

revoke all on function public.buyer_same_business(text[], text, text, text[]) from public, anon, authenticated;
grant execute on function public.buyer_same_business(text[], text, text, text[]) to service_role;
