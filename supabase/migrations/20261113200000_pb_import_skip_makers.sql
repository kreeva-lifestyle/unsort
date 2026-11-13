-- Leave chosen manufacturers out of an import (owner, 2026-11-13: "ability to ignore those manufacturer which we
-- want to while scrapping products").
--
-- WHY: a website can sell several makers' products, and the owner wants to leave some makers out. "Check website"
-- lists the manufacturers it found on the products (pb-products import/maker.ts); the import sheet lets staff untick
-- the ones to skip; the run passes over a product that names one of them, and counts it apart so the run tile can
-- say how many. The next import from the same website starts with the same choice.
-- HOW: pb_import_runs.skip_makers text[] = the names as chosen (compared spaces and case aside, at most 50), and
-- pb_import_runs.maker_skipped int = the products passed over for it. Written only by the pb-products edge function
-- (service role); staff read runs through the existing policy, which is unchanged.
--
-- Additive: two columns with defaults (existing runs: nothing skipped).

alter table public.pb_import_runs
  add column if not exists skip_makers text[] not null default '{}' check (cardinality(skip_makers) <= 50),
  add column if not exists maker_skipped int not null default 0;
comment on column public.pb_import_runs.skip_makers is 'Manufacturers this import leaves out (pb-products import/maker.ts skipsMaker); the next import from the same host starts with them.';
comment on column public.pb_import_runs.maker_skipped is 'Products passed over because they name a manufacturer in skip_makers.';
