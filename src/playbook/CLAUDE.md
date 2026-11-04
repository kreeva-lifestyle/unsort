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
ethics, database sustainability, theme tokens, inputs/buttons/modals/tables,
and the patterns to preserve (friendlyError on every toast, RPCs for
multi-table writes, escHtml/csvCell, no `select('*')` on growing tables).

Layout rules that do NOT carry over (they assume DailyWork's sidebar and
bottom nav): `page-pad`, `--nav-h`, the FAB, "desktop Add buttons hidden on
mobile". Playbook instead:
- scrolls inside its own container (`PlaybookApp` root: `height: 100%;
  overflow-y: auto`) — `#root` is a fixed, non-scrolling frame;
- pads with the safe-area insets (`max(16px, env(safe-area-inset-*))`);
- keeps actions visible in its header or on the page (no FAB until Playbook
  has its own navigation).

## Where Playbook code lives
- Everything Playbook goes under `src/playbook/`:
  - `PlaybookApp.tsx` — the shell (header, division switch, logout) and,
    later, Playbook's own navigation. Keep it thin.
  - `PlaybookDashboard.tsx` — the home page (a placeholder today).
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

## Brand
- Logo: `PlaybookMark` / `DivisionLogo division="playbook"` from
  `src/components/brand/DivisionLogos.tsx` — an open book whose spine is a
  play button, on a yellow→red gradient (`T.yl` → `T.re`).
- Playbook's accent is that warm gradient; DailyWork keeps indigo→sky. Use
  theme tokens only, never hex.
- Page titles: `<Page> · Playbook · DailyOffice`.
