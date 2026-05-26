# Pending Migrations — Requires Manual Supabase Execution

These migrations have been generated but NOT yet applied to the database.
Run them in order in your Supabase SQL Editor.

## Status

| File | Description | Status |
|------|-------------|--------|
| 20260526000001_audit_chain_columns.sql | content_hash + prev_hash on audit_logs | ⏸ PENDING |
| 20260526000002_journal_voucher_numbers.sql | JE-YYYY-NNNNN voucher trigger | ⏸ PENDING |
| 20260526000003_workflow_instances.sql | Workflow approval state machine table | ⏸ PENDING |
| 20260526000004_alert_rules_table.sql | Configurable alert thresholds per company | ⏸ PENDING |
| 20260526000005_job_runs_table.sql | Async job tracking | ⏸ PENDING |
| 20260526000006_companies_gl_mode_default.sql | gl_mode column constraint | ⏸ PENDING |

## How to apply

1. Open Supabase Dashboard → SQL Editor → New Query
2. Copy each file's `-- migrate:up` section content
3. Run in order (lowest timestamp first)
4. Mark as applied by removing from this list

## Dependency order

000001 → (no deps)
000002 → requires journal_entries table
000003 → requires companies, auth.users, company_members tables
000004 → requires companies, company_members tables
000005 → requires companies table
000006 → requires companies table
