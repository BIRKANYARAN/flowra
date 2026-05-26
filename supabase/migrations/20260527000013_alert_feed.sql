CREATE TABLE IF NOT EXISTS alert_feed (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_key       text NOT NULL,    -- stable: alert_type + '_' + resource_id (or just type)
  alert_type      text NOT NULL,    -- matches AlertEngine types
  severity        text NOT NULL CHECK (severity IN ('info','warning','critical')),
  title           text NOT NULL,
  detail          text,
  action_label    text,
  action_href     text,
  amount_try      numeric(15,2),
  due_date        date,
  resource_type   text,
  resource_id     text,
  is_acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  auto_resolved   boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  first_triggered_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at  timestamptz NOT NULL DEFAULT now(),
  trigger_count   integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX alert_feed_company_key_uq ON alert_feed(company_id, alert_key)
  WHERE auto_resolved = false;

ALTER TABLE alert_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_feed_select" ON alert_feed
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
CREATE POLICY "alert_feed_write" ON alert_feed
  FOR ALL USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
