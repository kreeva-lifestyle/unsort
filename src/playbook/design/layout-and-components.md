# Playbook layout and components: the building blocks, mapped to code

Use this when you build or redesign any Playbook screen and need the exact block, its size, the recipe that styles it and the file to reuse.

Visual values live in `src/playbook/DESIGN.md` (tokens §2, type and icons §3, recipes and radii §5, desktop §6, phone §7, motion §8). Contrast measurements and focus rules are in `copy-and-a11y.md`. Loading, empty, error and toast behaviour is in `states-and-feedback.md`. Phone-only detail is in `mobile.md`, and charts and stat tiles are in `data-and-charts.md`. This file says which block to use, at what size, and what code to reuse.

## 0. Ground rules
- **Recipes come from one file.** Read them from `src/playbook/pbTheme.ts`, which exports `PB` the way `T` works. If it does not exist yet, create it first, with the tokens from DESIGN.md §2 and these recipe objects: `pbTile`, `pbActive`, `pbHero`, `pbBtnPrimary`, `pbBtnSecondary`, `pbBtnDanger`, `pbInput`, `pbLabel`, `pbSheet`. If it already exists, use the names it exports.
- **Phone/desktop values are CSS variables.** Inline styles cannot hold media queries, so `src/index.css` sets these on `.pb-scroll` for desktop and resets them inside `@media (max-width: 768px)`: `--pb-tile-fill`, `--pb-blur`, `--pb-r-tile`, `--pb-r-hero`, `--pb-pad-tile`, `--pb-title`. Control sizes follow the pointer (DESIGN.md §5), so `--pb-ctl-h`, `--pb-chip-h`, `--pb-icon-btn`, `--pb-btn-fs` and `--pb-input-fs` are set under `@media (pointer: coarse)` and `(pointer: fine)`. Recipes in `pbTheme.ts` reference `var(--pb-…)`. Never branch on `useIsPhone` to pick a size; use it only to swap a whole layout.
- **No literals in components.** Never write raw colours, `T.*` accents or a hex alpha suffix. The DailyWork `S.*` recipes are only for components that are still on the old look.
- **Shared code only from the shared list.** Playbook imports only the shared layer named in root `CLAUDE.md` ("Divisions"): `src/lib/theme.tsx`, `supabase.ts`, `friendlyError.ts`, `escape.ts`, `errorLogger.ts`, `retryImport.tsx`, `division.ts`, `src/hooks/useAuth`, `useBackClose`, `useModalLock`, `src/components/ui/`, `src/components/brand/`.
  - `src/hooks/useIsPhone` and `src/lib/numericInput.ts` are not on that list.
  - For phone vs desktop, use CSS (`pb-` classes in `src/index.css`). If you need it in JS, add `src/playbook/hooks/useIsPhone.ts`.
  - For number inputs, use `numKey` from `components/product/status.tsx`.
- **Shared component changes are opt-in.** To restyle a shared `src/components/ui/` component for Playbook, add an optional prop with the old look as the default (for example an `ink`/`variant` prop). Say so in the PR. Never fork the component into `src/playbook/`, and never change how DailyWork looks.
- **Root rules stay.** Files stay under 200 lines. Clickables carry `className="pb-pill"` (buttons, chips, nav) or `"pb-tile"` (clickable tiles). Every clickable is a real `<button>` or `<a>`.

## 1. Spacing scale
- Use only 4, 8, 12, 16, 20, 24, 32 and 48. The only exceptions are the fixed chrome values in DESIGN.md §7 (tab bar padding 6, bottom margin 18), the grab handle (5 tall) and the chip's 2 px hit-box padding.
- Gaps by level:
  - label to value: 4–8
  - rows and tiles: 12–16 (the bento gap is 16)
  - sections: 24–32
- Tile padding is 20 on desktop and 16 on phone. Sheet padding is 16 on the sides, with the footer padding at 16 plus `env(safe-area-inset-bottom)`.
- Sticky side columns (editor section list, Settings status tile, Guide contents) sit at `top: var(--pb-sticky-top)` (84 = top bar 12 + 56, plus 16), never a per-page number.
- Space siblings with flex or grid `gap`, never with a margin on each child. Put `min-width: 0` on every flex or grid child that holds text.

## 2. Type scale (DESIGN.md §3)

| Role | Font | Size / weight | Colour |
|---|---|---|---|
| Page title | Sora | 32 desktop, 20 phone / 700, −0.3px | `PB.tx` |
| Tile or sheet title | Sora | 17 / 700, −0.3px | `PB.tx` |
| List name | Inter | 15 / 600, line-height 1.5 (Hindi marks need it, DESIGN.md §3), 2-line clamp | `PB.tx` |
| Body | Inter | 13 / 400, line-height 1.5 | `PB.tx` or `PB.tx2` |
| Meta | Inter | 12 | `PB.tx2` |
| Section label | Inter | 11 / 600, uppercase, 0.08em | `PB.tx2` |
| Numbers, ₹, SKUs, domains | JetBrains Mono | the size of their row, `tabular-nums` | `PB.tx` |

- Nothing goes under 11px. The current 10px spots (Pager, ProductCard, Vendors, WebsiteCard, `ui.tsx`, Dashboard, PbSettings) go up to 11 or 12 when you touch them.
- `PB.tx3` is only for chevrons, icons, timestamps and placeholders.
- Help copy longer than one short phrase (section and field hints, what a setting does) is body text: 13 px, line-height 1.5, `PB.tx2`, at most 640 px wide. `pbMeta` (12 px) is for one-line meta only (SKU · vendor · time).

## 3. Page shells
**Root.** `PlaybookApp.tsx` stays the single scroll container (`height: 100%; overflow-y: auto`, per `src/playbook/CLAUDE.md`). It owns:
- the `bg` fill with `isolation: isolate` and the backdrop glow layer (one fixed `aria-hidden` element; DESIGN.md §4, CSS in `mobile.md` §12);
- the top bar on desktop, or the header plus tab bar on phone;
- the toast host (`PbToasts`).

Do not use `page-pad`, `--nav-h` or a FAB.

**Desktop (769px and wider).**
- Page padding `24px 32px 48px`, max-width 1344, centred.
- A floating glass top bar (`pbTile`, radius 999, padding `8px 8px 8px 16px`) holds the logo, the nav pills, then the DailyWork switch and the account menu on the right (DESIGN.md §6).
- The nav pills keep `components/PbNav.tsx`'s six destinations (Dashboard, Products, Websites, Vendors, Settings, Guide, as the canvas); its gradient underline goes. The active pill uses `pbActive` plus `aria-current="page"`.
- Under the bar comes a page header row: the Sora title on the left and the page's actions on the right, with the primary action last.

**Phone (768px and below, `max-width: 768px`).**
- Header: the logo or a 44px glass back button, then the 20px title, then at most one action (a 44px gradient `+` or "Save").
- One column of content; stat tiles 2 per row (DESIGN.md §7).
- A floating 4-tab glass bar: Home · Products · Websites · More.
  - Vendors, Settings, Guide, Switch to DailyWork and Log out move to a **More** page (§4).
  - Give the scroll content a bottom padding of `calc(var(--pb-bar) + env(safe-area-inset-bottom) + 16px)` (`mobile.md` §4). Never hardcode the number.
- Navigation state stays as it is today (state plus localStorage `pb-page`). If you change it, change it for every page at once.

**Back buttons** (the one spec; other files point here). Use one form everywhere: a 44px glass button with an `aria-hidden` chevron and `aria-label="Back to <Page>"`. On desktop, a visible "‹ <Page>" label sits next to it. This replaces both the "‹ Products" button (ProductPage) and the "←" button (WebsiteEditor). Device Back works through `useBackClose`.

## 4. Bento recipes per page type (desktop 12 columns; 1099px and below use 6)
Every row of a fixed layout adds up to 12. Write the spans down before coding, as `(6×2)(3)(3)/(3)(3)`. There is one hero per page.
- **6-column mapping (769–1099px):** spans of 12, 8 and 6 become 6 (a full row); 4 and 3 become 3 (two per row; if the count is odd, the last one spans 6); the hero 6×2 stays 6×2.
- **Website tiles by count (12 columns):** 1 → 12; 2 → 6+6; 3 → 4+4+4; 4 → 6+6 / 6+6; 5 → 4+4+4 / 6+6; 6 → 4+4+4 / 4+4+4.
- **Full rows** apply to fixed layouts (dashboard, detail, settings). In a paged results grid, only the last row may be partial.
- **Dashboard** (`grid-auto-rows: minmax(152px, auto)`):
  - Hero 6×2: the one number that matters now, for example "Needs your attention: 7", which opens the filtered list.
  - Two 3×1 attention tiles on each of the hero's two rows: Needs info, Needs review, Failed, Publishing.
  - Then the website tiles, sized by the count rule above so every row is full. Any status mix is a 12-wide chart tile (`data-and-charts.md`).
  - When nothing is waiting, the hero says "Nothing is waiting" on `pbHero` in `onBrand` text, and the status tiles stay.
- **List page** (Products, Vendors, Websites):
  - A 12-wide toolbar tile with search and chips.
  - Then the results: product cards in a grid of 3 per row (4 cols each), or website tiles by the count rule. Vendors are glass rows in one 12-wide tile.
  - Then the pager. A list page has no hero, so the "+ Add" button is its one gradient.
- **Detail page** (Product, Website editor) (`grid-auto-rows: minmax(120px, auto)`):
  - Product: 12 header (photo, name, status, actions); then photos 8 + status/next step 4; facts 8 + "What the AI read" 4; listings 12.
  - Website editor: section nav 3 (a side list where the selected item is `pbActive` plus the `activeBar` inset) + section body 9, and a sticky save bar.
  - Website editor on phone: the section nav becomes a list of rows; each opens its section full-screen with a back button and the sticky save bar (`mobile.md` §5).
- **Settings or form page**: 8-wide tiles for the form sections and a 4-wide help or status tile beside them. On phone, put the help after the form.
- **More page (phone)**: rows Websites, Vendors, Settings, Guide (DESIGN.md §7 row spec), then Switch to DailyWork (secondary) and Log out (`pbBtnDanger`) at the bottom, as the canvas. Ask "Discard unsaved changes?" only if a draft exists.
- **Search**: at the top of Products (desktop and phone); it finds name, SKU and pasted details. The canvas has no top-bar search; add one only if the owner asks.
- **Phone**: everything stacks in DOM order. Tiles become full width (radius 22) and rows radius 20. Do not use horizontal scroll, except for the chip row.

## 5. Components: what to use, and where it lives

| Block | Reuse or extend | Style with | Rules |
|---|---|---|---|
| Glass tile / panel | new `PbTile` in `src/playbook/components/` (`as` = div, button or a) | `pbTile`; `pb-tile` when clickable | No tiles on tiles. Inside a tile, group with spacing and hairlines. Blur only within the DESIGN.md §5 budget. |
| Hero tile | `PbTile variant="hero"` | `pbHero`, `onBrand` text | One per page. It has a heading plus its value ("Live products: 128"). |
| Stat tile | new `PbStatTile` (do not reuse `src/components/ui/StatTile.tsx`; it is hard-wired to `T`) | `pbTile`; selected = `pbActive` | 11px label, mono value, one meta line, `aria-pressed` when it filters. Details in `data-and-charts.md`. |
| List row | new `PbRow` | `PB.tile` fill + `tileBd` + `tileHi`, **no backdrop-filter** | Row spec in DESIGN.md §7 (with a photo 96 tall; without, min 60). Name (2-line clamp), meta (`PB.tx2`, mono for ₹ and SKU), dot + label, chevron in `PB.tx3`. The whole row is one `<button>`. |
| Product card | `components/product/ProductCard.tsx` + `Thumb` | `PB.tile` fill + `tileBd` + `tileHi`, no backdrop-filter; `pb-tile` | Lazy photo with a fixed box, name, mono price, one dot + label per website. On phone, render as a `PbRow`. |
| Filter chips | replace the 3 selects in `components/product/ProductFilters.tsx` | each chip a 44px `<button>` with transparent 2px top/bottom padding holding a 40px pill (`<span>`), `pbBtnSecondary`; on = `pbActive` + check icon | `role="toolbar"`, `aria-pressed`, a count on each chip, and "Clear" whenever any chip is on. A chip that needs a list opens a sheet of options. |
| Segmented control | `Seg` in `components/website/ui.tsx` | track `pbTile` (radius 14); the chosen segment `pbActive` | Already a radiogroup. Swap its `T.ac3`/`T.ac55` colours for `pbActive` and add roving arrow keys. 2–4 options; with more, use a select or chips. |
| Toggle | `src/components/ui/Toggle.tsx` (44px hit area) | add an optional on-colour prop; Playbook passes `PB.live` | It needs a visible label. Use it only for settings that take effect at once, otherwise use a checkbox in the form. |
| Text input / select / textarea | `Field`, `NumInput`, `ChipsInput` in `components/website/ui.tsx` (replace `input44`) | `pbInput`: height `--pb-ctl-h` (48 coarse / 40 fine), radius 14, text 16 coarse / 14 fine | Label above (`pbLabel`), hint below in `PB.tx2`, error below in `PB.failed` with `aria-describedby`. ₹ fields are mono with a ₹ prefix. Number fields use `numKey`. Textareas grow to 6 rows and then scroll. |
| Chips input / pick chips | `ChipsInput`, `PickChips` (`ui.tsx`) | chips `pbBtnSecondary` radius 999; picked = `pbActive` | Each chip's remove button is 44px tall. |
| Buttons | new `PbButton kind="primary"\|"secondary"\|"danger"` | `pbBtnPrimary` / `pbBtnSecondary` / `pbBtnDanger`, + `pb-pill` | One primary per view. Height `--pb-ctl-h` (48 coarse / 40 fine). Two signals while busy (root `CLAUDE.md`), keeping the existing one-`busy`-key-per-screen pattern. Keep danger 16px or more from primary, never in the same corner. |
| Icon button | `PbButton` with `icon` + `aria-label` | `pbBtnSecondary`, 44×44 coarse / 36 fine, radius 14 | The SVG is `aria-hidden` and `focusable="false"`. |
| Bottom sheet (phone) / modal (desktop) | `components/product/PbModal.tsx` (portal, `modal-inner`, `useBackClose`, `useModalLock`, 44px close) | box `pbSheet`; scrim per DESIGN.md §7; desktop modal per DESIGN.md §6 | Build and behaviour: `mobile.md` §6. Short tasks only (about 6 fields or fewer). Put the buttons in `footer` (outside the scrolling body; submit with `form="<form id>"`). Pass `guard` while the form holds input: scrim tap and swipe-down then do nothing (×, Back and Escape still close). |
| Action menu | `src/components/ui/ActionSheet.tsx` | add a variant prop for `pbSheet` | Use it for row menus ("…"). It must also have a visible button; never rely on swipe alone. |
| Confirm | `useConfirm()` (`src/components/ui/ConfirmModal.tsx`) + `PbConfirm` (`components/ui/PbConfirm.tsx`, same props as `ConfirmModal`, built on `PbModal`) | confirm = `pbBtnDanger` when `danger`; focus starts on the safe button | Only for irreversible or Shopify-side actions. Name the item and its effect. Reversible actions use Undo (`states-and-feedback.md`). |
| Undo bar | `src/components/ui/UndoBar.tsx` | it uses `--nav-h`; add a bottom-offset prop and pass `calc(var(--pb-bar) + env(safe-area-inset-bottom) + 8px)` | The only place Undo appears (never in a toast). Shows for 6–8s. |
| Toasts | `components/PbToasts.tsx` (`usePbToasts`) | `pbSheet` glass; position is the `.pb-toasts` CSS rule (top right on desktop, above the tab bar on phone) | Every error goes through `friendlyError`. Behaviour is in `states-and-feedback.md`. |
| Photo viewer | `components/product/detail/PhotoViewer.tsx` (`usePhotoViewer`) | `PbModal` (sheet on phone, 720 modal on desktop) holding one `<img>` at `object-fit: contain`, Previous / Next in the footer | A photo opens here, never in a new tab (`mobile.md` §10). Title "Photo 2 of 5". |
| Empty state | `src/components/ui/Empty.tsx` | before a redesigned screen uses it, add an optional `ink` prop `{ accent, title, body }` defaulting to today's `T` values; Playbook passes `PB.brandA`, `PB.tx`, `PB.tx2` (its message is `T.tx3` today). Shared change: say so in the PR | First-run and filtered-empty are different states (`states-and-feedback.md`). |
| Loading | `Skeleton` / `SkeletonRows` (`src/components/ui/Skeleton.tsx`) | skeleton tiles sized like the real `PbTile`/`PbRow`, with fill `PB.tile` | Replace the plain "Loading…" text. |
| Pagination | `components/product/Pager.tsx` | `pbBtnSecondary` buttons; mono "1 / N" in `PB.tx2` at 12px | Add a `noun` prop (it always says "products" today). Vendors deletes its own copy and uses this one. 25 a page. Reset to page 0 on search or filter change. After a delete, stay on the page, or step back one page if it is now empty (as `Vendors.tsx`). |
| Photo picker / grid | `components/product/PhotoPicker.tsx` | photo grid of 4:5 cells, radius 16, fill `PB.tile`; add cell = dashed `tileBd` | First photo = cover (badge). 44px remove and reorder buttons. Open photos in-app, not in a new tab. Upload rules are in `mobile.md`. |
| Tags / pills (non-status) | new `PbTag` | `pbBtnSecondary` fill (no hover, not clickable), `tileBd` border, radius 999, 12px `PB.tx2` | For settings values and labels ("Sends as draft", "Send", "Keep off", "Kept"). Never coloured like a status. |
| Status | `Dot`, `PRODUCT_STATUS`, `LISTING_STATUS` in `components/product/status.tsx` | swap the colours to the mapping in §6 | Always dot + text label, with the dot `aria-hidden`. Statuses that need action get the tinted tile. |
| Charts | `src/components/ui/Charts.tsx` | add an optional `ink` prop | Rules are in `data-and-charts.md`. |
| Section within a tile | `Section` in `components/website/ui.tsx` | title 17 Sora or an 11px label; separated by a `tileBd` hairline | Do not nest tiles inside it. |
| Numbered setup step | `TgStep` + `TgValueBox` in `components/settings/telegram/TgStep.tsx` | hairline-separated block inside one tile; 32px mono number circle (`PB.ctl`), `pbName` title, dot + label status | For one-time setups done in order (Settings → Telegram). Steps are an `<ol>`; a value shown once (code, key) goes in `TgValueBox` with a Copy button. |
| Video in the photo area | `VideoCell` in `components/product/detail/ProductVideos.tsx` | photo cell recipe (radius 16, `PB.ctl`), `pbSheet`-style "Video · 12 MB" badge above the controls | `<video controls preload="metadata" playsInline>`; never the cover; never sent to Shopify or the AI (`kind = 'video'`). |

## 6. Status mapping (real Product Directory values to PB tokens)
Change the `color` fields in `components/product/status.tsx` and nowhere else. The labels stay. "Neutral" means a `PB.tx3` dot with a `PB.tx2` label.

| Area | Value → token |
|---|---|
| Product | `new` (Waiting for the AI) → `PB.busy`; `reading` → `PB.busy`; `needs_info` → `PB.review` + review tile; `ready` → `PB.live`; `archived` → neutral |
| Listing | `queued` → neutral; `generating` "Writing" → `PB.busy`; `review` "Needs review" → `PB.review` + review tile; `publishing` → `PB.busy`; `published` → `PB.live`; `failed` → `PB.failed` + failed tile; `skipped` "Removed" → neutral |
| Dashboard groups (`data/dashboard.ts`) | In progress → `PB.busy`; Needs review → `PB.review`; Published → `PB.live`; Failed → `PB.failed` |
| Website connection (`WebsiteCard` `connection()`) | Connected → `PB.live`; Not connected → `PB.review`; Connection problem → `PB.failed` |
| Vendor | Active → `PB.live`; Inactive → neutral |
| Settings values | Publish mode (live / draft / review), rule action ("Send" / "Keep off"; the code says "SEND" / "KEEP OFF" today, fix it when touched), "On" / "Off" → `PbTag`, not status colours |

- Busy states show how long they have been running (for example "Writing · 2 min"). Get it from the row's `updated_at` if the table has that column; otherwise leave it out.
- Never invent a status that is not in `src/playbook/types.ts`.

## 7. One-view rules
- Each view has at most one `pbHero` and one `pbBtnPrimary`. The brand gradient appears only on the logo, the hero and that one button.
- Selected states use `pbActive`, never a solid fill and never the old indigo (`T.ac*`).
- Nothing scrolls sideways at 390px except the chip row. There is no table on phone; glass rows replace it.
- **Desktop table inside a tile** (more than 7 columns of exact figures): header 11px / 600 uppercase `PB.tx2`, letter-spacing 0.08em; cell 13px `PB.tx`, padding `12px 16px`; row hairline `tileBd`; row hover `PB.rowHover` inside `@media (hover: hover)`; number columns right-aligned, mono, `tabular-nums`.

## 8. When you need a component that is not listed
1. **Compose it.** Build it from `PbTile` (or `PbRow`) and the recipes above. Don't make a new surface, shadow or colour. Radii come only from the DESIGN.md §5 radius table.
2. **Check reuse first.** Look in `src/components/ui/` and `src/playbook/components/`. If something is close, extend it with an optional prop instead of copying it.
3. **Place it.** Put it in `src/playbook/components/<area>/`, keep it under 200 lines, and give it `pb-pill` or `pb-tile` if it is clickable. Include a focus ring, 44px targets and its own loading, empty and error states.
4. **Record it.** Add a row for it to §5 in the same PR (block, file, recipe, rules), so the next screen reuses it. Use `review-checklist.md` before merging.
