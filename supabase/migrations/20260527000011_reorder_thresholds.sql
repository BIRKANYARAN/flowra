-- Per-product reorder thresholds
CREATE TABLE IF NOT EXISTS product_reorder_thresholds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reorder_point_qty   numeric(10,2) NOT NULL DEFAULT 0,   -- trigger reorder when stock falls to this
  reorder_qty         numeric(10,2) NOT NULL DEFAULT 0,   -- suggested order quantity
  lead_time_days      integer NOT NULL DEFAULT 7,         -- expected supplier lead time
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_reorder_thresholds_uq UNIQUE (company_id, product_id)
);

ALTER TABLE product_reorder_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reorder_thresholds_select" ON product_reorder_thresholds
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "reorder_thresholds_write" ON product_reorder_thresholds
  FOR ALL USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
    AND role IN ('admin', 'manager')
  ));
