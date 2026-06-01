# Flowra Production Certification Runbook

Run every step against PRODUCTION with a working connection. Set once:
```bash
export DATABASE_URL='postgresql://postgres:<password>@<project>.pooler.supabase.com:5432/postgres'
# or the service-role direct connection string from Supabase → Project Settings → Database
```
A step is **CERTIFIED** only when its PASS criterion is met against live data.
If a connection is not available, NOTHING below can be certified — that is a hard blocker.

| # | Item | How to verify | PASS criterion | If FAIL → remediation |
|---|------|---------------|----------------|------------------------|
| 1 | Production schema drift | `psql "$DATABASE_URL" -f certify.sql` (schema_drift:* rows) | all 7 rows PASS | go to #2 |
| 2 | Drift migration apply | apply the 7 migrations IN ORDER: `psql "$DATABASE_URL" -f supabase/migrations/20260526000007_*.sql` then `..._20260527000001/2/10/11/12/13_*.sql` | re-run #1 → all PASS | inspect error; tables use `IF NOT EXISTS` so re-runnable |
| 3 | RPC verification | certify.sql (rpc:* rows) | all PASS (FAIL=missing, WARN=arity differs) | #4 |
| 4 | RPC alignment | for each WARN/FAIL compare `\df+ <fn>` to the code call sites in docs/delivery/02 §A.3; align the **code** to the live signature (or migrate the RPC) | rpc:* all PASS AND app calls match | edit event.service.ts / worker.ts to the live sig, redeploy |
| 5 | Event outbox verification | certify.sql (event_outbox_backlog, event_outbox_schema) | schema PASS; backlog 0 (or explained) | #6 |
| 6 | Event outbox activation | (a) align RPCs (#4); (b) add `/api/events/process` + `/api/jobs/run` to `vercel.json` crons; redeploy; (c) re-check backlog drains | backlog trends to 0 after a cron tick | verify CRON_SECRET; check Vercel cron logs |
| 7 | Scheduled job verification | Vercel → Settings → Cron Jobs; `job_runs` table recent rows (certify.sql job_runs_recent) | 4 crons registered + recent successful runs | confirm `vercel.json` deployed; GET handlers present (already fixed) |
| 8 | Cron verification | hit each cron once: `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/overdue-update` (GET) | 200 + work performed (no 405) | GET alias shipped; check CRON_SECRET env in Vercel |
| 9 | Storage verification | `select id,name,public from storage.buckets;` + `select count(*) from storage.objects;`; confirm logo bucket exists and SVG policy | logo bucket present; uploads validated by validateImageBytes (scriptable SVG rejected) | create bucket; set policies |
| 10 | Behavioural RLS | `psql "$DATABASE_URL" -f rls_behavioural.sql` | rls_cross_tenant_* = PASS (0 leak), rls_own_tenant = PASS | review the failing table's policy; ensure company_id ∈ company_members(auth.uid()) |
| 11 | Cross-tenant access | same script (sales/expenses/audit_logs cross-tenant rows) | all PASS (0 visible) | as #10 |
| 12 | IDOR | rls_behavioural.sql (idor_convert_proforma_membership_check) + try the live API as tenant B with tenant A's proforma id | RPC contains membership check; API returns 404/403 | app mitigation is live (SaleService); harden the RPC per docs/02 §A.2 |
| 13 | Audit chain vs prod data | certify.sql (audit_chain_integrity) — recomputes SHA-256 over real audit_logs | 0 broken links | investigate flagged ids (genuine tamper vs pre-stamp rows) |
| 14 | Fresh install verification | in a SCRATCH Supabase project: run `supabase/FLOWRA_PRODUCTION_INSTALL.sql`; then `certify.sql` | install runs clean; schema_drift + rls_summary PASS | fix the offending DDL in the canonical file |
| 15 | Upgrade path verification | in a clone of the CURRENT prod schema: apply `FLOWRA_PRODUCTION_UPGRADE.sql` + un-applied `migrations/*`; then certify.sql | upgrade runs clean; #1 PASS | resolve migration ordering/conflicts |
| 16 | Backup / restore | take a Supabase snapshot; exercise the admin export then restore into a scratch project; the restore endpoint must 422 on an inconsistent payload BEFORE writing | snapshot taken; restore round-trips; pre-flight 422 works | see guides/BACKUP-RECOVERY-GUIDE.md |

## Producing the certification report
After running `certify.sql` + `rls_behavioural.sql`, paste the emitted check/status/detail
rows into `docs/delivery/04-PRODUCTION-CERTIFICATION-REPORT.md` under each heading
(schema/migration/RPC/RLS/cron/storage/deployment/accounting/governance) and compute
the final readiness score: 80+ once items 1–13 are all PASS; the remaining lift to
90+ requires items 14–16 green in a staging clone.

## Hard prerequisite
All of the above require `$DATABASE_URL` (a real service-role / pooler connection).
Without it, certification cannot proceed — provide it (or connect the Supabase CLI /
a Postgres MCP) and re-run; the scripts above will then certify in a single pass.
