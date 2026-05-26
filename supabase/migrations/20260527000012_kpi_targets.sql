CREATE TABLE IF NOT EXISTS kpi_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kpi_key         text NOT NULL,    -- e.g. 'monthly_revenue', 'gross_margin_pct', 'cash_runway_months'
  target_value    numeric(15,4) NOT NULL,
  target_label    text,             -- optional display label override
  period_type     text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly','quarterly','annual','rolling')),
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_targets_company_key_uq UNIQUE (company_id, kpi_key)
);

ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_targets_select" ON kpi_targets
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
CREATE POLICY "kpi_targets_write" ON kpi_targets
  FOR ALL USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION update_kpi_targets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER kpi_targets_updated_at BEFORE UPDATE ON kpi_targets
  FOR EACH ROW EXECUTE FUNCTION update_kpi_targets_updated_at();
