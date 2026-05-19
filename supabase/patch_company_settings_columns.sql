-- ──────────────────────────────────────────────────────────────────────────────
-- patch_company_settings_columns.sql
-- Idempotent — safe to run on any Flowra installation.
--
-- Root cause: user_settings table never had company_name, address, tax_number,
-- tax_office, mersis_no, logo_url, phone, website columns (these are company-
-- level fields and belong on the companies table). The TypeScript type was
-- aspirational but the DB schema never matched.
--
-- This patch adds the two genuinely missing columns (tax_office, mersis_no) to
-- the companies table. The rest (name, address, phone, website, logo_url, tax_id)
-- were already there.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_office text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS mersis_no  text;

-- Proforma preparer fields (ad soyad + ünvan — PDF signature block)
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS preparer_name  text;
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS preparer_title text;

-- PDF brand / document identity system (Belge Kimliği)
-- brand_color: which institutional palette to use for PDF output
-- document_style: which layout preset to use for PDF output
-- default_preparer_name/title: pre-filled in proforma creation form
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_color           text DEFAULT 'charcoal';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS document_style        text DEFAULT 'corporate';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_preparer_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_preparer_title text;

-- Verify companies
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name IN ('name','address','phone','website','logo_url','tax_id','tax_office','mersis_no',
                      'brand_color','document_style','default_preparer_name','default_preparer_title')
ORDER BY column_name;

-- Verify proformas
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'proformas'
  AND column_name IN ('preparer_name','preparer_title')
ORDER BY column_name;
