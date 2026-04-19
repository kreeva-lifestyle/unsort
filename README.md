# Handoff: DailyOffice UX Audit — Prioritized Fix List

## Overview
This handoff is a **UX audit** of the existing DailyOffice web app (Dashboard, Inventory, Brand Tags, PackStation, Cash Challan, CashBook, Settings/Auth). It contains **47 actionable issues** ranked by severity (P0 → P3) plus 5 "wins to keep," mapped to specific files and components in the current codebase.

This is not a redesign. It is a punch-list to be worked through in the existing React/TypeScript codebase.

## About the Design Files
The single file in this bundle — `Audit.html` — is a **browsable audit report**, not a design mock. It is meant to be read by humans (and Claude Code) as a reference document. There is nothing in it to "recreate in the codebase." Instead, each issue in the report points to a file + symptom + suggested fix in the existing app.

The target codebase is the DailyOffice app itself: React + TypeScript + Vite + Supabase, with design tokens centralised in `lib/theme.tsx`.

## Fidelity
**Audit / documentation.** Not hifi or lofi — it's a prioritized list of defects and improvements, each tied to a concrete file path. Severity and fix direction are opinionated; exact visual treatment for any given fix is up to the implementer (the report suggests a direction, not a pixel spec).

## How to Use This Audit

1. **Open `Audit.html` in a browser** — it has a table of contents, severity legend, and inline fix hints.
2. **Work the suggested sprint order** listed at the bottom of the report:
   1. Global `:focus-visible` + type-scale bump + `alert` → toast swap
   2. Break the Challan god-component (`CashChallan.tsx`) into per-dialog files
   3. Non-blocking duplicate feedback in PackStation (`PackTime.tsx`)
   4. Clickable Dashboard alerts (`pages/Dashboard.tsx`)
   5. Mobile nav — add "More" tab (`App.tsx`)
3. **Each issue tag tells you where to edit.** Tags in the report:
   - `file: <path>` — the file or symbol to touch
   - `fix: <direction>` — the suggested remediation
   - `Affects: <modules>` — for cross-cutting items

## Severity Scale
| Level | Meaning |
|---|---|
| **P0** | Blocks a core task or causes data loss. Fix this sprint. |
| **P1** | Hurts daily flow; measurable friction for operators. |
| **P2** | Inconsistency or minor friction. |
| **P3** | Polish / nice-to-have. |
| **Win** | Pattern working well — preserve it during cleanup. |

## Counts
- **6** P0 blockers
- **14** P1 high-impact
- **11** P2 medium
- **7** P3 polish
- **5** wins to keep

## Sections in the Report
1. **Cross-cutting** — patterns across every module (type scale, focus rings, glass morphism contrast, destructive confirms, inline styles, mobile nav, empty states, error copy)
2. **Dashboard** — Today's Pulse hierarchy, clickable alerts, revenue trend
3. **Inventory** — status audit trail, filter collapse, bulk actions, barcode consistency
4. **Brand Tags** — popup-blocked print flow, order-sheet partial import, toolbar wrap, modal grouping
5. **PackStation** — blocking duplicate modal, setup change trap, session summary, pending-write escalation
6. **Cash Challan** — 1056-line god-component split, keyboard row-add, return-flow hook-in
7. **CashBook** — PIN lockout, opening-balance audit, tab hierarchy
8. **Settings & Auth** — login error UX, role gating, sign-out colour, tab wrap
9. **Wins to keep** — optimistic scan feedback, real-time subs, lazy mount, hash routing, accent-dot mark

## Design Tokens Referenced
Most recommendations refer to tokens defined in `lib/theme.tsx`:
- Surfaces: `--bg #060810`, `--s #0B0F19`, `--s2 #0F1420`, `--s3 #141B2B`
- Borders: `--bd rgba(255,255,255,.05)`, `--bd2 rgba(255,255,255,.08)`
- Text: `--tx #E2E8F0`, `--tx2 #8896B0`, `--tx3 #4A5568` *(audit recommends bumping to `#6B7890` for contrast)*
- Accent: `--ac #6366F1`, `--ac2 #818CF8`
- Status: `--gr #34D399`, `--yl #FBBF24`, `--re #F87171`, `--bl #38BDF8`

Suggested cross-cutting changes:
- **Base type scale**: body 12→13px, labels 10→11px, demote `letter-spacing` from 2.5 to 1.5
- **Focus ring**: `:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px }`
- **tx3 contrast**: `#4A5568` → `#6B7890`

## Files in This Handoff
- `Audit.html` — the full audit report (self-contained, open in a browser)
- `README.md` — this document

## Suggested Workflow for Claude Code
1. Read `Audit.html` end to end to get oriented.
2. Start with the **cross-cutting P0s** (type scale, focus-visible, alert→toast). These are one-file changes in `lib/theme.tsx` + a new `<ToastUndo>` helper, and they raise baseline quality across every screen.
3. Then work **per-module P0/P1s** top-to-bottom. Each issue names its file.
4. When fixing the Challan god-component, split into `components/challan/ChallanForm.tsx`, `ChallanReturnFlow.tsx`, `ChallanLedger.tsx`, `ChallanAnalytics.tsx` — don't try to refactor in place.
5. Don't regress the 5 items in **Wins to keep**.
