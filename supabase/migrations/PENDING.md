# Migration Status

All migrations have been applied to the production database.

## Applied — 2026-05-26

| File | Description | Status | Applied |
|------|-------------|--------|---------|
| 20260526000001_audit_chain_columns.sql | content_hash + prev_hash on audit_logs | ✅ APPLIED | 2026-05-26 |
| 20260526000002_journal_voucher_numbers.sql | JE-YYYY-NNNNN voucher trigger + sequence | ✅ APPLIED | 2026-05-26 |
| 20260526000003_workflow_instances.sql | Workflow approval state machine table + RLS | ✅ APPLIED | 2026-05-26 |
| 20260526000004_alert_rules_table.sql | Configurable alert thresholds per company | ✅ APPLIED | 2026-05-26 |
| 20260526000005_job_runs_table.sql | Async job tracking with idempotency keys | ✅ APPLIED | 2026-05-26 |
| 20260526000006_companies_gl_mode_default.sql | gl_mode CHECK constraint on companies | ✅ APPLIED | 2026-05-26 |

## Verification (2026-05-26)

- audit_logs.content_hash, audit_logs.prev_hash — columns present
- journal_entries.voucher_number — column + UNIQUE index + trigger present
- journal_voucher_seq sequence — present
- workflow_instances table — created, RLS enabled, 2 indexes
- alert_rules table — created, RLS enabled, UNIQUE(company_id, rule_type)
- job_runs table — created, idempotency_key UNIQUE
- companies.gl_mode — column present, DEFAULT 'shadow', CHECK constraint active

## No pending migrations
