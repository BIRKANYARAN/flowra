-- product_cost_entries: per-product manual landed-cost entries (purchase/customs/tax/
-- shipping/other) with a frozen TRY snapshot. Consumed by app/api/cost-entries/route.ts
-- (GET list · POST bulk-upsert · DELETE soft-delete) and the catalog cost-entry UI
-- (app/dashboard/catalog/CatalogClient.tsx). The feature shipped (service + API + UI)
-- but its table was never migrated to prod → silently empty. Idempotent + additive;
-- no accounting calculation lives here (amount_try is computed in the route, stored frozen).
CREATE TABLE IF NOT EXISTS product_cost_entries (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  product_id  uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entry_type  text        NOT NULL DEFAULT 'purchase',  -- purchase|customs|tax|shipping|other
  description text        NOT NULL DEFAULT '',
  amount      numeric     NOT NULL DEFAULT 0,
  currency    text        NOT NULL DEFAULT 'TRY',
  fx_rate     numeric     NOT NULL DEFAULT 1,
  amount_try  numeric     NOT NULL DEFAULT 0,            -- frozen TRY snapshot = amount × fx_rate
  entry_date  date        NOT NULL DEFAULT current_date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_product_cost_entries_company_product
  ON product_cost_entries (company_id, product_id) WHERE (deleted_at IS NULL);

ALTER TABLE product_cost_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_cost_entries_company ON product_cost_entries;
CREATE POLICY product_cost_entries_company ON product_cost_entries FOR ALL USING (
  company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON product_cost_entries FROM anon;
