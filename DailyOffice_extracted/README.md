# Unsort / DailyOffice — Design System

> Design system for **DailyOffice** — an internal workspace suite built by
> **Arya Designs** (operating org: **Kreeva Lifestyle**). The product was
> originally named "Unsort" and is still deployed at
> [unsort.aryadesigns.co.in](https://unsort.aryadesigns.co.in), but the
> live UI wordmark is **DailyOffice — Your Workspace, Simplified**.

## Sources

| Source | Location |
| --- | --- |
| GitHub repo | `kreeva-lifestyle/unsort` (branch `main`) |
| Primary app shell | `src/App.tsx` (imported here at `source/App.tsx`) |
| Tag printer | `source/BrandTagPrinter.tsx` |
| Cash book | `source/CashBook.tsx` |
| Cash challan | `source/CashChallan.tsx` |
| Pack station | `source/PackTime.tsx` |
| Inventory extras | `source/InventoryExtras.tsx` |
| Global CSS | `source/index.css` |
| Project context memo | `UNSORT-CLAUDE-CODE-CONTEXT.md` (in the repo) |
| Deployed app | `https://unsort.aryadesigns.co.in` |

Sibling products in the same org (not included in this DS; may share tokens):
`kreeva-lifestyle/pricedesk`, `kreeva-lifestyle/attendance`.

---

## What DailyOffice is

A **dense, dark, keyboard-friendly web app** for a small manufacturing /
retail operation. One login, several modules:

- **Dashboard** — greeting, "Today's Pulse" stats, alerts, mini trends, a tasks list.
- **Inventory** — damaged / unsorted product tracking at component level,
  barcode + OCR scanning, auto-pair completion.
- **Brand Tags** — print bulk brand tags (barcodes with `JsBarcode`).
- **PackStation (PackTime)** — scan-based outbound packing.
- **Cash Challan** — Indian ₹-denominated invoice/challan printer, with
  paid / partial / unpaid states.
- **Cash Book** — daily cash opening/closing, expenses, handovers.
- **Settings (admin)** — categories, locations, users/roles.

Roles: **Admin / Manager / Operator / Viewer**. Built on React 18 +
TypeScript + Vite, backed by Supabase (Postgres + Auth + Realtime).

---

## Index — files in this design system

```
README.md                 ← this file
SKILL.md                  ← Claude Code skill shim
colors_and_type.css       ← canonical CSS variables (colors, type, radii, motion)
source/                   ← imported app source, read-only reference
preview/                  ← HTML specimen cards surfaced in the Design System tab
assets/                   ← logos, icons, branding imagery
fonts/                    ← (empty — fonts loaded from Google Fonts)
ui_kits/
  dailyoffice/            ← pixel-faithful recreation of the web app
    index.html            ← interactive click-thru
    *.jsx                 ← modular components
```

---

## Content fundamentals

The product copy is **utilitarian, terse, second-person, lowercase-ish**.
It reads like a tool, not a brand.

**Voice characteristics**

- **Short labels, no fluff.** Nav items are single words: *Dashboard,
  Inventory, Brand Tags, PackStation, Cash Challan, Settings.*
- **Second person, imperative.** "Scan barcode", "Capture & Read Text",
  "Sign In", "Go". Button text is ≤ 2 words almost always.
- **One tagline that does double duty.**
  > "DailyOffice — Your Workspace, Simplified."
  > Appears in the `<title>`, the login card, and the sidebar header.
- **Factual microcopy, no marketing adjectives.** Placeholders read
  "you@company.com", "Enter password", "Search items, IDs, SKUs…",
  "UNS-DDMMYY-XXXX". No "awesome", no "let's".
- **UPPERCASE + letter-spacing for section labels.** Eyebrows like
  `TODAY'S SCANS`, `OVERDUE PAYMENTS`, `OR TYPE ID` are set in
  8–10px, weight 600, letter-spacing ≈ 0.08–0.25em. This is the
  single most recognizable typographic mannerism.
- **Sentence case for body, title case for section titles.**
  "Complete Product", "Delete this task?", "Notifications".
- **Indian English, ₹ as currency.** `toLocaleString('en-IN')` everywhere.
  Dates format `en-IN`, e.g. `18 Apr 2026`.
- **No emoji in the UI itself.** The only emoji is the legacy 📦 favicon
  (SVG wrapper around `<text>`) — it does not appear in-app. Do not add
  emoji to slides, chips, or toasts.
- **Status is a single lowercase word.** `unsorted`, `damaged`, `complete`,
  `dry_clean`, `paid`, `partial`, `unpaid`. Chips upper-case them visually;
  data stays lowercase snake_case.
- **Error copy is short and honest.** "Something went wrong", "Camera not
  available.", "No ID found. Write clearly: UNS-DDMMYY-XXXX",
  "Network error. Try manual entry."
- **Footer signature.** Every surface ends with
  `POWERED BY ARYA DESIGNS` in 7–8px all caps, opacity ~0.3.

Use "you" for the user, "we" only if you absolutely must (rare).
Never address the user by marketing name; use their real first name
when available (`greeting, {profile.full_name.split(' ')[0]}`).

---

## Visual foundations

### Mood
Near-black workspace (`#060810`) with **indigo** accent (`#6366F1 → #818CF8`)
and five ambient blurred color orbs only on the login screen. Everywhere
else the UI is quiet: translucent white surfaces on dark, hairline borders,
small type, tabular numbers, and **one** gradient — the indigo brand
gradient reserved for the wordmark and primary buttons.

### Color
See `colors_and_type.css`. Key rules:

- **Background is not pure black.** `#060810` — almost-black with a hint of
  blue. Don't drop to `#000`.
- **Surfaces are transparent whites over that bg**, not opaque greys. Resting
  card: `rgba(255,255,255,0.02)`. Hover: `rgba(255,255,255,0.04)`.
- **Borders are transparent whites too**, `rgba(255,255,255,0.05)` hairline,
  `rgba(255,255,255,0.08)` emphasis. Never a solid grey stroke.
- **Three greys of text**: `#E2E8F0` (primary), `#8896B0` (secondary),
  `#4A5568` (tertiary / all labels). No pure white, no pure grey.
- **Indigo is the only brand color.** `#6366F1` primary, `#818CF8` light end.
  Use the gradient `linear-gradient(135deg, #6366F1, #818CF8)` for the
  wordmark and primary CTA only.
- **Semantic colors**: success `#22C55E` (table `#4ADE80`), danger `#EF4444`
  (`#FCA5A5`), warn `#F59E0B` (`#FCD34D`), info `#38BDF8` (`#7DD3FC`),
  cyan `#06B6D4` for "dry_clean" only. Each has a 10% bg + 25% border +
  light-tint fg recipe.

### Type
- **Inter** for all body, buttons, inputs (weights 300–700).
- **Sora** for the wordmark, page titles, and big numbers (600–800).
- **JetBrains Mono** for IDs, serials, batch numbers, scan codes,
  counts inside chart labels.
- **Tiny base size.** Body runs at 11–12px; labels 8–10px with
  `letter-spacing: 0.08–0.25em` and `text-transform: uppercase`. Numbers
  on stat cards jump to 18–20px Sora. This density is intentional —
  it signals "tool, not marketing".

### Spacing / radii
- Padding is **tight**: 10–14px card padding, 4–8px chip padding,
  4–6px gap inside flex groups.
- Radii: **6px** on inputs/buttons, **8–10px** on cards, **14px** on
  modal boxes, **18px** only on the login hero card. Nothing is pill-shaped.
- 1px hairline borders everywhere. No double borders.

### Backgrounds
- **Plain app bg** on most pages — no pattern.
- **Login screen** is the only "hero" surface: 5 blurred 200–400px
  circles of indigo / cyan / amber / green / magenta at ~12% opacity on
  top of the bg, plus a 24px dot grid overlay
  (`radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)`).
  Do not copy this treatment elsewhere.
- **No full-bleed photography.** No illustrations. No gradients as card
  fills. Do not invent any.
- **Charts are bar sparklines** with a `linear-gradient(180deg, #6366F1cc, #6366F144)`
  fill. Keep them ≤ 60px tall.

### Sidebar / header chrome
- **Sidebar**: 220px fixed, `rgba(8,11,20,0.85)` with `backdrop-filter: blur(36px)`
  and a right-side hairline. A single faint indigo radial glow sits
  behind the logo. Active nav row: `rgba(99,102,241,.08)` bg, indigo
  text, plus a **3×18 left-edge bar with a 0 8px indigo glow** and a
  slow `pulseGlow` animation. Inactive rows are tertiary grey; hover
  lifts to `rgba(99,102,241,.04)`.
- **Header**: 44px tall, `rgba(8,11,20,0.60)` + blur, sticky, with a
  6px brand dot (gradient) on the left of the title, then a 1px
  divider, then the search field, then scan-icon + bell buttons on the right.

### Borders, shadows, elevation
- **Hairlines** everywhere: `1px solid rgba(255,255,255,0.05)`. On modal
  heads and emphasized rows: `rgba(255,255,255,0.08)`.
- **No drop shadows on regular cards** — elevation is carried by surface
  opacity and border alone.
- Only three places shadow appears:
  - **Primary button** — `0 2px 10px rgba(99,102,241,.25)` (accent glow).
  - **Modal** — `0 24px 80px rgba(0,0,0,.65)` with heavy backdrop-blur.
  - **Toasts / notification dropdown** — `0 10px 40px rgba(0,0,0,.55)`.
- **Brand dot & active nav indicator** get a `0 0 8px #6366F1…88` glow —
  use sparingly, never on text.

### Motion
- **One easing curve, one duration, everywhere.**
  `all 180ms cubic-bezier(0.4, 0, 0.2, 1)` (aliased `--tx-all`).
- **Entry animations are small.** `translateY(4–10px)` + `opacity 0→1`
  over 150–250ms. No bounces, no overshoots except the login box
  (`modalBoxEnter` uses `cubic-bezier(.16, 1, .3, 1)`).
- **No looping decoration.** The ambient orbs use a one-shot
  `loginGlowIn` and then freeze. The only perpetual animations are:
  - `pulseGlow` on the active nav indicator (2s gentle opacity pulse)
  - `subtlePulse` on the sidebar logo (4s brightness nudge)
  - `scanLine` red bar on the live barcode scanner
  - `shimmer` on skeletons
- **No mass fade/slide on route change** beyond a 150ms `fi` keyframe.

### Interaction states
- **Hover on cards**: border → `rgba(255,255,255,0.08)`, bg → `rgba(255,255,255,0.04)`.
  Nothing scales, nothing lifts.
- **Hover on icon buttons**: bg → `rgba(255,255,255,0.05)`, border brightens one step.
- **Hover on primary button**: the 135° gradient is already hot; we keep
  the same gradient and rely on a slightly stronger shadow.
- **Press / active**: reduce the gradient's trailing alpha, or darken the
  tinted bg by ~2%. No shrink-on-press.
- **Focus**: indigo ring — `border-color: rgba(99,102,241,0.35)` +
  `box-shadow: 0 0 0 2px rgba(99,102,241,0.08)`.
- **Disabled**: `opacity: 0.6`, `pointer-events: none`.
- **Destructive hover**: bg `rgba(248,113,113,.08)`, border `rgba(248,113,113,.20)`.

### Blur & transparency
Used **only on navigation, modals, and toasts**. Never blur content.
- Sidebar / header: 32–36px blur over ~0.6–0.85 alpha dark surface.
- Modal: 32px blur over 0.96 alpha; the overlay behind is `rgba(0,0,0,.80)` + 8px blur.
- Toast / notif dropdown: 16–24px blur over 0.95 alpha.

### Imagery tone
There's effectively no photography in-app. If one is needed, stick to
**cool, desaturated, with slight grain**; never warm magazine imagery.

### Cards — the canonical recipe
```
background: rgba(255,255,255,0.02);
border: 1px solid rgba(255,255,255,0.05);
border-radius: 10px;
padding: 12px 14px;
```
Variant: **stat card** gets a 2px top accent bar
`linear-gradient(90deg, {statusColor}cc, {statusColor}33)`.

### Tables
- 9px UPPERCASE header row on `rgba(255,255,255,0.015)` with a 1px bottom hairline.
- 12px body rows in secondary grey text; row hover transitions `background 150ms ease`.
- No zebra striping.

### Layout rules
- Fixed 220px sidebar, 44px header, page `padding: 14px 16px`.
- Mobile breakpoint at 768px: sidebar collapses behind a hamburger,
  stat grid drops to 3 then 2 columns, modal goes full-viewport minus 16px.
- Never center-align content blocks at desktop width; everything is
  left-aligned inside the page grid.

---

## Iconography

**Hand-rolled 24×24 stroke icons, embedded in `App.tsx`.** The app
defines an internal `<Icon name>` component with a small dictionary of
SVG `<path d="…" />` strings. Attributes: `fill: none`, `stroke:
currentColor`, `stroke-width: 1.8`, `stroke-linecap: round`,
`stroke-linejoin: round`. They look like **Feather / Lucide at weight 1.8**.

Icons currently defined in-source:
`grid, box, tag, pin, file, users, search, scan, check, link, settings`,
plus a couple of inline one-off SVGs (bell, close `×`, magnifier in the
search input).

**Recommended substitution** for anything not already in the dictionary:
use [**Lucide**](https://lucide.dev) at `stroke-width: 1.8`. It is
visually indistinguishable from the hand-rolled set and covers every
edge case. The UI kit wires this up via CDN:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

> **Substitution flag.** The repo does not ship an icon font or SVG
> sprite — only the 11 inline paths above. For any icon beyond those, we
> stand in the matching Lucide glyph. Flag this to the team if we need
> an in-house icon set.

**Emoji**: not used in the UI. The only emoji is the `📦` favicon, which
is a data-URI SVG that wraps a `<text>` element — not really an emoji
surface. **Do not add emoji** to components, toasts, or chip labels.

**Unicode as icon**: the `✕` close glyph and `×` clear-search glyph are
used inline. The `₹` (U+20B9) rupee sign is used for every monetary
value. These are the only Unicode-as-icon usages — keep them.

**Barcodes** are generated client-side with `JsBarcode` (CODE128,
CODE39, EAN readers). The scanner uses `@ericblade/quagga2` for live
decoding. These are functional, not decorative.

**Logos / brand marks**: there is no bitmap logo — the brand mark **is**
the wordmark "DailyOffice" rendered in Sora 700–800 with the indigo
gradient clipped to text, next to a 6px indigo gradient dot. We
reproduce this in `assets/logo-wordmark.svg`.

---

## Font substitutions

All three families — **Inter, Sora, JetBrains Mono** — are loaded from
Google Fonts at runtime. No local `.ttf/.woff` files ship in the repo,
and the `fonts/` folder in this design system is therefore empty.

> **Flag to user:** If we need offline-capable / self-hosted fonts for
> production or for slide exports, please provide the licensed `.woff2`
> files for Inter, Sora, and JetBrains Mono, or confirm that the Google
> Fonts CDN is acceptable. The design system will work as-is against
> Google Fonts.
