-- Buyer Spider (Minis → Client Finder → Buyers): seed one buyer's website,
-- find lookalike buyers through a search API, and let their lookalikes seed
-- the next hop. Three tables:
--
--   buyer_runs   one crawl: the seed, the AI-written buyer profile and the
--                search queries, caps, counters, status. The run is the unit
--                the client loops `step` over, so it can be paused and resumed.
--   buyer_queue  the frontier: every domain a search surfaced for a run, with
--                the hop it was found at and which domain/query led there.
--                One row per (run, domain) — a site is judged once per run.
--   buyer_leads  the result: one row per DOMAIN across all runs (a buyer found
--                twice is one buyer), with the contact details read off their
--                own website, the AI's verdict, and the outreach status staff
--                keep here.
--
-- Access: the lead list is a company asset, so every signed-in user reads all
-- three tables. Staff may update ONLY the outreach columns of a lead (column
-- grant below); every insert and every other write comes from the service-role
-- edge function `buyer-spider`, which also enforces the spend caps.

create table if not exists buyer_runs (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid not null references profiles(id) on delete cascade,
  seed_url      text not null,
  seed_domain   text not null,
  -- AI-written profile of the seed buyer: what they sell, segment, country,
  -- and the search queries derived from it. Shown in the UI, reused per hop.
  profile       jsonb not null default '{}'::jsonb,
  status        text not null default 'running' check (status in ('running','paused','done','failed')),
  max_depth     int  not null default 2 check (max_depth between 1 and 3),
  max_leads     int  not null default 150 check (max_leads between 10 and 500),
  queries_used  int  not null default 0,
  pages_fetched int  not null default 0,
  leads_found   int  not null default 0,
  step_note     text,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists buyer_runs_by_user on buyer_runs (created_by, created_at desc);

create table if not exists buyer_queue (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references buyer_runs(id) on delete cascade,
  domain        text not null,
  url           text not null,
  hop           int  not null default 1,
  parent_domain text,
  via_query     text,
  -- pending → accepted (became a lead) / rejected (judged not a buyer) /
  -- skipped (blocklisted, unreachable, or already a known lead) / failed
  state         text not null default 'pending' check (state in ('pending','accepted','rejected','skipped','failed')),
  note          text,
  created_at    timestamptz not null default now(),
  unique (run_id, domain)
);
-- The step picks the next pending item for a run, shallowest hop first.
create index if not exists buyer_queue_next on buyer_queue (run_id, state, hop, created_at);

create table if not exists buyer_leads (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null unique,
  url             text not null,
  name            text,
  -- boutique / retailer / wholesaler / online_store / marketplace_seller / other
  kind            text,
  what_they_sell  text,
  city            text,
  country         text,
  phone           text,
  email           text,
  whatsapp        text,
  instagram       text,
  facebook        text,
  -- 0-100: how closely this site matches the seed buyer, per the AI judge.
  score           int  not null default 0 check (score between 0 and 100),
  reason          text,
  hop             int  not null default 1,
  parent_domain   text,
  first_run_id    uuid references buyer_runs(id) on delete set null,
  found_by        uuid references profiles(id) on delete set null,
  -- Outreach, kept by staff: new → contacted → replied → customer, or rejected.
  status          text not null default 'new' check (status in ('new','contacted','replied','customer','rejected')),
  notes           text,
  contacted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists buyer_leads_by_status on buyer_leads (status, created_at desc);
create index if not exists buyer_leads_by_run on buyer_leads (first_run_id, score desc);
create index if not exists buyer_leads_by_country on buyer_leads (country);

alter table buyer_runs  enable row level security;
alter table buyer_queue enable row level security;
alter table buyer_leads enable row level security;

create policy buyer_runs_read  on buyer_runs  for select to authenticated using (true);
create policy buyer_queue_read on buyer_queue for select to authenticated using (true);
create policy buyer_leads_read on buyer_leads for select to authenticated using (true);
-- Staff keep the outreach columns; the column grant below limits the update to
-- exactly those three, so a client can never rewrite a lead's contact data.
create policy buyer_leads_outreach on buyer_leads for update to authenticated using (true) with check (true);
revoke update on buyer_leads from authenticated;
grant  update (status, notes, contacted_at) on buyer_leads to authenticated;

comment on table buyer_runs  is 'Buyer Spider crawls: seed buyer site, AI profile + queries, caps and counters. Stepped by the client, written by the buyer-spider edge function.';
comment on table buyer_queue is 'Buyer Spider frontier: one row per (run, domain) surfaced by a search, judged once.';
comment on table buyer_leads is 'Buyer Spider results: one row per buyer domain across runs, contacts read from their own site, AI verdict, outreach status kept by staff.';
