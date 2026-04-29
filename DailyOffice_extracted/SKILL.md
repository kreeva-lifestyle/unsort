# DailyOffice Design System — Claude skill

Load this skill when the user asks you to design, extend, or recreate
any surface of **DailyOffice / Unsort** — the internal workspace suite
for Kreeva Lifestyle (`unsort.aryadesigns.co.in`).

---

## What you're working with

DailyOffice is a **dense, dark, keyboard-friendly web app** for a
small manufacturing / retail operation. One login, several modules:
Dashboard, Inventory, Brand Tags, PackStation, Cash Challan, Cash
Book, Settings. Stack is React 18 + TypeScript + Vite + Supabase.

The visual system is deliberately boring. Before generating anything:

1. Read **`README.md`** — it is the source of truth for voice, motion,
   spacing, and all the "why" behind a token.
2. Link **`colors_and_type.css`** into every HTML specimen. Never
   re-declare the variables.
3. Open **`ui-kit.html`** to see how the pieces compose.
4. If you need an icon, start from the 12 in `assets/icons.svg`; fall
   back to **Lucide at `stroke-width: 1.8`** for anything else.

---

## The non-negotiables

Think of these as lint rules. Breaking one should be a conscious
decision, not an accident.

- **Base font size is 12 px.** The `html` element is wound to 12 px
  and the whole grid assumes it. Never set `font-size: 14px` on a
  section — step up to 13/15/20 from the scale.
- **Background is `#060810`, not `#000`.** Cards are translucent
  whites over it (`rgba(255,255,255,0.02)`), not opaque greys.
- **Gradient is brand-only.** `--do-ac-grad` belongs to the wordmark,
  the primary CTA, the active-nav pip, and the login hero. Do not
  fill illustrations, backgrounds, or charts with it.
- **State or grey — nothing else.** Status tags use the five semantic
  hues (success / danger / warn / info / cyan). Non-state data is
  tertiary grey (`--do-tx-3`). Do not invent a sixth hue.
- **Three type jobs.** Sora for display and big numerics (700/800
  only). Inter for everything else (300–700). JetBrains Mono **only**
  for IDs, SKUs, serials, and currency columns.
- **Tag recipe is fixed.** `10% bg · 25% border · light-tint fg ·
  9 / 600 caps`. Don't raise opacity to "make it pop".
- **One easing, one duration.** `all 180ms cubic-bezier(0.4, 0, 0.2,
  1)`. No bounces, no overshoots except the one-shot login card.
- **No emoji.** Not in chips, not in toasts, not in slides. The only
  existing one is the `📦` favicon, which is out-of-surface.
- **Copy voice.** Terse, second-person, imperative. Button labels
  ≤ 2 words. Sentence case for body, title case for section titles.
  Every surface ends with `POWERED BY ARYA DESIGNS` in 7–8 px caps at
  ~30 % opacity.

---

## Recipes — the shapes you'll reach for most

### Card
```css
background: rgba(255,255,255,0.02);
border: 1px solid rgba(255,255,255,0.05);
border-radius: 10px;
padding: 12px 14px;
```

### Stat card
Add a 2 px top accent bar:
```css
background: linear-gradient(90deg, {statusColor}cc, {statusColor}33);
```
Eyebrow: 8 / 600 caps, tracked 0.08 em, tertiary grey.
Number: 20 / 700 Sora, `font-variant-numeric: tabular-nums`, state colour.

### Primary button
```css
background: linear-gradient(135deg, rgba(99,102,241,.87), rgba(129,140,248,.80));
color: #fff;
border-radius: 6px;
padding: 5px 12px;
font: 600 11px/1 Inter;
box-shadow: 0 2px 10px rgba(99,102,241,.25);
```

### Focus ring
```css
border-color: rgba(99,102,241,0.35);
box-shadow: 0 0 0 2px rgba(99,102,241,0.08);
```

### Modal
`rgba(14,18,30,.96)` surface, `1px solid rgba(255,255,255,.08)`,
`border-radius: 14px`, `box-shadow: 0 24px 80px rgba(0,0,0,.65)`,
`backdrop-filter: blur(32px)`. Overlay behind is
`rgba(0,0,0,.80)` with an 8 px blur.

---

## When you're mocking a new screen

Do them in this order — it matches the app's own compositional habit:

1. **Drop the 220 px sidebar on the left** using the `--do-sidebar`
   surface (`rgba(8,11,20,.85)` + `backdrop-filter: blur(36px)`).
   Active nav row uses `rgba(99,102,241,.08)` background, indigo text,
   and a 3 × 18 px left-edge bar with a 0 8 px indigo glow.
2. **Add the 44 px header** with the brand dot, a 1 px divider, the
   search input (`do-input` recipe), and icon buttons on the right.
3. **Lay stat cards first**, then the content below. KPIs anchor the
   page; prose is secondary.
4. **Tables are dense** — 9 px caps header on
   `rgba(255,255,255,0.015)`, 12 px rows in secondary grey, IDs in
   mono, numerics right-aligned.
5. **Page padding is 14 / 16 px.** Don't pad to 32 px; the app is
   meant to feel full.
6. **Footer signature** on every surface: `POWERED BY ARYA DESIGNS`,
   7–8 px caps, ~30 % opacity.

---

## Content / copy tips

- **Nav items are single words.** Dashboard, Inventory, Brand Tags,
  PackStation, Cash Challan, Settings.
- **Error copy is honest and short.** "Camera not available."
  "Network error. Try manual entry." "No ID found. Write clearly:
  UNS-DDMMYY-XXXX".
- **Placeholders are factual.** `you@company.com`, `Enter password`,
  `Search items, IDs, SKUs…`, `UNS-DDMMYY-XXXX`. Not marketing copy.
- **Currency.** Always `₹` (U+20B9) with `toLocaleString('en-IN')`.
- **Dates.** `en-IN` short, e.g. `18 Apr 2026`.
- **Status words stay lowercase snake_case** in data (`unsorted`,
  `dry_clean`, `paid`) — chips upper-case them visually only.

---

## What to ask the user up front

If the brief is not obvious, always confirm before drawing:

1. **Which module** — Dashboard, Inventory, PackStation, Cash Challan,
   Cash Book, Brand Tags, or Settings?
2. **Surface type** — full page inside the shell, modal, toast, or a
   standalone print/challan output?
3. **Variations** — one design or a few? Which axes should vary
   (layout, density, state coverage)?
4. **Role context** — Admin, Manager, Operator, Viewer? Some rows and
   actions only appear for specific roles.
5. **Real data or placeholder?** If real, ask for an example row.

---

## Assets you have

- `assets/logo-wordmark.svg` — gradient wordmark with brand dot.
- `assets/logo-mark.svg` — 64 × 64 mark-only tile.
- `assets/icons.svg` — 12 hand-rolled 24 × 24 stroke-1.8 icons
  (grid, box, tag, pin, file, users, search, scan, check, link,
  settings, bell). Anything beyond these: Lucide at stroke 1.8.
- `source/` — read-only imports of `App.tsx`, `index.css`,
  `BrandTagPrinter.tsx`, `CashBook.tsx`, `CashChallan.tsx`,
  `PackTime.tsx`, `InventoryExtras.tsx`.
- `preview/*.html` — 22 specimen cards that `ui-kit.html` frames.
  Reuse them verbatim when building new docs.

---

## One last reminder

DailyOffice's signature is **restraint**. If a design looks
"designer-y" — hero imagery, oversized type, marketing adjectives,
pill-shaped buttons, glassmorphism spreads, rainbow gradients — it's
already wrong. The product is a tool that earns its right to the
operator's eight hours every day by getting out of the way. Make
things that look like signage, not brochures.
