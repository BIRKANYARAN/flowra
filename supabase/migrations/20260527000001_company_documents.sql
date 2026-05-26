-- ─────────────────────────────────────────────────────────────────────────────
-- 20260527000001_company_documents.sql
--
-- Document Management Layer — company_documents table
-- Turkish SMEs must retain financial documents for 10 years (TTK).
-- Stores metadata + URL; actual file bytes live in Supabase Storage.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Document identity
  document_type text NOT NULL,   -- 'invoice' | 'contract' | 'bank_statement' | 'board_resolution' | 'tax_declaration' | 'proof_of_payment' | 'audit_report' | 'other'
  title text NOT NULL,
  description text,

  -- File reference (Supabase Storage URL or external URL)
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint,
  mime_type text,

  -- Period attribution
  document_date date NOT NULL,   -- date on the document itself
  period_year int,               -- extracted from document_date
  period_month int,

  -- Entity linkage (polymorphic)
  linked_resource_type text,     -- 'sale' | 'expense' | 'purchase' | 'partner_loan' | 'resolution' | 'period' | null
  linked_resource_id uuid,

  -- Governance
  is_audit_required boolean NOT NULL DEFAULT false,   -- must be present for audit readiness
  is_verified boolean NOT NULL DEFAULT false,         -- admin confirmed document is authentic
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,

  -- Retention
  retention_until date,          -- default: 10 years from document_date

  -- Soft delete
  deleted_at timestamptz,

  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_company  ON company_documents(company_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_type     ON company_documents(company_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_resource ON company_documents(company_id, linked_resource_type, linked_resource_id);
CREATE INDEX IF NOT EXISTS idx_documents_period   ON company_documents(company_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_documents_audit    ON company_documents(company_id, is_audit_required, is_verified);

ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view documents"
  ON company_documents FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()) AND deleted_at IS NULL);

CREATE POLICY "Members can upload documents"
  ON company_documents FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update documents"
  ON company_documents FOR UPDATE
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'admin'));
