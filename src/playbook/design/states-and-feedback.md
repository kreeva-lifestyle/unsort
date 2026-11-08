# Playbook states and feedback: design every state, not just the happy one

Use this when a Playbook component loads data, saves, talks to Shopify or the AI, or shows a status. Do this before you call it done.

Precedence: first the owner's words, then root `CLAUDE.md` and `src/playbook/CLAUDE.md`, then `src/playbook/DESIGN.md` (the look), then this file.
The look comes from DESIGN.md §2 and §5. Copy wording is in `copy-and-a11y.md`. Phone sheets and the keyboard are in `mobile.md`.
Chart reload is in `data-and-charts.md`. The final gate is in `review-checklist.md`.

## 1. First load: skeletons, never a whole-page spinner
- Draw the page chrome straight away: header, title, tab bar, filters and the primary button. Only the data area waits.
- Replace the plain `Loading…` text every current screen uses (e.g. `pages/Products.tsx`, `pages/ProductPage.tsx`) with skeleton tiles shaped exactly like the real layout:
  - Same bento spans and tile radii (DESIGN.md §5–6). Fill the first screen: 5 rows on phone, the full grid rows on desktop.
  - Phone list rows: a 64×80 radius-16 photo block, two text bars (60% and 35% wide), a dot, 96 tall (rows without a photo: min height 60).
  - The hero skeleton is a plain `PB.tile`. Do not show the gradient until the number arrives.
- Skeleton look: `PB.tile` + `PB.tileBd`, inner bars `PB.skelBar`, radius 8, the existing `shimmer` keyframe in `src/index.css` at 1.5 s. Add a `.pb-skel` class whose animation stops under `prefers-reduced-motion` (index.css has no such rule today).
- The shared `Skeleton` (`src/components/ui/Skeleton.tsx`) has rgba literals built in. Pass PB values through its `style` prop (spread last), or build `src/playbook/components/PbSkeleton.tsx`. Do not restyle the shared one unless the PR says so.
- Mark the waiting region `aria-busy="true"` and add an sr-only "Loading products".
- Time limit: if nothing has arrived after **15 s**, abort and show the error state (§4). `pbCall` (`data/pbFunctions.ts`) has no timeout today: pass an `AbortController` signal to its `fetch`; Supabase queries take `.abortSignal(signal)`.
- The 15 s abort applies to loading data only. Actions that start server work (read with AI, publish, regenerate, test connection, save) are never aborted: aborting shows "failed" while the server keeps working, and staff tap again and make duplicates. After 8 s show "Still working…", and let polling (§2) report the outcome.

## 2. Refreshing: keep what is on screen
- Never swap loaded content back to skeletons. Dim the stale block to `opacity: .6`, as `Products.tsx` already does, and turn the Refresh button into "Refreshing…" (§10).
- Keep the request-sequence counter that drops stale loads (Products and Vendors use one).
- Show freshness as `PB.tx3` meta in the tile head, for example "Updated 2 min ago", with IST times as in `mobile.md`.
- Statuses the server changes (reading, generating, publishing) must update without a manual reload:
  - While any visible item is busy, poll that item every 5 s. Stop when none are busy, pause while `document.hidden`, refetch once on `visibilitychange` and focus.
  - After 2 min in one stage, slow to every 30 s. Stop after 15 min and show "Taking longer than usual" with a Refresh button.
  - Put this in `src/playbook/hooks/`. `src/hooks/useActiveRefetch.ts` is not on the shared list, so do not import it.
  - Delete copy that tells staff to reload or "reopen in a minute" (for example in `ListingEditor.tsx`) once polling covers it.

## 3. Empty: three different empties
Use `<Empty>` from `src/components/ui/Empty.tsx`, placed inside a `PB.tile`. Before a redesigned screen uses it, add an optional `ink` prop `{ accent, title, body }` defaulting to today's `T` values (its message is `T.tx3` today); Playbook passes `PB.brandA`, `PB.tx`, `PB.tx2`. This is a shared change: say so in the PR.

| Kind | When | Content |
|---|---|---|
| First run | No rows and no filter is active | It teaches what will appear and offers one CTA: "No products yet. Add photos, a price and the websites it goes to." with the button "Add product" |
| Filtered | No rows and a search or filter is active | "No products match 'banarasi' on Store X", with a secondary "Clear filters" button that also resets the page to 0 |
| All clear | The queue was emptied by work done | A dot in `PB.live` with the label "Nothing is waiting" (on a plain tile; on the hero use `PB.onBrand` text only, no status colour on the gradient). No CTA. This is a success, not an empty |

- **A failed load is never an empty state.** Today `Products.tsx`, `Websites.tsx` and `Vendors.tsx` fall through to "No … yet" after an error, the Dashboard shows nothing, and `PbSettings` stays on "Loading settings…". Keep a separate `loadErr` state and check it before `rows.length === 0`.

## 4. Errors: in the tile that failed
- **The tile failed, the page did not.**
  - Load tiles independently (`Promise.allSettled`), so one bad query leaves the others working.
  - The failed tile becomes the failed tinted tile (DESIGN.md §2) and shows:
    - a `PB.failed` dot with the label "Could not load"
    - the `friendlyError(err)` sentence in `PB.tx`
    - a 44 px secondary "Try again" button that reloads only that tile
- **Use a whole-page error only when nothing loaded:** one `PB.tile` in the content area with the title "Could not open Products", the friendlyError sentence and a primary "Try again". Keep the header and tab bar so staff can go elsewhere. Copy the existing `loadErr` branch in `ProductPage.tsx`.
- **Save errors:** an inline box above the buttons (root CLAUDE.md, Modals) in the failed tint. Keep every field the person typed. When the server names a field, set `aria-invalid`, give it a `PB.failed` border with the message under it, then focus it and scroll it into view inside the sheet.
- **Wording:** every message goes through `friendlyError`, even `pbCall` errors that are already plain sentences; a raw `error.message` never reaches the screen. State the next step: Try again, Fix the price, Reconnect the website.
- An expired session shows "Your session expired. Please sign in again." (`friendlyError`), or pbCall's "Sign in again to continue". Do not show a retry loop.

## 5. Partial failure: some websites worked
- Keep the existing warning pattern: `read_product` and `route_product` may answer ok with a `warning`, and `ProductPage.tsx` then toasts `"<done>, but: <warning>"` as an **error**. Never show a success toast when any part failed.
- Publishing to N websites shows one result line per website on the product page:
  - Live rows: a `PB.live` dot, "Live on Store A", and a real `<a target="_blank" rel="noopener">` to the listing.
  - Failed rows: on the failed tinted tile, the plain reason, and a "Try again" for **that website only**.
  - Above the rows, a summary in mono figures: "Published to 2 of 3 websites · 1 failed".
- Bulk results: a summary toast or banner, "18 published, 2 failed · View", where "View" applies a failed-only filter. A bulk action never fails silently or reports only the successes.

## 6. Offline and slow network
- Playbook has no offline indicator. The shared `OfflineBar` is mounted in DailyWork's tree in `App.tsx`, which is hidden while Playbook is open.
  - Build a Playbook banner (§11) on the `online` / `offline` events: "You're offline. Nothing will save until you're back." While offline, disable save buttons and show that reason next to them.
- Slow requests: up to 8 s show the busy label only; after 8 s add a `PB.tx2` line under the button, "Still working, the network is slow." A data load aborts at 15 s and shows the error state with Try again; an action that started server work is never aborted (§1).
- Only say "will retry" if a queue really retries the write. Playbook has none today, so say plainly that it did not save, and keep the input.
- Retrying must not create duplicates. `AddProductModal` keeps one set id per form for this, so reuse that idea for any create.
- Long forms keep a localStorage draft, with every read and write wrapped in `try/catch`. Website drafts already survive device Back.

## 7. Permission denied
- `friendlyError` maps code 42501 and RLS errors to "You don't have permission to do that. Ask an admin if you need access." Show it inline where it happened, not as a page-wide error.
- RLS filters SELECTs silently, so someone without access sees **zero rows, not an error**. If a screen or action is admin-only, check the role up front and show an "Only admins can change website settings" tile instead of an empty state.
- Hide actions the person can never take. Disable actions blocked only for now (generating, publishing, offline) with the reason in text, like the existing listing lock "Being written right now — editing is off." Never a greyed-out button with no reason.

## 8. Long and odd content

| Case | Do |
|---|---|
| Long name (often Hindi and English mixed) | Lists clamp to 2 lines (`-webkit-line-clamp: 2`). Colour and variant go on their own meta line. Detail pages show the full name. Use `min-width: 0` and `overflow-wrap: anywhere`, never a fixed height, line-height ≥ 1.5 |
| Missing photo | Keep the 64×80 box on `PB.tile` with an `aria-hidden` icon and the sr-only text "No photo". On the product page, flag "Add photos". The product cannot publish without them |
| Missing price | Write "No price" with a `PB.review` dot. Never show "₹0", which blocks publishing |
| Zero | Show `0` in mono. Never leave a blank or a dash for a real zero |
| Unknown or not set | Show "—" with the sr-only text "Not set" |
| Huge numbers | `en-IN` grouping (`rupee` / `rupeeExact` in `src/playbook/format.ts`, `data-and-charts.md` §7) gives ₹1,23,45,678, in mono with `tabular-nums`. If it does not fit, let the tile grow. Never truncate a figure |
| Long SKU, handle, domain or tag | Mono with `overflow-wrap: anywhere`. Tags wrap as chips and are never cut |
| Long Shopify or AI error text | Clamp to 3 lines with a "Show more" button. Full text on tap |
| Many photos (up to 20) | Use the horizontal strip, with the first photo as cover. The page itself never scrolls sideways at 390 px |

## 9. Optimistic updates and rollback
- **Optimistic, for cheap and reversible changes** (on/off toggles, rule enable, rule reorder, archive with Undo): show the change at once, lock the control until the save settles, roll back on error:
```ts
const prev = rules;
setRules(next);                                   // the person sees it now
try { await saveRules(next); }
catch (e) { setRules(prev); addToast(friendlyError(e), 'error'); }
```
- **Never optimistic for server- or Shopify-driven work** (publish, AI read, regenerate, remove from Shopify): show the busy status (§12) and show Live only once the server says so.
- Undo vs confirm is decided in `ux-process.md`. Undo uses `UndoBar` for 6–8 s (§11); a confirm goes through `useConfirm` and names the item and its effect on Shopify.

## 10. Async buttons: two signals, always
This rule comes from root CLAUDE.md, Buttons. Playbook keeps **one `busy` key per screen**, like the `act()` helper in `ProductPage.tsx`:
- **Start:** the label becomes the verb in progress; every action button on the screen gets `pointerEvents: 'none'` and `opacity: .5`; the pressed one gets `aria-busy="true"` and a `min-width` so it does not jump.
- **End:** a `success` toast that repeats the verb, or `addToast(friendlyError(e), 'error')`, then `finally { setBusy(null) }`.
- Labels: Save → "Saving…", Publish now → "Publishing…", Read again with AI → "Reading…", Remove → "Removing…", Test connection → "Testing…", Run now → "Running…", Move up and Move down → "Moving…".
  - The rule move buttons in `RoutingSection.tsx` only fade today, with no "Moving…" label.
- Text-only signals, no spinner on the whole page. A 14 px inline ring inside a button is allowed only when the label cannot change (icon-only buttons).

## 11. Toasts, inline messages, or banners

| Channel | Use for | Do not use for | V2 look |
|---|---|---|---|
| Toast (`usePbToasts`) | The result of an action just taken: "Published to 3 websites" | Undo, load errors, form validation, lasting states, every small tap | The `pbSheet` recipe (`PB.sheet`, `blur(30px)`, DESIGN.md §7), radius 16, a status dot plus text, at most 4 at once. Desktop: top right inside the safe area. Phone: above the tab bar (`bottom: calc(var(--pb-bar) + env(safe-area-inset-bottom) + 8px + var(--pb-kb))`, the `.pb-toasts` rule), so it never covers the header's back button or its one action and sits in thumb reach to dismiss (changed 2026-11-07 after the phone audit). The same message is never shown twice at once. Success 4 s, error 7 s. Tap to dismiss |
| Inline | One field, row or tile: validation, a load failure, a lock reason | Anything page-wide | Tinted tile or field border plus a sentence. Stays until fixed |
| Banner | A page-wide state that lasts: automation paused, offline, website disconnected | One-off results | A full-width review or failed tinted tile at the top of the content, with a dot, one sentence and one action ("Turn on"). It cannot be dismissed while the state lasts |

- A load failure that already shows in its tile with Retry sends no toast as well (Dashboard, Products, Websites, Vendors, Settings): the toast would only cover the header.
- **Undo** always uses `UndoBar` at `bottom: calc(var(--pb-bar) + env(safe-area-inset-bottom) + 8px)` (in the thumb zone), shown 6–8 s. Toasts never carry Undo.
- When `PbToasts.tsx` is redesigned: replace its `T.*` colours and `rgba` shadow literal, and render error toasts with `role="alert"` (today one `role="status"` container holds all). Never move focus to a toast.

## 12. Long automation runs: progress per item
- Every product and listing shows its stage as a dot plus a label, plus the time spent in mono:

| Stage | Dot | Label |
|---|---|---|
| Reading | `PB.busy` | Reading · 12 s |
| Writing (generating) | `PB.busy` | Writing |
| Publishing | `PB.busy` | Publishing |
| Waiting | `PB.review` on the tinted tile | Needs info / Needs review |
| Live | `PB.live` | Published |
| Failed | `PB.failed` on the tinted tile | Failed |
| Queued, Removed | `PB.tx3` | Queued, Removed |

  - `status.tsx` paints reading and generating in `T.ac2` today. Move them to `PB.busy` in the redesign.
- Busy dots pulse (`.pb-pulse`, opacity 1 → .5, 1.6 s, DESIGN.md §8). Under reduced motion they do not pulse. Nothing spins.
- **Publishing to 3 stores:** heading "Publishing to 3 websites · 1 of 3 done" (mono counts), one row per website with its own stage, and a segmented bar with 2 px gaps, each segment in that website's status colour.
- AI reading has no real percentage: show the stage and elapsed time, never a fake progress bar.
- The work runs on the server. Say "You can leave this page. It keeps going." Polling (§2) picks up the result; announce each finished stage in a polite live region ("Published to Store A").
- After 2 min in one stage, add "Taking longer than usual" in `PB.tx2` and slow polling to 30 s; after 15 min stop polling and show a Refresh button (§2). Offer Retry only if that pb-products action is safe to repeat; check the edge function first.
- The Settings "Run now" ends with result tiles plus a summary: "Run finished: 12 sent, 1 failed · View".

## 13. Success moments: quiet
- The toast repeats the button ("Saved facts", "Published to 3 websites") and the status dot moves to `PB.live`.
- The changed row shows a `PB.live` ring at 40% alpha (a `::after` border) that fades in and out once with `opacity` over 0.6 s. Skip this under reduced motion.
- After a create, open the new item or highlight its row. Focus stays where the person was.
- Never use confetti, bouncing checkmarks, sounds, or a "Success!" modal.
- The all-clear "Nothing is waiting" tile (§3) is the biggest celebration Playbook gets.

## 14. State checklist by component type
Every cell must be designed, or marked n/a in the PR. "Tile err" means the inline error from §4.

| Component | First load | Refresh | Empty | Error | Busy / locked | Odd content |
|---|---|---|---|---|---|---|
| Page (list) | Skeleton rows or grid | Dim .6 plus "Updated…" | First-run vs filtered | Whole-page error only if nothing loaded | n/a | Pager keeps the page after Back |
| Bento or KPI tile | Skeleton tile at the same span | Number stays and updates in place | Shows 0, not hidden | Tile err plus Try again | n/a | Huge en-IN figure, tile grows |
| Hero tile | Plain `PB.tile` skeleton | Same | "Nothing is waiting" on `pbHero`, text `PB.onBrand`, no status colour on the gradient | Tile err, gradient dropped | n/a | Label plus number for screen readers |
| List row | 64×80 block and bars | Row stays | n/a | Row-level failed tint | Busy dot plus stage | 2-line clamp, no photo, no price |
| Form or sheet | Fields disabled with skeleton values | n/a | Sensible defaults | Inline box plus field error, input kept | One busy key, "Saving…" | Long text wraps, counters |
| Button | n/a | n/a | n/a | Error toast | Two signals, reason if disabled | Label wraps, no clipping |
| Toggle or segment | Disabled skeleton | n/a | n/a | Roll back plus toast | Locked while saving | n/a |
| Photo or thumbnail | `PB.tile` box with fixed size | n/a | "No photo" placeholder | Broken image falls back to the placeholder | Upload progress per photo plus retry | HEIC, portrait or landscape crop |
| Automation or listing row | Skeleton | Polls while busy | "Not sent to any website yet" | Failed tint, reason, retry for that row | Stage plus time | Long Shopify error clamped |
| Chart | See `data-and-charts.md` | Old chart at lower opacity | Says why it is empty | Tile err | n/a | Table toggle |
| Banner | n/a | Leaves when the state clears | n/a | n/a | n/a | Wraps on 390 px |
