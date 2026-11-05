# Playbook words and accessibility: what to write, and how everyone can use it
Use this when you write any label, message or help text in Playbook, or build anything a person reads, taps or tabs to.

Visual tokens are in `src/playbook/DESIGN.md` §2–§5. DESIGN.md §2 holds the contrast-checked values (amended 2026-11-05); this file does not override any of them, and §B1 records the measurements. Toast timing and states are in `states-and-feedback.md`; sheet layout and keyboard lift in `mobile.md`; chart labels and tables in `data-and-charts.md`; which component to use in `layout-and-components.md`. Root `CLAUDE.md` rules still apply (friendlyError, two-signal buttons, 44px targets, no `window.alert/confirm/open`).

## A. Words

### A1. Voice
- Write for shop staff on a phone: short, plain, friendly sentences. One idea per sentence. Present tense, active voice, "you" for the reader.
- Use the words staff use: product, photo, price, website, vendor, saree, lehenga, kurta set, size, live, draft. Say "website", not "store config" or "Shopify channel".
- Never show: payload, sync job, RPC, edge function, row, record, null, ID, token, API, 4xx/5xx, Supabase, slug (say "web address"), handle (say "web address" in labels; keep `handle` only in code). Exception: the website connection section may say "Shopify access token", with helper text saying where to find it in Shopify.
- Name the AI as "the AI" ("The AI is reading it"). Never name a model in UI text.
- No marketing tone ("Effortlessly manage…"), no jokes, no exclamation marks, no emoji.

### A2. Capitalisation and punctuation
- Sentence case everywhere: titles, buttons, tabs, labels ("Add product", "Website settings"). Proper nouns keep their case (Shopify, WhatsApp).
- Section labels are written in sentence case in code and uppercased by CSS (DESIGN.md §3), so screen readers do not spell them out.
- Use `…` (one character) for in-progress labels: "Saving…". Use `·` to join meta: "Banarasi · 3 sizes". Use `—` for an empty value.

### A3. Buttons and links
- A button is a verb plus its object, and says exactly what happens: "Approve & publish", "Publish to 3 websites", "Read again with AI", "Save facts", "Add vendor". Never "OK", "Submit", "Yes", "Done", "Click here".
- In-progress label = the same verb in "-ing" form: "Publishing…", "Reading…", "Removing…". The success toast repeats it in past tense: "Published to 3 websites".
- If the count or target matters, put it in the label ("Remove from 2 websites").
- Cancel is always "Cancel". Back: on phone an icon-only 44px button with `aria-label="Back to Products"`; on desktop the same button plus a visible "‹ Products" (`layout-and-components.md` §3).
- Links to Shopify say where they go: "Open on Shopify", "View live page". They are real `<a href target="_blank" rel="noopener">` (root rule: no `window.open`).
- A disabled button must say why, as helper text under it: "Add a cost price to publish".

### A4. Titles, labels and helper text
- Page title = the noun the tab uses ("Products", "Websites"). Detail page title = the item's own name.
- Field label = the noun ("Cost price", "Sizes"). Put units and format in the label or a prefix, not the placeholder: "Cost price (₹)".
- Placeholders show an example only ("e.g. Banarasi silk saree"), never instructions. Anything needed to fill the field goes in helper text below, in `PB.tx2`.
- Helper text says the consequence, not the mechanism: "Used to work out the price on each website", not "Feeds the pricing formula".
- Locked AI fields show the badge "Kept" with helper "You changed this. The AI will not overwrite it."

### A5. Errors: what happened, then what to do
- Pattern: `<What went wrong, in their words>. <The next step>.`
  - "Could not reach the website. Check the Shopify sign-in in Website settings, then try again."
  - "Price is ₹0. Add a cost price before publishing."
  - "2 of 3 websites published. Store B failed: the photo is too large. Open Store B to retry."
- Every caught error goes through `friendlyError(err)` (`src/lib/friendlyError.ts`) before it reaches a toast or error box. If a new server message is common, add a plain-English mapping there (shared file: say so in the PR).
- Field errors sit under the field and name the fix: "Enter a price above ₹0". Never "Invalid input".
- Never blame the person ("You entered…"). Never say "will retry" unless the app really queues the write.

### A6. Empty states (use `<Empty>` from `src/components/ui/Empty.tsx`)
- First run teaches and offers one action: title "No products yet", message "Add photos, a cost price and the websites it goes to. The AI writes the rest.", CTA "Add product".
- Filtered empty names the filter and offers the way out: "No products match 'banarasi' on Store B", CTA "Clear filters".
- All-done empty is calm: "Nothing is waiting. New products will show here."

### A7. Confirm dialogs (`useConfirm()` from `src/components/ui/ConfirmModal.tsx`)
- Only for irreversible or Shopify-side actions (`ux-process.md` §8); reversible ones use Undo.
- Title = question naming the item and the effect: "Remove 'Banarasi silk saree' from 3 websites?"
- Message = what happens on Shopify and whether it can be undone: "It will be taken off Store A, B and C. You can put it back later with "Put back on site"."
- `confirmLabel` repeats the verb ("Remove from 3 websites"), `danger: true`; `cancelLabel` "Cancel".

### A8. Numbers, money and dates
- Money, counts, percentages and dates (IST): format through `src/playbook/format.ts` (`data-and-charts.md` §7–8). Never an ad-hoc `toLocaleString` or `toISOString()`.
- Every compared number in JetBrains Mono with `font-variant-numeric: tabular-nums` (DESIGN.md §3).
- Plurals: write both forms ("1 product", "3 products"). Never "product(s)".

### A9. Hindi/English mixed names
- Keep names exactly as typed. Never auto-translate, title-case or strip diacritics.
- Font stack: append `'Noto Sans Devanagari'` after Inter. Line-height ≥ 1.5 for any text that may hold Devanagari, never a fixed height on text boxes.
- Lists clamp names to 2 lines; colour and variant go on a separate meta line so they are never cut (`states-and-feedback.md` §8).
- Search should match both scripts as typed; do not lower-case Devanagari specially.

## B. Accessibility

### B1. Contrast: the measurements behind DESIGN.md §2
Measured with WCAG 2.x ratios, glows at full strength behind the tile (worst case). AA = 4.5:1 for text, UI = 3:1 for icons, borders, large text. On 2026-11-05 these DESIGN.md values were changed so that everything passes: `glowAmber` alpha .40 → .30, the active stops .24/.08 → .16/.06, `failed` 0.72 → 0.78 lightness, the hero stops .88 → .94 (opaque when it holds text under 18px), `tx2` fixed at 0.86, the input border .14 → .36 (`inputBd`), and the new `focus` (13.8 on a tile, 6.6 over amber).

Results with those values (tile over the amber glow, worst case): `tx` 7.98, `tx2` 5.86, `tx3` 5.59, `live` 5.10, `review` 5.31, `busy` 5.70, `failed` 4.91; in a frosted pill `tx` 6.17, `onActive` 6.72, `tx2` 4.53; `onBrand` on the `brandB` end of the hero 4.70 (opaque 5.25). Sheets (`.82` glass) pass for every text token. Status dots are ≥ 4.5 on tiles. Tile hairline `PB.tileBd` stays `.12`: it is decorative. If you change a token, measure again and update this paragraph.

Which text token goes where:
- `PB.tx`: everything a person must read to act — names, prices, counts, values, mono numbers. Text in a selected pill uses `PB.onActive` (the active recipe, DESIGN.md §5).
- `PB.tx2`: helper text, meta lines, section labels, unselected nav text.
- `PB.tx3`: chevrons, icons, placeholders, timestamps only. Never body text, prices, errors or anything inside a selected pill.
- Status colours: the status label next to its dot, and error text (`PB.failed`). Never body copy.
- On the gradient (hero, primary button): `PB.onBrand` only.
- A selected chip or segment never relies on its border alone: frosted fill + weight 600 + inset amber bar (side lists) or a check icon (multi-select chips).

### B2. Focus ring
- The ring CSS is in the DESIGN.md §8 block (`.pb-focus`, `.pb-pill`, `.pb-tile` → `outline: 2px solid var(--pb-focus); outline-offset: 2px`). Feed `--pb-focus` from `PB.focus`. Keep the 2px offset on gradient buttons so the ring sits on the tile, not the gradient.
- Inputs in sheets: offset 0 and the border turns `PB.focus` too.
- Never `outline: none` without this replacement. Never draw the ring with `box-shadow` (forced-colours mode drops it).

### B3. Keyboard
- Every clickable is a real `<button>` or `<a>`; never a `div` with `onClick`. Tab order follows the visual order.
- Nav pills and tab bar: real `<button>`s, one tab stop each, Enter/Space activates.
- Segmented control (`Seg` in `components/website/ui.tsx`): roving tabindex, only the selected segment has `tabIndex={0}`; Left/Right move and select, Home/End jump to ends.
- Filter chips: `role="toolbar"`, one tab stop, Left/Right move, Space/Enter toggle, focused chip calls `scrollIntoView({ inline: 'nearest' })`.
- Sheets and modals: focus on open per `mobile.md` §6, trap Tab/Shift+Tab inside, Esc closes through `useBackClose`, focus returns to the opener on close.
- Enter in the last field submits (root rule). Escape never discards typed data without the unsaved-changes prompt.

### B4. Screen-reader semantics per pattern
| Pattern | Markup |
|---|---|
| Tab bar / top nav | `<nav aria-label="Playbook">` of `<button>`s (as `PbNav.tsx`); current one `aria-current="page"`; icons `aria-hidden`; "More" opens a page, not a menu |
| Segmented control | `role="radiogroup"` + `aria-label`; segments `role="radio"` + `aria-checked` |
| Filter chips | `<button aria-pressed>` in the toolbar; announce the new count ("12 products") in a polite live region |
| Status dot + label | dot `aria-hidden`; meaning in the text. Compact rows keep the label in an sr-only span, never only in `title` or colour |
| Sheet / modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title id (`PbModal` uses `aria-label` today; keep one of the two); background `inert`; grab handle `aria-hidden`; close `aria-label="Close"` |
| Toasts | container `role="status" aria-live="polite"` (as `PbToasts.tsx` does); error toasts `role="alert"`; never move focus; errors stay ≥ 6 s |
| Icon-only button | `aria-label` in plain words ("Add product"); SVG `aria-hidden` and `focusable="false"` |
| Hero tile | a heading plus the text value: "Live products: 128", not the number alone |
| Busy region | `aria-busy="true"` while loading, with sr-only "Loading products" |
| Form field | `<label htmlFor>`; helper and error linked by `aria-describedby`; `aria-invalid` on error |
| Price | the ₹ sign is real text, never an image or CSS `::before` |
| Charts | a "Table" toggle with the same numbers (`data-and-charts.md`) |

### B5. Reduced motion and reduced transparency
- `prefers-reduced-motion: reduce`: the DESIGN.md §8 block turns off hover lifts and sheen. Also: sheets fade in over 150ms instead of sliding, no smooth scroll, no count-up (`src/components/ui/CountUp.tsx` ignores this today: add the check before Playbook uses it), skeleton shimmer stops.
- No glass support — `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` — and `@media (prefers-reduced-transparency: reduce)` and `@media (forced-colors: active)`: use opaque fills and hide the glows; keep the focus ring.
  - tile `PB.tileSolid`, sheet `PB.sheetSolid`, tab bar `PB.barSolid` (DESIGN.md §2).
- Text must stay AA in these fallbacks; check them, not only the glass version.

### B6. Touch targets
- Every tappable thing ≥ 44×44px (root rule), including close, back, chip remove and row chevrons. Pad the hit area if the visual is smaller.
- Touch sizes (DESIGN.md §5 and §7, `pointer: coarse`): buttons and inputs 48; each filter chip a 44px `<button>` (the hit box) with transparent 2px top and bottom padding holding a 40px pill; tabs 52; rows 60 (96 with a photo).
- Keep 8px between adjacent targets and ≥ 16px between a destructive action and the primary one.
- Chart marks: hit area 44px tall on phone, 24px on desktop.

### B7. Before you merge (a11y quick pass)
1. Tab through the screen with a keyboard: every control reachable, ring visible, order sensible, sheets trap and return focus.
2. Every status shows a word, not only a colour. No readable text in `PB.tx3`.
3. Turn on reduced motion and reduced transparency (DevTools rendering panel): nothing slides, text still readable.
4. Every icon button has an `aria-label`; every field has a label.
5. Copy check: verbs on buttons, sentence case, ₹ in en-IN, IST dates, every error passed through `friendlyError`.
