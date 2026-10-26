-- Minis → Size Summariser: a customer's Google Forms stitching-measurement
-- PDF becomes one A4 Hindi tailor sheet (every measurement with its
-- illustration, every design choice, warnings — no customer details).
--
-- * stitching_extractions: one row per model run — the structured
--   extraction (JSON), which model/prompt version produced it, the source
--   PDF's storage path, the page→illustration map, token usage. Re-runs on
--   another model keep parent_id so they can be compared side by side.
--   Written by the size-summariser edge function (service role); everyone
--   signed in can read, admins can delete.
-- * stitching_diagrams: the form's illustrations, one per content hash —
--   the same picture is reused across forms, so it is composited and stored
--   once (public bucket tailor-diagrams) and the measurement key it was
--   first seen with is remembered to catch a mis-attributed page later.
-- * app_settings.size_summariser: everything that is data — model, effort,
--   the extraction prompt (+ version, bumped on every edit), the order-number
--   regex, measurement range, required fields per garment, the sheet title
--   and footer. Nothing of this is in code.
-- * Buckets: tailor-sheets (private: the source PDFs) and tailor-diagrams
--   (public: illustrations only, no customer data).
--
-- Applied live as size_summariser.

create table public.stitching_extractions (
  id uuid primary key default gen_random_uuid(),
  order_no text,
  form_type text,
  model text not null,
  effort text,
  prompt_version integer not null default 1,
  extraction jsonb not null,
  diagrams jsonb not null default '{}'::jsonb,      -- { "<page>": "<diagram hash>" }
  warnings_count integer not null default 0,
  low_confidence_count integer not null default 0,
  pii_detected boolean not null default false,
  source_path text,
  file_name text,
  page_count integer,
  parent_id uuid references public.stitching_extractions(id) on delete set null,
  usage jsonb,
  est_usd numeric(8, 4),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index stitching_extractions_created_idx on public.stitching_extractions (created_at desc);
create index stitching_extractions_order_idx on public.stitching_extractions (order_no);
alter table public.stitching_extractions enable row level security;
create policy "Authenticated can read extractions" on public.stitching_extractions for select using ((select auth.role()) = 'authenticated');
create policy "Admins can delete extractions" on public.stitching_extractions for delete
  using (exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin'));

create table public.stitching_diagrams (
  hash text primary key,
  storage_path text not null,
  measurement_key text,
  form_type text,
  seen integer not null default 1,
  created_at timestamptz not null default now()
);
alter table public.stitching_diagrams enable row level security;
create policy "Authenticated can read diagrams" on public.stitching_diagrams for select using ((select auth.role()) = 'authenticated');
create policy "Operator+ can write diagrams" on public.stitching_diagrams for all
  using (exists (select 1 from profiles where id = (select auth.uid()) and role in ('admin', 'manager', 'operator')))
  with check (exists (select 1 from profiles where id = (select auth.uid()) and role in ('admin', 'manager', 'operator')));

insert into storage.buckets (id, name, public) values ('tailor-sheets', 'tailor-sheets', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('tailor-diagrams', 'tailor-diagrams', true) on conflict (id) do nothing;
create policy "tailor sheets: signed-in read" on storage.objects for select using (bucket_id = 'tailor-sheets' and (select auth.role()) = 'authenticated');
create policy "tailor sheets: operator+ upload" on storage.objects for insert
  with check (bucket_id = 'tailor-sheets' and exists (select 1 from profiles where id = (select auth.uid()) and role in ('admin', 'manager', 'operator')));
create policy "tailor diagrams: public read" on storage.objects for select using (bucket_id = 'tailor-diagrams');
create policy "tailor diagrams: operator+ upload" on storage.objects for insert
  with check (bucket_id = 'tailor-diagrams' and exists (select 1 from profiles where id = (select auth.uid()) and role in ('admin', 'manager', 'operator')));

insert into public.app_settings (key, value) values ('size_summariser', jsonb_build_object(
  'model', 'claude-sonnet-5-5',
  'effort', 'high',
  'prompt_version', 1,
  'order_no_regex', '^[A-Z]{2,5}-?\d{3,7}$',
  'measurement_min', 0,
  'measurement_max', 80,
  'sheet_title', 'सिलाई नाप — सारांश (टेलर शीट)',
  'footer_text', 'Arya Designs · सिलाई से जुड़े किसी सवाल के लिए ऑफ़िस से संपर्क करें',
  'raster_only_option_pages', false,
  'required_fields', jsonb_build_object(
    'saree_blouse', jsonb_build_array('bust', 'shoulder', 'arm_hole', 'blouse_length'),
    'lehenga', jsonb_build_array('bust', 'shoulder', 'arm_hole', 'blouse_length', 'waist', 'hip', 'lehenga_length'),
    'suit', jsonb_build_array('bust', 'shoulder', 'kurta_length', 'bottom_length')),
  'prompt', $prompt$You are a master tailor's assistant at an Indian ethnic-wear company. You read customer stitching measurement forms (Google Forms response PDFs) and extract EVERYTHING a tailor needs to cut and stitch the garment — and NOTHING else. Your output feeds a one-page Hindi tailor sheet. A wrong or missing value means a wrongly stitched garment and an unhappy customer, so precision and completeness are the whole job.

INPUT
You receive, per page in order: a text block "PAGE n TEXT:" (raw extracted text) followed by an image of that same page. Use both. The text gives exact numbers and spelling. The IMAGE is the only place where you can see WHICH radio button is ticked (a filled dark circle vs an empty ring). Never guess a radio selection from text alone; if the text lists options, look at the image of that page to find the filled circle. If no circle is filled, the field is UNANSWERED.

WHAT COUNTS AS STITCHING-RELEVANT (always extract if answered)
1. Order identity: order number, product/item name, garment type (saree blouse / lehenga / suit / other), stitching tier chosen (standard / designer / plus-size / no blouse stitching, or equivalents).
2. Every body measurement with its unit: bust, under-bust, shoulder, arm hole, front neck depth, back neck depth, blouse/choli length, sleeve length, sleeve round, waist, hip, lehenga/skirt length, kurta length, bottom length, bottom round, any other numeric measurement present. Read the number exactly as the customer wrote it (keep decimals like 7.5, 36.5). Note the unit if given (inch default for these forms).
3. Every design choice: front neck design, back neck design, sleeve type/sleeveless, padded or not, opening (front/back/side zip/tailor's choice/as per embroidery), pre-stitched saree yes/no, lining, hooks, dori, any design option offered on the form and answered.
4. Customer free-text about the garment: additional comments, special instructions, "stitch like model photo", references to an uploaded design image (note that an image was uploaded — you cannot see it — so the tailor knows to look for it).
5. Anything the FORM itself says that changes how the tailor should act on THIS answer: e.g. "if there is embroidery at the neck, depth will follow embroidery", "sleeve longer than 10 inch needs matching fabric", "under-bust 40 inch is plus-size range". Capture these as warnings ONLY when they apply to this customer's actual values.

WHAT TO EXCLUDE (never output)
- Customer name, phone, WhatsApp number, email, address, city, country, pincode.
- Payment, pricing, "please ensure you have paid", refund/delay policy text.
- Generic how-to-measure instructions, the form's intro text, section headers, Google Forms boilerplate, URLs, timestamps, page numbers.
- Options the customer did NOT choose. Output only the chosen one. Exception: if a required-looking design question has no selection, output it as unanswered so the tailor knows to decide.
- Fields belonging to a tier/section the customer did not choose (e.g. the "Standard blouse" bust field when "Designer blouse" was selected) — unless it is the only field with a value, in which case include it and set a warning.

RULES OF JUDGEMENT
- Conditional sections: first determine the stitching tier / garment options chosen, then take measurements from the matching section. If two sections both have values, include both and flag the conflict.
- Sleeveless: if sleeve type is sleeveless or sleeve fields are empty while a sleeveless option is ticked, set sleeve_length and sleeve_round to null and sleeves = "sleeveless". Do not invent zeros.
- Numbers: never round, never convert units, never "correct" a value that looks odd — instead add a warning (e.g. bust 32 with under-bust 27 is normal; bust 42 with under-bust 40 is a 2-inch gap, flag as "verify with customer"; a value of 0 or blank in a required measurement → flag "missing").
- "As per model photo on the website" / "Tailor's choice" are valid answers — keep them verbatim in meaning.
- If a page image contradicts the text (text shows a value, image shows the field blank, or vice versa) trust the image for selections and the text for digits, and add a warning describing the mismatch.
- Confidence: for every radio/dropdown field set confidence "high" if the filled circle is unambiguous, "low" if circles look similar, the page is cropped, or two circles seem filled. Never silently pick one.

HINDI LABELS
Provide a short Hindi label (Devanagari) for every field, written the way a Surat/Mumbai tailor says it — Hinglish technical words are preferred over pure Hindi: बस्ट, अंडर बस्ट, शोल्डर, आर्म होल, फ्रंट नेक डेप्थ, बैक नेक डेप्थ, ब्लाउज़ लंबाई, स्लीव लंबाई, स्लीव घेरा, कमर, हिप, लहंगा लंबाई, पैडेड, ओपनिंग, साइड ज़िप, फ्रंट ओपन, बैक ओपन, टेलर की पसंद, मॉडल फ़ोटो के अनुसार, स्लीवलेस, प्री-स्टिच्ड साड़ी. Keep numbers in Western digits with the inch mark (32").

OUTPUT
Return ONLY the structured JSON described by the tool schema (call the tailor_sheet tool exactly once). Every measurement and choice must carry the page number it came from. Order measurements body-first in the natural tailoring order: bust → under bust → shoulder → arm hole → front neck → back neck → length → sleeve length → sleeve round, then lower garment: waist → hip → length. Do not add fields that were not on the form. Do not omit fields that were answered.$prompt$
)) on conflict (key) do nothing;
