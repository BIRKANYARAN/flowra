-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Grant Fix — Run ONCE in Supabase SQL Editor (Dashboard)
-- 
-- Required when migration was run via psql/CLI without automatic Supabase grants.
-- This fixes "permission denied for table X" errors for all roles.
--
-- Run at: https://supabase.com/dashboard/project/mltiubfnaoakxljxonck/sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Grant table access to all PostgREST roles
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Ensure future tables also get grants automatically
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines  to anon, authenticated, service_role;

-- Verify (should show counts > 0 after running above)
select
  grantee,
  count(*) as tables_with_access
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee
order by grantee;
