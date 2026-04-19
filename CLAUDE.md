# Project rules for Unsort

## File layout
- Modular structure — DO NOT put new code in App.tsx
- New components: `src/components/[feature]/`
- New pages: `src/pages/`
- Shared UI helpers: `src/components/ui/` (e.g. `Empty`, `BarcodeScanner`)
- Cash Challan sub-views: `src/components/challan/` (`ChallanAnalytics`, `ChallanLedger`, `ChallanForm` — main `CashChallan.tsx` owns data + list view only)
- Settings sub-pages: `src/components/settings/`
- Layout chrome: `src/components/layout/` (`Sidebar`, `Header`, `ToastContainer`)
- Types: `src/types/database.ts`
- Theme constants + recipes: `src/lib/theme.tsx` (exports `T`, `S`, `Icon`)
- Supabase client: `src/lib/supabase.ts`
- User-facing error copy: `src/lib/friendlyError.ts` — wrap every `error.message` you're about to `addToast` / `setError`

## Reading conventions
- Read only the specific file you need — never read all of App.tsx
- Keep every file under 200 lines (CashChallan.tsx is grandfathered — split further when touching it)
- Schema reference: UNSORT-CLAUDE-CODE-CONTEXT.md (read this instead of App.tsx for DB info)

## Patterns to preserve
- Every Supabase error → `addToast(friendlyError(err), 'error')`. Never surface raw `error.message`.
- Atomic multi-table writes go through SECURITY INVOKER RPCs
  (`delete_inventory_item_cascade`, `complete_inventory_pair`,
  `revert_inventory_pair`, `complete_item_with_extra`). Don't replace
  them with multiple chained `.then()` calls.
- Own-user cash PIN read: `supabase.rpc('get_own_pin')` only.
  Column-level SELECT on `profiles.cash_pin` is revoked for
  `authenticated` and `anon`.
- Empty states: use `<Empty>` from `src/components/ui/Empty.tsx` with
  icon + title + message + optional CTA.
- Destructive ops: use an in-app confirm modal, not `window.confirm()`.
- HTML print/PDF: interpolated values must go through `escHtml` /
  `esc` helpers already present in `CashChallan.tsx`, `CashBook.tsx`,
  `BrandTagPrinter.tsx`.
