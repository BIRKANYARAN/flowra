-- ─────────────────────────────────────────────────────────────────────────────
-- flowra_forward_commitments.sql
-- Commitment & Obligation Ledger — user-declared forward commitments table
-- Run once per environment (idempotent with IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forward_commitments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                text NOT NULL,
  commitment_type      text NOT NULL,   -- 'contract', 'purchase_order', 'lease', 'tax_payment', 'loan_repayment', 'dividend', 'capex', 'other'
  amount_try           numeric(15,2),   -- can be null if amount unknown
  currency             text NOT NULL DEFAULT 'TRY',
  due_date             date NOT NULL,
  recurrence           text,            -- null | 'monthly' | 'quarterly' | 'annual'
  recurrence_end_date  date,
  counterparty         text,            -- vendor, partner name, etc.
  description          text,
  status               text NOT NULL DEFAULT 'active',  -- 'active' | 'fulfilled' | 'cancelled'
  linked_resource_type text,            -- optional link to expense/partner/etc.
  linked_resource_id   uuid,
  created_by           uuid NOT NULL REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forward_commitments_company
  ON forward_commitments(company_id, due_date);

CREATE INDEX IF NOT EXISTS idx_forward_commitments_status
  ON forward_commitments(company_id, status);

-- RLS
ALTER TABLE forward_commitments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forward_commitments'
      AND policyname = 'Company members can view commitments'
  ) THEN
    CREATE POLICY "Company members can view commitments"
      ON forward_commitments FOR SELECT
      USING (company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forward_commitments'
      AND policyname = 'Company admins can insert commitments'
  ) THEN
    CREATE POLICY "Company admins can insert commitments"
      ON forward_commitments FOR INSERT
      WITH CHECK (company_id IN (
        SELECT company_id FROM company_members
        WHERE user_id = auth.uid() AND role = 'admin'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forward_commitments'
      AND policyname = 'Company admins can update commitments'
  ) THEN
    CREATE POLICY "Company admins can update commitments"
      ON forward_commitments FOR UPDATE
      USING (company_id IN (
        SELECT company_id FROM company_members
        WHERE user_id = auth.uid() AND role = 'admin'
      ));
  END IF;
END $$;
