-- ─────────────────────────────────────────────────────────────────────────────
-- Decision Context Snapshots
--
-- Stores the financial context (cash, runway, net income, situation score, etc.)
-- at the moment a significant governance decision was made. Enables future
-- decision-makers to answer "what was the financial state when this was approved?"
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decision_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- What triggered this snapshot
  trigger_type  text NOT NULL,   -- 'workflow_approved' | 'dividend_declared' | 'resolution_passed' | 'period_closed' | 'large_expense' | 'partner_loan' | 'manual'
  trigger_id    uuid,            -- FK to the triggering record (workflow_id, resolution_id, etc.)
  trigger_label text NOT NULL,   -- Human-readable: "Masraf Onayı: ₺120.000 IT Altyapısı"

  -- Who made the decision
  decision_by uuid REFERENCES auth.users(id),
  decision_at timestamptz NOT NULL DEFAULT now(),

  -- Financial context snapshot at time of decision
  context_snapshot jsonb NOT NULL,

  -- Optional human annotation (can be added later)
  annotation   text,
  annotated_by uuid REFERENCES auth.users(id),
  annotated_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_company
  ON decision_context_snapshots(company_id, decision_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_trigger
  ON decision_context_snapshots(company_id, trigger_type);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE decision_context_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view decision snapshots"
  ON decision_context_snapshots FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can insert decision snapshots"
  ON decision_context_snapshots FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Company admins can update decision snapshots"
  ON decision_context_snapshots FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
