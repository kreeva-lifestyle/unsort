# Playbook UX process: design the screen before you code it

Use this when you are about to build or redesign any Playbook screen, sheet or feature, before the first line of JSX.

Precedence: the owner's words, then `src/playbook/CLAUDE.md` and root `CLAUDE.md`, then `src/playbook/DESIGN.md`
(the look), then this file. Look and recipes live in DESIGN.md; tile sizes and components in
`layout-and-components.md`; loading/empty/error states in `states-and-feedback.md`; phone specifics in
`mobile.md`; charts in `data-and-charts.md`; words and accessibility in `copy-and-a11y.md`; the final
gate in `review-checklist.md`.

## 1. Answer six questions first
`src/playbook/CLAUDE.md` says: ask the owner what a Playbook screen should do before building it. Do not
borrow a DailyWork feature by guess. Then write these six answers in the PR description:
1. **Who** uses it (staff adding products, the owner reviewing, whoever fixes failures)?
2. **Where and when** (shop floor, between customers, end of day, at a desk)?
3. **Device**: phone first (iPhone and mid/low-end Android at 390 px), desktop second.
4. **Decision**: what do they decide on this screen (publish or not, fix this price, pick a website)?
5. **One primary action**: the single button that ends the job. If you name two, the screen does two
   jobs. Split it.
6. **Done looks like**: what they see when the job is finished (a toast, a status turning to Live, an
   empty "Nothing is waiting" tile).

If an answer is unknown, ask the owner one short question. Do not fill the gap with invention.

## 2. Information hierarchy
- Summary before detail: count or state at the top, the list below, one item's detail on its own page.
- One point of focus per view. A view may have one hero and one gradient button, but never next to each other:
  the hero sits at the top of the content, the gradient button in the header or the bottom thumb zone.
  One-tap row actions (Approve, Retry) are always secondary, never gradient.
- Three text levels only: `PB.tx` content, `PB.tx2` support and helper text. `PB.tx3` is only for
  chevrons, icons, placeholders and timestamps. Use size and weight before colour.
- Order tiles by how often they are used, not by how the database is shaped. What needs action
  (Needs review, Failed) comes before what is fine.
- Name things the way staff do: Products, Websites, Vendors, saree, lehenga, kurta set. Not "listing
  entity" or "store config".

## 3. Progressive disclosure
- Show the 3 to 5 fields that matter on every use. Put the rest under a "More details" toggle.
- Setup lives in Website settings (`components/website/*Section.tsx`), never in the daily flow.
  The Add product flow never asks for SEO, handle or tag templates.
- Show AI output as a readable summary first ("What the AI read"); editing is one tap away.
- Hide an action that cannot apply. If it is visible but unavailable, say why next to it
  ("Publishing is paused in Settings"). A disabled button with no reason is a bug.

## 4. Pick the container
| Job | Container |
|---|---|
| Short task, 6 fields or fewer, one decision, page behind gives context | Bottom sheet on phone, `PbModal` on desktop |
| Long form, several steps, product detail, has its own back history | Full page, opened in place (see §5) |
| Confirm an irreversible or external action | `useConfirm()` + `ConfirmModal` (shared) |
| Change one value in a row (price, on/off) | Inline edit in the row, saved on blur or Enter |
| Rare action on one item | Header action on desktop, `ActionSheet` (shared) on phone |

- Sheets: build, footer and behaviour per `mobile.md` §6 (never a sheet on a sheet; one primary in the
  footer; destructive actions live in the page's `…` menu). Desktop modal: DESIGN.md §6.

## 5. Navigation placement
- Phone has four tabs only: Home, Products, Websites, More (DESIGN.md §7). Desktop shows the six
  destinations (Dashboard, Products, Websites, Vendors, Settings, Guide) as top-bar pills (DESIGN.md §6),
  so there is no desktop More page. Do not add a fifth tab or a seventh pill; ask the owner.
- Daily work belongs under Products or Websites. Occasional tools (Vendors, Settings, Guide, new
  reports) go under More.
- Detail views open in place inside their page and close with device Back via `useBackClose`, the
  way `pages/Products.tsx` opens `ProductPage`. The current page is kept in localStorage `pb-page`
  (`PlaybookApp.tsx`), not the URL hash. Follow that, do not add a router.
- Back button: one style everywhere (`layout-and-components.md` §3).
- Header action: at most one (a 44 px `+` or "Save"), for things done about once per visit.
  Frequent actions go at the bottom of the screen or in the row itself.

## 6. Defaults that remove decisions
- Pre-fill: last-used vendor and website, last category, today's date in IST, price from the
  website's pricing formula (`PricingSection`) applied to the vendor cost.
- "Let the AI decide" is a valid default for category (`AddProductModal`). Keep it.
- Remember the person's last filter and per-page choice in localStorage, wrapped in try/catch.
- Never default anything that publishes, spends money or removes data. Those are always explicit.

## 7. Count the taps
- Write down the taps for the most common job before and after your design. Cut it to the minimum.
- Common one-tap actions (Approve, Retry, Open on Shopify) live in the list row or card, not two
  screens deep.
- Enter submits a form. When a sheet opens, focus follows `mobile.md` §6: the first field only if typing
  comes first, otherwise the sheet title.
- Do not add a review step the person has to tap through every time. Show the preview inline.

## 8. Undo or confirm
- **Reversible and internal** (archive, hide, restore, remove a filter): do it at once, then show the
  shared `UndoBar` (`src/components/ui/`) with Undo for 6 to 8 s. Toasts never carry Undo.
- **Irreversible or external** (remove from Shopify, unpublish a live product, change a live price on
  several websites, delete a website): `useConfirm()` with the item and the effect named:
  "Remove 'Banarasi silk saree' from 3 websites? It disappears from those stores now."
- A single-item edit made in a sheet whose button names the effect ("Update price on Store A") needs
  no second confirm. Removing or unpublishing always does.
- Use `danger: true` for destructive confirms. Type-to-confirm only for bulk destructive actions on
  more than about 10 items.
- Existing screens confirm Archive today (`ProductPage.tsx`). Do not change that unless the owner asks.

## 9. Bulk actions
- A "Select" button enters select mode. Rows get 44 px checkboxes. A sticky bar at the bottom (above
  the tab bar on phone) shows "12 selected" and the actions. Esc or Back leaves select mode.
- Run bulk work server-side (edge function or RPC), never a client loop of single writes
  (root CLAUDE.md: multi-table writes go through RPCs).
- Report the result as a summary: "18 published, 2 failed · View". The link filters the list to the
  failures with their reasons. A bulk action never fails silently or partly without saying which.
- Bulk retry must be safe to repeat: it never creates a duplicate listing.

## 10. Search, filter, sort
- Search sits at the top, server-side, debounced. `pages/Products.tsx` waits 300 ms and searches
  name, SKU and the pasted details (`data/products.ts`). Match that on new lists.
- Drop stale responses with a request sequence counter, as `Products.tsx` does.
- Filters are chips (DESIGN.md §7: 40 px, edge to edge on phone), with counts where cheap.
  Show "Clear" whenever any filter is active. Reset to page 1 on any search or filter change.
- Two different empty states: first-run (teaches, one action) and filtered ("No products match
  'banarasi'", with Clear filters). Both use shared `<Empty>`. Details in `states-and-feedback.md`.
- Default sort: newest first (Products uses `created_at desc`). Say the sort in the UI when a list
  offers more than one.

## 11. Pagination
- Staff lists page with the root pattern: Prev / "1 / N" / Next, 25 per page (`PAGE_SIZE` in
  `data/products.ts`, `Pager.tsx`), or "Load more" with "Showing 25 of 312". No infinite scroll:
  staff need to find their place and reach the end.
- Count with `{ count: 'exact', head: true }` and fetch only the columns shown (root database rules).
- Going back from a detail page keeps page number, filters and scroll position.
- If a delete empties the last page, step back one page (as `pages/Vendors.tsx` does).

## 12. Automation UX (Product Directory to Shopify)
The pipeline: product added, AI reads it (`reading`), it may need info (`needs_info`), listings are
written per website (`generating`), wait for review (`review`) when the website's mode says so, then
publish (`publishing`), then `published` or `failed`. Every screen that touches it follows four rules.

**Before: show what it will do.** Preview per website before anything goes live: title, ₹ price after
the pricing formula, tags, cover photo, and whether it goes live, as draft, or waits for review
(`MODE_LABEL` in `WebsiteCard.tsx`). Never auto-publish with a ₹0 price, no photos or no sizes; stop
at `needs_info` and say which field is missing.

**During: show where it is.** Each product and listing shows its state as dot plus label (status tables
in `components/product/status.tsx`; colours `PB.busy`, `PB.review`, `PB.live`, `PB.failed`). Show how
long a busy state has run ("Writing · 2 min"). While a listing is generating or publishing, its edit
controls are blocked with the reason shown (current behaviour). Server-driven states refresh themselves
(poll or refetch on focus); never tell staff to "reload" without giving them a button.

**After: show what it did and why.** Each change gets a line with IST time and who acted:
"Published to Store A by Automation, 2:14 PM". Each live listing links to Shopify with a real
`<a target="_blank" rel="noopener">` (`shopifyAdminUrl` in `data/pbFunctions.ts`), never `window.open`.
A failure says the reason in plain words, what to do, and has a Retry button. Never a raw API error.

**Override: staff always win.** Any field the AI filled is editable. A field staff edit is kept
(`locked`, shown as the "Kept" badge; lower-case "kept" in `ProductFacts.tsx` today, fix it when touched) and the AI never overwrites it.
Flag fields the AI is unsure about as "Check this". Automation can be paused (Settings, the
dashboard banner); a paused state is visible on every screen it affects.

**Never** a silent auto-action. If automation changes something the person did not ask for, it shows
up on the product's activity and on the dashboard.

## 13. Worked example: a "Price check" screen
1. **Ask**: owner confirms the job: "find products whose price on a website looks wrong before
   customers see it".
2. **Six answers**: owner or senior staff · end of day · phone · decide fix or accept · primary action
   "Fix price" · done = list shows "All prices look right".
3. **Place**: occasional tool, so under More on phone. Desktop has six top-bar pills (DESIGN.md §6); a
   seventh only if the owner agrees, so ask.
4. **Hierarchy**: hero tile "6 prices to check" (mono count). Below, one glass row per listing: photo,
   name (2 lines), website, current ₹ vs formula ₹ in mono, reason ("below cost").
5. **Filters**: chips Website · Below cost · Far above formula, with Clear. 25 per page, Prev / Next.
6. **Fix**: tapping a row opens a bottom sheet with one price field pre-filled from the formula and a
   live "₹ margin" line. Primary button "Update price on Store A".
7. **Confirm or undo**: the product is live, so the change is external. The sheet's button text is the
   confirmation; a second confirm only if the new price is below cost.
8. **Feedback**: "Updating…" on the button, then "Price updated on Store A", row leaves the list,
   price becomes kept so the AI will not change it back.
9. **Accept**: "Price is right" in the row hides it from this list (reversible, so `UndoBar`).
10. **States and gate**: skeleton rows, error tile with Retry, first-run empty state; then run
    `review-checklist.md`.
