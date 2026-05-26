-- Monthly budget targets per company
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  budget_year     integer NOT NULL CHECK (budget_year >= 2020 AND budget_year <= 2100),
  budget_month    integer NOT NULL CHECK (budget_month >= 1 AND budget_month <= 12),
  revenue_target_try    numeric(15,2) NOT NULL DEFAULT 0,
  expense_target_try    numeric(15,2) NOT NULL DEFAULT 0,
  gross_profit_target_try numeric(15,2) GENERATED ALWAYS AS (revenue_target_try - expense_target_try) STORED,
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_budgets_company_period_uq UNIQUE (company_id, budget_year, budget_month)
);

-- RLS
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_budgets_select" ON monthly_budgets
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "monthly_budgets_insert" ON monthly_budgets
  FOR INSERT WITH CHECK (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
    AND role = 'admin'
  ));
CREATE POLICY "monthly_budgets_update" ON monthly_budgets
  FOR UPDATE USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
    AND role = 'admin'
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_monthly_budgets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER monthly_budgets_updated_at BEFORE UPDATE ON monthly_budgets
  FOR EACH ROW EXECUTE FUNCTION update_monthly_budgets_updated_at();
