# Playbook design reference — "V2 · Bento glass" (approved)

The owner approved this look for Playbook on 2026-11-05. Every new or
redesigned Playbook screen follows it. The full set of mock-ups (4 desktop
pages and 9 phone screens) is in the design canvas
https://claude.ai/artifact/4oLPNPkqXgrCpXxiwVABcw (private to the owner).

This file covers how Playbook looks. `src/playbook/CLAUDE.md` covers how it is
built. Where the two meet, the root `CLAUDE.md` rules still apply: 44 px
touch targets, 16 px inputs on phone, the modal rules, `friendlyError`, and
the two-signal async buttons.

## 1. The idea in one line
Dark, deep backdrop, soft coloured light behind it, and content on
**frosted-glass tiles laid out as a bento grid**. The warm amber → coral
gradient is the only loud colour. It marks the brand, the one hero tile per
page, and the primary action.

## 2. Tokens
Build these once as a Playbook token file (e.g. `src/playbook/pbTheme.ts`,
exporting `PB` the way `T` works) and use the tokens, never the literals,
in components. They are OKLCH strings, so never append a hex alpha. Use
`alpha()` from `src/lib/theme.tsx` or write the `/ a` form.

| Token | Value | Use |
|---|---|---|
| `bg` | `oklch(0.10 0.03 270)` | page backdrop |
| `glowAmber` | `oklch(0.70 0.17 60 / .40)` | backdrop light, top left |
| `glowCoral` | `oklch(0.62 0.20 25 / .32)` | backdrop light, right |
| `glowIndigo` | `oklch(0.50 0.14 280 / .40)` | backdrop light, bottom |
| `tile` | `oklch(1 0 0 / 0.06)` (phone `0.07`) | glass tile fill |
| `tileBd` | `oklch(1 0 0 / 0.12)` | tile hairline |
| `tileHi` | `inset 0 1px 0 oklch(1 0 0 / 0.10)` | tile top highlight |
| `brandA` → `brandB` | `oklch(0.84 0.15 78)` → `oklch(0.64 0.21 28)` | brand gradient |
| `onBrand` | `oklch(0.16 0.03 40)` | text on the gradient |
| `tx` | `oklch(0.96 0.01 250)` | primary text |
| `tx2` | `oklch(0.82–0.86 0.02 255)` | secondary text |
| `tx3` | `oklch(0.78 0.02 255)` | chevrons, muted |
| `live` | `oklch(0.80 0.17 150)` | live / done |
| `review` | `oklch(0.84 0.15 75)` | waiting approval / needs info |
| `failed` | `oklch(0.72 0.18 25)` | failed |
| `busy` | `oklch(0.78 0.12 235)` | in progress (AI reading, publishing) |

Status is always **dot plus label**, never colour alone. A status that needs
action gets a tinted tile: review uses `oklch(0.80 0.15 75 / 0.12)` with a
`oklch(0.85 0.12 75 / 0.35)` border. Failed uses `oklch(0.62 0.2 25 / 0.16)`
with a `oklch(0.75 0.15 25 / 0.4)` border.

## 3. Type
- **Sora** 700: page title 32 px desktop / 20 px phone, tile titles 17 px,
  letter-spacing −0.3 px.
- **Inter**: all UI. 15 px for list names, 13 px body, 12 px meta.
- **JetBrains Mono**: every number a person compares (prices, costs, counts,
  SKUs, store domains).
- Section labels: 11 px, 600, uppercase, letter-spacing 0.08em, `tx2`.

## 4. The backdrop
Fill the page with `bg`. Add two or three absolutely-positioned circles in
the glow colours, `filter: blur(120px)` on desktop or `blur(80px)` on phone,
placed partly off-screen and marked `aria-hidden`. The glass only reads as
glass because of these lights behind it, so never put a tile on a flat
background.

## 5. Glass recipes
**Tile** (cards, panels, list rows):
```
background: tile; border: 1px solid tileBd; box-shadow: tileHi;
backdrop-filter: blur(24px) saturate(140%);   /* phone: blur(20px) */
-webkit-backdrop-filter: same;
border-radius: 24px;   /* hero 28, phone tiles 22, phone rows 20 */
```
**Active / selected** (current nav item, chosen segment, active filter chip):
frosted, brighter glass. This is not a solid fill.
```
background: linear-gradient(180deg, oklch(1 0 0 / .24), oklch(1 0 0 / .08));
border: 1px solid oklch(1 0 0 / .30);
box-shadow: inset 0 1px 0 oklch(1 0 0 / .50), inset 0 -1px 0 oklch(1 0 0 / .06),
            0 8px 24px oklch(0.64 0.21 28 / .22);
backdrop-filter: blur(18px) saturate(170%);
color: oklch(0.99 0.01 80); font-weight: 600;
```
A selected filter in a side list also gets `inset 3px 0 0 oklch(0.72 0.19 40)`.

**Hero tile** (one per page, the single most important number or state):
`linear-gradient(140deg, brandA / .88, brandB / .88)`, text `onBrand`,
radius 28 (phone 24).

**Primary button**: `linear-gradient(135deg, brandA, brandB)`, text
`onBrand`, 600 weight, radius 14–18, min-height 48 on phone. Use one per
view. **Secondary**: `oklch(1 0 0 / .06)` fill, 1 px `oklch(1 0 0 / .14)`
border. **Destructive**: transparent with a red border
`oklch(0.75 0.15 25 / .4)` and text `oklch(0.88 0.08 25)`.

**Inputs**: height 48 (phone) / 40 (desktop), radius 14, fill
`oklch(1 0 0 / .06)`, border `oklch(1 0 0 / .14)`, 16 px text on phone.

## 6. Desktop layout
- Page padding `24px 32px 48px`, content max-width **1344 px**, centred.
- **Top bar**: a floating glass pill (radius 999, padding `8px 8px 8px 16px`).
  It holds the logo, then the nav pills (active = frosted glass), then search
  and the account menu on the right. There is no sidebar.
- **Bento grid**: `grid-template-columns: repeat(12, minmax(0, 1fr))`,
  gap 16. `grid-auto-rows: 152px` on dashboards and `120px` on detail pages.
  Tiles span whole rows. Mix one large hero (e.g. 6×2) with 3- and 4-column
  tiles. The sizes in a grid must add up to full rows, with no ragged holes.
- Below 1100 px, collapse to 6 columns. Below 768 px, use the phone layout.

## 7. Phone layout (designed at 390 × 844)
- Side padding 16 px plus the safe-area insets. Header: logo or a 44 px glass
  back button, then a Sora 20 px title, then at most one action (a 44 px
  gradient `+` or a "Save" button).
- **Bottom tab bar**: floating glass, `margin: 0 12px 18px` plus the
  bottom safe-area, radius 26, padding 6. It has 4 tabs, **Home ·
  Products · Websites · More**. Each tab is an icon over an 11 px label,
  min-height 52, and the active tab is frosted glass. Vendors, Settings,
  Guide, Switch to DailyWork and Log out live under **More**.
- Everything stacks in one column. Lists are glass rows (photo 64×80 radius
  16, name, meta, status dot, chevron), with a min row height of 60.
- Filters are a horizontal scroll of 40 px chips, edge to edge
  (`margin: 0 -16px; padding: 0 16px`).
- Forms open as a **bottom sheet**. The sheet is glass
  `oklch(0.16 0.03 270 / .82)` with `blur(30px)`, radius `30px 30px 0 0`,
  and a grab handle. The scrim is `oklch(0.06 0.02 270 / .55)` with
  `blur(6px)`. Close is 44 px and the primary button sits at the bottom.
  Implement it with the shared modal rules (`createPortal`, `modal-inner`,
  scroll lock).
- Phone screens in the canvas: Dashboard, Products, Add product sheet,
  Product, Website settings, More, Vendors, Settings, Guide.

## 8. Motion — soft and slow
Put this once in `src/index.css` (scoped by the `pb-` class names) and add
`className="pb-pill"` to buttons, chips and nav items, and
`className="pb-tile"` to clickable tiles:
```css
.pb-pill,.pb-tile{transition:transform .6s cubic-bezier(.22,1,.36,1),box-shadow .6s cubic-bezier(.22,1,.36,1),background-color .5s ease,border-color .5s ease,filter .5s ease}
.pb-pill{position:relative;overflow:hidden}
.pb-pill::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(110deg,transparent 35%,oklch(1 0 0 / .22) 50%,transparent 65%);transform:translateX(-130%);transition:transform 1.1s cubic-bezier(.22,1,.36,1)}
.pb-pill:hover{transform:translateY(-1px);filter:brightness(1.08)}
.pb-pill:hover::after{transform:translateX(130%)}
.pb-pill:active{transform:translateY(0) scale(.98)}
.pb-tile:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 oklch(1 0 0 / .18),0 18px 40px oklch(0.05 0.03 270 / .45);border-color:oklch(1 0 0 / .22)}
@media (prefers-reduced-motion: reduce){.pb-pill,.pb-tile,.pb-pill::after{transition:none}.pb-pill:hover,.pb-tile:hover{transform:none}}
```
Hover lifts by 1–3 px and a light sheen crosses the button. Nothing bounces,
spins, or runs faster than about 0.5 s. Reduced motion turns all of it off.

## 9. Logo — the "bento P"
This replaces the open-book mark when the redesign is built. It is a
rounded square in the brand gradient holding three white blocks that form a
P, with a play triangle in its bowl:
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
Give each instance a unique gradient id. It is 32 px in headers and 40 px
on the login division picker.

## 10. Checklist for a Playbook screen
1. Backdrop has glows, and every content block sits on a glass tile.
2. There is at most one hero tile and one gradient button per view.
3. Selected state = frosted glass, not a solid colour.
4. Numbers are in mono, and every status is a dot plus a label.
5. Desktop uses the 12-column bento with full rows. Phone uses one column,
   the 4-tab glass bar and bottom sheets.
6. Touch targets are ≥ 44 px, phone inputs use 16 px text, and nothing
   scrolls sideways at 390 px.
7. Clickables carry `pb-pill` / `pb-tile`, and reduced motion is respected.
