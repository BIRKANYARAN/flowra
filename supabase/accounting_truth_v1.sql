-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA — Accounting Truth V1 Migration
-- Addresses gaps identified in the 2026-05-18 system audit.
-- Safe to run multiple times (idempotent).
-- Run in Supabase SQL Editor as service_role.
-- ════════════════════════════════════════════════════════════════════════════

-- ── GAP 6: Add kdv_amount_try to sales ──────────────────────────────────────
-- KDV was computed correctly on write but never persisted.
-- All tax summary queries returned 0 VAT. This column stores the frozen KDV
-- amount in TRY at the time of sale creation.
alter table sales add column if not exists kdv_amount_try numeric(12,2) not null default 0;
comment on column sales.kdv_amount_try is 'KDV (VAT) portion of the sale total in TRY, frozen at sale creation time.';

-- ── GAP 13: Add cost_price_try to sale_item_allocations ─────────────────────
-- COGS computations currently require a JOIN to stock_lots to get cost_price_try.
-- Storing it denormalized on the allocation row makes COGS computable without JOIN
-- and survives lot deletion/archiving.
alter table sale_item_allocations add column if not exists cost_price_try numeric(12,4);
comment on column sale_item_allocations.cost_price_try is 'Frozen TRY cost per unit at allocation time (FIFO lot cost_price_try).';

-- ── GAP 2: Add missing columns to stock_lots ────────────────────────────────
-- purchase.service.ts stamps these columns after creating a lot.
-- Without them, cost breakdown and purchase reconciliation silently fails.
alter table stock_lots add column if not exists source_id           uuid references stock_movements(id) on delete set null;
alter table stock_lots add column if not exists purchase_item_id    uuid;
alter table stock_lots add column if not exists allocated_cost_try  numeric(12,4);
alter table stock_lots add column if not exists entry_cost_try      numeric(12,4);  -- alias for cost_price_try (legacy compat)
alter table stock_lots add column if not exists fx_rate_at_entry    numeric(12,6);  -- alias for cost_fx_rate (legacy compat)
alter table stock_lots add column if not exists unit_cost           numeric(12,4);  -- alias for cost_price (legacy compat)
comment on column stock_lots.source_id        is 'FK to the stock_movement row that created this lot.';
comment on column stock_lots.entry_cost_try   is 'Alias for cost_price_try (kept for legacy code compatibility).';
comment on column stock_lots.fx_rate_at_entry is 'Alias for cost_fx_rate (kept for legacy code compatibility).';
comment on column stock_lots.unit_cost        is 'Alias for cost_price (kept for legacy code compatibility).';

-- Keep alias columns in sync with canonical columns via a trigger
create or replace function fn_sync_stock_lot_aliases()
returns trigger language plpgsql as $$
begin
  -- Forward: if canonical columns updated, sync aliases
  if new.cost_price_try is not null and new.entry_cost_try is null then
    new.entry_cost_try := new.cost_price_try;
  end if;
  if new.entry_cost_try is not null and new.cost_price_try is null then
    new.cost_price_try := new.entry_cost_try;
  end if;
  if new.cost_fx_rate is not null and new.fx_rate_at_entry is null then
    new.fx_rate_at_entry := new.cost_fx_rate;
  end if;
  if new.cost_price is not null and new.unit_cost is null then
    new.unit_cost := new.cost_price;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_stock_lot_aliases on stock_lots;
create trigger trg_sync_stock_lot_aliases
  before insert or update on stock_lots
  for each row execute function fn_sync_stock_lot_aliases();

-- ── GAP 16: Change gl_mode default to 'parallel' ────────────────────────────
-- Default was 'shadow' which silently skips all journal entries.
-- 'parallel' writes journal entries while keeping operational tables as primary truth.
-- Only affects NEW companies. Existing companies stay as-is.
alter table companies alter column gl_mode set default 'parallel';

-- Optional: flip existing companies from shadow → parallel.
-- Uncomment the line below if you want to activate GL for all existing companies:
-- update companies set gl_mode = 'parallel' where gl_mode = 'shadow';

-- ── GAP 17: Canonicalize partner_loan_tranches interest rate column ──────────
-- Two columns exist for the same concept. annual_interest_rate added in Phase 7.
-- interest_rate_annual_pct is the original. Keep both in sync.
create or replace function fn_sync_plt_interest_rate()
returns trigger language plpgsql as $$
begin
  if new.annual_interest_rate is not null and new.interest_rate_annual_pct = 0 then
    new.interest_rate_annual_pct := new.annual_interest_rate::numeric(6,3);
  end if;
  if new.interest_rate_annual_pct > 0 and new.annual_interest_rate is null then
    new.annual_interest_rate := new.interest_rate_annual_pct::numeric(6,4);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_plt_interest_rate on partner_loan_tranches;
create trigger trg_sync_plt_interest_rate
  before insert or update on partner_loan_tranches
  for each row execute function fn_sync_plt_interest_rate();

-- ── GAP 1: Fix convert_proforma_to_sale — store TRY total, not native currency ──
-- The RPC stored v_proforma.total (which may be USD/EUR) directly into sales.total.
-- All downstream queries that read sales.total (aliased as total_try) got wrong values
-- for non-TRY proformas.
create or replace function public.convert_proforma_to_sale(
  p_proforma_id    uuid,
  p_user_id        uuid,
  p_sale_date      date    default null,
  p_due_date       date    default null,
  p_bank_id        uuid    default null,
  p_notes          text    default null,
  p_internal_notes text    default null
) returns jsonb language plpgsql security definer as $$
declare
  v_proforma      proformas%rowtype;
  v_item          proforma_items%rowtype;
  v_sale_id       uuid;
  v_sale_no       text;
  v_year          text;
  v_seq           int;
  v_lot           stock_lots%rowtype;
  v_qty_needed    numeric;
  v_qty_from_lot  numeric;
  v_sale_item_id  uuid;
  v_total_try     numeric;
begin
  -- 1. Lock + validate proforma
  select * into v_proforma
    from proformas
    where id = p_proforma_id and deleted_at is null
    for update;

  if not found then
    raise exception 'PROFORMA_NOT_FOUND: %', p_proforma_id;
  end if;
  if v_proforma.status = 'converted' then
    raise exception 'ALREADY_CONVERTED: %', p_proforma_id;
  end if;
  if not exists (select 1 from proforma_items where proforma_id = p_proforma_id) then
    raise exception 'NO_ITEMS: proforma has no items';
  end if;
  if v_proforma.currency != 'TRY' and coalesce(v_proforma.fx_rate_try, 0) <= 0 then
    raise exception 'FX_RATE_NOT_FOUND: non-TRY proforma has no fx_rate_try';
  end if;

  -- 2. Generate sale_no
  v_year := to_char(coalesce(p_sale_date, now()::date), 'YYYY');
  select coalesce(max(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from sales where company_id = v_proforma.company_id and sale_no like 'SAL-' || v_year || '-%';

  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- 3. Compute TRY total (GAP 1 fix: multiply by fx_rate_try for non-TRY proformas)
  v_total_try := round(v_proforma.total * coalesce(v_proforma.fx_rate_try, 1), 2);

  -- 4. Insert sale row (total is now always in TRY)
  insert into sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, payment_status,
    sale_date, due_date, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  ) values (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    coalesce(p_bank_id, v_proforma.bank_id), p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency,
    v_total_try,   -- ← GAP 1 fixed: TRY total, not native currency total
    'pending',
    coalesce(p_sale_date, now()::date), p_due_date, p_notes, p_internal_notes,
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  ) returning id into v_sale_id;

  -- 5. Insert sale_items + FIFO allocations
  for v_item in
    select * from proforma_items where proforma_id = p_proforma_id order by sort_order
  loop
    insert into sale_items (
      sale_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order
    ) values (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.product_name,
      v_item.qty, v_item.unit_price, v_item.currency,
      coalesce(v_item.discount_pct, 0), v_item.line_total,
      v_item.notes, v_item.sort_order
    ) returning id into v_sale_item_id;

    -- FIFO allocation (only for inventory-linked items with a product_id)
    if v_item.product_id is not null then
      v_qty_needed := v_item.qty;

      for v_lot in
        select * from stock_lots
        where company_id = v_proforma.company_id
          and product_id = v_item.product_id
          and qty_remaining > 0
          and deleted_at is null
        order by received_at, created_at
      loop
        exit when v_qty_needed <= 0;

        if v_lot.cost_price_try is null or v_lot.cost_price_try = 0 then
          raise exception 'ZERO_COST_LOT: lot % has no cost_price_try', v_lot.id;
        end if;

        v_qty_from_lot := least(v_qty_needed, v_lot.qty_remaining);

        -- Insert allocation (GAP 13 fix: include cost_price_try)
        insert into sale_item_allocations (
          company_id, sale_item_id, lot_id,
          qty_allocated, cost_price, cost_currency, cost_price_try
        ) values (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_qty_from_lot, v_lot.cost_price, v_lot.cost_currency,
          v_lot.cost_price_try  -- ← GAP 13 fixed: freeze TRY cost at allocation time
        );

        -- Decrement lot
        update stock_lots
          set qty_remaining = qty_remaining - v_qty_from_lot,
              updated_at    = now()
          where id = v_lot.id;

        -- Record movement
        insert into stock_movements (
          company_id, product_id, lot_id, type, qty,
          unit_cost, currency, reference_id, moved_at
        ) values (
          v_proforma.company_id, v_item.product_id, v_lot.id,
          'sale_out', -v_qty_from_lot,
          v_lot.cost_price, v_lot.cost_currency, v_sale_id, now()
        );

        v_qty_needed := v_qty_needed - v_qty_from_lot;
      end loop;

      if v_qty_needed > 0 then
        raise exception 'INSUFFICIENT_STOCK: product % needs % more units', v_item.product_id, v_qty_needed;
      end if;
    end if;
  end loop;

  -- 6. Mark proforma as converted
  update proformas
    set status       = 'converted',
        converted_at = now(),
        updated_at   = now()
    where id = p_proforma_id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no);
end;
$$;

-- Re-grant execute permission
grant execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) to authenticated;

-- ── GAP 10: Ensure partner_transactions table exists ────────────────────────
-- The table is used throughout the app but may not exist on clean installs.
create table if not exists partner_transactions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  partner_id    uuid references partners(id) on delete set null,
  user_id       uuid references auth.users(id) on delete set null,
  tx_type       text not null,   -- 'capital_in' | 'loan_to_company' | 'loan_repayment' | 'dividend' | 'board_fee' | 'salary' | 'loan_in' | 'loan_out'
  amount        numeric(15,2) not null check (amount > 0),
  currency      text not null default 'TRY',
  fx_rate       numeric(12,6) not null default 1,
  amount_try    numeric(15,2) not null,
  gross_try     numeric(15,2),       -- for dividend: gross amount before withholding
  withholding_try numeric(15,2),     -- for dividend: tax withheld (10%)
  tx_date       date not null,
  notes         text,
  reference_id  uuid,                -- optional FK to loan tranche or other record
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_partner_tx_company  on partner_transactions(company_id) where deleted_at is null;
create index if not exists idx_partner_tx_partner  on partner_transactions(company_id, partner_id) where deleted_at is null;
create index if not exists idx_partner_tx_date     on partner_transactions(company_id, tx_date) where deleted_at is null;

alter table partner_transactions enable row level security;

drop policy if exists partner_tx_member on partner_transactions;
create policy partner_tx_member on partner_transactions
  for all using (is_company_member(company_id));

-- Grants
grant all on partner_transactions to authenticated, service_role;

-- ── Backfill: populate kdv_amount_try for existing direct sales ─────────────
-- For historical sales with total > 0 and kdv_amount_try = 0, approximate KDV
-- using the blended 20% rate. This is approximate — exact values require item data.
-- Only update sales that have no proforma (direct sales via the new endpoint).
-- Proforma-originated sales may have mixed KDV rates — leave at 0 for now.
update sales
  set kdv_amount_try = round(total - (total / 1.2), 2)
  where kdv_amount_try = 0
    and total > 0
    and proforma_id is null
    and deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- Run this in Supabase SQL Editor.
-- After running: test by creating a direct sale and verifying
--   sale_items are created, kdv_amount_try is populated,
--   and sales.total is in TRY.
-- ════════════════════════════════════════════════════════════════════════════
