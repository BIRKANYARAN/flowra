-- ════════════════════════════════════════════════════════════════════════════
-- 20260602000001_secdef_membership_guards.sql
--
-- SECURITY: close cross-tenant access via SECURITY DEFINER functions + RLS predicates.
--
-- Independent final audit found (verified against the live DB):
--  (A) 6 SECURITY DEFINER functions trust a caller-supplied company/user id with NO
--      membership check, and are EXECUTE-granted to `authenticated`. Any logged-in
--      user of ANY tenant could call them via PostgREST with another company's id:
--        - create_journal_entry  → forge/corrupt another company's general ledger
--        - verify_audit_chain     → read another company's audit-log ids/timestamps
--        - get_real_cost          → read another company's product costs
--        - get_sales_analytics    → read another company's sales aggregates
--        - enqueue_job            → enqueue jobs against another company
--        - bootstrap_user_company → bootstrap/attach as another user
--  (B) is_company_member / is_company_admin (which back nearly EVERY RLS policy)
--      ignore company_members.deleted_at → a SOFT-DELETED (removed) member keeps
--      full RLS read/write access to all company data.
--
-- Guard pattern: `auth.uid() IS NOT NULL AND NOT is_company_member(<co>)` — blocks
-- cross-tenant AUTHENTICATED callers while still allowing the trusted service_role
-- (auth.uid() IS NULL; e.g. the job worker calling enqueue_job). anon EXECUTE was
-- already revoked (migration 20260601000001). Legitimate callers always pass their
-- OWN company id (resolved from their membership), so the guard is transparent to them.
--
-- NOTE on accepted_at: 1 active admin currently has accepted_at IS NULL (an
-- unaccepted invite). Adding `accepted_at IS NOT NULL` here would change that live
-- user's access (a business decision), so it is deliberately ROADMAPPED, not applied.
-- Only `deleted_at IS NULL` (0 soft-deleted today → zero current impact) is applied.
--
-- Idempotent. Validated BEGIN/ROLLBACK + cross-tenant probe against production.
-- ════════════════════════════════════════════════════════════════════════════

-- ── (B) RLS-backing predicates: exclude removed (soft-deleted) members ───────
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = auth.uid() and deleted_at is null
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = auth.uid() and role = 'admin' and deleted_at is null
  )
$function$;

-- ── (A) SECURITY DEFINER membership guards ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_journal_entry(p_company_id uuid, p_period_id uuid, p_source_type text, p_source_id uuid, p_entry_date date, p_description text, p_reference text, p_is_adjustment boolean, p_created_by uuid, p_lines jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
AS $function$
declare
  v_entry_id uuid;
  v_line     jsonb;
  v_dr       numeric := 0;
  v_cr       numeric := 0;
begin
  if auth.uid() is not null and not public.is_company_member(p_company_id) then
    raise exception 'FORBIDDEN: cross-tenant access denied';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_dr := v_dr + coalesce((v_line->>'debit_try')::numeric,  0);
    v_cr := v_cr + coalesce((v_line->>'credit_try')::numeric, 0);
  end loop;

  if abs(v_dr - v_cr) > 0.01 then
    raise exception 'Cannot create unbalanced journal entry: debits=%, credits=%', v_dr, v_cr;
  end if;

  insert into journal_entries (
    company_id, period_id, source_type, source_id,
    entry_date, description, reference, is_adjustment, created_by
  ) values (
    p_company_id, p_period_id, p_source_type, p_source_id,
    p_entry_date, p_description, p_reference, p_is_adjustment, p_created_by
  ) returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_entry_lines (
      entry_id, account_code, account_name, debit_try, credit_try, description
    ) values (
      v_entry_id,
      v_line->>'account_code',
      v_line->>'account_name',
      coalesce((v_line->>'debit_try')::numeric,  0),
      coalesce((v_line->>'credit_try')::numeric, 0),
      v_line->>'description'
    );
  end loop;

  return v_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_company_id uuid, p_from date, p_to date)
 RETURNS TABLE(row_id uuid, created_at timestamp with time zone, has_hash boolean, chain_intact boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE rec record; v_prev text; v_expected text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: cross-tenant access denied';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.enqueue_job(p_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_company_id uuid DEFAULT NULL::uuid, p_run_at timestamp with time zone DEFAULT now())
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is not null and p_company_id is not null and not public.is_company_member(p_company_id) then
    raise exception 'FORBIDDEN: cross-tenant access denied';
  end if;
  insert into jobs (type, payload, company_id, status, run_at)
  values (p_type, p_payload, p_company_id, 'pending', p_run_at)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.get_real_cost(p_product_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_company_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_avg_cost  numeric(12,4);
  v_total_qty numeric(12,3);
  v_company   uuid;
BEGIN
  -- Resolve company from user if not provided
  IF p_company_id IS NULL AND p_user_id IS NOT NULL THEN
    SELECT company_id INTO v_company
    FROM company_members
    WHERE user_id = p_user_id AND deleted_at IS NULL
    LIMIT 1;
  ELSE
    v_company := p_company_id;
  END IF;

  IF auth.uid() IS NOT NULL AND v_company IS NOT NULL AND NOT public.is_company_member(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: cross-tenant access denied';
  END IF;

  -- FIFO: weighted average from active stock lots
  SELECT
    SUM(entry_cost_try * qty_remaining) / NULLIF(SUM(qty_remaining), 0),
    SUM(qty_remaining)
  INTO v_avg_cost, v_total_qty
  FROM stock_lots
  WHERE product_id = p_product_id
    AND (v_company IS NULL OR company_id = v_company)
    AND qty_remaining > 0
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'real_cost',   COALESCE(v_avg_cost, 0),
    'total_qty',   COALESCE(v_total_qty, 0),
    'product_id',  p_product_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_analytics(p_user_id uuid DEFAULT NULL::uuid, p_company_id uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company  uuid;
  v_result   jsonb;
BEGIN
  -- Resolve company
  IF p_company_id IS NULL AND p_user_id IS NOT NULL THEN
    SELECT company_id INTO v_company
    FROM company_members
    WHERE user_id = p_user_id AND deleted_at IS NULL
    LIMIT 1;
  ELSE
    v_company := p_company_id;
  END IF;

  IF auth.uid() IS NOT NULL AND v_company IS NOT NULL AND NOT public.is_company_member(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: cross-tenant access denied';
  END IF;

  SELECT jsonb_build_object(
    'total_revenue_try',    COALESCE(SUM(total_try), 0),
    'total_sales',          COUNT(*),
    'paid_count',           COUNT(*) FILTER (WHERE payment_status = 'paid'),
    'pending_count',        COUNT(*) FILTER (WHERE payment_status = 'pending'),
    'overdue_count',        COUNT(*) FILTER (WHERE payment_status = 'overdue'),
    'total_paid_try',       COALESCE(SUM(amount_paid_try) FILTER (WHERE payment_status = 'paid'), 0),
    'avg_sale_try',         COALESCE(AVG(total_try), 0),
    'currencies',           jsonb_agg(DISTINCT currency) FILTER (WHERE currency IS NOT NULL)
  )
  INTO v_result
  FROM sales
  WHERE company_id = v_company
    AND deleted_at IS NULL
    AND (p_from IS NULL OR sale_date >= p_from)
    AND (p_to   IS NULL OR sale_date <= p_to);

  RETURN COALESCE(v_result, jsonb_build_object(
    'total_revenue_try', 0, 'total_sales', 0, 'paid_count', 0,
    'pending_count', 0, 'overdue_count', 0, 'total_paid_try', 0,
    'avg_sale_try', 0, 'currencies', '[]'::jsonb
  ));
END;
$function$;

-- bootstrap_user_company: you may only bootstrap YOURSELF (no membership exists yet,
-- so the guard is identity-based, not membership-based). service_role bypasses.
CREATE OR REPLACE FUNCTION public.bootstrap_user_company(p_user_id uuid, p_company_id uuid DEFAULT NULL::uuid, p_name text DEFAULT 'My Company'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_member_id  uuid;
begin
  if auth.uid() is not null and p_user_id <> auth.uid() then
    raise exception 'FORBIDDEN: may only bootstrap your own account';
  end if;
  if p_company_id is not null then
    if exists (select 1 from company_members where company_id = p_company_id and user_id = p_user_id) then
      return jsonb_build_object('company_id', p_company_id, 'bootstrapped', false);
    end if;
  end if;

  select active_company_id into v_company_id from user_settings where user_id = p_user_id;

  if v_company_id is null then
    select company_id into v_company_id from company_members
    where user_id = p_user_id order by created_at limit 1;
  end if;

  if v_company_id is not null then
    insert into user_settings (user_id, company_id, active_company_id)
    values (p_user_id, v_company_id, v_company_id)
    on conflict (user_id) do update
      set active_company_id = coalesce(user_settings.active_company_id, v_company_id);
    return jsonb_build_object('company_id', v_company_id, 'bootstrapped', false);
  end if;

  insert into companies (name) values (p_name) returning id into v_company_id;

  insert into company_members (company_id, user_id, role, accepted_at)
  values (v_company_id, p_user_id, 'admin', now())
  returning id into v_member_id;

  insert into user_settings (user_id, company_id, active_company_id)
  values (p_user_id, v_company_id, v_company_id)
  on conflict (user_id) do update
    set company_id = v_company_id, active_company_id = v_company_id;

  return jsonb_build_object('company_id', v_company_id, 'member_id', v_member_id, 'bootstrapped', true);
end $function$;
