# Playbook design reference — "V2 · Bento glass" (approved)

The owner approved this look for Playbook on 2026-11-05. Every new or redesigned Playbook screen follows it. The mock-ups (4 desktop pages and 9 phone screens) are in the design canvas https://claude.ai/artifact/4oLPNPkqXgrCpXxiwVABcw (private to the owner).

**Amended 2026-11-05 for contrast and phone performance.** `glowAmber`, `tx2`, `failed`, the active and hero stops and the input border were changed to pass WCAG (measurements in `design/copy-and-a11y.md` §B1). Recipe colours got token names. Phone tiles lost their blur, the glows became one gradient layer, and the motion CSS gained hover guards and a focus ring. The canvas still shows the old values. Where the two differ, this file wins.

This file covers how Playbook looks. `src/playbook/CLAUDE.md` covers how it is built. The root `CLAUDE.md` mechanics still apply: 44 px touch targets, 16 px inputs on phone, the modal rules, `friendlyError`, two-signal async buttons.

## Design guide index
Load the `playbook-design` skill (`.claude/skills/playbook-design/SKILL.md`) before any Playbook UI work. It walks through these files in `design/`:
- `ux-process.md`: the six questions, hierarchy, containers, navigation, Undo or confirm.
- `layout-and-components.md`: `pbTheme.ts`, spacing, type, bento recipes, components.
- `states-and-feedback.md`: loading, empty, errors, toasts, automation progress.
- `mobile.md`: breakpoints, tab bar, sheets, keyboard, photos, glass budget.
- `data-and-charts.md`: numbers, ₹, IST dates, KPI tiles, the chart palette.
- `copy-and-a11y.md`: words, contrast measurements, focus, keyboard, screen readers.
- `review-checklist.md`: the gate before commit, the screenshot harness, smoke steps.

## 1. The idea in one line
Dark, deep backdrop, soft coloured light behind it, and content on **frosted-glass tiles laid out as a bento grid**. The warm amber → coral gradient is the only loud colour. It marks the brand, the one hero tile per page, and the primary action.

## 2. Tokens
Build these once in `src/playbook/pbTheme.ts`, exporting `PB` the way `T` works. Components use the names, never the literals. Literals live only in `pbTheme.ts` recipes and the §8 CSS. They are OKLCH strings, so never append a hex alpha; use `alpha()` from `src/lib/theme.tsx` or the `/ a` form. Chart colours (`PB_VIZ`) are in `design/data-and-charts.md` §2.

| Token | Value | Use |
|---|---|---|
| `bg` | `oklch(0.10 0.03 270)` | page backdrop |
| `glowAmber` | `oklch(0.70 0.17 60 / .30)` | backdrop light, top left |
| `glowCoral` | `oklch(0.62 0.20 25 / .32)` | backdrop light, right |
| `glowIndigo` | `oklch(0.50 0.14 280 / .40)` | backdrop light, bottom |
| `tile` | `oklch(1 0 0 / 0.06)` (phone `0.07`) | glass tile fill |
| `tileBd` | `oklch(1 0 0 / 0.12)` | tile hairline |
| `tileHi` | `inset 0 1px 0 oklch(1 0 0 / 0.10)` | tile top highlight |
| `brandA` → `brandB` | `oklch(0.84 0.15 78)` → `oklch(0.64 0.21 28)` | brand gradient |
| `onBrand` | `oklch(0.16 0.03 40)` | text on the gradient |
| `tx` | `oklch(0.96 0.01 250)` | primary text |
| `tx2` | `oklch(0.86 0.02 255)` | secondary text |
| `tx3` | `oklch(0.78 0.02 255)` | chevrons, icons, placeholders, timestamps |
| `live` | `oklch(0.80 0.17 150)` | live / done |
| `review` | `oklch(0.84 0.15 75)` | waiting approval / needs info |
| `failed` | `oklch(0.78 0.16 25)` | failed |
| `busy` | `oklch(0.78 0.12 235)` | in progress (AI reading, publishing) |
| `focus` | `oklch(0.90 0.10 85)` | focus ring (`--pb-focus`) |
| `onActive` | `oklch(0.99 0.01 80)` | text in the active recipe |
| `reviewBg` / `reviewBd` | `oklch(0.80 0.15 75 / .12)` / `oklch(0.85 0.12 75 / .35)` | review tint, border |
| `failedBg` / `failedBd` | `oklch(0.62 0.2 25 / .16)` / `oklch(0.75 0.15 25 / .4)` | failed tint, border |
| `activeBd` / `activeBar` / `activeGlow` | `oklch(1 0 0 / .30)` / `oklch(0.72 0.19 40)` / `oklch(0.64 0.21 28 / .22)` | active border, side-list bar, glow |
| `ctl` / `ctlBd` / `inputBd` | `oklch(1 0 0 / .06)` / `oklch(1 0 0 / .14)` / `oklch(1 0 0 / .36)` | control fill, secondary border, input border |
| `dangerBd` / `dangerTx` | `oklch(0.75 0.15 25 / .4)` / `oklch(0.88 0.08 25)` | destructive button |
| `bar` | `oklch(1 0 0 / .08)` | phone tab bar fill |
| `sheet` / `scrim` | `oklch(0.16 0.03 270 / .82)` / `oklch(0.06 0.02 270 / .55)` | sheet, modal, toast glass; scrim |
| `handle` / `skelBar` / `rowHover` | `oklch(1 0 0 / .28)` / `oklch(1 0 0 / .08)` / `oklch(1 0 0 / .04)` | grab handle, skeleton bar, table row hover |
| `lift` | `0 18px 40px oklch(0.05 0.03 270 / .45)` | hover shadow (`--pb-lift`) |
| `tileSolid` / `sheetSolid` / `barSolid` | `oklch(0.18 0.03 270 / .92)` / `oklch(0.16 0.03 270 / .97)` / `oklch(0.16 0.03 270 / .95)` | opaque fallbacks (§7) |

Status is always **dot plus label**, never colour alone. A status that needs action gets a tinted tile: `reviewBg` + `reviewBd`, or `failedBg` + `failedBd`.

## 3. Type and icons
- **Sora** 700: page title 32 px desktop / 20 px phone, tile titles 17 px, letter-spacing −0.3 px.
- **Inter**: all UI. 15 px list names, 13 px body, 12 px meta. Stack `Inter, 'Noto Sans Devanagari', system-ui, sans-serif`; line-height ≥ 1.5 on any text that may hold Hindi.
- **JetBrains Mono**: every number a person compares (prices, costs, counts, SKUs, store domains).
- Section labels: 11 px, 600, uppercase, letter-spacing 0.08em, `tx2`.
- **Icons**: `Icon` from `src/lib/theme.tsx`, stroke `currentColor`; 20 px in tabs and More rows, 18 px in buttons, 16 px inline. A missing icon is added to `Icon` (shared change, say so in the PR). Never emoji or an icon library.

## 4. The backdrop
Fill the Playbook root with `bg` and give it `isolation: isolate`, so a `z-index: -1` layer paints above that fill. Inside it, render one fixed, `aria-hidden` `.pb-glow` layer of three radial gradients (amber top left, coral right, indigo bottom; CSS in `design/mobile.md` §12) at every size. Never use `filter: blur()` divs (the canvas draws them; the layer looks the same for far less work). Glass only reads as glass over these lights, so never put a tile on a flat background.

## 5. Glass recipes
**Tile** (cards and panels):
```
background: tile; border: 1px solid tileBd; box-shadow: tileHi;
backdrop-filter: blur(24px) saturate(140%);  /* desktop fixed-layout tiles only */
-webkit-backdrop-filter: same;
```
Phone tiles and rows, and cards in a results grid, keep the fill, `tileBd` and `tileHi` with **no** backdrop-filter. Blur budget: phone ≤ 3 surfaces at once (tab bar, an open sheet, its scrim); desktop ≤ 6 (top bar plus the main fixed-layout tiles). The hero never blurs (its fill is nearly opaque).

**Active / selected** (current nav item, chosen segment, active filter chip): frosted, brighter glass, never a solid fill.
```
background: linear-gradient(180deg, oklch(1 0 0 / .16), oklch(1 0 0 / .06));
border: 1px solid activeBd; color: onActive; font-weight: 600;
box-shadow: inset 0 1px 0 oklch(1 0 0 / .50), inset 0 -1px 0 oklch(1 0 0 / .06), 0 8px 24px activeGlow;
backdrop-filter: blur(18px) saturate(170%);
```
A selected filter in a side list also gets `inset 3px 0 0 activeBar`.

**Hero tile** (one per page, the single most important number or state): `linear-gradient(140deg, brandA / .94, brandB / .94)` (fully opaque stops when it holds text under 18 px), text `onBrand`, no backdrop-filter.

**Buttons**: primary `linear-gradient(135deg, brandA, brandB)`, text `onBrand`, one per view. Secondary: `ctl` fill, 1 px `ctlBd`. Destructive: transparent, 1 px `dangerBd`, text `dangerTx`. Text Inter 600, 15 px on a coarse pointer / 13 px on a fine one.

**Inputs**: fill `ctl`, border `inputBd` (`focus` when focused), text 16 px coarse / 14 px fine. Segmented control: height = control height, track `tile`, segment text 14 / 13.

**Control sizes follow the pointer, not the width.** `@media (pointer: coarse)`: buttons and inputs 48, chips a 44 px hit box, icon buttons 44. `@media (pointer: fine)`: 40, 36, 36.

**Radii, the only ones:** 999 pill, chip, tag, top bar · 30 sheet top · 28 desktop hero, desktop modal · 26 tab bar · 24 desktop tile, phone hero · 22 phone tile, sticky action bar · 20 phone row, active tab · 18 primary and full-width buttons, row inside a desktop tile · 16 photo, toast · 14 input, icon button, secondary button, segment, logo · 8 skeleton bar · 4 chart bar end · 3 grab handle.

## 6. Desktop layout
- Page padding `24px 32px 48px`, content max-width **1344 px**, centred.
- **Top bar**: a floating glass pill (radius 999, padding `8px 8px 8px 16px`) with the logo, the nav pills **Dashboard · Products · Websites · Vendors · Settings · Guide** (as the canvas; active = frosted glass), then the DailyWork switch and the account menu (Log out) on the right. No sidebar. The canvas draws no top-bar search; search sits at the top of Products.
- **Bento grid**: `grid-template-columns: repeat(12, minmax(0, 1fr))`, gap 16, `grid-auto-rows: minmax(152px, auto)` on dashboards and `minmax(120px, auto)` on detail pages. Mix one large hero (e.g. 6×2) with 3- and 4-column tiles. Fixed layouts fill whole rows with no ragged holes; in a paged results grid only the last row may be partial.
- At 1099 px and below, collapse to 6 columns (mapping in `design/layout-and-components.md` §4). At 768 px and below (`@media (max-width: 768px)`, the query `.modal-inner` and `useIsPhone` use), use the phone layout.
- **Desktop modal**: centred, width 520, `max-height: 90dvh`, `sheet` fill with `blur(30px)` over the same scrim. Head padding 20, Sora 17 title, 44 px close. Footer right-aligned: Cancel (secondary), then the primary.

## 7. Phone layout (designed at 390 × 844)
- Side padding 16 px plus the safe-area insets. Header: logo or a 44 px glass back button, a Sora 20 px title, at most one action (a 44 px gradient `+` or "Save"). It scrolls away with the content and has no blur; a fixed `aria-hidden` strip of `bg`, `env(safe-area-inset-top)` tall, covers the status bar.
- **Bottom tab bar**: `bar` fill, 1 px `ctlBd`, `blur(24px)`, radius 26, padding 6, margin `0 max(12px, env(safe-area-inset-left|right))` and `calc(18px + env(safe-area-inset-bottom))` below. 4 tabs, **Home · Products · Websites · More**, each an icon over an 11 px label, min-height 52; the active tab is frosted glass. Under `@media (max-height: 500px)` the bottom margin is 8 and tabs 44. **More** lists Websites, Vendors, Settings and Guide as rows, then Switch to DailyWork and Log out at the bottom.
- One column, except stat tiles, which sit 2 per row under a full-width hero (as the canvas dashboard).
- Rows with a photo: 64×80 photo, 8 px padding (96 px tall), name, meta, status dot, chevron. Rows without one (More, Vendors, settings lists): min-height 60, a 20 px icon in a 36 px `ctl` square, name, meta, chevron.
- Filters: a horizontal scroll of chips, edge to edge (`margin: 0 -16px; padding: 0 16px`). Each chip is a 44 px `<button>` (the hit box) with transparent 2 px top and bottom padding, holding a 40 px visible pill.
- Forms open as a **bottom sheet**: `sheet` with `blur(30px)`, a grab handle, over `scrim` with `blur(6px)`. Close is 44 px. The footer holds one full-width primary button only; Cancel is the ×, swipe down or device Back. A destructive action never goes in a sheet footer; it lives in the page's `…` menu. Build and behaviour: `design/mobile.md` §6.
- No glass support or reduced transparency: `tileSolid`, `sheetSolid`, `barSolid`, glows hidden (`design/copy-and-a11y.md` §B5).
- Phone screens in the canvas: Dashboard, Products, Add product sheet, Product, Website settings, More, Vendors, Settings, Guide.

## 8. Motion — soft and slow
Put this once in `src/index.css` (scoped by the `pb-` names). Add `className="pb-pill"` to buttons, chips and nav items, and `className="pb-tile"` to clickable tiles. Feed `--pb-lift` and `--pb-focus` from `PB.lift` and `PB.focus` on the Playbook root.
```css
.pb-pill,.pb-tile{-webkit-tap-highlight-color:transparent;transition:transform .6s cubic-bezier(.22,1,.36,1),box-shadow .6s cubic-bezier(.22,1,.36,1),border-color .5s ease,filter .5s ease}
.pb-pill{position:relative;overflow:hidden}
.pb-pill::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(110deg,transparent 35%,oklch(1 0 0 / .22) 50%,transparent 65%);transform:translateX(-130%);transition:transform 1.1s cubic-bezier(.22,1,.36,1)}
@media (hover:hover){.pb-pill:hover{transform:translateY(-1px);filter:brightness(1.08)}.pb-pill:hover::after{transform:translateX(130%)}.pb-tile:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 oklch(1 0 0 / .18),var(--pb-lift);border-color:oklch(1 0 0 / .22)}}
.pb-pill:active,.pb-tile:active{transform:scale(.98);transition-duration:.08s}
.pb-focus:focus-visible,.pb-pill:focus-visible,.pb-tile:focus-visible{outline:2px solid var(--pb-focus);outline-offset:2px}
@keyframes pbPulse{50%{opacity:.5}} .pb-pulse{animation:pbPulse 1.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.pb-pill,.pb-tile,.pb-pill::after{transition:none}.pb-pill:hover,.pb-tile:hover,.pb-pill:active,.pb-tile:active{transform:none}.pb-pulse{animation:none}}
```
Hover and ambient motion take 0.5–0.6 s. Press feedback is immediate (under 0.1 s). Sheets slide in over 0.3–0.45 s. Toasts and reduced-motion fades take 150 ms. Nothing bounces or spins. Keep the `:active` rule after the hover block so a press wins on desktop too. On phone only `transform` and `opacity` animate; the desktop hover above may also ease `box-shadow`, `border-color` and `filter`. Under reduced motion, sheets fade in (opacity only, 150 ms) instead of sliding, and busy dots stay still.

## 9. Logo — the "bento P"
This replaces the open-book mark when the redesign is built. It is a rounded square in the brand gradient holding three white blocks that form a P, with a play triangle in its bowl:
```svg
<svg viewBox="0 0 48 48">
  <defs><linearGradient id="pbg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="oklch(0.84 0.15 78)"/>
    <stop offset="1" stop-color="oklch(0.64 0.21 28)"/></linearGradient></defs>
  <rect width="48" height="48" rx="14" fill="url(#pbg)"/>
  <rect x="10" y="10" width="11" height="28" rx="4" fill="white"/>
  <rect x="24" y="10" width="14" height="13" rx="4" fill="white" fill-opacity=".72"/>
  <path d="M25.5 27.6v8.8c0 .8.9 1.3 1.6.9l7-4.4c.6-.4.6-1.3 0-1.7l-7-4.4c-.7-.5-1.6 0-1.6.8z"
        fill="white" fill-opacity=".9"/>
</svg>
```
Give each instance a unique gradient id. It is 32 px in headers and 40 px on the login division picker.

## 10. Checklist for a Playbook screen
1. Backdrop has glows, and every content block sits on a glass tile.
2. At most one hero tile and one gradient button per view.
3. Selected state = frosted glass, not a solid colour.
4. Numbers are in mono, and every status is a dot plus a label.
5. Desktop uses the 12-column bento with full rows. Phone uses one column (stat tiles 2 per row), the 4-tab glass bar and bottom sheets.
6. Touch targets ≥ 44 px on touch, 16 px phone inputs, no sideways scroll at 360 px.
7. Clickables carry `pb-pill` / `pb-tile`, and reduced motion is respected.
