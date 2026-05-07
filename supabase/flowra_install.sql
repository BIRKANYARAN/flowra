-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Production Installer — idempotent, production-safe
--
-- HOW TO RUN:
--   Run the full file against your Supabase project via:
--     psql $DATABASE_URL -f flowra_install.sql
--   Or paste into Supabase SQL Editor.
--
-- SAFETY:
--   All DDL uses IF NOT EXISTS / OR REPLACE guards.
--   All data migrations are conditional (WHERE clause checks before UPDATE).
--   No destructive operations (no DROP TABLE, no TRUNCATE).
--   Safe to run multiple times — idempotent.
--
-- SECTIONS:
--   A. Enum types
--   B. Schema patches — ADD COLUMN IF NOT EXISTS
--   C. Data migrations — backfill missing values
--   D. Constraints — idempotent check constraint additions
--   E. Indexes — idempotent CREATE INDEX IF NOT EXISTS
--   F. Functions — CREATE OR REPLACE (all SECURITY DEFINER RPCs)
--   G. Permissions
-- ─────────────────────────────────────────────────────────────────────────────

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A. ENUM TYPES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

do $$ begin
  create type payment_status_enum as enum ('unpaid', 'paid', 'partial', 'overdue');
exception when duplicate_object then null;
end $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B. SCHEMA PATCHES — ADD COLUMN IF NOT EXISTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- expenses: payment tracking + expense classification
alter table expenses
  add column if not exists payment_status payment_status_enum not null default 'paid';

alter table expenses
  add column if not exists expense_type text;

-- recurring_expenses: classification
alter table recurring_expenses
  add column if not exists expense_type text;

-- sales: cash-basis collection tracking (paid_at is set when payment_status → 'paid')
alter table sales
  add column if not exists paid_at timestamptz;

alter table sales
  add column if not exists payment_status text not null default 'unpaid';

-- sales: due date for receivable aging (null → fall back to created_at)
alter table sales
  add column if not exists due_date date;

-- sales: partial payment tracking (null = unpaid or fully paid via payment_status)
alter table sales
  add column if not exists amount_paid numeric(12,2);

-- expenses: link back to originating recurring template (for double-count guard)
alter table expenses
  add column if not exists recurring_expense_id uuid;

-- partner_transactions: company scoping (older rows may lack this)
alter table partner_transactions
  add column if not exists company_id uuid;

-- tasks: deadline tracking
alter table tasks
  add column if not exists due_date date;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- C. DATA MIGRATIONS — safe conditional backfills
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Handle legacy column type migration (text → enum)
do $$
declare
  col_type text;
begin
  select udt_name into col_type
  from   information_schema.columns
  where  table_schema = 'public'
    and  table_name   = 'expenses'
    and  column_name  = 'payment_status';

  if col_type = 'text' then
    update expenses
    set    payment_status = 'paid'
    where  payment_status is null
       or  payment_status not in ('unpaid', 'paid', 'partial', 'overdue');

    alter table expenses
      alter column payment_status type payment_status_enum
      using payment_status::payment_status_enum;
  end if;
end $$;

-- Ensure no null payment_status remains (belt-and-suspenders)
update expenses
set    payment_status = 'paid'
where  payment_status is null;

alter table expenses
  alter column payment_status set default 'paid',
  alter column payment_status set not null;

-- Backfill expense_type from category for expenses
update expenses
set expense_type = case category
  when 'equipment'    then 'capital'
  when 'tax'          then 'tax'
  when 'interest'     then 'financial'
  when 'principal'    then 'loan_repayment'
  when 'dividend'     then 'dividend'
  when 'partner_loan' then 'partner_financing'
  when 'salary'       then 'operational'
  when 'board_fee'    then 'operational'
  when 'rent'         then 'operational'
  when 'utilities'    then 'operational'
  when 'marketing'    then 'operational'
  when 'logistics'    then 'operational'
  when 'software'     then 'operational'
  when 'general'      then 'operational'
  else 'operational'
end
where expense_type is null
   or expense_type not in (
     'operational', 'fixed', 'variable', 'capital', 'financial', 'tax',
     'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer', 'other'
   );

-- Backfill expense_type for recurring_expenses
update recurring_expenses
set expense_type = case category
  when 'equipment'    then 'capital'
  when 'tax'          then 'tax'
  when 'interest'     then 'financial'
  when 'principal'    then 'loan_repayment'
  when 'dividend'     then 'dividend'
  when 'partner_loan' then 'partner_financing'
  when 'salary'       then 'operational'
  when 'board_fee'    then 'operational'
  when 'rent'         then 'operational'
  when 'utilities'    then 'operational'
  when 'marketing'    then 'operational'
  when 'logistics'    then 'operational'
  when 'software'     then 'operational'
  when 'general'      then 'operational'
  else 'operational'
end
where expense_type is null
   or expense_type not in (
     'operational', 'fixed', 'variable', 'capital', 'financial', 'tax',
     'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer', 'other'
   );

-- Backfill sales.payment_status from legacy data
-- (safe: won't overwrite rows that already have a valid status)
update sales
set payment_status = case
  when paid_at is not null then 'paid'
  else 'unpaid'
end
where payment_status is null
   or payment_status not in ('unpaid', 'paid', 'partial', 'overdue');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- D. CONSTRAINTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'expenses'::regclass
      and conname  = 'chk_expenses_expense_type'
  ) then
    alter table expenses add constraint chk_expenses_expense_type
      check (expense_type in (
        'operational', 'fixed', 'variable', 'capital', 'financial', 'tax',
        'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer', 'other'
      ));
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'recurring_expenses'::regclass
      and conname  = 'chk_recurring_expenses_expense_type'
  ) then
    alter table recurring_expenses add constraint chk_recurring_expenses_expense_type
      check (expense_type in (
        'operational', 'fixed', 'variable', 'capital', 'financial', 'tax',
        'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer', 'other'
      ));
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'sales'::regclass
      and conname  = 'chk_sales_payment_status'
  ) then
    alter table sales add constraint chk_sales_payment_status
      check (payment_status in ('unpaid', 'paid', 'partial', 'overdue'));
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'partner_transactions'::regclass
      and conname  = 'chk_partner_tx_type'
  ) then
    alter table partner_transactions add constraint chk_partner_tx_type
      check (tx_type in (
        'capital_in', 'loan_to_company', 'loan_repayment', 'dividend',
        'loan_in', 'loan_out', 'salary', 'board_fee'
      ));
  end if;
exception when others then null;
end $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- E. INDEXES — idempotent (CREATE INDEX IF NOT EXISTS)
-- These cover the most common query patterns observed in the application.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- sales: company_id scoped queries (main list, period filter)
create index if not exists idx_sales_company_deleted
  on sales (company_id, deleted_at)
  where deleted_at is null;

create index if not exists idx_sales_company_payment_status
  on sales (company_id, payment_status)
  where deleted_at is null;

create index if not exists idx_sales_company_created_at
  on sales (company_id, created_at)
  where deleted_at is null;

create index if not exists idx_sales_company_paid_at
  on sales (company_id, paid_at)
  where deleted_at is null and paid_at is not null;

-- expenses: company_id + period filter (most frequent query)
create index if not exists idx_expenses_company_date
  on expenses (company_id, expense_date)
  where deleted_at is null;

create index if not exists idx_expenses_company_payment_type
  on expenses (company_id, payment_status, expense_type)
  where deleted_at is null;

-- recurring_expenses: active templates per company
create index if not exists idx_recurring_expenses_company_active
  on recurring_expenses (company_id, is_active)
  where deleted_at is null and is_active = true;

-- stock_lots: remaining inventory per company
create index if not exists idx_stock_lots_company_remaining
  on stock_lots (company_id, qty_remaining)
  where deleted_at is null and qty_remaining > 0;

create index if not exists idx_stock_lots_product
  on stock_lots (product_id, company_id)
  where deleted_at is null;

-- sale_item_allocations: FIFO cost lookups
create index if not exists idx_sale_item_allocations_sale
  on sale_item_allocations (sale_id, company_id)
  where deleted_at is null;

create index if not exists idx_sale_item_allocations_lot
  on sale_item_allocations (stock_lot_id)
  where deleted_at is null;

-- partner_transactions: per-partner aggregations
create index if not exists idx_partner_tx_partner_company
  on partner_transactions (partner_id, company_id)
  where deleted_at is null;

create index if not exists idx_partner_tx_company_type
  on partner_transactions (company_id, tx_type)
  where deleted_at is null;

-- proformas: pipeline queries
create index if not exists idx_proformas_company_status
  on proformas (company_id, status)
  where deleted_at is null;

-- tasks: due-date alerts
create index if not exists idx_tasks_company_due
  on tasks (company_id, due_date, status)
  where deleted_at is null and status = 'open';

-- audit_logs: activity feed
create index if not exists idx_audit_logs_company_created
  on audit_logs (company_id, created_at desc);

-- alerts: unread count per user
create index if not exists idx_alerts_user_unread
  on alerts (actor_user_id, is_read)
  where is_read = false;

-- fx_rates: latest rate lookup
create index if not exists idx_fx_rates_date_currency
  on fx_rates (rate_date desc, currency);

-- company_members: user lookup (used by resolveCompanyId on every request)
create index if not exists idx_company_members_user
  on company_members (user_id, deleted_at)
  where deleted_at is null;

-- purchases: period VAT queries
create index if not exists idx_purchases_company_date
  on purchases (company_id, purchase_date)
  where deleted_at is null;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- F. FUNCTIONS (SECURITY DEFINER RPCs)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- create_partner_loan_expense
-- SECURITY FIX v2: validates that p_company_id belongs to the authenticated user
-- (prevents cross-company data injection via a spoofed company_id parameter).
create or replace function create_partner_loan_expense(
  p_uid          uuid,
  p_partner_id   uuid,
  p_amount       numeric,
  p_currency     text,
  p_amount_try   numeric,
  p_fx_rate      numeric,
  p_fx_source    text,
  p_description  text,
  p_expense_date date,
  p_kdv          numeric,
  p_company_id   uuid default null
)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_partner_ok  boolean;
  v_company_ok  boolean;
  v_tx_id       uuid;
  v_expense_id  uuid;
begin
  -- Caller must be the authenticated user
  if auth.uid() is distinct from p_uid then
    raise exception 'create_partner_loan_expense: unauthorized';
  end if;

  -- SECURITY FIX: validate that p_company_id is a company the user belongs to.
  -- Without this check an attacker can inject data into any company by guessing a UUID.
  if p_company_id is not null then
    select exists(
      select 1
      from company_members
      where company_id = p_company_id
        and user_id    = p_uid
        and deleted_at is null
    ) into v_company_ok;

    if not v_company_ok then
      raise exception 'create_partner_loan_expense: company not found or not authorized (id: %)', p_company_id;
    end if;
  end if;

  -- Validate partner ownership (partner must belong to same user + company)
  select exists(
    select 1
    from partners
    where id         = p_partner_id
      and user_id    = p_uid
      and (p_company_id is null or company_id = p_company_id)
      and deleted_at is null
  ) into v_partner_ok;

  if not v_partner_ok then
    raise exception 'PARTNER_NOT_FOUND: Ortak bulunamadı (id: %)', p_partner_id;
  end if;

  insert into partner_transactions (
    partner_id, user_id, tx_type, amount, currency, fx_rate, amount_try,
    tx_date, notes, company_id
  ) values (
    p_partner_id, p_uid, 'loan_to_company', p_amount, p_currency, p_fx_rate,
    p_amount_try, p_expense_date, p_description, p_company_id
  ) returning id into v_tx_id;

  insert into expenses (
    user_id, amount, currency, amount_try, fx_rate, fx_source, description,
    category, payment_status, expense_type, expense_date, kdv, company_id
  ) values (
    p_uid, p_amount, p_currency, p_amount_try, p_fx_rate, p_fx_source,
    p_description, 'partner_loan', 'paid', 'partner_financing',
    p_expense_date, p_kdv, p_company_id
  ) returning id into v_expense_id;

  return jsonb_build_object('expense_id', v_expense_id, 'tx_id', v_tx_id);
end;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- G. PERMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

revoke execute on function create_partner_loan_expense from public;
grant  execute on function create_partner_loan_expense to authenticated;
