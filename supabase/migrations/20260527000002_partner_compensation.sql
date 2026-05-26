-- ═══════════════════════════════════════════════════════════════════════════════
-- TTK 394 Partner Compensation (Huzur Hakkı) — Scheduler + Payments
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Compensation schedules ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_compensation_schedules (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id          uuid        NOT NULL REFERENCES partners(id)  ON DELETE CASCADE,
  monthly_gross_try   numeric(15,2) NOT NULL,
  withholding_rate    numeric(4,3)  NOT NULL DEFAULT 0.15,  -- GVK 94 stopaj (varsayılan %15)
  sgk_rate            numeric(4,3)  NOT NULL DEFAULT 0.00,  -- SGK katkı payı
  effective_from      date        NOT NULL,
  effective_until     date,                                 -- null = devam ediyor
  board_decision_ref  text,                                 -- yönetim kurulu kararı no
  is_active           boolean     NOT NULL DEFAULT true,
  notes               text,
  created_by          uuid        NOT NULL REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcs_company_active
  ON partner_compensation_schedules (company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_pcs_partner
  ON partner_compensation_schedules (partner_id);

-- ── Compensation payments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_compensation_payments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  schedule_id        uuid        NOT NULL REFERENCES partner_compensation_schedules(id),
  partner_id         uuid        NOT NULL REFERENCES partners(id),
  payment_period     date        NOT NULL,   -- ödeme döneminin ilk günü (YYYY-MM-01)
  gross_amount_try   numeric(15,2) NOT NULL,
  withholding_try    numeric(15,2) NOT NULL,
  sgk_try            numeric(15,2) NOT NULL DEFAULT 0,
  net_amount_try     numeric(15,2) NOT NULL,
  payment_status     text        NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'cancelled'
  paid_at            timestamptz,
  expense_id         uuid        REFERENCES expenses(id),     -- bağlı gider kaydı
  notes              text,
  created_by         uuid        NOT NULL REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (schedule_id, payment_period)  -- aynı döneme çift kayıt önleme
);

CREATE INDEX IF NOT EXISTS idx_pcp_company
  ON partner_compensation_payments (company_id, payment_period);

CREATE INDEX IF NOT EXISTS idx_pcp_schedule
  ON partner_compensation_payments (schedule_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE partner_compensation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_compensation_payments  ENABLE ROW LEVEL SECURITY;

-- SELECT: company members
CREATE POLICY "pcs_select" ON partner_compensation_schedules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- INSERT/UPDATE: admin only
CREATE POLICY "pcs_insert" ON partner_compensation_schedules
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "pcs_update" ON partner_compensation_schedules
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Payments
CREATE POLICY "pcp_select" ON partner_compensation_payments
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pcp_insert" ON partner_compensation_payments
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "pcp_update" ON partner_compensation_payments
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
