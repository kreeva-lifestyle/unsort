---
name: supabase-migration
description: Guide database schema changes through the full migration workflow with error prevention. Use when the user says "add a column", "create a table", "migration", "schema change", "new field", "add index", "create function", "alter table", "add trigger", or "new RPC".
---

# Database Migration Workflow

Follow these steps in order for every schema change. Do not skip steps.

## 1. Audit current state
- MCP `list_tables` to inspect existing structure
- Read `src/types/database.ts` for current TypeScript types (this is the de facto schema reference)
- Search `.from('affected_table')` across `src/` to find all consuming components
- Search `postgres_changes.*affected_table` to find realtime subscriptions
- Read `CLAUDE.md` for project-specific database rules

## 2. Write migration SQL
- Apply via MCP `apply_migration` with a descriptive `name` (e.g. `add_manufacturer_to_inventory_items`)
- Start with a SQL comment explaining WHY the change is needed
- New tables must include in the same migration:
  - `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
  - `created_at timestamptz DEFAULT now()`
  - `updated_at timestamptz DEFAULT now()` (omit only for intentionally immutable tables)
  - `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY`
  - At least one `CREATE POLICY` (empty RLS locks out everyone)
- Functions/RPCs for multi-table writes: use `SECURITY INVOKER` (not DEFINER)
- RPC parameter names: `p_` prefix (e.g. `p_item_id`, `p_reason`)
- Add btree indexes on any column the UI will filter or sort on

## 3. Guard against data loss
- NOT NULL on a populated table: MUST provide a DEFAULT or run a backfill UPDATE first
- Sensitive columns: add column-level `REVOKE SELECT` for `authenticated` and `anon` roles; access only via RPC
- Derived/counter fields: use a DB trigger, never client-side logic (follow the `trigger_update_component_count` pattern)
- Dropping columns/tables: confirm with user first; check for FK references

## 4. Verify migration
- MCP `list_tables` to confirm the new structure exists
- MCP `execute_sql` to spot-check (e.g. `SELECT count(*) FROM new_table`, verify constraint exists)

## 5. Update TypeScript types
- Edit `src/types/database.ts`
- Follow dual-type pattern: `Xxx` interface (Row) + `XxxInsert` type
- Row: nullable DB columns use `| null`; Insert: auto-generated/defaulted fields are optional
- If table has a status column: export `type XxxStatus = NonNullable<Xxx['status']>` and `const XXX_STATUSES: XxxStatus[] = [...]`
- Add comment header: `// --- table_name (N cols) ---`
- Naming: avoid React collisions (e.g. `ProductComponent` not `Component`)

## 6. Update friendlyError
- Read `src/lib/friendlyError.ts`
- If migration adds CHECK or UNIQUE constraints with domain-specific meaning, add a mapping before the generic code-based catches
- Pattern: `if (code === 'XXXXX' || l.includes('specific phrase')) return 'Human-readable message.';`

## 7. Update consuming code
- All queries to new/modified table must list columns explicitly (never `select('*')`)
- Error handling: `if (error) addToast(friendlyError(error), 'error')` -- never surface raw error.message
- If realtime needed: `ALTER PUBLICATION supabase_realtime ADD TABLE new_table` in migration, add `supabase.channel().on('postgres_changes', ...)` with filter clause when possible, unsubscribe on unmount

## 8. Build check
- `npx tsc --noEmit` -- zero errors
- `npx vite build` -- successful build

---

## Error Prevention Checklist

Verify ALL items before declaring the migration done:

1. **RLS policy exists** -- ENABLE ROW LEVEL SECURITY alone locks everyone out
2. **NOT NULL is safe** -- has DEFAULT or backfill on populated tables
3. **Types updated** -- `src/types/database.ts` matches new schema
4. **No select('*')** -- all queries list columns explicitly
5. **Multi-table = RPC** -- chained `.then()` is not a transaction
6. **Filter columns indexed** -- btree index on any column the UI filters/sorts on
7. **Realtime configured** -- publication + subscription + unsubscribe if live updates needed
8. **friendlyError covers constraints** -- new unique/check violations produce human messages
9. **Optimistic concurrency** -- `.eq('field', expectedValue)` guard if row can be updated concurrently
10. **Batch writes for imports** -- bulk inserts >100 rows use batches of 500 with beforeunload guard
