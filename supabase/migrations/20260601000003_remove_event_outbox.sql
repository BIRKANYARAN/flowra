-- ════════════════════════════════════════════════════════════════════════════
-- 20260601000003_remove_event_outbox.sql
--
-- Remove the dead event-outbox subsystem (owner decision: remove, not complete).
--
-- Verified dead against live production before removal:
--   • event_outbox: 0 rows, no FK dependents, read only by claim_event_batch +
--     the (now-deleted) EventService; never drained (/api/events/process absent
--     from vercel.json crons). emit() also wrote non-existent columns, so it
--     failed-but-caught on every mutation — the outbox was never populated.
--   • monthly_metrics: 0 rows, NO readers in TS or SQL (the recurring-revenue
--     "monthly_metrics" object is an in-memory MRR field, a name collision),
--     written only by upsert_monthly_metrics (the dead sale.created handler).
--   • Metrics are computed on-read (docs/FINANCIAL_MODEL.md §8 — "computed on
--     demand, not event-driven"), so the subsystem is redundant, not idle.
--
-- The JOB system (jobs/job_runs tables, claim_next_job/fail_job/enqueue_job/
-- complete_job RPCs, lib/jobs/**, /api/jobs/**, /api/cron/**) is SEPARATE and
-- live — it is intentionally NOT touched here.
--
-- Drop order: functions first (claim_event_batch RETURNS setof event_outbox, so
-- it depends on the table), then the tables (RLS policies + indexes drop with
-- the table). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.claim_event_batch(text, integer);
DROP FUNCTION IF EXISTS public.upsert_monthly_metrics(uuid, integer, integer, numeric, numeric, numeric, numeric, integer, integer);

DROP TABLE IF EXISTS public.event_outbox;
DROP TABLE IF EXISTS public.monthly_metrics;
