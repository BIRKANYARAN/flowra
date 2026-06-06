-- ─────────────────────────────────────────────────────────────────────────────
-- 20260603000001_declare_dividend_atomic.sql
--
-- Atomic dividend declaration (DP-3, item 5).
--
-- The dividend declare route (Pattern B) inserted one partner_transactions row per
-- partner in a sequential loop — a failure on row N left rows 1..N-1 committed
-- (a partial, unfixable distribution). This SECURITY DEFINER function performs all
-- inserts inside ONE transaction: any failure rolls the whole batch back.
--
-- Guards (SECDEF bypasses RLS, so they are enforced explicitly here):
--   • the caller must be a member of the company (is_company_member);
--   • every partner_id must belong to the company and be non-deleted;
--   • each net amount must be positive.
-- ─────────────────────────────────────────────────────────────────────────────

-- Return type changed across iterations (integer → jsonb); drop any prior signature first.
DROP FUNCTION IF EXISTS public.declare_dividend_atomic(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.declare_dividend_atomic(
  p_company_id   uuid,
  p_user_id      uuid,
  p_declarations jsonb   -- [{ partner_id, net_try, tx_date, notes }]
) RETURNS jsonb         -- [{ tx_id, partner_id, amount_try }] — for per-row audit logging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec        jsonb;
  v_partner_id uuid;
  v_net        numeric;
  v_tx_date    date;
  v_notes      text;
  v_tx_id      uuid;
  v_result     jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', p_company_id USING ERRCODE = '42501';
  END IF;

  IF p_declarations IS NULL OR jsonb_typeof(p_declarations) <> 'array' THEN
    RAISE EXCEPTION 'declarations must be a JSON array';
  END IF;

  FOR v_rec IN SELECT value FROM jsonb_array_elements(p_declarations) AS t(value)
  LOOP
    v_partner_id := (v_rec->>'partner_id')::uuid;
    v_net        := round((v_rec->>'net_try')::numeric, 2);
    v_tx_date    := (v_rec->>'tx_date')::date;
    v_notes      := v_rec->>'notes';

    IF v_net IS NULL OR v_net <= 0 THEN
      RAISE EXCEPTION 'net_try must be positive for partner %', v_partner_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = v_partner_id AND company_id = p_company_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Partner % not in company %', v_partner_id, p_company_id;
    END IF;

    INSERT INTO public.partner_transactions
      (company_id, partner_id, user_id, tx_type, amount, currency, fx_rate, amount_try, tx_date, notes)
    VALUES
      (p_company_id, v_partner_id, p_user_id, 'dividend', v_net, 'TRY', 1, v_net, v_tx_date, v_notes)
    RETURNING id INTO v_tx_id;

    v_result := v_result || jsonb_build_object(
      'tx_id',      v_tx_id,
      'partner_id', v_partner_id,
      'amount_try', v_net
    );
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL    ON FUNCTION public.declare_dividend_atomic(uuid, uuid, jsonb) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.declare_dividend_atomic(uuid, uuid, jsonb) TO authenticated, service_role;
