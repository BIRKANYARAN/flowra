-- ═══════════════════════════════════════════════════════════════════════════════
-- 20260601000001_production_hardening.sql
-- Applied to production during FINAL CERTIFICATION. Idempotent.
--   1. Revoke anon/PUBLIC EXECUTE on all SECURITY DEFINER functions (anon could
--      call create_journal_entry/restore_user_data/get_real_cost/... — systemic IDOR)
--   2. convert_proforma_to_sale: add is_company_member guard + revoke anon
--   3. Activate the audit_logs tamper-evident hash chain (stamp trigger + real verifier)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Lock down SECURITY DEFINER functions from anon/PUBLIC ──────────────────
DO $hardening$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
           WHERE p.prosecdef AND p.proname NOT IN ('is_company_member','is_company_admin')
             AND has_function_privilege('anon', p.oid, 'EXECUTE') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $hardening$;

-- ── 2. convert_proforma_to_sale: membership guard (full hardened body) ─────────
CREATE OR REPLACE FUNCTION public.convert_proforma_to_sale(p_proforma_id uuid, p_user_id uuid, p_sale_date date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_bank_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_proforma        proformas%rowtype;
  v_item            proforma_items%rowtype;
  v_sale_id         uuid;
  v_sale_no         text;
  v_year            text;
  v_seq             int;
  v_lot             stock_lots%rowtype;
  v_qty_needed      numeric;
  v_qty_from_lot    numeric;
  v_sale_item_id    uuid;
  v_total_try       numeric;
  v_revenue_try     numeric;
  v_kdv_amount_try  numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_proforma
    FROM proformas
    WHERE id = p_proforma_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFORMA_NOT_FOUND: %', p_proforma_id; END IF;
  -- IDOR guard (added during certification): the caller MUST be a member of the
  -- proforma's company. SECURITY DEFINER bypasses RLS, so without this an anon/
  -- cross-tenant caller could convert another company's proforma.
  IF NOT is_company_member(v_proforma.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: proforma % does not belong to the caller''s company', p_proforma_id;
  END IF;
  IF v_proforma.status = 'converted' THEN RAISE EXCEPTION 'ALREADY_CONVERTED: %', p_proforma_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM proforma_items WHERE proforma_id = p_proforma_id) THEN
    RAISE EXCEPTION 'NO_ITEMS: proforma has no items';
  END IF;
  IF v_proforma.currency != 'TRY' AND COALESCE(v_proforma.fx_rate_try, 0) <= 0 THEN
    RAISE EXCEPTION 'FX_RATE_NOT_FOUND: non-TRY proforma has no fx_rate_try';
  END IF;

  v_year := to_char(COALESCE(p_sale_date, now()::date), 'YYYY');
  SELECT COALESCE(MAX(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  INTO v_seq
  FROM sales WHERE company_id = v_proforma.company_id AND sale_no LIKE 'SAL-' || v_year || '-%';
  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- TRY total from proforma total × FX rate (for non-TRY proformas)
  v_total_try := ROUND(v_proforma.total * COALESCE(v_proforma.fx_rate_try, 1), 2);

  -- KDV amount in TRY
  SELECT ROUND(
    COALESCE(SUM(
      pi.line_total * COALESCE(pi.kdv_rate, 20) / (100 + COALESCE(pi.kdv_rate, 20))
    ), 0) * COALESCE(v_proforma.fx_rate_try, 1)
  , 2)
  INTO v_kdv_amount_try
  FROM proforma_items pi
  WHERE pi.proforma_id = p_proforma_id;

  -- Revenue (net, excl KDV) in TRY
  v_revenue_try := ROUND(v_total_try - v_kdv_amount_try, 2);

  INSERT INTO sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, total_try, revenue_try, kdv_amount_try, payment_status,
    sale_date, due_date, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  ) VALUES (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    COALESCE(p_bank_id, v_proforma.bank_id), p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency,
    v_total_try, v_total_try, v_revenue_try, v_kdv_amount_try, 'pending',
    COALESCE(p_sale_date, now()::date), p_due_date, p_notes, p_internal_notes,
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN
    SELECT * FROM proforma_items WHERE proforma_id = p_proforma_id ORDER BY sort_order
  LOOP
    INSERT INTO sale_items (
      sale_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order,
      kdv_rate
    ) VALUES (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.product_name,
      v_item.qty, v_item.unit_price, v_item.currency,
      COALESCE(v_item.discount_pct, 0), v_item.line_total,
      v_item.notes, v_item.sort_order,
      COALESCE(v_item.kdv_rate, 20)
    ) RETURNING id INTO v_sale_item_id;

    IF v_item.product_id IS NOT NULL THEN
      v_qty_needed := v_item.qty;
      FOR v_lot IN
        SELECT * FROM stock_lots
        WHERE company_id = v_proforma.company_id
          AND product_id = v_item.product_id
          AND qty_remaining > 0
          AND deleted_at IS NULL
        ORDER BY received_at, created_at
      LOOP
        EXIT WHEN v_qty_needed <= 0;
        IF v_lot.cost_price_try IS NULL OR v_lot.cost_price_try = 0 THEN
          RAISE EXCEPTION 'ZERO_COST_LOT: lot % has no cost_price_try', v_lot.id;
        END IF;
        v_qty_from_lot := LEAST(v_qty_needed, v_lot.qty_remaining);
        INSERT INTO sale_item_allocations (
          company_id, sale_item_id, lot_id,
          qty_allocated, cost_price, cost_currency, cost_price_try
        ) VALUES (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_qty_from_lot, v_lot.cost_price, v_lot.cost_currency, v_lot.cost_price_try
        );
        UPDATE stock_lots
          SET qty_remaining = qty_remaining - v_qty_from_lot, updated_at = now()
          WHERE id = v_lot.id;
        INSERT INTO stock_movements (
          company_id, product_id, lot_id, type, qty,
          unit_cost, currency, reference_id, moved_at
        ) VALUES (
          v_proforma.company_id, v_item.product_id, v_lot.id,
          'sale_out', -v_qty_from_lot,
          v_lot.cost_price, v_lot.cost_currency, v_sale_id, now()
        );
        v_qty_needed := v_qty_needed - v_qty_from_lot;
      END LOOP;
      IF v_qty_needed > 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: product % needs % more units', v_item.product_id, v_qty_needed;
      END IF;
    END IF;
  END LOOP;

  UPDATE proformas SET status = 'converted', converted_at = now(), updated_at = now()
    WHERE id = p_proforma_id;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.convert_proforma_to_sale(uuid,uuid,date,date,uuid,text,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_proforma_to_sale(uuid,uuid,date,date,uuid,text,text) TO authenticated, service_role;


-- ── 3. audit_logs tamper-evident hash chain (dumped from certified prod state) ─
CREATE OR REPLACE FUNCTION public.audit_row_payload(p_action text, p_entity_type text, p_entity_id text, p_old jsonb, p_new jsonb, p_created timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT concat_ws('|', coalesce(p_action,''), coalesce(p_entity_type,''), coalesce(p_entity_id,''),
                   coalesce(p_old::text,'null'), coalesce(p_new::text,'null'), coalesce(p_created::text,''));
$function$
;
CREATE OR REPLACE FUNCTION public.audit_logs_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_prev text;
BEGIN
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.company_id::text,'∅'), 0));
    SELECT content_hash INTO v_prev FROM audit_logs
      WHERE company_id IS NOT DISTINCT FROM NEW.company_id AND content_hash IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    NEW.prev_hash := v_prev;
    NEW.content_hash := encode(digest(audit_row_payload(NEW.action, NEW.entity_type, NEW.entity_id, NEW.old_data, NEW.new_data, NEW.created_at) || coalesce(v_prev,''), 'sha256'), 'hex');
  EXCEPTION WHEN OTHERS THEN NEW.content_hash := NULL; NEW.prev_hash := NULL; END;
  RETURN NEW;
END $function$
;
DROP TRIGGER IF EXISTS audit_logs_stamp_trg ON audit_logs;
CREATE TRIGGER audit_logs_stamp_trg BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_stamp();
CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_company_id uuid, p_from date, p_to date)
 RETURNS TABLE(row_id uuid, created_at timestamp with time zone, has_hash boolean, chain_intact boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE rec record; v_prev text; v_expected text;
BEGIN
  v_prev := NULL;
  FOR rec IN SELECT id, al.created_at AS cat, al.action, al.entity_type, al.entity_id, al.old_data, al.new_data, al.content_hash, al.prev_hash
             FROM audit_logs al WHERE al.company_id IS NOT DISTINCT FROM p_company_id ORDER BY al.created_at ASC, al.id ASC LOOP
    v_expected := encode(digest(audit_row_payload(rec.action, rec.entity_type, rec.entity_id, rec.old_data, rec.new_data, rec.cat) || coalesce(v_prev,''), 'sha256'), 'hex');
    IF rec.cat BETWEEN p_from AND (p_to + interval '1 day') THEN
      row_id:=rec.id; created_at:=rec.cat; has_hash:=rec.content_hash IS NOT NULL;
      chain_intact := has_hash AND rec.content_hash=v_expected AND rec.prev_hash IS NOT DISTINCT FROM v_prev; RETURN NEXT;
    END IF;
    v_prev := rec.content_hash;
  END LOOP;
END $function$
;

-- One-time backfill of pre-existing rows (idempotent: recomputes the same hashes)
DO $bf$ DECLARE c record; r record; v_prev text; v_hash text;
BEGIN FOR c IN SELECT DISTINCT company_id FROM audit_logs LOOP v_prev:=NULL;
  FOR r IN SELECT id,action,entity_type,entity_id,old_data,new_data,created_at FROM audit_logs WHERE company_id IS NOT DISTINCT FROM c.company_id ORDER BY created_at,id LOOP
    v_hash:=encode(digest(audit_row_payload(r.action,r.entity_type,r.entity_id,r.old_data,r.new_data,r.created_at)||coalesce(v_prev,''),'sha256'),'hex');
    UPDATE audit_logs SET content_hash=v_hash, prev_hash=v_prev WHERE id=r.id; v_prev:=v_hash;
  END LOOP; END LOOP; END $bf$;
