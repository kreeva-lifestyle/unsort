-- Playbook: "New Arrival" follows the owner's rule by itself (owner, 12 Nov 2026: "Also are we tracking meta data like
-- what was the date of upload. This way we could identify the whether its new arrival. … Last 30 days = auto tag New
-- arrival."; 20 Nov 2026: "Did you check which where actually new arrival as per our condition?").
-- WHY: the store called every SuratMandi product new. Its "New arrivals" collection took every product with a price,
-- and the theme's badge counted from the day a product was made on Shopify (17-20 Nov 2026 for all 510). By the owner's
-- rule 10 of the 510 were new: uploaded on the supplier's site in the last 30 days. Playbook now gives a product the
-- tag "New Arrival" while its upload date is 30 days old or less (listingFacts.ts withNewArrival), and the store's
-- collection and badge read that tag. Nothing on the product changes when the 30 days run out, so no trigger can see
-- it: this sweep, once an hour, marks for the small send (facts_due, 20261120100000_pb_facts_send.sql) every listing on
-- sale whose record of what the store has (pb_listings.sent) disagrees with the rule now: the tag goes on, or comes
-- off. A listing marked too often costs nothing on Shopify (the send compares with the record first).
-- The upload date: the supplier's site (attributes.source_created_at, kept since 12 Nov 2026), else the day the
-- product came into Playbook (a Telegram post, a product added by hand). Additive: two functions and one cron job.

create or replace function public.pb_upload_date(p_attributes jsonb, p_created timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  return coalesce(nullif(p_attributes ->> 'source_created_at', '')::timestamptz, p_created);
exception when others then
  return p_created; -- a date the source wrote in a form that is not one: the day it came into Playbook
end $$;
comment on function public.pb_upload_date(jsonb, timestamptz) is 'The day a product was uploaded: on the supplier''s site (attributes.source_created_at), else the day it came into Playbook. Twin of listingFacts.ts uploadedAt.';

-- Runs as whoever calls it (the cron job: the database owner); it writes nothing but the mark.
create or replace function public.pb_new_arrival_sweep() returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  update public.pb_listings l set facts_due = true, facts_tried_at = null
  from public.pb_products p
  where p.id = l.product_id and l.shopify_product_id is not null
    and not (l.status = 'skipped' and coalesce(l.shopify_status, '') in ('DRAFT', 'ARCHIVED'))
    and p.status <> 'archived' and not l.facts_due
    -- "New Arrival" (exactly these words: listingFacts.ts NEW_ARRIVAL, the theme's badge, the store's collection)
    and (public.pb_upload_date(p.attributes, p.created_at) >= now() - interval '30 days')
        is distinct from coalesce((l.sent -> 'tags') ? 'New Arrival', false);
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.pb_new_arrival_sweep() is 'Marks for the small send every listing on sale whose "New Arrival" tag on record disagrees with "uploaded in the last 30 days" (hourly, pb-new-arrivals). Returns how many.';

select cron.schedule('pb-new-arrivals', '13 * * * *', $$select public.pb_new_arrival_sweep()$$);
