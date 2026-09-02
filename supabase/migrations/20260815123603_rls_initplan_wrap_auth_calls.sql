-- WHY: the performance advisor flagged ~95 policies (auth_rls_initplan):
-- bare auth.uid()/auth.role()/auth.jwt() in a policy is re-evaluated for
-- EVERY ROW a query touches - a 5,000-row inventory read paid the auth
-- lookup 5,000 times. Wrapping the call in a scalar subquery,
-- (select auth.uid()), is the documented Supabase remediation: Postgres
-- evaluates it ONCE per statement as an InitPlan. Semantics-preserving -
-- same stable function, same value for the whole statement.
-- Applied 2026-08-15 via MCP as rls_initplan_wrap_auth_calls (public schema)
-- plus the same DO block run against storage.objects. Generated dynamically
-- from pg_policies; verified 0 bare-auth policies remain in either schema
-- and the public policy count (157) is unchanged.
do $$
declare p record; new_qual text; new_check text; stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and ((coalesce(qual,'') ~ 'auth\.(uid|role|jwt)\(\)' and coalesce(qual,'') !~ '\( ?SELECT auth\.')
        or (coalesce(with_check,'') ~ 'auth\.(uid|role|jwt)\(\)' and coalesce(with_check,'') !~ '\( ?SELECT auth\.'))
  loop
    new_qual  := regexp_replace(p.qual,       'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(p.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if p.with_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end $$;
