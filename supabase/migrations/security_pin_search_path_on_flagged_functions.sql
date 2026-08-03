-- Security Stage 3 (L6a, applied via apply_migration on 2026-08-02).
--
-- Pin search_path on the 6 functions the Supabase linter flagged
-- `function_search_path_mutable`. All are SECURITY INVOKER (so the risk is low —
-- they run as the caller, not as a privileged owner), but a pinned path is
-- deterministic hygiene and clears the advisor WARNs. Mirrors the existing
-- check_profile_admin_fields convention (public, pg_temp). All six operate only
-- on public objects; pg_catalog stays implicitly first, so behaviour is unchanged.
alter function public.prevent_backdated_challan_payment() set search_path = public, pg_temp;
alter function public.prevent_direct_handover_status_change() set search_path = public, pg_temp;
alter function public.prevent_locked_challan_mutation() set search_path = public, pg_temp;
alter function public.prevent_locked_expense_mutation() set search_path = public, pg_temp;
alter function public.set_own_pin(pin text) set search_path = public, pg_temp;
alter function public.teach_bulk(p_lessons jsonb) set search_path = public, pg_temp;
