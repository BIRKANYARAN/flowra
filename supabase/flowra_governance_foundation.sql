-- ════════════════════════════════════════════════════════════════════════════════
-- FLOWRA GOVERNANCE FOUNDATION
-- Corporate Actions Registry + Resolution Workflow + Governance Obligations
-- ════════════════════════════════════════════════════════════════════════════════

-- ── 1. CORPORATE ACTIONS ────────────────────────────────────────────────────────
-- Append-only immutable log of corporate governance events.
-- Financial events trigger prompts to record here; records link back to those events.

CREATE TABLE IF NOT EXISTS corporate_actions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type          text        NOT NULL,
  action_date          date        NOT NULL,
  title                text        NOT NULL,
  description          text,
  authorized_by        text        NOT NULL DEFAULT 'board',
  resolution_reference text,
  linked_event_type    text,
  linked_event_id      uuid,
  financial_amount     numeric(15,2),
  financial_currency   text        NOT NULL DEFAULT 'TRY',
  metadata             jsonb       NOT NULL DEFAULT '{}',
  created_by           uuid        NOT NULL REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_action_type_check CHECK (action_type IN (
    'CAPITAL_INCREASE','CAPITAL_CALL','CAPITAL_DECREASE',
    'DIVIDEND_DECLARATION','DIVIDEND_PAYMENT',
    'PARTNER_ADMISSION','PARTNER_EXIT','EQUITY_RATIO_CHANGE',
    'BOARD_APPOINTMENT','BOARD_REMOVAL','AUDITOR_APPOINTMENT',
    'ANNUAL_ACCOUNTS_APPROVAL','BUDGET_APPROVAL',
    'SIGNIFICANT_ASSET_PURCHASE','SIGNIFICANT_ASSET_DISPOSAL',
    'PARTNER_LOAN_AUTHORIZATION','COMPENSATION_AUTHORIZATION',
    'PARTNERSHIP_AGREEMENT_AMENDMENT','COMPANY_RESTRUCTURE','OTHER'
  )),
  CONSTRAINT ca_authorized_by_check CHECK (authorized_by IN (
    'board','general_meeting','shareholders','management','single_shareholder'
  ))
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_company_date
  ON corporate_actions(company_id, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type
  ON corporate_actions(company_id, action_type);

-- RLS
ALTER TABLE corporate_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corporate_actions_select" ON corporate_actions
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "corporate_actions_insert" ON corporate_actions
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- NO UPDATE policy — append-only
-- NO DELETE policy — immutable

-- ── 2. GOVERNANCE RESOLUTIONS ───────────────────────────────────────────────────
-- Board and shareholder resolutions authorizing financial actions.

CREATE TABLE IF NOT EXISTS governance_resolutions (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resolution_number          text        NOT NULL,
  title                      text        NOT NULL,
  resolution_type            text        NOT NULL DEFAULT 'board',
  status                     text        NOT NULL DEFAULT 'draft',
  resolution_date            date        NOT NULL,
  description                text        NOT NULL,
  voting_outcome             jsonb,
  proposed_by                uuid        REFERENCES auth.users(id),
  approved_by                uuid        REFERENCES auth.users(id),
  approved_at                timestamptz,
  implemented_at             timestamptz,
  linked_corporate_action_id uuid        REFERENCES corporate_actions(id),
  metadata                   jsonb       NOT NULL DEFAULT '{}',
  created_by                 uuid        NOT NULL REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gr_status_check CHECK (status IN ('draft','approved','rejected','implemented')),
  CONSTRAINT gr_type_check   CHECK (resolution_type IN ('board','general_meeting','circular')),
  UNIQUE (company_id, resolution_number)
);

CREATE INDEX IF NOT EXISTS idx_resolutions_company_date
  ON governance_resolutions(company_id, resolution_date DESC);
CREATE INDEX IF NOT EXISTS idx_resolutions_status
  ON governance_resolutions(company_id, status);

-- Auto-increment resolution number per company: RES-YYYY-NNN
CREATE OR REPLACE FUNCTION generate_resolution_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  year_str text;
  seq_num  integer;
BEGIN
  year_str := to_char(NEW.resolution_date, 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(resolution_number, '-', 3) AS integer)
  ), 0) + 1
  INTO seq_num
  FROM governance_resolutions
  WHERE company_id = NEW.company_id
    AND resolution_number LIKE 'RES-' || year_str || '-%';

  NEW.resolution_number := 'RES-' || year_str || '-' || LPAD(seq_num::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolution_number ON governance_resolutions;
CREATE TRIGGER trg_resolution_number
  BEFORE INSERT ON governance_resolutions
  FOR EACH ROW
  WHEN (NEW.resolution_number = '' OR NEW.resolution_number IS NULL)
  EXECUTE FUNCTION generate_resolution_number();

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_resolution_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_resolution_updated_at ON governance_resolutions;
CREATE TRIGGER trg_resolution_updated_at
  BEFORE UPDATE ON governance_resolutions
  FOR EACH ROW EXECUTE FUNCTION update_resolution_timestamp();

-- RLS
ALTER TABLE governance_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resolutions_select" ON governance_resolutions
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

CREATE POLICY "resolutions_insert" ON governance_resolutions
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "resolutions_update" ON governance_resolutions
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── 3. GOVERNANCE OBLIGATIONS ────────────────────────────────────────────────────
-- User-declared obligations for the governance calendar.
-- System-computed obligations are NOT stored — they are computed on-the-fly.

CREATE TABLE IF NOT EXISTS governance_obligations (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  obligation_type            text        NOT NULL DEFAULT 'contractual',
  title                      text        NOT NULL,
  description                text,
  due_date                   date        NOT NULL,
  recurrence                 text        NOT NULL DEFAULT 'none',
  recurrence_day             integer,
  status                     text        NOT NULL DEFAULT 'pending',
  completed_at               timestamptz,
  completed_by               uuid        REFERENCES auth.users(id),
  source                     text        NOT NULL DEFAULT 'user',
  linked_corporate_action_id uuid        REFERENCES corporate_actions(id),
  metadata                   jsonb       NOT NULL DEFAULT '{}',
  created_by                 uuid        NOT NULL REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT go_type_check CHECK (obligation_type IN ('statutory','contractual','internal')),
  CONSTRAINT go_status_check CHECK (status IN ('pending','completed','overdue','waived')),
  CONSTRAINT go_recurrence_check CHECK (recurrence IN ('none','monthly','quarterly','annual'))
);

CREATE INDEX IF NOT EXISTS idx_obligations_company_due
  ON governance_obligations(company_id, due_date);

ALTER TABLE governance_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obligations_select" ON governance_obligations
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );
CREATE POLICY "obligations_insert" ON governance_obligations
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
CREATE POLICY "obligations_update" ON governance_obligations
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
