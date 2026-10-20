-- Buyer Spider follow-up to 20261020185737_buyer_leads_same_business (review).
--
-- 1. buyer_runs.max_depth may now be 4 ("4 · deepest"); the original check
--    stopped at 3, so a 4-hop start failed after paying for the profile call.
-- 2. buyer_brand_key is stricter about subdomains. It dropped ANY subdomain,
--    so every shop on a shared host the list did not name (x.myinstamojo.com,
--    y.shopaccino.com, z.company.site …) became one "business" and real new
--    buyers were skipped as already on the list. Now a subdomain is dropped
--    only when it is a country / storefront word (uk., us., shop., store. …)
--    and the host itself is not a shared shop host; any other subdomain keeps
--    the whole address as the key. The ending is still ignored, so
--    sareesbazaar.com = sareesbazaar.in and andaazfashion.co.uk = .com.
--    brand_key is a stored generated column: SET EXPRESSION (Postgres 17)
--    recomputes every row with the new rule; nothing is dropped.

alter table public.buyer_runs drop constraint if exists buyer_runs_max_depth_check;
alter table public.buyer_runs add constraint buyer_runs_max_depth_check check (max_depth between 1 and 4);

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
  -- Shared shop hosts: the shop is the whole address, never the host's name.
  if k = any (array['wixsite', 'myshopify', 'mystrikingly', 'strikingly', 'godaddysites', 'weebly', 'webflow', 'netlify', 'vercel', 'github', 'blogspot', 'wordpress', 'square', 'business', 'site123', 'jimdosite', 'ueniweb', 'mydukaan', 'dukaan', 'bigcartel', 'ecwid', 'squarespace', 'myinstamojo', 'instamojo', 'shopaccino', 'dotpe', 'zohocommerce', 'storehippo', 'myshopline', 'mybigcommerce', 'bigcommerce', 'odoo', 'company', 'webnode', 'mojo', 'pages', 'herokuapp', 'firebaseapp', 'carrd', 'mystore', 'tumblr', 'wix', 'shopify']) then
    return d;
  end if;
  -- A subdomain counts as the same business only when it is a country or
  -- storefront word; anything else (a shop on someone else's domain) keeps
  -- the whole address.
  if n > sfx + 1 and (n > sfx + 2 or parts[1] <> all (array['shop', 'store', 'stores', 'online', 'global', 'intl', 'international', 'en', 'm', 'eu', 'uk', 'us', 'usa', 'in', 'au', 'ca', 'nz', 'ae', 'uae', 'sg', 'my', 'de', 'fr', 'it', 'es', 'nl', 'za', 'pk', 'bd', 'lk', 'np', 'qa', 'sa', 'kw', 'om', 'bh', 'hk', 'jp'])) then
    return d;
  end if;
  if length(k) < 4 then return d; end if;
  return k;
end $$;

alter table public.buyer_leads alter column brand_key set expression as (public.buyer_brand_key(domain));
