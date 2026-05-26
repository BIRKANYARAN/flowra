-- migrate:up
-- ─────────────────────────────────────────────────────────────────────────────
-- Workflow approval state machine table
--
-- Tracks multi-step approval flows: expense approvals, partner loan entries,
-- dividend declarations, period close, and period lock operations.
-- Each workflow has an initiator, an optional approver, expiry, and payload.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_instances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_type  text NOT NULL CHECK (workflow_type IN (
                   'expense_approval','partner_loan_entry','dividend_declaration',
                   'period_close','period_lock'
                 )),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN (
                   'pending','approved','rejected','expired','executed'
                 )),
  initiator_id   uuid NOT NULL REFERENCES auth.users(id),
  approver_id    uuid REFERENCES auth.users(id),
  initiated_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  expires_at     timestamptz NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_instances_company_status
  ON workflow_instances(company_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_expires
  ON workflow_instances(expires_at) WHERE status = 'pending';

-- RLS
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
-- Policy: company members can see their company's workflows
-- Admins can approve/reject; any member can initiate
CREATE POLICY "workflow_instances_company_member" ON workflow_instances
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- migrate:down
DROP POLICY IF EXISTS "workflow_instances_company_member" ON workflow_instances;
ALTER TABLE workflow_instances DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_workflow_instances_expires;
DROP INDEX IF EXISTS idx_workflow_instances_company_status;
DROP TABLE IF EXISTS workflow_instances;
