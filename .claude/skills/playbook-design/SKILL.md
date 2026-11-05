---
name: playbook-design
description: Design and build any Playbook screen in the approved "V2 · Bento glass" look with good UX, then check it with screenshots before committing. Use for ANY Playbook UI/UX work, including a new screen, page, tab, sheet, modal, component, layout, redesign, restyle, colours, glass, bento grid, mobile or phone layout, form, list, table, filter, chart, KPI or stat tile, dashboard, empty state, loading or skeleton state, error message, toast, button, icon, logo, copy or label text, accessibility, "make it look better", "fix the UI", "it looks wrong on my phone", and any request starting with "Playbook:" that changes what users see.
---

# Playbook design workflow

Follow these steps in order every time a Playbook change touches what people
see. Do not skip steps, and do not start JSX before step 3.

Precedence when sources disagree: the owner's words, then root `CLAUDE.md` and
`src/playbook/CLAUDE.md`, then `src/playbook/DESIGN.md`, then the files in
`src/playbook/design/`.

## 1. Read the rules
- `src/playbook/DESIGN.md`, all of it: tokens (`PB.*`), type, backdrop,
  glass recipes, desktop bento, phone layout, motion, logo, checklist. The
  visual mock-ups (4 desktop pages, 9 phone screens) are in the design canvas
  linked at the top of DESIGN.md. Open it when you need to see a screen.
- `src/playbook/CLAUDE.md`: where code lives, the division boundary (the
  shared-layer list itself is in root `CLAUDE.md` "Divisions"), the scroll
  container and safe-area rules.

## 2. Read the parts of `src/playbook/design/` you need
| File | Read it when |
|---|---|
| `ux-process.md` | Always, before a new or redesigned screen, sheet or flow: the six questions, hierarchy, which container, navigation, taps, Undo vs confirm, automation UX |
| `layout-and-components.md` | Always, before writing components: `pbTheme.ts` recipes, spacing and type scales, page shells, bento recipes, which existing component to reuse, status mapping |
| `states-and-feedback.md` | Anything that loads, saves, talks to Shopify or the AI, or shows a status: skeletons, empty, errors, partial failure, toasts, progress |
| `mobile.md` | Every screen (all are used on phones): breakpoints, safe areas, thumb zone, tab bar, bottom sheets, keyboard, photos, low-end Android glass budget |
| `data-and-charts.md` | Any count, ₹ figure, percentage, date, KPI tile or chart: picking the form, palette, number and IST formatting |
| `copy-and-a11y.md` | Any label, message, button text or help text, and anything a person taps or tabs to, plus the contrast measurements behind the DESIGN.md token values |
| `review-checklist.md` | Always, before you commit: the checklist, the screenshot harness and the smoke-step format |

## 3. Design before code
Answer the six `ux-process.md` §1 questions in about five short lines:
who, where and when, device (phone first), the decision made here, the one
primary action, and what "done" looks like. Pick the container (sheet, full
page, inline edit, confirm) and the bento layout from `layout-and-components.md`.
If an answer is unknown, ask the owner one short, plain question. Do not
invent a feature or borrow one from DailyWork by guess. Put the answers in
the PR description.

## 4. Build with tokens and recipes
- Use `PB` tokens and recipes from `src/playbook/pbTheme.ts`. If that file does
  not exist yet, create it first from DESIGN.md §2 and the recipe list and
  CSS variables in `layout-and-components.md` §0.
- Reuse before building: `src/components/ui/` (`Empty`, `ConfirmModal` /
  `useConfirm`, `ActionSheet`, `Skeleton`, `Toggle`) and the existing Playbook
  components named in `layout-and-components.md` §5.
- Glass sits over the glow backdrop. One hero tile and one gradient button per
  view. Selected = frosted glass. Numbers in JetBrains Mono. Status = dot plus
  label. Clickables carry `pb-pill` / `pb-tile`.
- Root `CLAUDE.md` rules still apply: 44 px targets, 16 px inputs on phone,
  modals with `createPortal` + `modal-inner` + scroll lock + `useBackClose` +
  reset on close, `friendlyError` on every toast, two-signal async buttons,
  `<Empty>`, number inputs that block letters, `escHtml` in HTML templates.
  `page-pad`, `--nav-h` and the FAB do not apply to Playbook.

## 5. Design every state
For each component, build and look at: loading (skeletons shaped like the real
layout), filled, first-run empty, filtered empty with "Clear filters", load
error in the tile with Retry, partial failure, saving, success, and long or
odd content (long names, Hindi text, big ₹ values, every status).
`states-and-feedback.md` §14 lists the states per component type.

## 6. Verify with screenshots, then fix
- Run `npm run build`. It must pass.
- Follow `review-checklist.md` §3: render the screen in the `harness-pb/`
  harness (never commit it), shoot it at **390×844**, **360×740**,
  **1024×768** and **1440×900** for the filled, empty and long states, and
  read every PNG yourself.
- The audit must show no sideways scroll, nothing off the right edge, no
  target under 44 px on phone, no tiny text, no phone input under 16 px, and
  no page errors.
- Go through every box in `review-checklist.md` §2 and its "12 most common
  mistakes". Fix what fails and shoot again before you commit.

## 7. Report it in the PR
Add a "UI review" section to the PR description: the six answers from step 3,
the states you built, the screenshot sizes and states you checked, what the
audit and checklist caught and what you fixed, any shared-layer file you
touched and why, and any risk you are unsure of. After the Pages run is green,
give the owner 2–4 plain smoke steps on their phone and what "broken" looks
like (`review-checklist.md` §4).

## Never
- Never add a colour outside the `PB` tokens: no hex, no `rgba()` literals, no
  hex alpha suffix, no old `T.ac*` indigo on a redesigned screen.
- Never put a second primary (gradient) button in one view.
- Never ship a spinner-only or "Loading…"-only page. Draw the chrome and use
  skeletons.
- Never show status by colour alone. Always a dot plus a label.
- Never make an action hover-only or swipe-only. Every action has a visible
  button on touch, and hover effects sit in `@media (hover: hover)`.
- Never ship a touch target under 44 px.
- Never let a file grow past 200 lines. Split it first.
- Never put glass on a flat background, stack tiles on tiles, or leave a
  ragged bento row.
- Never ignore reduced motion. On phone, only `transform` and `opacity`
  animate. Desktop hover (inside `@media (hover:hover)`) may also ease
  `box-shadow`, `border-color` and `filter`, as in DESIGN.md §8.

## When the owner's request conflicts with DESIGN.md
Follow the owner. Update `src/playbook/DESIGN.md` (and the matching file in
`src/playbook/design/`, if one covers it) in the same PR, and say in the PR
description what changed and why, so the next screen follows the new rule.
