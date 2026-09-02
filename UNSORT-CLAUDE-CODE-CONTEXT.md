# DailyOffice — project overview for Claude Code

The repo and domain are still called `unsort` (the original damaged-stock
tracker); the product is now **DailyOffice**, the back-office app for
Arya Designs (ethnic wear). Rules live in `CLAUDE.md`; this file is the map.

- **Live:** https://dailyoffice.aryadesigns.co.in (GitHub Pages, deployed from `main` by `.github/workflows/deploy.yml`)
- **Repo:** https://github.com/kreeva-lifestyle/unsort
- **Stack:** React 18 + TypeScript + Vite, Supabase (Postgres, Auth, Realtime, Edge Functions), installed as a PWA on the owner's iPhone (393px is the primary viewport)
- **Supabase project:** `ulphprdnswznfztawbvg` (Mumbai). The anon key lives in `src/lib/supabase.ts` only.

## Modules (bottom nav + "More" drawer)
| Tab | Page | Notes |
|---|---|---|
| Dashboard | `src/pages/Dashboard.tsx` | revenue hero, KPI grid, notes; numbers from the `dashboard_summary()` RPC |
| Inventory | `src/pages/Inventory.tsx` | unsorted / damaged / dry-clean / completed items with component tracking; Spare Parts sub-module in `InventoryExtras.tsx` (permission key `extras`) |
| Brand Tags | `src/pages/BrandTags.tsx` | label rows, Excel import/export, barcode label printing |
| PackStation | `src/pages/PackTime.tsx` | AWB scanning with camera, sheet sync via the `packtime` edge function (DB tables are `packtime_*`) |
| Cash Challan | `src/pages/CashChallan.tsx` + `src/components/challan/` | sales/return challans, payments, credit, WhatsApp reminders; Cash Book sub-module in `CashBook.tsx` (permission key `cashbook`) |
| Purchase Orders | `src/pages/PurchaseOrders.tsx` + `src/components/purchaseorders/` | vendors, receiving, PDF |
| Listing AI | `src/components/listingai/` | marketplace listing sheets filled by the `listing-ai` edge function from the mirrored master sheet |
| Attendance | `src/components/attendance/` | employees, timesheets, salary and payslips |
| Programs | `src/modules/programs/` | production programs; the one module with its own `hooks/`, `lib/`, `i18n/` (English + Gujarati) |
| Minis | `src/pages/Minis.tsx` + `src/components/minis/` | small tools: Utsav / Cbazaar / Odette imports, address labels, Trackly short links, return labels, rate cards, Dropbox links, Forward Dropbox, master assistant, client finder, Dropbox upload, product costing, OTP inbox |
| Print Station | `src/pages/PrintStation.tsx` | cloud print queue drained by the PC running QZ Tray |
| Settings | `src/components/settings/` | users and module access, categories, brands, locations, printers, payment QR, error logs, profile |

Roles: `admin`, `manager`, `operator`, `viewer`. Tab access is `canAccessTab` in `src/lib/tabs.ts`; per-user overrides live in `profiles.module_access` (JSON of module key → boolean), including the two non-tab keys `extras` and `cashbook` (`canAccessModule`).

## Data
- **Schema:** `src/types/database.ts` — one `Xxx` interface + `XxxInsert` type per table, with a `(N cols)` header per table. This is the reference; there is no separate schema document.
- **Migrations:** `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`, applied through the Supabase MCP and committed in the same change. Alphabetical order is chronological order.
- **Multi-table writes** go through SECURITY INVOKER RPCs (`delete_inventory_item_cascade`, `complete_inventory_pair`, `revert_inventory_pair`, `complete_item_with_extra`, `apply_return_credit`…). A few RPCs are SECURITY DEFINER on purpose (PIN verification with lockout, edge-function-only calls, catalog refresh).
- **Master sheet:** mirrored into `master_sheet_rows` / `master_sheet_columns` by the `master-sync` edge function on a pg_cron schedule (2-minute probe, hourly full sync); the app never writes to the sheet.
- **Realtime:** the app subscribes to `cash_challans`, `cash_challan_items`, `cash_expenses`, `cash_handovers`, `cash_book_balances`, `brand_tags`, `inventory_items`, `inventory_extras`, `item_components`, `item_tags`, `products`, `components`, `locations`, `tags`, `programs`, `purchase_orders`, `purchase_order_items`, `purchase_order_receipts`, `print_queue`, `app_settings`, `otp_inbox`, `notifications`, `profiles`, `tasks`. `activity_logs`, `damage_reports` and `inventory_extras_history` were removed from the publication (nothing listens). A subscription to an unpublished table sits silent — add the table to `supabase_realtime` in the same migration.
- **Inventory status values:** `unsorted`, `damaged`, `dry_clean`, `complete`, `completed` (see `database.ts`; `complete` and `completed` are distinct legacy values).

## Edge functions (`supabase/functions/`)
`admin-users`, `client-finder`, `listing-ai`, `master-sync`, `odette-export`, `otp-inbox`, `packtime`, `short-track`, `sign-qz`. Secrets (Google service account, Dropbox, QZ private key) exist only as function env vars.

## Commands
```bash
npm run dev        # local dev server
npm run build      # eslint + tsc + vite — the same gate the deploy workflow runs
npm run lint       # eslint only
npm run preview    # serve the production build
```
No test suite exists; the harness pattern used for verification is headless Chromium against a throwaway Vite entry (see recent PR descriptions).
