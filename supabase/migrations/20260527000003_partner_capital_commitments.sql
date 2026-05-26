-- ═══════════════════════════════════════════════════════════════════════════════
-- TTK 588 Capital Call Tracker — partner_capital_commitments
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS partner_capital_commitments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id            uuid        NOT NULL REFERENCES partners(id),
  committed_amount_try  numeric(15,2) NOT NULL,
  paid_amount_try       numeric(15,2) NOT NULL DEFAULT 0,
  commitment_date       date        NOT NULL,
  call_date             date,                    -- ödeme vadesi
  payment_status        text        NOT NULL DEFAULT 'pending',  -- 'pending'|'partial'|'paid'|'overdue'
  notes                 text,
  created_by            uuid        NOT NULL REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcc_company
  ON partner_capital_commitments (company_id);

CREATE INDEX IF NOT EXISTS idx_pcc_partner
  ON partner_capital_commitments (partner_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE partner_capital_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcc_select" ON partner_capital_commitments
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pcc_insert" ON partner_capital_commitments
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "pcc_update" ON partner_capital_commitments
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
