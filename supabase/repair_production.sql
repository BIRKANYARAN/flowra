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

do $$ begin
  alter table partner_transactions drop constraint if exists chk_partner_tx_type;
exception when others then null; end $$;

do $$ begin
  alter table partner_transactions add constraint chk_partner_tx_type
    check (tx_type in (
      'capital_in', 'loan_to_company', 'loan_repayment', 'dividend',
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

-- ── 14. convert_proforma_to_sale — stock_lot_id fix ──────────────────────────
-- Recreates the function using the canonical stock_lot_id column name.
-- stock_movements.lot_id is intentionally kept as-is (different table, no rename).

create or replace function public.convert_proforma_to_sale(
  p_proforma_id    uuid,
  p_user_id        uuid,
  p_sale_date      date    default null,
  p_due_date       date    default null,
  p_bank_id        uuid    default null,
  p_notes          text    default null,
  p_internal_notes text    default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_caller_id    uuid := auth.uid();
  v_proforma     proformas%rowtype;
  v_sale_id      uuid;
  v_sale_no      text;
  v_year         text := to_char(now(), 'YYYY');
  v_seq          integer;
  v_item         record;
  v_sale_item_id uuid;
  v_qty_needed   numeric;
  v_lot          record;
  v_alloc_qty    numeric;
begin
  if v_caller_id is null or v_caller_id <> p_user_id then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_proforma from proformas where id = p_proforma_id;
  if not found then raise exception 'PROFORMA_NOT_FOUND'; end if;
  if v_proforma.status not in ('draft','sent','accepted') then
    raise exception 'PROFORMA_INVALID_STATUS:%', v_proforma.status;
  end if;
  if not exists (
    select 1 from company_members
    where company_id = v_proforma.company_id and user_id = p_user_id
  ) then raise exception 'FORBIDDEN'; end if;

  select coalesce(max(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from sales
  where company_id = v_proforma.company_id and sale_no like 'SAL-' || v_year || '-%';

  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, payment_status,
    sale_date, due_date, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  )
  values (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    coalesce(p_bank_id, v_proforma.bank_id), p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency, v_proforma.total,
    'pending',
    coalesce(p_sale_date, now()::date), p_due_date, p_notes, p_internal_notes,
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  )
  returning id into v_sale_id;

  for v_item in
    select * from proforma_items where proforma_id = p_proforma_id order by sort_order
  loop
    insert into sale_items (
      sale_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order
    )
    values (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.product_name,
      v_item.qty, v_item.unit_price, v_item.currency,
      v_item.discount_pct, v_item.line_total, v_item.notes, v_item.sort_order
    )
    returning id into v_sale_item_id;

    if v_item.product_id is not null then
      v_qty_needed := v_item.qty;
      for v_lot in
        select * from stock_lots
        where product_id  = v_item.product_id
          and company_id  = v_proforma.company_id
          and qty_remaining > 0
          and deleted_at is null
        order by coalesce(received_at, created_at::date), created_at
      loop
        exit when v_qty_needed <= 0;
        v_alloc_qty := least(v_qty_needed, v_lot.qty_remaining);

        -- sale_item_allocations uses stock_lot_id (renamed from lot_id)
        insert into sale_item_allocations (
          company_id, sale_item_id, stock_lot_id, qty_allocated, cost_price, cost_currency
        )
        values (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_alloc_qty, v_lot.cost_price, v_lot.cost_currency
        );

        update stock_lots
        set qty_remaining = qty_remaining - v_alloc_qty, updated_at = now()
        where id = v_lot.id;

        -- stock_movements.lot_id is the correct name (no rename on this table)
        insert into stock_movements (
          company_id, product_id, lot_id, type, qty, unit_cost, currency, reference_id
        )
        values (
          v_proforma.company_id, v_item.product_id, v_lot.id,
          'sale_out', -v_alloc_qty, v_lot.cost_price, v_lot.cost_currency, v_sale_id
        );

        v_qty_needed := v_qty_needed - v_alloc_qty;
      end loop;
    end if;
  end loop;

  update proformas
  set status = 'converted', converted_at = now(), updated_at = now()
  where id = p_proforma_id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no);
end $$;
