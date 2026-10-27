-- Size Summariser settings v2: what the first real customer form (ETH20911,
-- "Microsoft Print to PDF", no text layer) taught. Data only, no schema.
--
--   * prompt v2: the original prompt plus rules for picture-only pages,
--     several questions per page, word answers to measurement questions
--     (value_text_en / value_text_hi instead of a false "missing"), the
--     y_on_page position used to match form pictures to cards, an empty tier
--     when the form does not state one, and contradictions to flag (note vs
--     selected value, sleeve answers that disagree, tier-only options).
--   * the second, independent read of picture-only pages: verify_model
--     (Haiku 5.5 — a fraction of a rupee per form) and its prompt.
--
-- Guarded on prompt_version = 1 so it applies once and never appends twice.
-- Owner asked for it on 2026-10-27 ("apply the summariser settings"); the
-- direct SQL write timed out twice waiting on the connector's confirmation.
update public.app_settings set value = value
  || jsonb_build_object('prompt_version', 2)
  || jsonb_build_object('verify_model', 'claude-haiku-5-5')
  || jsonb_build_object('verify_prompt', $v$You transcribe customer stitching-measurement forms from page images. For every page, list each question on it and the answer the customer gave, exactly as printed. For a radio or checkbox question the answer is the option whose circle or box is filled; for a dropdown it is the value shown in the box; for a text field the text typed. If nothing is selected or typed, the answer is an empty string. Copy numbers and units exactly ("35 inch", "7.5"). Do not interpret, convert, translate or summarise, and do not skip questions that ask for a name, phone or email — transcribe everything.$v$)
  || jsonb_build_object('prompt', (value->>'prompt') || $p$

FORM SHAPES (forms come from many templates and brands)
- Several questions may share one page; one question may run onto the next page. Give every measurement and choice the page where its ANSWER is shown.
- Some PDFs have no text layer: the TEXT block then says "(no text)" and the page image is all you have. Read each answer from the image with the same care.
- Dropdown answers appear as the value shown in the box ("35 inch"). Order numbers may be written without a hyphen (ETH20911).

NON-NUMBER ANSWERS
If a measurement question is answered with words instead of a number ("As per the Embroidery on the Blouse (Recommended)", "Sleeveless", "Standard size"), still list the measurement: value null, the answer as shown in value_text_en, and a short Hindi version in value_text_hi ("कढ़ाई के अनुसार", "स्लीवलेस"). That is an answer, not a missing value — never warn that it is missing.

POSITION
For every measurement give y_on_page: where its question starts on the page image, 0 = top edge, 1 = bottom edge.

TIER
If the form does not show which stitching tier was bought, set stitching_tier to "" (empty) — do not write "not stated".

CONTRADICTIONS (a "check" warning in Hindi that quotes both sides)
- A customer note asking for a different value than the one selected (note says 37.5", dropdown says 37"): keep the selected value in the field and quote both in the warning.
- Sleeve answers that disagree (a sleeve length or "as per embroidery" while sleeve round says sleeveless).
- An option marked for one tier ("Designer Stitching customers only") chosen when the form does not show that tier: an "info" warning so the office checks the order.$p$)
where key = 'size_summariser' and coalesce((value->>'prompt_version')::int, 1) = 1;
