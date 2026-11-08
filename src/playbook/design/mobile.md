# Playbook on phones: layout, sheets, forms, photos and speed

Use this when you build or change any Playbook screen that phones will show, which means every Playbook screen.

Visual values (tokens, radii, blur, tab bar look) are in `src/playbook/DESIGN.md` §2, §5 and §7 (contrast-checked; measurements in `copy-and-a11y.md` §B1). Which block to use and where its code lives is in `layout-and-components.md`. Loading, error and Undo behaviour is in `states-and-feedback.md`. This file adds the phone-only rules. The root `CLAUDE.md` rules still apply: 44px targets, 16px inputs on phone, the modal rules, and no `window.alert/confirm/open`. `page-pad`, `--nav-h` and the FAB do not apply here (`src/playbook/CLAUDE.md`).

## 1. Sizes and breakpoints
| Width | Layout |
|---|---|
| 1100px and up | Desktop: a 12-column bento, with content up to 1344px wide (DESIGN.md §6) |
| 769–1099px | The same desktop chrome on a 6-column bento |
| 768px and below | Phone: one column, the 4-tab glass bar and bottom sheets |

- Write the phone query as `@media (max-width: 768px)`. It is the same query `src/index.css` uses for the `.modal-inner` bottom sheet and the one `src/hooks/useIsPhone.ts` uses. The phone layout and the sheet must switch at the same width, or a desktop layout ends up with a phone sheet.
- If you need the breakpoint in JS, add `src/playbook/hooks/useIsPhone.ts` with the same query. The shared one is not on the shared-layer list.
- Design at **390×844**, and make the layout work from **360 to 430** wide. Nothing scrolls sideways at 360px:
  - Text wraps.
  - Every flex or grid child that holds text gets `min-width: 0`.
  - Long SKUs, domains and handles get `overflow-wrap: anywhere`.
- Never give a text box a fixed height. Mixed Hindi and English needs line-height 1.5 or more, and the font stack ends in `'Noto Sans Devanagari'`.
- **Landscape phones:** 844×390 gets the 6-column layout and 667×375 the phone layout. Nothing depends on height; sheets and modals scroll inside `max-height: 90dvh`. Under `@media (max-height: 500px)` the tab bar's margin drops to 8px and its tabs to min-height 44 (DESIGN.md §7); set `--pb-bar: 66px` there too (§4).

## 2. Safe areas and the scroll container
- `index.html` already sets `viewport-fit=cover`, so `env(safe-area-inset-*)` works. Do not edit the meta tag. It is shared.
- Playbook scrolls inside its own root (`PlaybookApp.tsx`: `height: 100%; overflow-y: auto`). Give that root `className="pb-scroll"` and `overscroll-behavior-y: contain`.
- Insets:
  - Sides: `max(16px, env(safe-area-inset-left|right))` (`src/playbook/CLAUDE.md`).
  - Header top: `max(12px, env(safe-area-inset-top))`.
  - Tab bar: bottom margin `calc(18px + env(safe-area-inset-bottom))`, and side margins `max(12px, env(safe-area-inset-left|right))` so a landscape notch never covers a tab.
- Use `100dvh` or `height: 100%`. Never use `100vh`, because on iOS it hides the bottom of the page behind the toolbar.

## 3. Thumb zones
- At 390×844, the bottom third is easy to reach and the top corners are hard.
- **Bottom:** frequent and final actions (Save, Publish, Next, Mark ready), either in a sheet footer or in the sticky action bar (§5).
- **Header, top right:** only an action done about once per visit, such as the 44px gradient `+` for Add product (DESIGN.md §7). Never put Save there.
- **Destructive actions** go in the row or page `…` menu (`src/components/ui/ActionSheet.tsx`) or at the end of the page content. Keep them 16px or more from the primary button and never in the same corner.
- The back button sits at the top left; its spec is in `layout-and-components.md` §3.

## 4. Glass tab bar
- Four tabs: Home · Products · Websites · More (DESIGN.md §7).
- Make the bar `position: fixed` inside `PlaybookApp`, with `className="pb-tabbar"`. Its semantics (`<nav>`, `aria-current`) are in `copy-and-a11y.md`.
- Each tab is 52px tall at least. The bar is 6px padding + 52 + 6 + 2px border = **66px**. Set `--pb-bar: 84px` (bar plus its 18px margin) on `.pb-scroll`. Inside `@media (max-height: 500px)` set `--pb-bar: 66px` (6+44+6+2 bar, 8 margin). Never hardcode either number anywhere else.
- **Last item clears the bar.** The scroll content's bottom padding is `calc(var(--pb-bar) + env(safe-area-inset-bottom) + 16px)`. Check it by scrolling to the end at 360×640. The last row's chevron and its button must be fully tappable.
- **Hide the bar while the keyboard is open** (§7: `.pb-kb .pb-tabbar { transform: translateY(120%); opacity: 0 }`). On both iOS and Android the keyboard overlays the page, so a fixed bar would float in the middle of the form.
- **Hide it under a sheet:** `body.modal-open .pb-tabbar { visibility: hidden }`. This also frees a blur layer (§10).
- The bar never scrolls away and never changes height between pages. The active tab is frosted glass (DESIGN.md §5).
- A second tap on the active tab scrolls that page to the top and closes any open detail view (`closeAllLayers`).

## 5. Sticky bottom action bar (full-screen forms and editors)
- Use it for pages with a save step that are too long for a sheet: the product facts, `WebsiteEditor` ("Unsaved changes · Discard · Save changes"), and Select mode.
- Position: `position: sticky; bottom: calc(var(--pb-bar) + env(safe-area-inset-bottom) + 8px)`. It is a glass tile (radius 22, padding 8) inside the scroll container, so it scrolls with nothing and never overlaps the tab bar.
- It holds one primary button (`flex: 1`, min-height 48) and at most one secondary on its left. The destructive action is never here.
- Show it only when there is something to do (unsaved changes, items selected). Busy state follows the root two-signal rule ("Saving…", every button greyed out).
- Add the bar's height plus 12px to the page's bottom padding while the bar shows.
- When the keyboard is open, lift the bar with `--pb-kb` (§7) so Save stays visible above the keyboard.

## 6. Bottom sheets
- **When to use one** (decision table in `ux-process.md`): a short task, about 6 fields or fewer, with one decision. Use a full-screen page for anything longer. Never open a sheet on a sheet; a confirm on top is fine.
- **Build:** `components/product/PbModal.tsx`, which already has the portal, `modal-inner`, `useBackClose`, `useModalLock` and the 44px close. Add the phone overrides below to `src/index.css` under a `.pb-sheet` class. They need `!important` to beat the root `.modal-inner` rule (radius 14, `max-height: 85dvh`, extra `form{padding:14px}`):
  - Radius `30px 30px 0 0`.
  - `max-height: min(90dvh, calc(100dvh - var(--pb-kb, 0px) - 24px))`.
  - `bottom: var(--pb-kb, 0px)`.
  - `padding: 0`, with the inner form padding cancelled.
- **Layout:** a flex column of three parts.
  1. Header: grab handle, title, close.
  2. Body: `overflow-y: auto; overscroll-behavior: contain`.
  3. Footer: `flex: none`, padding `16px 16px calc(16px + env(safe-area-inset-bottom))`, holding one full-width primary button only. Cancel is the × button, swipe down or device Back. A destructive action never goes in a sheet footer; it lives in the page's `…` menu.
  The footer sits inside the sheet, never fixed to the window, so it rides up with the keyboard.
- **Height:** the sheet sizes to its content up to the max-height. A sheet with a long list of options (vendor or category picker) opens at the max height with a search field on top.
- **Grab handle:** 36×5px, radius 3, fill `oklch(1 0 0 / .28)`, 8px from the top, `aria-hidden`. Leave 16px between the handle and the title.
- **Swipe down to close** is a shortcut. The 44px close button is always visible.
  - Track the drag on the handle and header only, never the body, because it scrolls.
  - Close when the sheet is dragged more than 120px or released faster than 0.5px/ms. Otherwise spring back over .3s with `cubic-bezier(.22,1,.36,1)`.
  - Move it with `transform` only.
  - If the form is dirty, swipe, scrim tap and Back show the "Discard changes?" confirm instead of dropping input.
- **Scroll lock:** `useModalLock` only locks `body`, but Playbook scrolls in `.pb-scroll`. Add `body.modal-open .pb-scroll { overflow: hidden }` and set `inert` on the Playbook root while a sheet is open.
- **Focus:**
  - On open, focus the first text field only if typing is the first thing the person does. If the sheet starts with photos, a picker or a choice, focus the sheet title (`tabIndex={-1}`) instead, so the keyboard does not cover the choice.
  - On close, return focus to the button that opened the sheet. Trap and roles are in `copy-and-a11y.md`.
- **Reset:** reset all form state on close (root modal rules).
- **Motion:** the sheet slides in over about .45s. With reduced motion it fades in over 150ms.

## 7. Keyboard: keep the focused input visible
Add `src/playbook/hooks/useKeyboardInset.ts` and mount it once in `PlaybookApp`:
```ts
const vv = window.visualViewport; if (!vv) return;
const sync = () => {
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  root.style.setProperty('--pb-kb', `${kb}px`);
  root.classList.toggle('pb-kb', kb > 120);
};
vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync); // remove both on unmount
```
- On `focusin` inside a sheet or form, wait 300ms and then call `el.scrollIntoView({ block: 'center' })`. The keyboard animation has to finish first.
- Never `autoFocus` a field on page load on a phone. It throws the keyboard over the page before the person has read it.

## 8. Forms on phone
- One column. Label above the field (`pbLabel`, 8px gap). Help or error text under the field at 12px.
- Two fields may share a row only if both are short numbers and each stays 150px or wider at 360.
- Inputs: height 48, font 16px (DESIGN.md §5). Use the full width. Never use placeholder text as the label.

| Field | Attributes |
|---|---|
| Price, cost (₹) | `type="text" inputMode="decimal"` + `onKeyDown={numKey}` (`components/product/status.tsx`), or `NumInput` (`website/ui.tsx`). Put ₹ as a visible prefix, not inside the value. |
| Count, quantity, sizes stock | `inputMode="numeric" pattern="[0-9]*"` + `numKey` |
| SKU, vendor code | `autoCapitalize="characters" autoCorrect="off" spellCheck={false}` |
| Product name, title | `autoCapitalize="sentences"`; the field grows to 2 lines, and the counter sits under it |
| Description, notes | `<textarea rows={4}>` that grows with its content, `autoCapitalize="sentences"` |
| Store domain, handle, URL | `inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}` |
| Search | `type="search" enterKeyHint="search"`, with a 44px clear button |
| Phone, email | `type="tel" autoComplete="tel"` / `type="email" autoComplete="email"` |
| API keys and secrets | `type="password" autoComplete="new-password"` (as `ConnectionSection.tsx` does), with a 44px show/hide button |

- Every field except the last gets `enterKeyHint="next"`, and Enter moves focus to the next field. The last field gets `enterKeyHint="done"`, and Enter submits (root rule).
- **Choices:** 2–5 options → `Seg` or chips. 6 or more → native `<select>` (OS picker). A long searchable list → a picker view that replaces the sheet's content, not a sheet on top.
- **Validation:** check a field on blur, not per keypress. On submit, scroll to and focus the first field with an error. Keep everything typed.

## 9. Lists on phone
- Rows are glass rows (DESIGN.md §7). With a photo: a 64×80 photo (radius 16) and 8px padding, so 96px tall, then the name (2-line clamp), meta, a status dot plus label, and a chevron. Without a photo (Vendors, More, settings lists): min-height 60, a 20px icon in a 36px `ctl` square, name, meta, chevron. Leave 8px between rows.
- The whole row is one `<button>` or `<a>`. A second action in a row (for example `…`) is a separate 44px sibling button, never nested inside the row button.
- Swipe actions (`src/components/ui/SwipeRow.tsx`) are only shortcuts. Every swipe action is also in the row's `…` menu or on the detail page.
- Pressing a row gives `transform: scale(.98)` at once on `:active`. Hover lift sits behind `@media (hover: hover)`, because on touch screens it sticks after a tap.
- Paging: `Pager`, with Prev and Next at least 44px, or "Load more · Showing 25 of 312". No infinite scroll.
- Coming back from a detail page keeps the page, the filters and the scroll position. Keep `.pb-scroll`'s `scrollTop` in state and restore it.
- Each filter chip is a `<button>` 44px tall (the hit box) with transparent 2px top and bottom padding, holding a 40px visible pill (`<span>`). The chips sit in a sideways-scrolling row (`margin: 0 -16px; padding: 0 16px; scroll-snap-type: x proximity`) with no visible scrollbar. The last chip is never cut off without a visible hint that more chips follow.

## 10. Photos and camera
- **Picker input:** `<input type="file" accept="image/*" multiple>` with no `capture`, so staff choose camera or gallery. `PhotoPicker.tsx` accepts only jpeg/png/webp today; widen it to `image/*` when you touch it, and keep the 20-photo cap. Widen it only together with the on-device JPEG conversion below, run before `checkPhoto()` (`data/products.ts`): `checkPhoto` and the `playbook-products` bucket's `allowed_mime_types` accept only jpeg/png/webp.
- **Before upload, on the device,** one photo at a time (several at once runs low-end Android out of memory):
  - Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`.
  - Scale to 2000px on the long edge, and export as JPEG at quality 0.8 through a canvas (`toBlob`).
  - If decoding fails (HEIC on Android), mark that one photo "Can't read this photo type. Choose a JPG." The others carry on.
- **Upload:** each photo shows its own progress and Retry. The form stays usable meanwhile; Save waits and says so ("Uploading 2 photos…").
- **Grid:**
  - 3 columns of 4:5 cells at 390px, with an 8px gap.
  - The first photo is the cover and has a badge.
  - Each photo has a 44px remove button and 44px move-left/right buttons. Drag to reorder is only an extra.
  - Tapping a photo opens it in-app, never in a new tab (`PhotoViewer`, built on `PbModal`: Previous / Next buttons, 44px close, device Back).
  - Revoke object URLs on remove and on close (this is already done).
- **Showing photos:** lists ask for sized images (Shopify CDN `&width=128`, `srcset` `&width=256 2x`), never originals. Every image gets `width`/`height`, `loading="lazy"`, `decoding="async"`, `object-fit: cover` and a `PB.tile` background while loading.

## 11. iOS Safari fixes
- Any input under 16px zooms the page. Use 16px on every phone input, including the ones in sheets and the search field.
- Write `-webkit-backdrop-filter` next to every `backdrop-filter`.
- Fixed bars and the keyboard: §4 and §7. Never put the sheet's Save button in `position: fixed` relative to the window.
- Rubber-band scrolling moves the page behind a sheet. Use `overscroll-behavior: contain` on the sheet body and on `.pb-scroll`.
- `-webkit-tap-highlight-color: transparent` on `.pb-pill` and `.pb-tile` is in the DESIGN.md §8 block; rely on your own `:active` state.
- `:hover` sticks after a tap, so every hover effect goes inside `@media (hover: hover)`, as the DESIGN.md §8 block already does, with `:active` outside it.
- Dates are IST: `data-and-charts.md` §8.
- For a real link to Shopify, use `<a href target="_blank" rel="noopener">`. `window.open` is banned (root rule).

## 12. Low-end Android and the glass budget
- **At most 3 blurred surfaces on screen at once on a phone:** the tab bar, one sheet and its scrim (DESIGN.md §5). The header and the hero never blur.
  - Phone tiles, list rows and tiles inside a list never get `backdrop-filter`. They use the `PB.tile` phone fill plus `tileBd` and `tileHi`, and the highlight carries the glass look.
  - For more than about 20 rows, blur the list's container once, or nothing at all.
- **Blur values:** tab bar 24px, sheet 30px, scrim 6px (DESIGN.md §7). If the throttled check below drops frames, ask the owner before lowering the sheet blur below 30px or the scrim below 6px.
- **Glows:** no blurred divs at any size (DESIGN.md §4). The Playbook root has `isolation: isolate` so this `z-index: -1` layer paints above its `bg` fill. Use one fixed layer:
  ```css
  .pb-glow{position:fixed;inset:0;z-index:-1;pointer-events:none;contain:strict;
    background:radial-gradient(60% 40% at 0% 0%,var(--glowA),transparent 70%),
      radial-gradient(50% 40% at 100% 45%,var(--glowC),transparent 70%),
      radial-gradient(70% 40% at 50% 100%,var(--glowI),transparent 70%)}
  ```
  Feed the variables from `PB.glowAmber`, `PB.glowCoral` and `PB.glowIndigo`. Mark the layer `aria-hidden`.
- **Animation:** on phone, only `transform` and `opacity` animate. Desktop hover (inside `@media (hover:hover)`) may also ease `box-shadow`, `border-color` and `filter` (DESIGN.md §8). Use `will-change` only on a sheet while it moves, and drop it on `transitionend`. Long lists get `content-visibility: auto; contain-intrinsic-size: auto 96px` on each row.
- **No glass support:** under `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`, and under `prefers-reduced-transparency`, switch to the opaque fills `PB.tileSolid`, `PB.sheetSolid` and `PB.barSolid` (DESIGN.md §2). Text must stay readable with no glass.
- **Network:** shop Wi-Fi is weak. Data loads time out after 15s with a Retry; actions that start server work are never aborted (`states-and-feedback.md` §1). Stale data stays on screen while the page reloads.

## 13. Test before you call it done
- **Sizes:** 360×740 (small Android), 375×667 (iPhone SE), **390×844** (design), 393×852 (iPhone 15 Pro, root checklist), 430×932, 844×390 (landscape), 768×1024 (still phone), 1024×768 (6 columns), 1344×900 or wider (12 columns).
- **Harness:** the local `harness-pb/` (Vite and Playwright). Set it up as in `review-checklist.md` §3. It is already git-excluded by the `harness-*/` line in `.git/info/exclude`. Never commit it.
  - Use the Playwright device `iPhone 15 Pro`, plus a 360-wide Android context with `hasTouch: true`.
  - For low-end Android, throttle the CPU through CDP: `Emulation.setCPUThrottlingRate { rate: 4 }`. Then open a sheet, scroll a 25-row list, and confirm there is no visible stutter in a trace or video.
- **At each phone size, check:**
  - Nothing scrolls sideways, on the page or inside `.pb-scroll` (the `sideScroll` check in `review-checklist.md` §3.3).
  - The last item clears the tab bar.
  - Every tap target is 44px or more.
  - Inputs are 16px.
  - The sheet's footer stays visible with the keyboard open. In the harness, fake the keyboard by setting `--pb-kb: 300px`.
- Ask the owner to try the screen on a real iPhone and a real mid-range Android. Smoke steps follow the root post-deploy rule.
