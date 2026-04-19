# Database Schema — Unsort

**This is the authoritative schema reference for this project.**

Generated from the live Supabase database (`information_schema.columns`) on 2026-04-19.
TypeScript types in `src/types/database.ts` are derived from this file.

When the schema changes:
1. Re-run the snapshot query (at bottom of this file)
2. Update this file
3. Update `src/types/database.ts` to match
4. Then update consumers

---

## Tables

### `profiles` (9 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| email | NO | text |
| full_name | YES | text |
| role | YES | text |
| is_active | YES | boolean |
| created_at | YES | timestamptz |
| updated_at | YES | timestamptz |
| cash_pin | YES | text |
| phone | YES | text |

**Notes:**
- `role` is a free text column but app code expects one of: `admin`, `manager`, `operator`, `viewer`
- `cash_pin` stores PIN in plain text — security review needed (tracked separately)

---

### `products` (10 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| sku | NO | text |
| name | NO | text |
| description | YES | text |
| category | YES | text |
| total_components | YES | integer |
| is_active | YES | boolean |
| created_by | YES | uuid |
| created_at | YES | timestamptz |
| updated_at | YES | timestamptz |

---

### `components` (7 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| product_id | NO | uuid |
| component_code | NO | text |
| name | NO | text |
| description | YES | text |
| is_critical | YES | boolean |
| created_at | YES | timestamptz |

---

### `inventory_items` (20 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| product_id | NO | uuid |
| batch_number | YES | text |
| serial_number | YES | text |
| status | YES | text |
| damage_type | YES | text |
| damage_description | YES | text |
| damage_severity | YES | text |
| location | YES | text |
| notes | YES | text |
| reported_by | YES | uuid |
| created_at | YES | timestamptz |
| updated_at | YES | timestamptz |
| order_id | YES | text |
| marketplace | YES | text |
| ticket_id | YES | text |
| link | YES | text |
| paired_with | YES | uuid |
| size | YES | text |
| status_changed_at | YES | timestamptz |

**Notes:**
- `status` values used by app: `unsorted`, `damaged`, `complete`, `repaired`, `disposed`
- `paired_with` is a self-referential FK for matched/paired items
- `marketplace` tracks the source (Myntra, Ajio, Amazon, etc.) for return flows
- Damage info (`damage_type`, `damage_description`, `damage_severity`) lives directly on the item

---

### `item_components` (6 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| inventory_item_id | NO | uuid |
| component_id | NO | uuid |
| status | YES | text |
| notes | YES | text |
| updated_at | YES | timestamptz |

**Notes:**
- `status` values used by app: `missing`, `present`, `damaged`
- No `checked_by`, `checked_at`, or `created_at` columns (despite what the old context doc says)

---

### `activity_logs` (9 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| user_id | YES | uuid |
| action | NO | text |
| entity_type | NO | text |
| entity_id | YES | uuid |
| old_value | YES | jsonb |
| new_value | YES | jsonb |
| description | YES | text |
| created_at | YES | timestamptz |

**Notes:**
- No `metadata` column — schema uses `old_value` + `new_value` jsonb instead
- `user_id` nullable because system-generated events may have no user

---

### `notifications` (9 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| user_id | YES | uuid |
| title | NO | text |
| message | NO | text |
| type | YES | text |
| entity_type | YES | text |
| entity_id | YES | uuid |
| is_read | YES | boolean |
| created_at | YES | timestamptz |

**Notes:**
- No `metadata` column — schema uses `entity_type` + `entity_id` for polymorphic references
- `type` enum is not yet finalized; typed as `string | null` for now

---

### `damage_reports` (12 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| inventory_item_id | NO | uuid |
| report_number | YES | text |
| damage_date | YES | date |
| damage_type | NO | text |
| cause | YES | text |
| estimated_loss | YES | numeric |
| action_taken | YES | text |
| status | YES | text |
| reported_by | YES | uuid |
| created_at | YES | timestamptz |
| updated_at | YES | timestamptz |

**Notes:**
- `status` values used by app: `open`, `investigating`, `resolved`, `closed`
- `report_number` likely has a DB-side default / trigger (format: `DMG-YYYYMMDD-XXXX`)
- No `damage_description`, `images`, `resolved_by`, or `resolved_at` columns — these live on `inventory_items` or don't exist yet

---

### `inventory_extras` (12 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| product_id | NO | uuid |
| product_name | NO | text |
| component_id | NO | uuid |
| component_name | NO | text |
| sku | NO | text |
| size | NO | text |
| quantity | NO | integer |
| notes | YES | text |
| created_by | YES | uuid |
| created_at | YES | timestamptz |
| updated_at | YES | timestamptz |

**Notes:**
- App use: stand-alone inventory of spare components (e.g., a loose Dupatta) available to complete an unsorted item. Used by `src/InventoryExtras.tsx` to list/add/adjust extras and match them against unsorted `inventory_items` by `(product_id, sku, size, component_id)`.
- `product_name` and `component_name` are denormalised snapshots of the related product/component at time of insert.
- Unique constraint (implied by app error-handling on code `23505`) across `(product_id, component_id, sku, size)`.

---

### `inventory_extras_history` (9 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| extra_id | YES | uuid |
| action | NO | text |
| quantity_change | NO | integer |
| quantity_after | NO | integer |
| reason | YES | text |
| related_inventory_item_id | YES | uuid |
| user_id | YES | uuid |
| created_at | YES | timestamptz |

**Notes:**
- Append-only audit trail for `inventory_extras`. Each row records a quantity change and the resulting balance.
- `action` values used by app: `created`, `added`, `removed`, `used`.
- `related_inventory_item_id` is populated when `action = 'used'` (an extra was consumed to complete an inventory item).
- `extra_id` is nullable to let history rows survive a future delete of the parent extra (soft-reference).

---

## Cash namespace tables

Tables in the `cash_*` namespace support the Cash Book and Cash Challan (invoicing) features.

### `cash_book_balances` (4 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| date | NO | date |
| opening_balance | NO | numeric |
| created_at | YES | timestamptz |

**Notes:**
- One row per day. Stores the manually-entered opening cash balance used to compute the closing balance after sales, expenses, and handovers.
- `date` is effectively the natural key (expected unique-on-date for upsert).

---

### `cash_expenses` (7 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| date | NO | date |
| amount | NO | numeric |
| category | NO | text |
| description | YES | text |
| paid_by | YES | uuid |
| created_at | YES | timestamptz |

**Notes:**
- Records individual cash outflows (office supplies, rent, etc.) that reduce the closing balance for the day.
- `paid_by` references `profiles.id` — who logged the expense.

---

### `cash_handovers` (15 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| date | NO | date |
| amount | NO | numeric |
| from_user_id | YES | uuid |
| from_user_name | NO | text |
| to_user_id | YES | uuid |
| to_user_name | NO | text |
| notes | YES | text |
| status | NO | text |
| confirmed_at | YES | timestamptz |
| created_at | YES | timestamptz |
| period_from | YES | date |
| period_to | YES | date |
| breakdown | YES | jsonb |
| reason | YES | text |

**Notes:**
- `status` values: `pending` | `confirmed` | `expired`.
- Immutable once created — only `status` and `confirmed_at` flip on PIN sign-off; there is no `updated_at` column.
- `from_user_name` / `to_user_name` are denormalised snapshots; the corresponding `*_user_id` FKs may be null if the profile was deleted.
- `breakdown` is jsonb — the app stores a snapshot of the cash-flow calculation (opening, sales, returns, expenses, previous handovers, available) at handover time. Typed as `Record<string, unknown> | null`; consumers cast to a local view type.
- `reason` is required (by app logic) only when the handed amount differs from the computed available cash.

---

### `cash_challans` (25 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| challan_number | NO | integer |
| customer_id | YES | uuid |
| customer_name | NO | text |
| status | NO | text |
| subtotal | NO | numeric |
| discount_type | YES | text |
| discount_value | YES | numeric |
| discount_amount | YES | numeric |
| round_off | YES | numeric |
| total | NO | numeric |
| amount_paid | YES | numeric |
| payment_mode | YES | text |
| payment_date | YES | date |
| notes | YES | text |
| tags | YES | ARRAY (text[]) |
| created_by | YES | uuid |
| modified_by | YES | uuid |
| voided_by | YES | uuid |
| voided_at | YES | timestamptz |
| created_at | YES | timestamptz |
| updated_at | YES | timestamptz |
| shipping_charges | YES | numeric |
| is_return | YES | boolean |
| source_challan_id | YES | uuid |

**Notes:**
- `status` values: `paid` | `partial` | `pending` | `void`.
- `payment_mode` is free text today (Cash/UPI/etc.); enum not yet fixed — typed as `string | null` with a TODO.
- `tags` is a Postgres `text[]` — typed as `string[] | null` in TS.
- `source_challan_id` is a self-reference back to the original challan for returns (`is_return = true`).
- `customer_id` references `cash_challan_customers.id`; `customer_name` is denormalised at save time.

---

### `cash_challan_items` (11 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| challan_id | YES | uuid |
| sku | YES | text |
| description | NO | text |
| quantity | NO | integer |
| price | NO | numeric |
| total | NO | numeric |
| sort_order | YES | integer |
| discount_type | YES | text |
| discount_value | YES | numeric |
| discount_amount | YES | numeric |

**Notes:**
- Line items belonging to a `cash_challans` row (1-N). `challan_id` is nullable to allow orphan recovery but the app always sets it.
- `discount_type` allowed values are not yet fixed (likely `percent` / `flat`) — typed as `string | null` with a TODO.

---

### `cash_challan_customers` (5 columns)

| Column | Nullable | Type |
|---|---|---|
| id | NO | uuid |
| name | NO | text |
| phone | YES | text |
| address | YES | text |
| created_at | YES | timestamptz |

**Notes:**
- Lightweight customer directory used by the invoicing module. Uniqueness on `name` (case-insensitive) is enforced by app-level checks.

---

## Known drift from `UNSORT-CLAUDE-CODE-CONTEXT.md`

The old context doc is stale. Highlights:

1. **`inventory_items`** has 10 extra columns not in the doc (marketplace tracking, pairing, size)
2. **`item_components`** is simpler than the doc (no `checked_by`, `checked_at`, `created_at`)
3. **`activity_logs`** uses `old_value`/`new_value` jsonb, not `metadata`
4. **`notifications`** uses `entity_type`/`entity_id`, not `metadata`
5. **`damage_reports`** doesn't have `damage_description`, `images`, `resolved_by`, `resolved_at`
6. **`profiles`** has extra `cash_pin` and `phone` columns

---

## Regenerating this snapshot

Run in Supabase SQL editor:

```sql
SELECT 
  table_name, 
  column_name, 
  is_nullable, 
  data_type
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'products', 'components', 
    'inventory_items', 'item_components', 
    'activity_logs', 'notifications', 'damage_reports'
  )
ORDER BY table_name, ordinal_position;
```
