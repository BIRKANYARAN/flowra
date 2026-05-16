-- ─────────────────────────────────────────────────────────────────────────────
-- flowra_phase2_pcle.sql — PCLE Partner Capital & Liability Engine
--
-- ADDITIVE ONLY: No existing table modifications.
-- All new tables. Safe to run on production with zero downtime.
--
-- Tables:
--   partner_finance_events        — Immutable PCLE event ledger (append-only)
--   partner_loan_tranches         — Structured loan tracking per partner
--   partner_capital_commitments   — Equity commitment vs paid tracking
--   partner_compensation_schedules — Huzur hakkı recurring schedules
--   alert_rules                   — Configurable alert thresholds per company
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. partner_finance_events — Immutable PCLE Event Ledger ──────────────────
-- Append-only. Never updated. Never deleted.
-- Every partner financial event is recorded here for audit and projection.

CREATE TABLE IF NOT EXISTS partner_finance_events (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id    uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,
  -- Event type taxonomy:
  -- EQUITY:       EQUITY_COMMITMENT, EQUITY_PAYMENT, EQUITY_CALL, CAPITAL_RATIO_CHANGE
  -- LIABILITY:    LOAN_DISBURSEMENT, LOAN_REPAYMENT, LOAN_INTEREST_ACCRUAL, LOAN_RESTRUCTURE
  -- DISTRIBUTION: COMPENSATION_PAYMENT, DIVIDEND_DECLARED, DIVIDEND_PAID, LEGAL_RESERVE_SET
  -- RECONCILIATION: EQUALIZATION_TRANSFER, RETAINED_TRANSFER
  amount_try    numeric(15,2) NOT NULL DEFAULT 0,
  currency      text          NOT NULL DEFAULT 'TRY',
  fx_rate       numeric(12,6) NOT NULL DEFAULT 1,
  event_date    date          NOT NULL DEFAULT CURRENT_DATE,
  reference     text,           -- invoice, board-decision ref, etc.
  description   text,
  metadata      jsonb,          -- event-specific data (tranche_id, period_id, etc.)
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pfe_company    ON partner_finance_events(company_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_pfe_partner    ON partner_finance_events(partner_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_pfe_event_type ON partner_finance_events(event_type);

-- RLS
ALTER TABLE partner_finance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pfe_company_select" ON partner_finance_events
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pfe_company_insert" ON partner_finance_events
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- APPEND-ONLY: No update, no delete
CREATE POLICY "pfe_no_update" ON partner_finance_events
  FOR UPDATE USING (false);

CREATE POLICY "pfe_no_delete" ON partner_finance_events
  FOR DELETE USING (false);


-- ── 2. partner_loan_tranches — Structured Loan Tracking ─────────────────────
-- One row per loan disbursement. Tracks repayment progress.
-- net_loan = principal_try - total_repaid_try (computed, not stored)

CREATE TABLE IF NOT EXISTS partner_loan_tranches (
  id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id                uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id                uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  source_event_id           uuid        REFERENCES partner_finance_events(id),
  principal_try             numeric(15,2) NOT NULL CHECK (principal_try > 0),
  interest_rate_annual_pct  numeric(6,3) NOT NULL DEFAULT 0,
  disbursement_date         date        NOT NULL,
  expected_repayment_date   date,
  total_repaid_try          numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_repaid_try >= 0),
  status                    text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','partially_repaid','repaid','overdue','restructured')),
  notes                     text,
  deleted_at                timestamptz,
  created_by                uuid        REFERENCES auth.users(id),
  created_at                timestamptz DEFAULT now() NOT NULL,
  updated_at                timestamptz DEFAULT now() NOT NULL
);

-- Computed: remaining = principal - repaid (check constraint)
ALTER TABLE partner_loan_tranches
  ADD CONSTRAINT chk_repaid_not_exceed_principal
  CHECK (total_repaid_try <= principal_try);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plt_company   ON partner_loan_tranches(company_id);
CREATE INDEX IF NOT EXISTS idx_plt_partner   ON partner_loan_tranches(partner_id);
CREATE INDEX IF NOT EXISTS idx_plt_status    ON partner_loan_tranches(status) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE partner_loan_tranches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plt_company_select" ON partner_loan_tranches
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "plt_company_write" ON partner_loan_tranches
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 3. partner_capital_commitments — Equity Commitment Tracking ─────────────
-- Tracks committed vs paid equity per partner (TTK 588)

CREATE TABLE IF NOT EXISTS partner_capital_commitments (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id        uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  committed_try     numeric(15,2) NOT NULL CHECK (committed_try >= 0),
  paid_try          numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_try >= 0),
  commitment_date   date        NOT NULL DEFAULT CURRENT_DATE,
  due_date          date,
  board_decision_ref text,
  notes             text,
  deleted_at        timestamptz,
  created_by        uuid        REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_paid_not_exceed_committed CHECK (paid_try <= committed_try)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pcc_company ON partner_capital_commitments(company_id);
CREATE INDEX IF NOT EXISTS idx_pcc_partner ON partner_capital_commitments(partner_id);

-- RLS
ALTER TABLE partner_capital_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcc_company_select" ON partner_capital_commitments
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pcc_company_write" ON partner_capital_commitments
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 4. partner_compensation_schedules — Huzur Hakkı Schedules ───────────────
-- TTK 394: Board fee / huzur hakkı recurring schedule per partner

CREATE TABLE IF NOT EXISTS partner_compensation_schedules (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id          uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  monthly_amount_try  numeric(15,2) NOT NULL CHECK (monthly_amount_try >= 0),
  start_date          date        NOT NULL,
  end_date            date,       -- NULL = ongoing
  board_decision_ref  text,       -- TTK 394 requires General Assembly decision
  is_active           boolean     NOT NULL DEFAULT true,
  notes               text,
  deleted_at          timestamptz,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pcs_company ON partner_compensation_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_pcs_partner ON partner_compensation_schedules(partner_id);
CREATE INDEX IF NOT EXISTS idx_pcs_active  ON partner_compensation_schedules(company_id, is_active) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE partner_compensation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcs_company_select" ON partner_compensation_schedules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pcs_company_write" ON partner_compensation_schedules
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 5. alert_rules — Configurable Alert Thresholds ───────────────────────────
-- Per-company configurable thresholds (overrides defaults in AlertEngine)

CREATE TABLE IF NOT EXISTS alert_rules (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_type       text        NOT NULL,
  -- Rule type examples:
  -- RECEIVABLE_30, RECEIVABLE_60, CASH_RUNWAY_90, CASH_RUNWAY_30
  -- PARTNER_BURDEN, PARTNER_LOAN_DUE, PERIOD_OVERDUE, TAX_DUE_SOON
  -- BS_IMBALANCED, LEGAL_RESERVE_LOW, DSR_HIGH
  threshold_value numeric(15,4), -- meaning depends on rule_type (days, ratio, TRY)
  severity        text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  UNIQUE (company_id, rule_type)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_ar_company ON alert_rules(company_id, is_active);

-- RLS
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_company_select" ON alert_rules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ar_company_write" ON alert_rules
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 6. Seed default alert rules for existing companies ───────────────────────
-- Each company gets the standard rule set with default thresholds.
-- Only inserts if no rules exist (idempotent via ON CONFLICT DO NOTHING).

INSERT INTO alert_rules (company_id, rule_type, threshold_value, severity)
SELECT
  c.id,
  rules.rule_type,
  rules.threshold_value,
  rules.severity
FROM companies c
CROSS JOIN (VALUES
  ('RECEIVABLE_30',    30,   'warning'),
  ('RECEIVABLE_60',    60,   'critical'),
  ('CASH_RUNWAY_90',   90,   'warning'),
  ('CASH_RUNWAY_30',   30,   'critical'),
  ('PARTNER_BURDEN',   0.20, 'warning'),
  ('PERIOD_OVERDUE',   10,   'warning'),
  ('TAX_DUE_SOON',     7,    'critical'),
  ('BS_IMBALANCED',    100,  'critical'),
  ('LEGAL_RESERVE_LOW',0,    'warning'),
  ('DSR_HIGH',         0.70, 'critical')
) AS rules(rule_type, threshold_value, severity)
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, rule_type) DO NOTHING;
