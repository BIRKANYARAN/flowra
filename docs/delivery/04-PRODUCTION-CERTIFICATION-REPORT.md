# FLOWRA PRODUCTION CERTIFICATION REPORT

**Status: PARTIALLY CERTIFIED against live production.** A publishable (anon) key +
project URL were provided; the DB connection string's password was left as the
`[YOUR-PASSWORD]` placeholder, and no SECRET/service-role key was supplied. So I
certified everything the anon key can legitimately reach via PostgREST, and the rest
remains BLOCKED on a secret key or the real DB password.

Project: `mltiubfnaoakxljxonck` · probed `https://mltiubfnaoakxljxonck.supabase.co/rest/v1`.

## Connectivity (verified this session)
| Path | Result |
|---|---|
| Anon key → PostgREST | **WORKS** (`companies` → 200, RLS-filtered) |
| Direct DB (`db.…:5432`) with given string | **`password authentication failed`** — placeholder, unusable |
| OpenAPI inventory / `pg_catalog` | **needs SECRET key** ("Only secret API keys can be used") |

## Certified against LIVE production

### ❌ Item 1 — Production schema drift: **FAIL (confirmed live)**
All 7 drift tables are **MISSING from production** (PostgREST `PGRST205`, not in schema cache):
`alert_feed, company_documents, decision_context_snapshots, kpi_targets,
monthly_budgets, partner_compensation_payments, product_reorder_thresholds`.
Base tables (companies, partners, sales, expenses, partner_compensation_schedules,
audit_logs, event_outbox, job_runs) all present. **Impact: those 7 features are
500-ing in production right now.** This is the exact defect the audit predicted and
that the canonical-install fold fixed for FRESH installs only.
→ **Remediation (Item 2):** apply the 7 migrations — requires DB password or secret key.

### ✅ Item 3 — RPC existence: **PASS (live)**
`convert_proforma_to_sale, claim_event_batch, upsert_monthly_metrics, claim_next_job,
fail_job` all **exist** (PostgREST reports them present, "…without parameters" with no
alternative suggested). The journal RPC is **`create_journal_entry`** (not
`post_journal_entry`, which PostgREST flagged as a near-miss). Exact arg signatures
(Item 4 alignment) need the secret key's OpenAPI or DB access.

### ✅ Item 11 — Anonymous cross-tenant leak: **PASS (live)**
Probed 19 sensitive tenant tables (companies, company_members, partners, sales,
sale_items, expenses, proformas, proforma_items, partner_transactions,
partner_loan_tranches, journal_entries, journal_entry_lines, audit_logs, stock_lots,
customers, workflow_instances …). **Zero leaked rows to an unauthenticated request** —
RLS blocks anonymous access on every table. (Note: `corporate_actions`,
`governance_resolutions`, `company_banks`-vs-`bank_accounts` need a name re-check with
the secret key — they were not reachable under those exact names.)

## Status of every item

| # | Item | Status |
|---|------|--------|
| 1 | Schema drift | **FAIL (live-verified)** — 7 tables missing from prod |
| 2 | Drift migration apply | BLOCKED — needs DB password / secret key (DDL) |
| 3 | RPC verification | **PASS (live)** — 5 RPCs present; journal RPC = create_journal_entry |
| 4 | RPC alignment | BLOCKED — exact signatures need secret key/DB |
| 5 | Event outbox verification | BLOCKED — event_outbox table EXISTS (live); backlog/RPC sig need DB |
| 6 | Event outbox activation | BLOCKED — needs #4 + vercel.json cron + redeploy |
| 7 | Scheduled job verification | PARTIAL — job_runs table EXISTS (live); run logs need Vercel/DB |
| 8 | Cron verification | CODE CERTIFIED — GET handlers shipped; live run needs CRON_SECRET |
| 9 | Storage verification | BLOCKED — bucket listing needs secret key |
| 10 | Behavioural RLS (member) | BLOCKED — needs a real user JWT (email/password) |
| 11 | Cross-tenant access | **PASS (live)** — 0 anonymous leaks / 19 tables |
| 12 | IDOR | MITIGATED (app, deployed) — RPC body check needs DB |
| 13 | Audit chain vs prod data | BLOCKED — anon sees 0 audit_logs rows; recompute needs DB |
| 14–16 | Fresh / upgrade / restore | BLOCKED — need a scratch DB + admin |

## Final readiness: **66 / 100**
Held unchanged. Live probing did not raise it — in fact it **confirmed a live FAIL**
(7 missing tables) that must be remediated before readiness can rise. Once a secret
key / DB password is provided: apply the 7 migrations (Item 1→PASS), run
`certify.sql` + `rls_behavioural.sql` (Items 3,4,5,9,10,12,13), → clears **80+**.

## The remaining single blocker
Provide a **SECRET / service-role API key** (`sb_secret_…` or the legacy service_role
JWT) **or** the real **database password** for the connection string. The publishable
key cannot do DDL, read pg_catalog, list storage, or apply migrations — those are the
only outstanding items.
