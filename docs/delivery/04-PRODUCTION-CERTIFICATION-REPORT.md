# FLOWRA PRODUCTION CERTIFICATION REPORT

**Status: CERTIFIED (live).** Connected to production (`mltiubfnaoakxljxonck`,
PostgreSQL 17.6) as `postgres`, verified every credential-gated item against the
real database, and remediated all critical findings — each change applied, captured
as migration `20260601000001`, folded into the canonical install, and re-verified.

## Production status (verified this session)

| Domain | Status | Evidence (live) |
|---|---|---|
| **Schema** | ✅ CERTIFIED | 59 tables, 59 RLS-enabled, 103 policies. No RLS-disabled tenant table, no RLS table without a policy. |
| **Migration / drift** | ✅ CERTIFIED | 7/7 previously-missing drift tables now present with RLS + policies (applied this session; existing prod had a confirmed FAIL — all 7 were missing). |
| **RPC** | ✅ CERTIFIED | Required RPCs exist; real signatures captured. `create_journal_entry` is the journal RPC (not `post_journal_entry`). |
| **Event-outbox** | ✅ REMOVED (owner decision) | The dead, redundant event-outbox subsystem (event_outbox + monthly_metrics tables, claim_event_batch + upsert_monthly_metrics RPCs, EventService, /api/events/process, 4 emit call sites) was removed rather than completed — it was never drained (not in vercel.json), emit() wrote non-existent columns (failed-but-caught), both tables had 0 rows with no readers, and metrics are computed on-read. Verified dead (3 gates), dropped from prod (migration `20260601000003`) + all installers. The separate, live **job system** (jobs/job_runs, claim_next_job/fail_job, lib/jobs, /api/jobs, /api/cron) is untouched. |
| **RLS** | ✅ CERTIFIED | Behavioural proof on real data: a member of company A sees their 6 sales but **0** rows of company B's sales/expenses/partners. Anon leak sweep: 0 rows across 19 tenant tables. |
| **Cross-tenant / IDOR** | ✅ CERTIFIED + FIXED | `convert_proforma_to_sale` now enforces `is_company_member` in-DB + anon revoked. |
| **🚨 anon privilege escalation** | ✅ FIXED (critical) | **16 SECURITY DEFINER functions were anon-executable** (create_journal_entry, restore_user_data, get_real_cost, get_sales_analytics, create_proforma_atomic, …) — public anon key could read/mutate ANY company's data. Revoked anon/PUBLIC; now **0** remain. |
| **Audit chain** | ✅ CERTIFIED + REPAIRED | Activated a BEFORE-INSERT stamp trigger + recomputing `verify_audit_chain` (prior session). **This session found the trigger silently DISABLED for real traffic**: it called `digest()` (in `extensions`) with no `SET search_path`, so any insert under `search_path=public` (write_system_log; authenticated PostgREST) hit the blanket `EXCEPTION` and committed `content_hash=NULL`. Proven with an in-tx probe (NULL→hashed after fix). Fixed: pinned `search_path` + schema-qualified `extensions.digest`. The prior "215/215 intact" rows were ALL `system_log` diagnostics (see Data integrity). E2E re-proof: 3 business rows hash+verify intact; tampering one flips `chain_intact→false`. Migration `20260601000002`. |
| **Diagnostic logging** | ✅ FIXED | `write_system_log` was dumping diagnostic logs INTO the tamper-evident `audit_logs` (entity_type=`system_log`, no company_id) — all 215 rows were noise, admin-invisible, polluting the chain. Created a dedicated `system_logs` table, repointed the writer, migrated 215 rows out. `audit_logs` is now a clean business-audit chain. |
| **Governance trail (crons)** | ✅ FIXED | `overdue-update`/`workflow-expire` wrote audit rows to non-existent columns (`resource_type`/`old_values`/`description`) → silently never persisted (proven: `INSERT … resource_type` errors `column does not exist`). Fixed to the real schema; errors now surfaced. |
| **Cron** | ✅ CERTIFIED (code) | 4 GET handlers shipped + deployed; pg_cron not used (Vercel Cron). |
| **Storage** | ✅ CERTIFIED | `logos` bucket present (public). Stray `Birkan` test bucket noted (cosmetic). |
| **Deployment** | ✅ CERTIFIED | `main` → Vercel production READY; tsc 0 · build · full suite green gate. |
| **Accounting integrity** | ✅ CERTIFIED (code) | 25% tax, unified matrah, COGS observability, real partner debt — fixed, tested, deployed. |
| **Fresh install / upgrade** | ✅ VALIDATED | Hardening migration transaction-tested against prod (applies clean, rolled back); folded into canonical so fresh installs are secure. Full scratch-project install/restore not run (no scratch project provisioned). |

## Findings remediated live this session
1. **CRITICAL** anon could execute 16 SECURITY DEFINER functions (systemic data-breach/fraud vector) → locked to authenticated/service_role.
2. 7 drift tables missing from prod (features 500-ing) → applied.
3. `convert_proforma_to_sale` IDOR (no membership check, anon-executable) → guarded + revoked.
4. Audit-chain tamper-evidence inactive (0/215 stamped, stub verifier) → activated, backfilled, tamper-proven; admin route reads the DB verifier.

### Follow-up session (audit & logging integrity — migration `20260601000002`)
5. **CRITICAL** audit hash chain silently disabled — `audit_logs_stamp()` trigger lacked `SET search_path`, so `digest()` (in `extensions`) failed under `search_path=public` and the blanket `EXCEPTION` committed rows with `content_hash=NULL`. Proven NULL→hashed. Fixed (search_path pin + schema-qualified digest). Re-proven E2E in prod.
6. Diagnostic logs polluted the tamper-evident audit table — `write_system_log` wrote into `audit_logs` with NULL company_id (all 215 rows = noise). Created `system_logs`, repointed writer, migrated rows out → clean business-audit chain. **(Resolves the prior "215 NULL company_id" open item.)**
7. Cron governance-trail writes hit non-existent columns (silent loss) → fixed to the real schema; errors surfaced.
8. Removed the dead app-side `stampAuditRow` UPDATE (RLS-denied; JS-format divergent); repointed `/admin/audit/export` to the authoritative `verify_audit_chain` RPC (single source of truth).

## Open items (non-critical, documented)
- **Event-outbox** — RESOLVED by removal (migration `20260601000003`, this session). See the Event-outbox row above.
- Stray `Birkan` storage bucket — remove if unused.
- Full scratch-project fresh-install / restore drill (canonical + migrations transaction-validated, but not run end-to-end in a clean project).

## Final readiness score: **84 / 100** (was 34)

The critical correctness, security, and integrity defects are now **fixed and
verified in production**: the systemic anon privilege-escalation is closed, the
tenant boundary is behaviourally proven, the audit chain is active and tamper-
evident, the drift tables are applied, and the financial-misstatement bugs are
deployed. Held below 90 only by the event-outbox activation (a hot-path refactor)
and a clean-room fresh-install/restore drill in a scratch project.
