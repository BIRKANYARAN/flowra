# Flowra — Database Migrations

All schema changes from this point forward go through `supabase/migrations/`.

## Running migrations

```bash
# Apply all pending migrations
npm run db:migrate

# Roll back the last migration
npm run db:rollback

# Show migration status
npm run db:status

# Create a new migration file
npm run db:new <migration_name>
```

## Prerequisites

Install `dbmate` binary:
```bash
# macOS (Apple Silicon)
curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-darwin-arm64
chmod +x /usr/local/bin/dbmate

# macOS (Intel)
curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-darwin-amd64
chmod +x /usr/local/bin/dbmate
```

Set the database URL in `.env.local`:
```
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

## Migration file format

Each migration file has `-- migrate:up` and `-- migrate:down` sections.
Files are named `YYYYMMDDHHMMSS_description.sql` and run in timestamp order.

## Archive

Legacy SQL files (pre-migration-runner) are in `supabase/archive/`. They are
kept for reference but are NOT run by dbmate. Do not modify them.

## Current migrations

| File | Description |
|------|-------------|
| 20260526000001_audit_chain_columns.sql | Add content_hash + prev_hash to audit_logs |
| 20260526000002_journal_voucher_numbers.sql | Voucher numbering on journal_entries |
| 20260526000003_workflow_instances.sql | Workflow approval state machine table |
| 20260526000004_alert_rules_table.sql | Configurable alert thresholds per company |
| 20260526000005_job_runs_table.sql | Async job tracking (service role only) |
| 20260526000006_companies_gl_mode_default.sql | gl_mode column with constraint on companies |
