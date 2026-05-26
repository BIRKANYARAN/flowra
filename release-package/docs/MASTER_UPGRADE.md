# Flowra — Master Upgrade Guide

**Version:** 3.0  
**Audience:** Developers and IT administrators upgrading an existing Flowra installation.  
**Estimated time:** 15–30 minutes for a standard upgrade.

---

## Table of Contents

1. [Before You Upgrade](#1-before-you-upgrade)
2. [Standard Upgrade Path](#2-standard-upgrade-path)
3. [GL Mode Upgrade Path](#3-gl-mode-upgrade-path)
4. [Rollback Instructions](#4-rollback-instructions)
5. [Post-Upgrade Verification](#5-post-upgrade-verification)
6. [Breaking Changes](#6-breaking-changes)
7. [Migration File Status](#7-migration-file-status)

---

## 1. Before You Upgrade

### Check your current version

Flowra does not currently embed a version number in the database. Determine your approximate version by checking which features exist:

```sql
-- Run in Supabase SQL Editor
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'companies' AND column_name = 'gl_mode'
) AS has_gl_mode,
EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'journal_entries'
) AS has_journal_entries,
EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'governance_reports'
) AS has_governance,
EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'reconciliation_snapshots'
) AS has_reconciliation;
```

| Result | Interpretation |
|---|---|
| All four `true` | You are on v2.5+ — standard upgrade applies |
| `has_gl_mode = false` | You are on v1.x — contact support before upgrading |
| `has_journal_entries = false` | Pre-GL era — run full install on a new database |

### Create a database backup

**Always back up before upgrading.** Supabase provides point-in-time recovery on paid plans and daily backups on all plans.

**Manual backup via Supabase Dashboard:**
1. Go to **Project Settings → Database → Backups**.
2. Click **Create backup** (available on Pro plan and above).
3. Wait for completion before proceeding.

**Manual export (free tier):**
```bash
# Export schema + data using pg_dump
pg_dump "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
  --no-owner --no-acl \
  -f flowra_backup_$(date +%Y%m%d).sql
```

You will need your database password from **Project Settings → Database → Connection info**.

### Check for active users

Notify users before running the upgrade. The SQL upgrade script is non-destructive and does not drop data, but it does acquire table locks briefly while adding columns and creating indexes.

Recommended maintenance window: 5 minutes is sufficient for most upgrades.

---

## 2. Standard Upgrade Path

The canonical upgrade file applies all changes since the initial installation and is safe to run on any v2.x installation:

```
supabase/FLOWRA_PRODUCTION_UPGRADE.sql
```

### How to run it

1. Go to **Supabase Dashboard → SQL Editor**.
2. Click **New query**.
3. Open `supabase/FLOWRA_PRODUCTION_UPGRADE.sql` in a text editor, select all, and paste into the SQL Editor.
4. Click **Run**.

### What the upgrade does

- Adds new columns to existing tables (all `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
- Creates new tables introduced after the initial release (governance, reconciliation, partner tranches, etc.)
- Creates or replaces database functions (fully idempotent)
- Updates RLS policies for new tables
- Does **not** drop any existing tables or columns
- Does **not** modify existing data

### After the upgrade

Update your application code to the latest version:

```bash
git pull origin main
npm install
npm run build
```

If deploying to Vercel, push to your linked branch — Vercel will automatically rebuild and deploy.

---

## 3. GL Mode Upgrade Path

Flowra's GL (General Ledger) system has three progressive modes. Most installations start in `shadow` mode. This section explains how to advance through each mode safely.

### Understanding GL Modes

| Mode | Journal entries written? | Financial statements source | Use when |
|---|---|---|---|
| `shadow` | No | Operational tables (sales, expenses, collections) | Default for new installations |
| `parallel` | Yes (background) | Operational tables (statements use ops data) | Validating journal entries before cutover |
| `gl_primary` | Yes | Journal entries (ledger-driven statements) | Full double-entry accounting active |

### Check your current GL mode

```sql
SELECT id, name, gl_mode FROM companies;
```

### Phase A: Shadow → Parallel

This phase activates journal entry writing for all new transactions AND backfills journal entries for all historical records.

**Step 1: Run the backfill script**

```sql
-- Paste content of: supabase/flowra_phase9c_backfill.sql
-- This creates journal entries for all existing sales, expenses,
-- collections, and partner transactions.
-- Duration: 30 seconds to 5 minutes depending on data volume.
```

**Step 2: Verify the backfill**

```sql
SELECT COUNT(*) FROM journal_entries;
-- Should be > 0 if you have historical transactions

-- Check for any failed entries
SELECT COUNT(*) FROM journal_entries WHERE debit_account IS NULL OR credit_account IS NULL;
-- Should return 0
```

**Step 3: Validate trial balance is balanced**

Navigate to `/dashboard/cfo` → Trial Balance. The **Difference** row at the bottom must be **0.00 TL**. If it shows a non-zero difference, do not advance to `gl_primary`.

**Step 4: Update GL mode**

```sql
UPDATE companies SET gl_mode = 'parallel' WHERE id = 'your-company-uuid';
```

New transactions will now write journal entries automatically.

**Step 5: Run shadow audit validation**

```
GET /api/admin/gl-shadow-audit
Authorization: Bearer <service_role_key>
```

This endpoint compares operational table totals against GL totals and reports any discrepancies.

### Phase B: Parallel → GL Primary

Only advance to `gl_primary` after running in `parallel` mode for at least one full accounting period (30 days) and confirming the trial balance remains balanced.

**Step 1: Validate parallel mode**

- Confirm trial balance is balanced (Difference = 0.00)
- Confirm all income statement line items match between `/dashboard/finance` and `/dashboard/cfo`
- Run shadow audit: `GET /api/admin/gl-shadow-audit` → should return zero discrepancies

**Step 2: Run the cutover script**

```sql
-- Paste content of: supabase/flowra_phase9c_gl_primary_cutover.sql
-- This changes the financial statement queries to read from journal_entries
-- rather than operational tables.
```

**Step 3: Confirm cutover**

```sql
SELECT gl_mode FROM companies WHERE id = 'your-company-uuid';
-- Should return: gl_primary
```

**Step 4: Verify financial statements**

Navigate to `/dashboard/finance` → Genel Bakış. Verify that revenue, expense, and net profit figures are consistent with what you saw before the cutover.

---

## 4. Rollback Instructions

### Rollback gl_primary → parallel

If issues appear after activating `gl_primary`, roll back immediately:

```sql
-- Paste content of: supabase/flowra_phase9c_rollback.sql
-- This reverts gl_mode to 'parallel' and restores financial statement
-- queries to use operational tables.
```

Verify:

```sql
SELECT gl_mode FROM companies WHERE id = 'your-company-uuid';
-- Should return: parallel
```

### Rollback parallel → shadow

```sql
UPDATE companies SET gl_mode = 'shadow' WHERE id = 'your-company-uuid';
```

Note: This does not delete journal entries that were written during parallel mode. The entries remain in the database but are no longer used for financial statements. This is intentional — the data is preserved for audit purposes.

### Rollback the SQL upgrade

The `FLOWRA_PRODUCTION_UPGRADE.sql` script only adds columns, tables, and functions — it does not remove anything. True rollback of a SQL upgrade is not possible without restoring from the backup you created before upgrading.

If specific new columns are causing issues, they can be dropped individually:

```sql
-- Example: remove a specific column added by upgrade
ALTER TABLE expenses DROP COLUMN IF EXISTS workflow_status;
```

Contact support for guidance before manually dropping schema elements.

---

## 5. Post-Upgrade Verification

After every upgrade, run through this checklist:

- [ ] `GET /api/health` returns `{"status":"ok"}`
- [ ] Dashboard loads without JavaScript errors
- [ ] `/dashboard/finance` loads all 8 tabs without errors
- [ ] `/dashboard/admin` loads the admin hub
- [ ] `/dashboard/cfo` shows Trial Balance (check for 0.00 difference if in parallel/gl_primary)
- [ ] Run `supabase/schema_verify.sql` in SQL Editor — should report no missing columns
- [ ] Run `supabase/db_audit.sql` in SQL Editor — should report no issues
- [ ] Create a test transaction (sale or expense) and verify it appears in the correct report
- [ ] If GL mode is `parallel` or `gl_primary`: verify a new journal entry was written for your test transaction

### Schema verification query

```sql
-- Paste content of: supabase/schema_verify.sql
-- Reports any expected columns that are missing from the schema.
-- All rows should show 'EXISTS'.
```

---

## 6. Breaking Changes

### v3.0 (current)

**No breaking changes.** Version 3.0 is a purely additive release:

- New tables added (governance, reconciliation, extended partner features)
- New columns added to existing tables
- New API endpoints added
- Existing API endpoints and database schema are fully backward compatible

No changes to existing column names, table names, or API response shapes. No changes to authentication or session handling.

### v2.x → v3.0 migration

Run `FLOWRA_PRODUCTION_UPGRADE.sql` — this handles the full migration automatically.

### v1.x → v3.0 migration

Direct migration from v1.x to v3.0 is not supported via the upgrade script. If you are on v1.x, create a new Supabase project, run `FLOWRA_PRODUCTION_INSTALL.sql`, and migrate your data manually. Contact support for assistance.

---

## 7. Migration File Status

| File | Status | Notes |
|---|---|---|
| `FLOWRA_PRODUCTION_INSTALL.sql` | Current | Use for new installs only |
| `FLOWRA_PRODUCTION_UPGRADE.sql` | Current | Use for all upgrades |
| `flowra_phase9c_backfill.sql` | Current | Run when advancing to `parallel` GL mode |
| `flowra_phase9c_gl_primary_cutover.sql` | Current | Run when advancing to `gl_primary` GL mode |
| `flowra_phase9c_rollback.sql` | Current | Run to roll back `gl_primary` |
| `db_audit.sql` | Current | Diagnostic — run anytime |
| `schema_verify.sql` | Current | Diagnostic — run after upgrades |
| `repair_production.sql` | Current | Emergency use only |
| `governance.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `reconciliation_system.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `accounting_truth_v1.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `grant-fix.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `patch_company_settings_columns.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `phase9_workflow_governance_patch.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `FLOWRA_SYNC_PATCH.sql` | Superseded | Included in `FLOWRA_PRODUCTION_UPGRADE.sql` |
| `flowra_install.sql` | Superseded | Legacy installer — do not use |
| `flowra_FULL_MIGRATION.sql` | Superseded | Legacy upgrade — do not use |
| `FLOWRA_FULL_INSTALL.sql` | Superseded | Intermediate installer — do not use |
| `supabase/archive/*` | Historical | Reference only — do not run |
| `supabase/migrations/*` | Historical | Reference only — do not run |
