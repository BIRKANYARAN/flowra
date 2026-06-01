# Flowra Admin Guide

Scope: company administrators (role = admin). Admins manage members, settings,
governance, backups, and integrity tooling.

## Roles & access
- Access is enforced by Supabase **RLS** keyed on `company_members(user_id, company_id, role)`.
- `admin` can write settings, declare dividends, run admin/audit tooling. `manager`
  has elevated inventory rights. All members read their company's data only.
- The service-role key is server-only (lib/admin-db.ts); never exposed to the client.

## Settings (/dashboard/settings)
- Company profile, logo, document identity (PDF branding), bank accounts, policy
  interest rate (per currency), demo data (disabled in production).

## Governance & integrity
- **Audit chain:** /dashboard/admin audit tooling verifies the SHA-256 hash chain
  of `audit_logs`. A genuine verification error now reports **not-OK** (it previously
  always reported healthy). Tampered or unstamped rows are flagged.
- **Reconciliation:** the 19-section institutional reconciliation runs balance-sheet,
  partner-finance and over-distribution checks that now compute real variances.
- **Certified export:** SHA-256-fingerprinted governance export; partner debt is now
  reported correctly (was 0). Note: the fingerprint is an integrity hash, not a legal
  e-signature.

## Scheduled jobs (Vercel Cron)
Daily/monthly crons run receivables aging, interest accrual, workflow expiry, and
governance snapshots. They require the `CRON_SECRET` env var (Bearer auth). Verify in
the Vercel dashboard that all four show successful runs.

## Known operational notes
- Monthly/derived metrics are computed **on read** (on demand), by design — there is
  no background event/outbox aggregation. (The unused event-outbox subsystem was
  removed; the scheduled **job** workers under `/api/cron/*` are unaffected.)
