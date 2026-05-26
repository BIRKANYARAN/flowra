-- migrate:up
-- ─────────────────────────────────────────────────────────────────────────────
-- Configurable alert thresholds per company
--
-- Allows each company to define their own alert rule thresholds for
-- receivables aging, cash runway, and other financial metrics.
-- One rule_type per company (UNIQUE constraint enforces this).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_type       text NOT NULL,   -- e.g. 'RECEIVABLE_30', 'CASH_RUNWAY_90'
  threshold_value numeric(15,2) NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, rule_type)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_company
  ON alert_rules(company_id) WHERE is_active = true;

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_rules_company_member" ON alert_rules
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- migrate:down
DROP POLICY IF EXISTS "alert_rules_company_member" ON alert_rules;
ALTER TABLE alert_rules DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_alert_rules_company;
DROP TABLE IF EXISTS alert_rules;
