# Flowra Deployment Guide

## Stack
- Next.js (App Router) on **Vercel**; auto-deploy from GitHub `main`.
- Supabase (Postgres + Auth + Storage) as the backend.

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + Bearer path.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only (admin client / crons). Never client-exposed.
- `CRON_SECRET` — required; Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

## First deploy (fresh environment)
1. Create the Supabase project.
2. Run `supabase/FLOWRA_PRODUCTION_INSTALL.sql` in the SQL editor (now includes the
   "DRIFT FOLD" section → all 59 tables + 92 RLS policies, fresh-install complete).
3. Set env vars in Vercel (Production scope).
4. Push to `main` → Vercel builds & deploys. Confirm `state: READY`.
5. In Vercel → Cron, confirm the 4 scheduled jobs are registered (vercel.json) and run.

## Upgrading an EXISTING database
- Apply `supabase/FLOWRA_PRODUCTION_UPGRADE.sql` and any un-applied files in
  `supabase/migrations/` IN ORDER. Existing prod still needs the 7 drift migrations
  (alert_feed, company_documents, decision_context_snapshots, kpi_targets,
  monthly_budgets, partner_compensation_payments, product_reorder_thresholds).
- This is the credential-gated step; verify each `CREATE TABLE IF NOT EXISTS` and RLS
  policy applied without error.

## CI / quality gate (before any merge to main)
`npx tsc --noEmit` (0 errors) · `npm run build` (compiles) · `npm run test:run` (green).
The schema-drift-guard test fails if a new migration table is not folded into the
canonical install.

## Rollback
Vercel: promote the previous READY deployment (rollback candidates are flagged in the
deployment list). DB changes are forward-only; use the documented backup/restore for data.
