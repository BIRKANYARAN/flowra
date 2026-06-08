-- recurring_expenses: exists in prod + heavily queried, but was never in the canonical
-- install or any migration (created ad-hoc). Idempotent; folds it into fresh-install parity.
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id),
  description   text        NOT NULL,
  category      text        NOT NULL DEFAULT 'general',
  amount        numeric     NOT NULL,
  currency      text        NOT NULL DEFAULT 'TRY',
  fx_rate       numeric     NOT NULL DEFAULT 1,
  frequency     text        NOT NULL DEFAULT 'monthly',
  start_date    date        NOT NULL,
  end_date      date,
  is_active     boolean     NOT NULL DEFAULT true,
  is_deductible boolean,
  kdv           numeric     NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_company
  ON recurring_expenses (company_id) WHERE (deleted_at IS NULL AND is_active = true);

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_expenses_company ON recurring_expenses;
CREATE POLICY recurring_expenses_company ON recurring_expenses FOR ALL USING (
  company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON recurring_expenses FROM anon;
