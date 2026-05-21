-- ═══════════════════════════════════════════════════════════════════════════════
-- Flowra — Master Shareholder Reconciliation System
-- reconciliation_snapshots + reconciliation_signoffs
-- Idempotent (IF NOT EXISTS everywhere)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Immutable reconciliation snapshots
CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id           uuid NOT NULL,  -- FK to companies
  created_by           uuid NOT NULL,  -- FK to auth.users
  created_at           timestamptz DEFAULT now() NOT NULL,
  reconciliation_date  date NOT NULL,
  title                text NOT NULL DEFAULT 'Ortaklar Kurulu Mutabakat Dosyası',
  period_label         text,           -- e.g. "2026-04"
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_approval','approved','archived')),
  -- Frozen data (19 sections as JSON)
  sections             jsonb NOT NULL DEFAULT '{}',
  -- Immutability
  data_hash            text,           -- SHA256 of sections JSON
  dataset_version      int  NOT NULL DEFAULT 1,
  is_immutable         boolean NOT NULL DEFAULT false,
  immutable_at         timestamptz,
  -- Scoring
  confidence_score     int CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_factors   jsonb,
  -- Governance
  governance_findings  jsonb,
  -- Meta
  approver_count       int NOT NULL DEFAULT 0,
  signoff_count        int NOT NULL DEFAULT 0,
  metadata             jsonb
);

-- Per-shareholder signoffs
CREATE TABLE IF NOT EXISTS reconciliation_signoffs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id   uuid NOT NULL REFERENCES reconciliation_snapshots(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL,
  partner_id    uuid,                 -- nullable — may not be in partners table yet
  partner_name  text NOT NULL,
  ownership_pct numeric(5,2),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  signed_at     timestamptz,
  comments      text,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recon_snapshots_company ON reconciliation_snapshots(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_signoffs_snapshot ON reconciliation_signoffs(snapshot_id);

-- RLS
ALTER TABLE reconciliation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_signoffs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recon_snapshots_select ON reconciliation_snapshots;
DROP POLICY IF EXISTS recon_snapshots_insert ON reconciliation_snapshots;
DROP POLICY IF EXISTS recon_snapshots_update ON reconciliation_snapshots;
DROP POLICY IF EXISTS recon_signoffs_select  ON reconciliation_signoffs;
DROP POLICY IF EXISTS recon_signoffs_insert  ON reconciliation_signoffs;
DROP POLICY IF EXISTS recon_signoffs_update  ON reconciliation_signoffs;

CREATE POLICY recon_snapshots_select ON reconciliation_snapshots
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY recon_snapshots_insert ON reconciliation_snapshots
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Immutable snapshots cannot be updated once locked
CREATE POLICY recon_snapshots_update ON reconciliation_snapshots
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'
    )
    AND is_immutable = false
  );

CREATE POLICY recon_signoffs_select ON reconciliation_signoffs
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY recon_signoffs_insert ON reconciliation_signoffs
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY recon_signoffs_update ON reconciliation_signoffs
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );
