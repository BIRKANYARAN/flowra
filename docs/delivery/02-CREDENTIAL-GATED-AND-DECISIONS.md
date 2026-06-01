# FLOWRA — Credential-Gated Work & Business Decisions (Phase 6 boundary)

These items are intentionally NOT auto-executed: they require Supabase admin access
(destructive/unverifiable from this environment) or a business/legal sign-off.
Each is precisely specified so it can be applied directly when unblocked.

## A. Credential-gated (need Supabase admin access)

1. **Apply the 7 drifted migrations to EXISTING production.**
   Fresh installs are now complete (folded into FLOWRA_PRODUCTION_INSTALL.sql),
   but existing prod DBs still lack: alert_feed, company_documents,
   decision_context_snapshots, kpi_targets, monthly_budgets,
   partner_compensation_payments, product_reorder_thresholds.
   → Apply supabase/migrations/2026052700001x_*.sql + 20260526000007_*, 20260527000002_*.

2. **Harden convert_proforma_to_sale RPC.** It is SECURITY DEFINER with no
   membership check (IDOR). App-layer mitigation is live (SaleService.convertProforma
   rejects cross-tenant proformas), but the RPC itself should add
   `is_company_member(auth.uid(), <proforma.company_id>)` and stop trusting p_user_id.

3. **Event-outbox + job-runner RPC signature alignment.** The outbox is currently
   inert (not scheduled) AND its code↔RPC signatures mismatch the deployed schema:
   - event.service.ts claim_event_batch({p_batch_size}) vs DB (p_worker_id, p_batch_size)
   - upsert_monthly_metrics param names/types differ
   - worker.ts claim_next_job()/fail_job() arg mismatch
   These need DB verification of the deployed RPC signatures before the code is
   aligned and /api/events/process + /api/jobs/run are added to vercel.json crons.
   Making blind code changes without confirming the live signatures risks turning an
   inert subsystem into an actively-erroring one — deferred until DB access.

4. **Behavioral RLS tests.** Cross-company isolation is only asserted via SQL-text
   grep today. A real test needs a seeded test database to prove a cross-tenant
   read is denied.

## B. Business / legal decisions (should not be flipped unilaterally)

5. **Hard TTK 509/519 enforcement on the LEGACY batch dividend path**
   (app/api/partners/dividend/declare Pattern B). The primary declare path (Pattern A)
   already enforces can_declare (TTK 509 net-income / distributable + TTK 519 legal
   reserve → 422). The legacy batch path validates only amount sanity (now via the
   tested guards) and does NOT re-check TTK 509/519. Turning on hard enforcement there
   could reject batch declarations that are currently allowed — a policy change that
   warrants explicit sign-off. Recommended once confirmed: route batch totals through
   the same DividendService.calculate compliance gate.

Note: the financial-integrity invariants are NOT unprotected — they are enforced in
the domain paths (dividend Pattern A; double-entry balance in JournalEntryService;
reconciliation validation now reads the real contract). lib/db/guards.ts was a
parallel, previously-unused module; its amount guards are now wired into the dividend
batch path, and its richer assertions remain available for the decisions above.
