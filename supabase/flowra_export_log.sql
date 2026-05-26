-- ─────────────────────────────────────────────────────────────────────────────
-- supabase/flowra_export_log.sql
--
-- Export audit log table for Certified Financial Data Export feature.
-- Track who generated exports, when, for which period, and the checksum.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  export_id text NOT NULL,
  generated_by uuid NOT NULL REFERENCES auth.users(id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  checksum text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]',
  record_counts jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_company ON export_logs(company_id, created_at DESC);

-- RLS
ALTER TABLE export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view export logs"
  ON export_logs FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can insert export logs"
  ON export_logs FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
