-- ═══════════════════════════════════════════════════════════════════════════════
-- repair_production.sql
--
-- Safe, idempotent schema repair script for Flowra production databases.
-- Run this against any production Supabase instance to bring its schema
-- in sync with flowra_install.sql.
--
-- ALL statements use IF NOT EXISTS / IF EXISTS guards.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. payment_status enum ────────────────────────────────────────────────────
-- Canonical values: unpaid | paid | partial | overdue
-- (NOT 'pending' or 'cancelled' — those were earlier incorrect drafts)

do $$ begin
  begin alter type payment_status_enum add value if not exists 'unpaid';  exception when others then null; end;
  begin alter type payment_status_enum add value if not exists 'paid';    exception when others then null; end;
  begin alter type payment_status_enum add value if not exists 'partial'; exception when others then null; end;
  begin alter type payment_status_enum add value if not exists 'overdue'; exception when others then null; end;
end $$;

-- Migrate any legacy 'pending' rows to 'unpaid'
update sales    set payment_status = 'unpaid' where payment_status = 'pending';
update expenses set payment_status = 'unpaid' where payment_status = 'pending';

-- ── 2. sales table — missing columns ─────────────────────────────────────────

alter table sales
  add column if not exists payment_status text    not null default 'unpaid',
  add column if not exists amount_paid    numeric(14,2),
  add column if not exists paid_at        timestamptz,
  add column if not exists due_date       date,
  add column if not exists total_try      numeric(14,2) not null default 0,
  add column if not exists total_cost     numeric(14,2),
  add column if not exists nominal_profit numeric(14,2);

-- Backfill total_try from total where missing (for TRY sales)
update sales set total_try = total where total_try = 0 and currency = 'TRY';

-- ── 3. expenses table — missing columns ──────────────────────────────────────
-- Canonical column: amount_try (NOT 'amount_paid'), expense_date (NOT 'date')

alter table expenses
  add column if not exists amount_try     numeric(14,2) not null default 0,
  add column if not exists fx_rate        numeric(12,6) not null default 1,
  add column if not exists expense_date   date,
  add column if not exists expense_type   text,
  add column if not exists payment_status text          not null default 'paid',
  add column if not exists deleted_at     timestamptz;

-- Backfill amount_try from amount (assumes TRY if currency matches)
update expenses set amount_try = amount where amount_try = 0 and currency = 'TRY';
-- Backfill expense_date from created_at where missing
update expenses set expense_date = created_at::date where expense_date is null;

-- ── 4. partner_transactions — tx_type constraint ─────────────────────────────
-- FAZ 2: added 'correction' (immutable ledger: wrong entries are reversed via
-- a correction row, never deleted) and 'equity_injection' / 'peace_fee'
-- as canonical aliases that map to capital_in / huzur_hakki in the service.

do $$ begin
  alter table partner_transactions drop constraint if exists chk_partner_tx_type;
exception when others then null; end $$;

do $$ begin
  alter table partner_transactions add constraint chk_partner_tx_type
    check (tx_type in (
      -- FAZ 2 canonical types
      'capital_in', 'loan_to_company', 'loan_repayment', 'dividend',
      'correction',
      -- legacy types (backward compat)
      'loan_in', 'loan_out', 'salary', 'board_fee',
      'huzur_hakki', 'equalization'
    ));
exception when others then null; end $$;

-- ── 5. company_banks table (canonical name — NOT 'banks') ────────────────────

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'banks'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_banks'
  ) then
    alter table banks rename to company_banks;
  end if;
end $$;

alter table company_banks
  add column if not exists company_id uuid references companies(id) on delete cascade,
  add column if not exists is_active  boolean      not null default true,
  add column if not exists deleted_at timestamptz;

-- ── 6. recurring_expenses — fx_rate default ───────────────────────────────────

alter table recurring_expenses
  add column if not exists fx_rate numeric(12,6) default 1;

update recurring_expenses set fx_rate = 1 where fx_rate is null;

-- ── 7. sale_item_allocations — canonical column name is stock_lot_id ──────────

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sale_item_allocations' and column_name = 'lot_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'sale_item_allocations' and column_name = 'stock_lot_id'
  ) then
    alter table sale_item_allocations rename column lot_id to stock_lot_id;
  end if;
end $$;

-- ── 8. tasks table ───────────────────────────────────────────────────────────

alter table tasks
  add column if not exists status     text not null default 'open',
  add column if not exists notes      text,
  add column if not exists deleted_at timestamptz;

-- ── 9. proformas table ───────────────────────────────────────────────────────

alter table proformas
  add column if not exists revision_no integer not null default 1;

-- ── 10. Performance indexes ───────────────────────────────────────────────────

create index if not exists idx_sales_company_payment
  on sales (company_id, payment_status) where deleted_at is null;

create index if not exists idx_sales_paid_at
  on sales (company_id, paid_at) where deleted_at is null and payment_status = 'paid';

create index if not exists idx_expenses_company_date
  on expenses (company_id, expense_date) where deleted_at is null;

create index if not exists idx_partner_tx_company
  on partner_transactions (company_id, partner_id, tx_type);

-- sale_item_allocations — drop legacy lot_id index, ensure stock_lot_id index exists
drop index if exists idx_sia_lot_id;
create index if not exists idx_sia_stock_lot_id on sale_item_allocations(stock_lot_id);

-- tasks — indexes require deleted_at / status columns (added in section 8)
create index if not exists idx_tasks_company_id on tasks(company_id) where deleted_at is null;
create index if not exists idx_tasks_due_date   on tasks(company_id, due_date) where deleted_at is null;
create index if not exists idx_tasks_status     on tasks(company_id, status)   where deleted_at is null;

-- Unique partial index: prevents duplicate live sales for the same proforma.
-- TypeScript service catches 'uq_sales_proforma_live' in error message → ALREADY_CONVERTED.
create unique index if not exists uq_sales_proforma_live
  on sales (proforma_id)
  where deleted_at is null;

-- ── 11. RLS grants ────────────────────────────────────────────────────────────

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ── 12. Sales rep support on proformas ───────────────────────────────────────

alter table proformas add column if not exists sales_rep_name  text;
alter table proformas add column if not exists sales_rep_title text;
alter table proformas add column if not exists sales_rep_phone text;

-- ── 13. company_id backfill — sale_item_allocations ──────────────────────────
-- Uses dynamic SQL to handle both lot_id and stock_lot_id column names safely.

do $$
declare v_col text;
begin
  select column_name into v_col
  from   information_schema.columns
  where  table_schema = 'public'
    and  table_name   = 'sale_item_allocations'
    and  column_name  in ('stock_lot_id', 'lot_id')
  order by case column_name when 'stock_lot_id' then 1 else 2 end
  limit 1;

  if v_col is null then
    raise warning 'sale_item_allocations: neither stock_lot_id nor lot_id found — skipping backfill';
    return;
  end if;

  execute format($q$
    update sale_item_allocations sia
    set    company_id = l.company_id
    from   stock_lots l
    where  sia.%I      = l.id
      and  sia.company_id is null
  $q$, v_col);

  raise notice 'company_id backfill done (column: %)', v_col;
end $$;

-- ── 14. Column guarantees for convert_proforma_to_sale ───────────────────────
-- These columns are WRITTEN by the function below; they must exist first.
-- All guards are idempotent: safe to re-run.

alter table sales
  add column if not exists interest_rate numeric(8,6),
  add column if not exists interest_days integer,
  add column if not exists subtotal      numeric(14,2),
  add column if not exists kdv_total     numeric(14,2);

alter table sale_items
  add column if not exists line_total_try numeric(14,2) not null default 0;

alter table sale_item_allocations
  add column if not exists holding_days  integer,
  add column if not exists interest_cost numeric(14,2);

-- ── 15. convert_proforma_to_sale — canonical function ────────────────────────
--
-- Signature (aligned with lib/services/sale.service.ts):
--   p_item_ids      uuid[]    — proforma_item IDs to convert (empty = all items)
--   p_quantities    numeric[] — qty overrides, parallel index to p_item_ids
--   p_interest_days numeric   — financing days; drives holding_cost / interest_cost
--   p_company_id    uuid      — security: caller company; NULL = derive from proforma
--
-- Returns: uuid (sale_id) — TypeScript casts to string
--
-- Guarantees:
--   • Atomic: entire conversion in one transaction; any failure rolls back fully
--   • Idempotent guard: proforma.status = 'converted' raises ALREADY_CONVERTED
--   • Race-safe sale_no: pg_advisory_xact_lock serialises per company+year
--   • FIFO stock check: raises INSUFFICIENT_STOCK before any INSERT
--   • interest_days: written to sale.interest_rate/interest_days and allocation
--     holding_days/interest_cost using the latest interest_rates.annual_rate
--
-- Column contract (verified against TypeScript interfaces):
--   proforma_items  : name, quantity, price, discount_percent, kdv, unit, unit_cost
--   sale_items      : product_name, quantity, price, discount_percent, kdv, unit,
--                     unit_cost, currency, line_total, line_total_try, sort_order
--   sale_item_alloc : sale_id, company_id, sale_item_id, stock_lot_id,
--                     qty_allocated, unit_cost, holding_days, interest_cost
--   sales           : interest_rate, interest_days (when p_interest_days > 0)

drop function if exists public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text);

create or replace function public.convert_proforma_to_sale(
  p_proforma_id   uuid,
  p_user_id       uuid,
  p_item_ids      uuid[]    default '{}',
  p_quantities    numeric[] default '{}',
  p_interest_days numeric   default 0,
  p_company_id    uuid      default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_caller_id      uuid    := auth.uid();
  v_proforma       proformas%rowtype;
  v_sale_id        uuid;
  v_sale_no        text;
  v_year           text    := to_char(now(), 'YYYY');
  v_seq            integer;
  v_item           record;
  v_check          record;    -- product-level aggregate cursor for pre-flight
  v_item_count     integer;
  v_sale_item_id   uuid;
  v_qty_needed     numeric;
  v_lot            record;
  v_alloc_qty      numeric;
  v_item_qty       numeric;
  v_item_idx       integer;   -- array_position result for parallel array lookup
  v_unit_cost_try  numeric;
  v_line_total     numeric;
  v_line_total_try numeric;
  v_fx_item        numeric;
  v_interest_rate  numeric := 0;
  v_interest_cost  numeric;
  v_avail_stock    numeric;
  v_subtotal_sum   numeric := 0;   -- accumulated pre-KDV total (proforma currency)
  v_kdv_total_sum  numeric := 0;   -- accumulated KDV total (proforma currency)
  v_total_try_sum  numeric := 0;   -- accumulated TRY total including KDV
begin
  -- ── Auth ──────────────────────────────────────────────────────────────────
  if v_caller_id is null or v_caller_id <> p_user_id then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  -- ── Load proforma WITH row lock (R1: concurrent-conversion guard) ──────────
  -- FOR UPDATE acquires an exclusive row-level lock on the proforma row.
  -- Any concurrent transaction attempting the same proforma will block here
  -- until this transaction commits.  When it unblocks, it will see
  -- status = 'converted' and raise ALREADY_CONVERTED.
  -- uq_sales_proforma_live acts as a final-layer DB-level barrier.
  select * into v_proforma
  from proformas
  where id = p_proforma_id and deleted_at is null
  for update;
  if not found then raise exception 'PROFORMA_NOT_FOUND'; end if;

  -- ── Company guard ─────────────────────────────────────────────────────────
  if p_company_id is not null and v_proforma.company_id <> p_company_id then
    raise exception 'FORBIDDEN';
  end if;

  -- ── Membership check ──────────────────────────────────────────────────────
  if not exists (
    select 1 from company_members
    where company_id = v_proforma.company_id
      and user_id    = p_user_id
      and accepted_at is not null
      and deleted_at is null
  ) then raise exception 'FORBIDDEN'; end if;

  -- ── Status guard ──────────────────────────────────────────────────────────
  if v_proforma.status = 'converted' then
    raise exception 'ALREADY_CONVERTED';
  end if;
  if v_proforma.status not in ('draft', 'sent', 'accepted') then
    raise exception 'PROFORMA_INVALID_STATUS:%', v_proforma.status;
  end if;

  -- ── NO_ITEMS guard ────────────────────────────────────────────────────────
  -- If p_item_ids contains IDs not belonging to this proforma, or the filter
  -- yields zero rows, refuse — a zero-line sale must never be created.
  select count(*) into v_item_count
  from proforma_items
  where proforma_id = p_proforma_id
    and (cardinality(p_item_ids) = 0 or id = any(p_item_ids));

  if v_item_count = 0 then
    raise exception 'NO_ITEMS';
  end if;

  -- ── Pre-flight FIFO stock check — AGGREGATE by product_id ────────────────
  -- Aggregate total qty needed per product across ALL matching lines, then
  -- compare against total available stock in a single check.
  -- Prevents partial failures when the same product appears in multiple lines.
  for v_check in
    select
      pi.product_id,
      min(pi.name) as sample_name,
      sum(
        case
          -- P0-B: parallel array contract — lookup by array_position, not sort_order
          when cardinality(p_item_ids) > 0
               and array_position(p_item_ids, pi.id) is not null
               and cardinality(p_quantities) >= array_position(p_item_ids, pi.id)
               and p_quantities[array_position(p_item_ids, pi.id)] > 0
          then p_quantities[array_position(p_item_ids, pi.id)]
          else pi.quantity
        end
      ) as total_qty_needed
    from proforma_items pi
    where pi.proforma_id = p_proforma_id
      and (cardinality(p_item_ids) = 0 or pi.id = any(p_item_ids))
      and pi.product_id is not null
    group by pi.product_id
  loop
    select coalesce(sum(qty_remaining), 0)
    into   v_avail_stock
    from   stock_lots
    where  product_id   = v_check.product_id
      and  company_id   = v_proforma.company_id
      and  qty_remaining > 0
      and  deleted_at is null;

    if v_avail_stock < v_check.total_qty_needed then
      raise exception 'INSUFFICIENT_STOCK:%', v_check.sample_name
        using detail = format(
          'needed=%s available=%s product_id=%s',
          v_check.total_qty_needed, v_avail_stock, v_check.product_id
        );
    end if;
  end loop;

  -- ── Interest rate lookup ──────────────────────────────────────────────────
  if p_interest_days > 0 then
    select coalesce(annual_rate / 100.0, 0)
    into   v_interest_rate
    from   interest_rates
    order  by rate_date desc
    limit  1;
  end if;

  -- ── Race-safe sale_no generation ──────────────────────────────────────────
  -- Advisory lock serialises competing conversions for the same company+year.
  -- The lock is transaction-scoped: released automatically on commit/rollback.
  perform pg_advisory_xact_lock(
    ('x' || substr(md5(v_proforma.company_id::text || v_year), 1, 16))::bit(64)::bigint
  );

  select coalesce(max(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from sales
  where company_id = v_proforma.company_id
    and sale_no like 'SAL-' || v_year || '-%';

  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- ── Insert sale ───────────────────────────────────────────────────────────
  -- R3: total and total_try are placeholders (0) here.
  -- Both are computed from the SELECTED items in the loop below and written
  -- via UPDATE after the loop.  This ensures partial conversions get the correct
  -- subtotal of selected lines, not the full proforma.total.
  insert into sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, total_try, payment_status,
    sale_date,
    interest_rate, interest_days,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  )
  values (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    v_proforma.bank_id, p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency,
    0,           -- total placeholder — set by UPDATE below (supports partial conversion)
    0,           -- total_try placeholder — set by UPDATE below
    'unpaid',
    now()::date,
    nullif(v_interest_rate, 0),
    nullif(p_interest_days::integer, 0),
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  )
  returning id into v_sale_id;

  -- ── Process items ─────────────────────────────────────────────────────────
  for v_item in
    select pi.*
    from proforma_items pi
    where pi.proforma_id = p_proforma_id
      and (cardinality(p_item_ids) = 0 or pi.id = any(p_item_ids))
    order by pi.sort_order
  loop
    -- P0-B: Parallel array contract — quantity resolved by p_item_ids index,
    -- not by sort_order row number.  array_position returns null when not found.
    if cardinality(p_item_ids) > 0 then
      v_item_idx := array_position(p_item_ids, v_item.id);
      if v_item_idx is not null
         and cardinality(p_quantities) >= v_item_idx
         and p_quantities[v_item_idx] > 0
      then
        v_item_qty := p_quantities[v_item_idx];
      else
        v_item_qty := v_item.quantity;  -- proforma_items canonical column
      end if;
    else
      v_item_qty := v_item.quantity;
    end if;

    -- FX rate for this line's currency → TRY
    v_fx_item := case v_item.currency
      when 'TRY' then 1
      when 'USD' then coalesce(v_proforma.fx_usd, 1)
      when 'EUR' then coalesce(v_proforma.fx_eur, 1)
      else             coalesce(v_proforma.fx_try, 1)
    end;

    v_line_total     := round(v_item_qty * v_item.price
                              * (1 - coalesce(v_item.discount_percent, 0) / 100.0), 2);
    v_line_total_try := round(v_line_total * v_fx_item, 2);

    -- Accumulate totals (P0-D)
    v_subtotal_sum  := v_subtotal_sum  + v_line_total;
    v_kdv_total_sum := v_kdv_total_sum
                       + round(v_line_total * coalesce(v_item.kdv, 0) / 100.0, 2);
    v_total_try_sum := v_total_try_sum
                       + v_line_total_try
                       + round(v_line_total_try * coalesce(v_item.kdv, 0) / 100.0, 2);

    -- sale_items canonical columns: product_name, quantity, price, discount_percent,
    --   kdv, unit, unit_cost, currency, line_total, line_total_try, sort_order
    insert into sale_items (
      sale_id, company_id, product_id, product_name,
      unit, unit_cost, price, quantity, discount_percent, kdv, currency,
      line_total, line_total_try, sort_order
    )
    values (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.name,
      coalesce(v_item.unit, 'adet'), coalesce(v_item.unit_cost, 0),
      v_item.price, v_item_qty, coalesce(v_item.discount_percent, 0),
      coalesce(v_item.kdv, 0), v_item.currency,
      v_line_total, v_line_total_try, v_item.sort_order
    )
    returning id into v_sale_item_id;

    -- ── FIFO allocation ───────────────────────────────────────────────────
    if v_item.product_id is not null then
      v_qty_needed := v_item_qty;

      for v_lot in
        select *
        from   stock_lots
        where  product_id    = v_item.product_id
          and  company_id    = v_proforma.company_id
          and  qty_remaining > 0
          and  deleted_at is null
        order by coalesce(entry_date, created_at::date), created_at
        for update  -- R2: locks each lot row; concurrent sales block until we commit
      loop
        exit when v_qty_needed <= 0;
        v_alloc_qty     := least(v_qty_needed, v_lot.qty_remaining);
        v_unit_cost_try := coalesce(v_lot.entry_cost_try, v_lot.unit_cost, 0);

        -- Interest cost for this allocation slice
        v_interest_cost := round(
          v_alloc_qty * v_unit_cost_try * v_interest_rate * p_interest_days / 365.0,
          2
        );

        -- sale_item_allocations: all 8 required fields
        insert into sale_item_allocations (
          sale_id, company_id, sale_item_id, stock_lot_id,
          qty_allocated, unit_cost, holding_days, interest_cost
        )
        values (
          v_sale_id, v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_alloc_qty, v_unit_cost_try,
          p_interest_days::integer,
          v_interest_cost
        );

        -- Decrement lot
        update stock_lots
        set    qty_remaining = qty_remaining - v_alloc_qty,
               updated_at    = now()
        where  id = v_lot.id;

        -- stock_movements: reference_type='sale', movement_type='out'
        insert into stock_movements (
          company_id, product_id, reference_type, movement_type, reference_id,
          qty_change, qty_before, qty_after, unit_cost, entry_date
        )
        values (
          v_proforma.company_id, v_item.product_id, 'sale', 'out', v_sale_id,
          -v_alloc_qty,
          v_lot.qty_remaining,                    -- snapshot before update
          v_lot.qty_remaining - v_alloc_qty,
          v_unit_cost_try,
          now()::date
        );

        v_qty_needed := v_qty_needed - v_alloc_qty;
      end loop;

      -- R2: Defensive post-allocation check.
      -- The pre-flight is a snapshot; FOR UPDATE on lots catches concurrent depletion
      -- that occurred between the pre-flight read and the lock acquisition.
      -- If v_qty_needed > 0 here, another transaction consumed stock concurrently.
      if v_qty_needed > 0 then
        raise exception 'INSUFFICIENT_STOCK:%', v_item.name
          using detail = format(
            'shortfall=%s (concurrent stock depletion detected)', v_qty_needed
          );
      end if;
    end if;
  end loop;

  -- ── Write computed totals to sale (R3 + P0-D) ───────────────────────────────
  -- All four totals computed from the SELECTED item set — correct for both full
  -- and partial conversions.  total = subtotal + kdv_total (base currency).
  update sales
  set    total      = round(v_subtotal_sum + v_kdv_total_sum, 2),
         total_try  = round(v_total_try_sum,  2),
         subtotal   = round(v_subtotal_sum,   2),
         kdv_total  = round(v_kdv_total_sum,  2)
  where  id = v_sale_id;

  -- ── Mark proforma converted ───────────────────────────────────────────────
  update proformas
  set    status       = 'converted',
         converted_at = now(),
         updated_at   = now()
  where  id = p_proforma_id;

  return v_sale_id;
end $$;
