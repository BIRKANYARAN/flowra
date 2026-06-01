-- ════════════════════════════════════════════════════════════════════════════
-- 20260601000002_audit_logging_integrity.sql
--
-- AUDIT & LOGGING INTEGRITY remediation (finalization program).
--
-- Three independent, evidence-backed defects, all verified against live prod:
--
-- (1) CRITICAL — tamper-evident hash chain silently disabled.
--     audit_logs_stamp() (BEFORE INSERT trigger) calls digest(), which lives in
--     the `extensions` schema, but the function has NO `SET search_path`. For any
--     insert whose active search_path lacks `extensions` (e.g. write_system_log
--     sets it to 'public'; authenticated PostgREST inserts), digest() fails to
--     resolve, the blanket `EXCEPTION WHEN OTHERS` swallows it, and the row is
--     committed with content_hash = NULL. Proven with an in-transaction probe:
--     `SET search_path='public'; INSERT … RETURNING content_hash` → NULL.
--     FIX: pin `SET search_path TO public, extensions` AND schema-qualify
--     extensions.digest(). The happy path now always hashes.
--
-- (2) DATA INTEGRITY — diagnostic logs pollute the tamper-evident audit table.
--     write_system_log() inserts diagnostic system logs INTO audit_logs with
--     entity_type='system_log' and NO company_id. All 215 current audit_logs
--     rows are system_log noise (zero business audits), invisible to the
--     is_company_admin(company_id) SELECT policy and un-attributable.
--     FIX: dedicated public.system_logs table; repoint write_system_log to it;
--     migrate the existing rows out of audit_logs.
--
-- (3) (companion, code side) the dead app-side stampAuditRow() UPDATE and the
--     format-divergent JS verifier are addressed in the application layer.
--
-- Idempotent. Validated with BEGIN/ROLLBACK against production before apply.
-- ════════════════════════════════════════════════════════════════════════════

-- ── (1) Re-stamp trigger: resolve digest deterministically ───────────────────
CREATE OR REPLACE FUNCTION public.audit_logs_stamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_prev text;
BEGIN
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.company_id::text,'∅'), 0));
    SELECT content_hash INTO v_prev FROM audit_logs
      WHERE company_id IS NOT DISTINCT FROM NEW.company_id AND content_hash IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    NEW.prev_hash := v_prev;
    -- schema-qualify digest so it resolves regardless of caller search_path
    NEW.content_hash := encode(
      extensions.digest(
        audit_row_payload(NEW.action, NEW.entity_type, NEW.entity_id,
                          NEW.old_data, NEW.new_data, NEW.created_at) || coalesce(v_prev,''),
        'sha256'),
      'hex');
  EXCEPTION WHEN OTHERS THEN
    -- Defensive only: with the search_path pin above this should never fire.
    -- An unhashed row is a VISIBLE gap (verify_audit_chain reports has_hash=false),
    -- which is strictly better than dropping the audit record entirely.
    NEW.content_hash := NULL; NEW.prev_hash := NULL;
  END;
  RETURN NEW;
END $function$;

-- ── (2) Dedicated diagnostic log table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  text,
  user_id     uuid,
  level       text NOT NULL DEFAULT 'info',
  message     text NOT NULL DEFAULT '',
  context     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level   ON public.system_logs (level, created_at DESC);

-- Diagnostics are not user-facing: RLS on, no policy → only service_role /
-- the SECURITY DEFINER writer reach it. Lock down direct table access.
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_logs FROM anon, authenticated, PUBLIC;
GRANT  SELECT, INSERT ON public.system_logs TO service_role;

-- Repoint the diagnostic writer away from the tamper-evident audit table.
CREATE OR REPLACE FUNCTION public.write_system_log(
  p_request_id text DEFAULT NULL::text,
  p_user_id    uuid DEFAULT NULL::uuid,
  p_level      text DEFAULT 'info'::text,
  p_message    text DEFAULT ''::text,
  p_context    jsonb DEFAULT NULL::jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.system_logs (request_id, user_id, level, message, context, created_at)
  VALUES (p_request_id, p_user_id, p_level, p_message, p_context, now());
EXCEPTION WHEN OTHERS THEN
  -- Logging must NEVER crash the caller.
  NULL;
END;
$function$;

REVOKE ALL    ON FUNCTION public.write_system_log(text, uuid, text, text, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.write_system_log(text, uuid, text, text, jsonb) TO authenticated, service_role;

-- ── Migrate existing diagnostic rows out of the audit chain ──────────────────
-- action was stored as 'level:message'; entity_id held the request_id; context
-- was stored in new_data. Copy first, then delete from audit_logs.
INSERT INTO public.system_logs (request_id, user_id, level, message, context, created_at)
SELECT entity_id,
       user_id,
       split_part(action, ':', 1),
       substring(action FROM position(':' IN action) + 1),
       new_data,
       created_at
FROM public.audit_logs
WHERE entity_type = 'system_log';

DELETE FROM public.audit_logs WHERE entity_type = 'system_log';
