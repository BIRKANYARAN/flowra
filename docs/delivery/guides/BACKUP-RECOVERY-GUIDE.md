# Flowra Backup & Recovery Guide

## What to back up
- **Database:** Supabase managed automated backups (point-in-time per plan). Take a
  manual snapshot before any migration.
- **Storage:** the Supabase Storage bucket holding logos/documents.
- **Schema as code:** `supabase/FLOWRA_PRODUCTION_INSTALL.sql` + `supabase/migrations/`
  are the source of truth; keep them in git (they are).

## Application-level backup/restore
Flowra ships an admin backup/restore path (the audit's best-engineered operational
flow):
- **Export:** admin-only; produces a tenant-scoped export.
- **Restore:** runs **pre-flight referential-integrity validation** and returns HTTP
  422 BEFORE any destructive write if the payload is inconsistent; rejects cross-tenant
  rows; guards against path traversal; performs **compensation rollback** if the atomic
  restore RPC fails partway.

## Recovery procedures
1. **Bad deploy:** promote the previous READY Vercel deployment (no DB change needed).
2. **Data corruption (single tenant):** use the admin restore from the latest good
   tenant export (pre-flight validation protects against importing inconsistent data).
3. **Full DB loss:** restore the Supabase backup, then re-apply any migrations created
   after the backup timestamp, then redeploy the matching git commit.

## Integrity verification after recovery
- Run the audit-chain verifier (admin tooling) for the affected period — it now
  reports real broken links instead of always-OK.
- Spot-check the formal P&L vs the CFO cockpit tax figure — they should agree
  (unified matrah).

## Cadence
- Verify automated DB backups weekly. Take a manual snapshot before every migration.
- Test a restore into a staging project quarterly.
