# Tech Debt — Unsort

Known issues deferred from the Phase 3.6 → 3.12 refactor. Each has a scope and a rough priority. Address individually; do not bundle.

---

## Security

### cash_pin plaintext storage (HIGH)
**Location:** `profiles.cash_pin` column; read/written in `App.tsx` (lines ~1743, 1769, 1779) and `CashBook.tsx` (~L265–267 plaintext compare).
**Issue:** PINs are stored and compared in plain text. A DB compromise or misconfigured RLS would expose them.
**Fix plan:**
- Hash PINs (bcrypt/argon2) before storage
- Compare hashes, not raw values
- Migrate existing PINs: force-reset on next login, or one-time rehash job
- Consider Supabase Auth MFA as a longer-term replacement
**When:** Dedicated security phase. Do not bundle with feature work.

---

## Type system

### Insert types mark DB-default fields as required (MEDIUM)
**Location:** `src/types/database.ts` — affects `BrandTagInsert.mrp/copies/mktd`, `CashChallanItemInsert.quantity/price/total`, `CashChallanInsert.subtotal/total/status`, `CashExpenseInsert.date`, `CashHandoverInsert.date/status`.
**Issue:** These columns are NOT NULL in the DB but have defaults. The Insert type makes them required, forcing every caller to supply a value even when the DB default is intended.
**Fix plan:** Cross-reference `column_default` from information_schema for each NOT NULL column. Mark the corresponding Insert field optional (`?:`) if a DB default exists.
**When:** Low-urgency cleanup; can be done during Phase 4 if convenient, otherwise after.

### Insert types are hand-written mirrors, not `Omit<>` derivations (LOW)
**Location:** `src/types/database.ts` throughout.
**Issue:** Every schema change requires editing two places (Row + Insert). Drift risk.
**Fix plan:** Derive Insert types using `Omit<Row, ...> & Partial<...>` pattern. Requires a careful audit to avoid silently changing any existing type.
**When:** Consider only if drift becomes a real problem. Otherwise leave as-is.

---

## Code quality

### Null-coalesce style inconsistency (LOW)
**Location:** 129 occurrences of `||` vs 19 of `??` across `src/*.tsx` for default-value fallbacks.
**Issue:** `||` treats `0` and `''` as missing; `??` treats only `null`/`undefined` as missing. Mixing is a latent bug risk for fields where `0` or `''` are legitimate values distinct from "absent."
**Fix plan:** Audit each occurrence; switch to `??` where appropriate (especially numeric fields where `0` is valid). Keep `||` only where empty-string-as-missing is semantically intended.
**When:** Style pass, non-urgent.

### PackTime.tsx dead 23505 rollback handler (LOW)
**Location:** `src/PackTime.tsx:367`.
**Issue:** Error-code 23505 handler assumes a unique constraint on `packtime_scans` that doesn't exist in the DB. Dead code path.
**Fix plan:** Either add the intended unique constraint in the DB (if duplicate scans have occurred) or remove the handler.
**When:** Investigate first — do we actually want duplicate-scan prevention? If yes, add DB constraint. If no, remove handler.

### inventory_extras duplicate-insert risk (LOW — but real data integrity gap)
**Location:** `inventory_extras` table in DB; error handling in `InventoryExtras.tsx`.
**Issue:** The app comment previously claimed an implied unique constraint on `(product_id, component_id, sku, size)`. No such constraint exists. Duplicate extras can be inserted.
**Fix plan:** Check whether duplicates have actually occurred in production data. If yes, de-dupe and add the constraint. If no, remove any assumption of uniqueness from app code.
**When:** Before it causes a real problem — worth a quick investigation.

---

## Performance / deployment

### Bundle size 1.38 MB (LOW, gets addressed by Phase 4)
**Location:** `dist/assets/index-*.js`.
**Issue:** Vite warns bundle exceeds 500 KB. Gzipped it's 392 KB (acceptable), but code-splitting would help first-load on slow connections.
**Fix plan:** Once App.tsx is split into per-page modules (Phase 4), use React lazy imports on each page. `React.lazy(() => import('./pages/CashBook'))`.
**When:** During or after Phase 4.

---

## Documentation

### UNSORT-CLAUDE-CODE-CONTEXT.md is partly stale (LOW)
**Location:** repo root.
**Issue:** The schema section is marked stale with a banner, but the rest (tech stack, features, commands) is still referenced by some setup flows.
**Fix plan:** Either update it completely, or trim it down to just the parts that remain accurate and point everything else at `DATABASE-SCHEMA.md` and `TECH-DEBT.md`.
**When:** Low-urgency housekeeping.

---

## Completed (for reference)

- ✅ Phase 2: Supabase client extracted to `src/lib/supabase.ts`
- ✅ Phase 2.5: Client consolidated across all 6 top-level files
- ✅ Phase 3–3.5: Central types file created and aligned to real DB
- ✅ Phase 3.6: InventoryExtras migrated
- ✅ Phase 3.6.5: `inventory_extras*` tables documented, Component → ProductComponent rename
- ✅ Phase 3.7–3.7.5: CashBook migrated, cash_* tables documented
- ✅ Phase 3.8: BrandTagPrinter migrated
- ✅ Phase 3.9: PackTime migrated
- ✅ Phase 3.10: CashChallan migrated
- ✅ Phase 3.11: Adversarial audit
- ✅ Phase 3.12: Enum unions corrected, dead filter fixed, local ChallanStatus removed

## Next

- ⏳ Phase 4: Split `src/App.tsx` (2,293 lines) into `src/pages/` modules. This is the fix for the "prompt too long" issue that triggered this entire refactor.
