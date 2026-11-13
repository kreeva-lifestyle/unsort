# Playbook division — project rules

**When this file applies:** the owner starts a request with **`Playbook:`**
(e.g. "Playbook: add a targets page"). Only then work here; requests with no
prefix or `DailyWork:` are for DailyWork and must not touch `src/playbook/`.

Playbook is the second division of DailyOffice (owner, 2026-11-04). It is
picked on the login screen (`src/lib/division.ts`) and runs its own shell,
`PlaybookApp.tsx`, instead of DailyWork's sidebar and tabs. Its features and
dashboard are still to be decided by the owner: **ask what a Playbook screen
should do before building it — do not borrow DailyWork features by guess.**

The root `CLAUDE.md` is DailyWork's rulebook. From it, these apply here
unchanged: the auto-deploy flow (commit → PR → squash merge → wait for the
Pages run → smoke steps), the mandatory pre-merge self-review, engineering
ethics, database sustainability, token discipline (no hex, no hex alpha
suffix, OKLCH tokens only), the modal mechanics (createPortal, `modal-inner`,
scroll lock, reset on close), the two-signal async buttons, 44 px targets,
16 px phone inputs and the table rules. Colour, size and radius values for new
or redesigned screens come from `src/playbook/DESIGN.md` (PB tokens), not from
`T`/`S`. Also the patterns to preserve (friendlyError on every toast, RPCs for
multi-table writes, escHtml/csvCell, no `select('*')` on growing tables).

Layout rules that do NOT carry over (they assume DailyWork's sidebar and
bottom nav): `page-pad`, `--nav-h`, the FAB, "desktop Add buttons hidden on
mobile". Playbook instead:
- scrolls inside its own container (`PlaybookApp` root: `height: 100%;
  overflow-y: auto`) — `#root` is a fixed, non-scrolling frame;
- pads with the safe-area insets (`max(16px, env(safe-area-inset-*))`);
- keeps actions visible in its header or on the page (never a FAB).

## Where Playbook code lives
- Everything Playbook goes under `src/playbook/`:
  - `PlaybookApp.tsx` — the shell (header, division switch, logout, `PbNav`,
    toasts). Keep it thin.
  - `PlaybookDashboard.tsx` — the home page.
  - New pages: `src/playbook/pages/`; components: `src/playbook/components/`;
    data access: `src/playbook/data/` (one file per area); hooks:
    `src/playbook/hooks/`.
- Keep files under 200 lines; split before they grow past it.
- Navigation inside Playbook is its own: do not add Playbook pages to
  DailyWork's `src/lib/tabs.ts`, `Sidebar.tsx` or `miniRegistry.ts`.

## Boundaries with DailyWork
- Playbook may use the shared layer — the list in the root `CLAUDE.md`
  "Divisions" section is the one canonical list.
- Playbook must NOT import from DailyWork feature folders
  (`src/pages/*`, `src/components/{challan,jobwork,inventory,minis,…}`), and
  DailyWork must not import from `src/playbook/`. If both need something, move
  it to the shared layer in its own reviewed change.
- `App.tsx` only routes to `PlaybookApp` (lazy). Do not put Playbook code in it.
- While Playbook is open, DailyWork stays mounted but hidden (so open work
  survives a switch); its global shortcuts are switched off. If it fails to
  load or crashes, `PlaybookUnavailable` (src/components/brand/DivisionFallback.tsx)
  offers "Back to DailyWork" — keep that escape hatch working.

## Database
- Playbook tables are prefixed **`pb_`** (e.g. `pb_plays`), RPCs `pb_…`,
  storage buckets `playbook-…`, migrations named `…_pb_<what>.sql`, so the
  two divisions' data never mix and can be told apart at a glance.
- Every new table: RLS on in the same migration, at least one policy, staff
  gate with `(select public.app_is_staff())` unless the owner says otherwise.
  Put the interfaces in `src/playbook/types.ts` (not `src/types/database.ts`,
  which is grandfathered and must not grow).
- Reading DailyWork data (e.g. sales for a dashboard) goes through a view or
  RPC built for Playbook, never by writing to DailyWork tables.
- `npm run build` does not type-check edge functions. Before merging a change
  under `supabase/functions/pb-*`, run `npm run check:server` (TypeScript over
  the three functions, set up in `supabase/functions/_check/`) and
  `npm run test:server` (their unit tests) — a missing import there is a
  runtime 500. The deploy workflow runs both before the build. A merge does
  not deploy the functions: see `docs/playbook/DEPLOY.md`.
- Rules that live in the database (which product is a copy, what the Ready
  gate holds, what a bulk change may take back) are tried on a throwaway
  PostgreSQL, never the live one: `bash supabase/tests/sql/run.sh`. It ends
  with status 1 when a check in `t_dups.sql` fails. The workflow **Playbook
  SQL tests** runs it on every change under `supabase/migrations/`,
  `supabase/tests/sql/` or `docs/playbook/sql-to-run/`. Changing one of those
  functions: add the case to the test in the same PR, and add a new migration
  it needs to the list in `run.sh`.

## Design — load the `playbook-design` skill before any Playbook UI work
- The skill (`.claude/skills/playbook-design/SKILL.md`) has you read
  `src/playbook/DESIGN.md` and the guides in `src/playbook/design/` before
  writing UI, and ends with the review checklist and screenshots.
- The owner approved the **"V2 · Bento glass"** look (2026-11-05): dark
  backdrop with soft glows, frosted-glass tiles on a 12-column bento grid,
  frosted-glass selected states, a 4-tab glass bar on phone, and slow hover
  motion. `DESIGN.md` holds the tokens, recipes, layouts, logo and a
  checklist, plus a link to the mock-ups. Every new or redesigned Playbook
  screen follows it. Put its values in a Playbook token file rather than
  inline literals.
- Every existing screen is on V2 (owner, 2026-11-05: "Build playbook V2
  design"). Tokens and recipes: `src/playbook/pbTheme.ts`; primitives:
  `src/playbook/components/ui/` (`PbTile`, `PbButton`, `PbRow`, `PbConfirm`,
  `PbPageHeader`…) and `components/product/PbModal.tsx` (with `footer` and
  `dirty`, which guards scrim tap / swipe and asks "Discard changes?" on ×,
  Back or Escape); CSS: the
  "Playbook V2" block at the end of `src/index.css` (pb- classes only).

## Brand
- Logo: `PlaybookMark` / `DivisionLogo division="playbook"` from
  `src/components/brand/DivisionLogos.tsx` — the "bento P" (DESIGN.md §9):
  white blocks forming a P with a play button in its bowl, on the amber→coral
  brand gradient (`PB.brandA` → `PB.brandB`, mirrored as literals there
  because shared code must not import from `src/playbook/`).
- Playbook's accent is that warm gradient; DailyWork keeps indigo→sky. Use
  tokens only, never hex.
- Page titles: `<Page> · Playbook · DailyOffice`.
