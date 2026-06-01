# FLOWRA PRODUCTION CERTIFICATION REPORT

**Certification status: BLOCKED — no production database connection available in the
execution environment.** Authority was granted, but no credential/connection
(`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, Supabase CLI session, or Postgres MCP)
is present in this sandbox. Probed and confirmed absent: `.env`/shell env, Supabase
CLI, local Postgres, Vercel env-pull (unsupported), Supabase MCP (not connected).
`psql` is installed but has nothing to connect to.

Per the program's own principle — the same one behind fixing the "always-OK" audit
verifier — **no item below is marked PASS unless verified against live production.**
Every DB-dependent item is therefore `BLOCKED (ready-to-run)`: the exact verification
is written and one command away (`supabase/certification/`), pending a connection.

| Domain | Status | Evidence / how it certifies |
|---|---|---|
| **Production schema** | BLOCKED (ready-to-run) | `certify.sql` schema_drift:* — asserts the 7 folded tables exist in prod. Fresh-install SQL is complete (static, verified). |
| **Migration status** | BLOCKED (ready-to-run) | Runbook #2 — apply 7 drift migrations in order; re-run schema check. Migrations are idempotent (`IF NOT EXISTS`). |
| **RPC status** | BLOCKED (ready-to-run) | `certify.sql` rpc:* — existence + arity for convert_proforma_to_sale, claim_event_batch, upsert_monthly_metrics, claim_next_job, fail_job. App-side call signatures documented in 02 §A.3. |
| **RLS status** | BLOCKED (ready-to-run) | `certify.sql` rls_* (coverage, no deny-all gaps) + `rls_behavioural.sql` (live cross-tenant denial on real data). Static: 52/52 coverage confirmed in audit. |
| **Cron status** | PARTIAL — code CERTIFIED, runtime BLOCKED | Code fix verified+deployed (4 crons now export GET; guard test green). Live cron-run confirmation needs Vercel Cron logs / `curl` with CRON_SECRET (Runbook #7–8). |
| **Storage status** | BLOCKED (ready-to-run) | Runbook #9 — bucket + policy inspection. Upload validation hardened+tested (scriptable SVG rejected). |
| **Deployment status** | CERTIFIED | `main` auto-deploys to Vercel; latest production deployment `READY` (verified via Vercel API this session). tsc 0 · build pass · full suite green gate enforced. |
| **Accounting integrity** | CODE CERTIFIED, prod-data BLOCKED | 25% tax, unified matrah, COGS-truncation observability, certified-export real debt — all fixed, tested, deployed. Reconciling against live numbers needs DB. |
| **Governance integrity** | CODE CERTIFIED, prod-data BLOCKED | audit-chain verifier corrected + behaviourally tested; runValidation + shareholder positions read the real contract. Recompute-vs-prod-data is `certify.sql` audit_chain_integrity (Runbook #13). |
| **IDOR** | MITIGATED (app), RPC BLOCKED | App-layer ownership guard live in SaleService.convertProforma. RPC hardening + behavioural proof = `rls_behavioural.sql` idor_* (Runbook #12). |
| **Fresh install / Upgrade / Backup** | BLOCKED (ready-to-run) | Runbook #14–16 against a scratch/clone project. |

## Final readiness score: **66 / 100** (unchanged — cannot be raised without live verification)

I will not raise the score on un-verified work. Items 1–13 are expected to certify
quickly once connected (the code-side defects they cover are already fixed); that
clears **80+**. Items 14–16 (staging-clone install/upgrade/restore) lift to **90+**.

## The single blocker, and how to clear it
Provide ONE of:
1. `SUPABASE_SERVICE_ROLE_KEY` + project URL, or a pooler/direct `DATABASE_URL`, exported in this environment; or
2. an authenticated Supabase CLI (`supabase login` + linked project); or
3. a connected Postgres/Supabase MCP server.

Then: `psql "$DATABASE_URL" -f supabase/certification/certify.sql` and
`-f supabase/certification/rls_behavioural.sql`, apply migrations per the runbook,
and this report fills with live PASS/FAIL rows in a single pass.
