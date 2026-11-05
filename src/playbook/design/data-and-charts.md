# Playbook numbers, KPIs and charts

Use this when a Playbook screen shows a count, a ₹ figure, a percentage, a date, a KPI tile or any chart.

Visual tokens and recipes are in `src/playbook/DESIGN.md` (tokens §2, type §3, tile and hero §5, motion §8).
Its values are contrast-checked (measurements in `copy-and-a11y.md` §B1). Loading,
empty and error states are in `states-and-feedback.md`. Where a stat tile sits in the bento is in
`layout-and-components.md`. The final gate is `review-checklist.md`.

## 1. Pick the form before the colour
| What you are showing | Use | Not |
|---|---|---|
| One number (live products, failed today) | Stat tile (§6). The page's single most important one is the hero tile (DESIGN.md §5) | A chart |
| Products or listings per status | Thin segmented bar plus `dot · count · label` chips, in status colours. If people must compare the counts, ranked horizontal bars | Pie, donut |
| Listings per website (one series) | Horizontal bars, largest first, every bar the same colour (store slot 1) | Six colours for one series; colour by size |
| Status split per website (several series) | Stacked bars, one store colour per store, or status colours per segment (never both, §3) | Grouped 3D or side-by-side clutter |
| Something over time (publish failures per day) | Line (2px) or columns, in `PB.failed` for failures. If the story is one store, highlight it and grey the rest | Area stacks with many series |
| More than 7 categories, or many exact figures | A table on desktop, glass rows on phone (§9) | A crowded chart |

Never: two y-axes, pie or donut charts, a bar chart with only one bar, a chart for a single number.

## 2. Validated palette (dark glass)
All values are OKLCH. Build them into `src/playbook/pbTheme.ts` next to `PB` (e.g. `PB_VIZ.store[0..5]`,
`PB_VIZ.seq[1..7]`, `PB_VIZ.div`, `PB_VIZ.grid`, `.axis`, `.other`), never as literals in components. Hex was only
used as validator input.

Surfaces tested with the validator: the sheet `oklch(0.16 0.03 270)`, the page `PB.bg`, and a glow-lit tile
`oklch(0.24 0.05 290)`. Rechecked on 2026-11-05 by direct computation on a tile (`PB.tile` over `PB.bg`) and on a
tile over the amber glow's peak at the corrected `.30` alpha.

**Store colours (categorical), in this fixed order**
| Slot | Name | Value |
|---|---|---|
| 1 | orange | `oklch(0.60 0.14 60)` |
| 2 | teal | `oklch(0.64 0.11 190)` |
| 3 | violet | `oklch(0.60 0.17 295)` |
| 4 | lime | `oklch(0.66 0.14 118)` |
| 5 | magenta | `oklch(0.60 0.18 345)` |
| 6 | blue | `oklch(0.58 0.15 262)` |

Validator results (`--mode dark`, all three surfaces):
- **6 slots, side by side** (stacked bars, bars, lines): every check passes. Lightness 0.48–0.67, chroma 0.10 or more.
  Worst neighbour pair is blue next to magenta: colour-blind ΔE 9.7 (target 8), normal-vision ΔE 22.0 (floor 15).
  Contrast 3:1 or better on the three validator surfaces (about 4.5:1 on the sheet, 4.3:1 on a tile). Over the
  amber glow's peak the weakest store colour falls to about 2.5:1, below the 3:1 floor, so every chart keeps a
  second cue there: 2px gaps between touching fills, a legend, and direct labels or the Table toggle.
- **Scatter plots and small multiples (`--pairs all`)**: slots 1–3 pass (worst: violet/teal, 13.8 / 22.8).
  Four fail (orange/lime 5.5 / 14.9), six fail (blue/violet 2.2 / 9.6). So in those charts show **at most 3
  stores**; group the rest as "Other" or split into separate small charts.
- **Against status colours**: every store colour is at least ΔE 16.6 (OKLab ×100) from every status colour,
  rechecked with the corrected `PB.failed` `oklch(0.78 0.16 25)`. Orange sits at hue 60 (not 50) to keep clear of
  `PB.failed`.

**Sequential (amber, one hue), steps 100 → 700, dark to light**
`oklch(0.40 0.08 70)`, `oklch(0.48 0.10 70)`, `oklch(0.57 0.12 70)`, `oklch(0.66 0.13 70)`,
`oklch(0.75 0.14 72)`, `oklch(0.84 0.13 75)`, `oklch(0.92 0.07 80)`
- On dark glass, **more = lighter**. Passes `--ordinal`: lightness rises at least 0.06 per step, one hue,
  darkest step 2.08:1 on the sheet (about 2.0 on a tile), below the 3:1 UI floor. So a sequential cell always
  carries its value as text or sits next to a legend; never use step 100 alone as the only mark.
- On a glow-lit tile start ordered steps (tiers, stages) at step 200 (2.01:1).
- Amber is close to `PB.review`: never use this ramp in a chart that also shows status.

**Diverging (cool, neutral, warm)** for above/below a target or price up/down
- Cool arm, strong to light: `oklch(0.70 0.13 268)`, `oklch(0.59 0.14 268)`, `oklch(0.48 0.10 268)`
- Midpoint: `oklch(0.40 0.01 270)` (neutral grey; never a colour)
- Warm arm, light to strong: `oklch(0.48 0.09 50)`, `oklch(0.59 0.13 50)`, `oklch(0.70 0.14 52)`
- Each arm passes `--ordinal` (hue spread 0–2°). The middle-strength ends are 23.8 apart (colour-blind) and 25.5 (normal).
- The outer ends look close to `PB.failed` and `PB.busy`, so status colours and diverging colours never share a chart.

**Chart ink on glass**
| Part | Value |
|---|---|
| Gridlines | `PB_VIZ.grid` = `oklch(1 0 0 / .08)`, 1px, solid, horizontal only |
| Baseline / axis | `PB_VIZ.axis` = `oklch(1 0 0 / .16)` |
| "Other" and greyed-out series | `PB_VIZ.other` = `oklch(0.55 0.02 265)` (4.0:1) |
| Axis ticks / labels / values | `PB.tx3` / `PB.tx2` / `PB.tx` |
| Text inside a store-colour fill | white (APCA Lc −62 to −75) |
| Text inside a status fill | `PB.onBrand` (Lc 52–75) |

## 3. Colour rules
- **Colour follows the entity.** A website keeps its slot everywhere and forever: assign slots by a stable
  order (website `created_at`, then `id`), not by rank, filter or what is on screen. A filter never repaints.
- A 7th website: give it `PB_VIZ.other` as "Other" in charts and say so in the legend. Never invent a 7th hue.
- **Status colours are reserved** (`PB.live`, `PB.review`, `PB.failed`, `PB.busy`): only where the colour means
  a state, always as dot plus label, never as a store colour. A chart uses status colours **or** store colours, never both.
- Status value → token mapping is in `layout-and-components.md` §6. Don't remap statuses here.
- No gradient inside a chart. The brand gradient belongs to the logo, the hero tile and the one primary button.
- Never: rainbow ramps, a coloured midpoint, more than 6 hues, colour as the only carrier of meaning.

## 4. Marks
- Bars: 24px thick at most, 4px rounded at the end, square at the baseline. Bars start at zero.
- Lines: 2px. Dots: 8px or larger with a 2px ring in the surface colour. Area fill about 10% opacity.
- Touching fills (stacked segments): a 2px gap, never an outline.
- A chart always sits on a `PB.tile` (DESIGN.md §5), never straight on the backdrop. The tile height
  includes the x-axis labels; a chart tile never scrolls inside itself.
- Don't put `backdrop-filter` on chart parts (glass budget in DESIGN.md §5 and `mobile.md` §12).

## 5. Labels, legends, tooltips
- 2+ series: always a legend (dot + name, `PB.tx2`, 12px). Up to 4 series: also label the marks directly.
  One series: no legend box; the tile title names it.
- Label a few values only: the last point, the extreme, or the one the screen is about. Never a number on every point.
- A value goes inside a bar only if it fits; otherwise just outside the end; if no room, in the tooltip and the table.
- Text uses `PB.tx*`, never the series colour. Smallest chart text is 11px (`Columns` labels in
  `src/components/ui/Charts.tsx` are 10px today; raise them when Playbook uses it).
- Ticks: rounded, few (3–5), Indian grouping. Long category names wrap to 2 lines, never rotate.
- **Desktop**: hover shows the tooltip. Line charts: a crosshair that snaps to the nearest date. Bars and
  segments: the mark is the target and lifts slightly. Hit area at least 24px.
- **Phone (no hover)**: tap a mark to pin its tooltip; tap again or outside to close. Hit area at least 44px tall.
- Keyboard focus on a mark shows the same tooltip (focus ring: `copy-and-a11y.md`).
- One tooltip lists every series at that point: value bold in mono, name in `PB.tx2`, a short line in the
  series colour. Insert text with `textContent`, never `innerHTML`.
- Tooltips add detail only: every value must also be readable another way (labels, legend chips, table).
- Every chart tile has a **"Table"** toggle (`pbBtnSecondary`, `aria-pressed`) that shows the same numbers.

## 6. Stat tiles and KPIs
- Build `src/playbook/components/PbStatTile.tsx` on the tile recipe. Do not use `src/components/ui/StatTile.tsx`
  (wired to DailyWork `T` tokens and Sora 800 values).
- Anatomy: 11px uppercase section label (DESIGN.md §3) → value in JetBrains Mono 28–32px `PB.tx`, weight 600
  → one meta line 12px `PB.tx2` (comparison or "Updated 2 min ago"). Never Sora for the value.
- Give context: "₹4,82,300 · 38 products", "12 failed · 3 since yesterday". A delta uses an arrow plus a word or
  sign ("▲ 12 vs last week"), not colour alone. Only colour a delta when up/down truly means good/bad.
- Zero shows `0`, not a dash or a hidden tile. Unknown shows `—`.
- A tile that filters a list is a real `<button>` with `aria-pressed`; selected uses the frosted active recipe.
- Screen reader text reads as a sentence: "Live products: 128" (label is real text, not only visual).
- Hero tile: one per page, `PB.onBrand` text on the brand gradient. Use opaque stops when it carries text under
  18px (DESIGN.md §5).
- Today `src/playbook/PlaybookDashboard.tsx` shows its counts in Sora; move them to mono when the page is rebuilt.

## 7. Number formatting (one helper file)
`src/playbook/format.ts` is the only formatter: `rupee` (whole ₹), `rupeeExact` (move `rupees()` here from
`components/product/status.tsx`, which re-exports it), `count`, `pct`, `istDate`, `istRelative` (§8). No ad-hoc
`toLocaleString` in components.
```ts
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const int  = new Intl.NumberFormat('en-IN');
export const rupee = (n: number | null | undefined) => n == null ? '—' : inr0.format(n);   // ₹1,23,456
export const count = (n: number) => int.format(n);                                            // 1,00,000
export const pct   = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : '—';
```
- Money: Indian grouping always (₹1,23,45,678, never ₹12,345,678). Whole rupees in lists, tiles and charts;
  paise only where they change a decision (a price editor, a cost line): `rupeeExact`, `en-IN` with up to 2
  decimals.
- The ₹ sign is real text (screen readers say "rupees"), never a CSS `::before` or an image.
- Compact axis ticks only: `₹1.2L`, `₹3.4Cr` (lakh, crore), never K/M. Full figure in tooltip and table.
- Percentages: whole numbers ("38%"); one decimal only below 10% when it matters ("2.5% failed").
  Always show the base nearby ("38% · 12 of 32"). Percent of zero is `—`, not `0%` or `NaN%`.
- Never truncate a figure. If it does not fit, the tile grows (`states-and-feedback.md` §8).

## 8. Dates and times (IST)
- `istDate` / `istRelative` in `format.ts` always format with `timeZone: 'Asia/Kolkata'` and `en-IN`: "5 Nov, 2:30 PM"; add the year only when it is not this year.
- Under 1 min: "Just now". Under 60 min: "12 min ago". Under 24 h: "3 h ago". Yesterday: "Yesterday, 4:10 PM".
  Older: the date. Put the full IST date and time in the element's `title` and in tables.
- "Today", day buckets and date ranges are IST days. Never use `toISOString().slice(0, 10)` (UTC, wrong
  before 5:30 AM IST). `shortDate()` in `components/product/status.tsx` has no `timeZone` today; add it.
- Time axes: day ticks "5 Nov", hour ticks "2 PM". Date-range presets: Today, 7, 30, 90 days, then Custom.

## 9. Tables and rows
- **Desktop**: a table inside a `PB.tile` when there are more than 7 columns of figures or the user compares
  exact values. Table spec in `layout-and-components.md` §7 (headers 11px uppercase `PB.tx2`, cells 13px `PB.tx`,
  number columns right-aligned, mono, `tabular-nums`). Never the root 10px `T.tx3` headers.
- **Phone**: no tables. Each row becomes a glass row: name and status on the left, the one key figure in mono on
  the right, secondary figures as a 12px meta line. Nothing scrolls sideways at 390px.
- Sort: default most recently updated, or largest first for ranked figures; show the sort in the header.
- Totals row last, weight 600, separated by a `PB.tileBd` hairline.

## 10. Filters and reloads
- Filters sit in one row above everything they affect, never inside a chart tile. Order: date range, then
  website, then status. On phone they are the 40px chip row (DESIGN.md §7).
- When data reloads, keep the old chart at `opacity: .6`: no skeleton flash, no layout jump. First load uses
  a skeleton shaped like the chart (`states-and-feedback.md` §1–2).
- Empty chart: say why ("No products published in the last 7 days") and keep the axes' space.

## 11. Motion
- Count-up (`src/components/ui/CountUp.tsx`) only on the first load of a stat tile, at most 600ms, never on
  refresh, filter change or every poll. It ignores `prefers-reduced-motion` today: add a
  `matchMedia('(prefers-reduced-motion: reduce)')` check (show the final value at once) before Playbook uses it.
  It is shared UI, so say so in the PR.
- Bars and lines may grow in once on first paint (about 0.5s, DESIGN.md §8 easing); data updates move without
  replaying the intro. No bouncing, spinning or staggered confetti. Reduced motion turns all of it off.

## 12. Reusing the shared charts
- `src/components/ui/Charts.tsx` (`Meter`, `StackBar`, `BarList`, `Columns`) is shared and hard-wired to `T`.
  Add an optional `ink` prop (track, text, empty colours) that Playbook fills from `pbTheme.ts`. Don't fork it,
  and keep DailyWork's output unchanged when `ink` is absent.
- `StackBar` segments only have a `title` tooltip: add tap-to-inspect before using it on phone.
- No chart library is installed; plain divs/SVG are enough for these forms. Ask the owner before adding one.

## 13. Anti-patterns (reject in review)
Two y-axes · pie or donut (worst with many slices) · rainbow ramps · colours repainted on filter · more than 6
hues · status colours as series · a coloured diverging midpoint · colour as the only meaning · a number on every
point · dashed or heavy gridlines · thick saturated blocks · labels clipped by bars · tooltip as the only way to
read a value · filters inside chart tiles · skeleton flash on reload · no table view · numbers in Sora or a
proportional font · Western digit grouping for ₹ · UTC dates · `NaN%` or `₹NaN` on screen.
