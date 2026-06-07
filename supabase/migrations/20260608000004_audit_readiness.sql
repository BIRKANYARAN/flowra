-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra: Audit Readiness Engine — Migration
-- Table: governance_audit_acknowledgments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance_audit_acknowledgments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  check_key         text        NOT NULL,           -- e.g. 'receivables_aging_reviewed'
  acknowledged_by   uuid        NOT NULL REFERENCES auth.users(id),
  acknowledged_at   timestamptz NOT NULL DEFAULT now(),
  notes             text,
  valid_until       date        NOT NULL,           -- acknowledgment expires (typically 30 days from creation)
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_audit_ack_company
  ON governance_audit_acknowledgments(company_id, check_key, valid_until);

-- RLS: company members can read; only admins insert (enforced at API layer)
ALTER TABLE governance_audit_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_read_audit_ack"
  ON governance_audit_acknowledgments FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_members_insert_audit_ack"
  ON governance_audit_acknowledgments FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );
