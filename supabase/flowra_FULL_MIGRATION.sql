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

-- proformas: immutable FX snapshot columns (locked at creation time)
alter table proformas
  add column if not exists fx_usd          numeric(12,6);
alter table proformas
  add column if not exists fx_eur          numeric(12,6);
alter table proformas
  add column if not exists fx_try          numeric(12,6) default 1;
alter table proformas
  add column if not exists fx_source       text;
alter table proformas
  add column if not exists fx_rate_date    date;
alter table proformas
  add column if not exists fx_rate_try     numeric(12,6);

-- proformas: company + customer data snapshots for deterministic PDF rendering
alter table proformas
  add column if not exists company_snapshot  jsonb;
alter table proformas
  add column if not exists customer_snapshot jsonb;

-- proformas: internal notes (hidden from customer PDF)
alter table proformas
  add column if not exists internal_notes text;

-- proformas: revision counter (incremented on each update)
alter table proformas
  add column if not exists revision_no integer not null default 1;

-- proformas: bank reference for payment details in PDF
alter table proformas
  add column if not exists bank_id uuid;

-- idempotency_keys: prevent duplicate critical writes (proforma creation, sale conversion)
create table if not exists idempotency_keys (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null,
  idempotency_key text        not null,
  operation       text        not null,
  status          text        not null default 'pending',
  result_id       uuid,
  result_data     jsonb,
  request_hash    text,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint uq_idempotency_user_key unique (user_id, idempotency_key)
);

-- idempotency_keys: add request_hash column if table already exists without it
alter table idempotency_keys
  add column if not exists request_hash text;

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

-- tasks → customers FK (enables PostgREST embedded selects: customers(name))
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tasks'::regclass
      and conname  = 'fk_tasks_customer'
  ) then
    alter table tasks
      add constraint fk_tasks_customer
        foreign key (related_customer_id)
        references customers(id)
        on delete set null;
  end if;
exception when others then null;
end $$;

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

-- create_proforma_atomic
-- Atomically inserts a proforma header + all line items in one transaction.
-- Returns { id, proforma_no } as jsonb.
-- SECURITY: validates auth.uid() = p_user_id and that the user belongs to p_company_id.
create or replace function create_proforma_atomic(
  p_user_id           uuid,
  p_customer_id       uuid    default null,
  p_bank_id           uuid    default null,
  p_customer_name     text    default '',
  p_currency          text    default 'TRY',
  p_validity_days     integer default 30,
  p_notes             text    default null,
  p_internal_notes    text    default null,
  p_total             numeric default 0,
  p_fx_usd            numeric default null,
  p_fx_eur            numeric default null,
  p_fx_try            numeric default 1,
  p_fx_source         text    default 'manual',
  p_fx_rate_date      text    default null,
  p_fx_rate_try       numeric default null,
  p_company_snapshot  jsonb   default null,
  p_customer_snapshot jsonb   default null,
  p_items             jsonb   default '[]',
  p_company_id        uuid    default null
)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_proforma_id  uuid;
  v_proforma_no  text;
  v_seq          bigint;
  v_company_ok   boolean;
  v_item         jsonb;
  v_idx          integer := 0;
begin
  -- Caller must be the authenticated user
  if auth.uid() is distinct from p_user_id then
    raise exception 'create_proforma_atomic: unauthorized (uid mismatch)';
  end if;

  -- Validate company membership
  select exists(
    select 1
    from company_members
    where company_id = p_company_id
      and user_id    = p_user_id
      and deleted_at is null
  ) into v_company_ok;

  if not v_company_ok then
    raise exception 'create_proforma_atomic: company not found or not authorized (id: %)', p_company_id;
  end if;

  -- Generate sequential proforma number within the company (year-scoped)
  select coalesce(max(revision_no), 0) + 1
  from   proformas
  where  company_id = p_company_id
    and  deleted_at is null
    and  extract(year from created_at) = extract(year from now())
  into v_seq;

  v_proforma_no := 'PRF-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');

  -- Insert proforma header
  insert into proformas (
    user_id, company_id, customer_id, bank_id,
    customer_name, currency, validity_days,
    notes, internal_notes, total,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot,
    proforma_no, status, revision_no
  ) values (
    p_user_id, p_company_id, p_customer_id, p_bank_id,
    p_customer_name, p_currency, p_validity_days,
    p_notes, p_internal_notes, p_total,
    p_fx_usd, p_fx_eur, p_fx_try, p_fx_source,
    case when p_fx_rate_date is not null then p_fx_rate_date::date else null end,
    p_fx_rate_try,
    p_company_snapshot, p_customer_snapshot,
    v_proforma_no, 'draft', 1
  ) returning id into v_proforma_id;

  -- Insert line items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into proforma_items (
      proforma_id,
      product_id,
      name,
      unit,
      unit_cost,
      price,
      quantity,
      discount_percent,
      kdv,
      currency,
      sort_order
    ) values (
      v_proforma_id,
      case when (v_item->>'product_id') is not null and (v_item->>'product_id') != ''
           then (v_item->>'product_id')::uuid
           else null end,
      coalesce(v_item->>'name', ''),
      coalesce(v_item->>'unit', 'adet'),
      coalesce((v_item->>'unit_cost')::numeric, 0),
      coalesce((v_item->>'price')::numeric, 0),
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'kdv')::numeric, 0),
      coalesce(v_item->>'currency', p_currency),
      coalesce((v_item->>'sort_order')::integer, v_idx)
    );
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('id', v_proforma_id, 'proforma_no', v_proforma_no);
end;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- G. PERMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

revoke execute on function create_partner_loan_expense from public;
revoke execute on function create_proforma_atomic      from public;

grant  execute on function create_partner_loan_expense to authenticated;
grant  execute on function create_proforma_atomic      to authenticated;

-- idempotency_keys: authenticated users can only read/write their own rows
alter table idempotency_keys enable row level security;

do $$ begin
  create policy "idempotency_own_rows" on idempotency_keys
    for all using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;
grant  execute on function create_partner_loan_expense to authenticated;
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- flowra_phase1_accounting.sql — Accounting Truth Layer (Phase 1 additions)
--
-- ADDITIVE ONLY — never drops or alters existing columns.
-- Run this AFTER flowra_install.sql on any environment.
-- Idempotent: safe to run multiple times.
--
-- New tables:
--   accounting_periods      — financial period lifecycle (open → closed → locked)
--   simulation_scenarios    — saved multi-scenario comparison snapshots
--
-- New enum:
--   period_status_enum      — open | closed | locked
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── A. ENUM ─────────────────────────────────────────────────────────────────

do $$ begin
  create type period_status_enum as enum ('open', 'closed', 'locked');
exception when duplicate_object then null;
end $$;

-- ── B. ACCOUNTING PERIODS ────────────────────────────────────────────────────
-- Tracks the lifecycle of financial reporting periods.
-- A "locked" period enforces immutability: API guards block writes to any
-- sale, expense, or partner transaction dated within a locked period.

create table if not exists accounting_periods (
  id                                  uuid primary key default gen_random_uuid(),
  company_id                          uuid not null,
  period_start                        date not null,
  period_end                          date not null,
  status                              period_status_enum not null default 'open',

  -- Cash balances at period boundaries
  opening_cash_try                    numeric(20,2) not null default 0,
  closing_cash_try                    numeric(20,2) not null default 0,

  -- Retained earnings flow
  retained_earnings_brought_forward   numeric(20,2) not null default 0,
  period_profit_try                   numeric(20,2) not null default 0,
  retained_earnings_carried_forward   numeric(20,2) not null default 0,

  -- Audit
  closed_at                           timestamptz,
  closed_by                           uuid references auth.users(id),
  notes                               text,
  created_at                          timestamptz not null default now(),
  updated_at                          timestamptz not null default now(),

  -- Constraints
  constraint accounting_periods_no_overlap
    exclude using gist (
      company_id with =,
      daterange(period_start, period_end, '[]') with &&
    ) deferrable initially deferred,

  constraint accounting_periods_dates_valid
    check (period_end >= period_start)
);

-- Enable RLS
alter table accounting_periods enable row level security;

do $$ begin
  create policy "accounting_periods_company_access" on accounting_periods
    for all using (
      company_id in (
        select company_id from company_members
        where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- Indexes
create index if not exists idx_accounting_periods_company_status
  on accounting_periods(company_id, status);

create index if not exists idx_accounting_periods_company_dates
  on accounting_periods(company_id, period_start desc);

-- ── C. SIMULATION SCENARIOS ──────────────────────────────────────────────────
-- Saved simulation scenarios for multi-scenario strategic comparison.
-- Inputs and computed outputs are stored as JSONB for flexibility.

create table if not exists simulation_scenarios (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  user_id       uuid not null references auth.users(id),
  name          text not null,
  description   text,

  -- Scenario parameters (ScenarioInputs shape from types/dto.ts)
  inputs        jsonb not null default '{}',

  -- Computed results snapshot
  summary       jsonb not null default '{}',
  monthly_breakdown jsonb not null default '[]',
  assumptions   jsonb not null default '[]',

  -- Organization
  tags          jsonb not null default '[]',
  is_baseline   boolean not null default false,  -- the reference scenario for comparisons

  -- Lifecycle
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz   -- soft delete
);

alter table simulation_scenarios enable row level security;

do $$ begin
  create policy "simulation_scenarios_company_access" on simulation_scenarios
    for all using (
      company_id in (
        select company_id from company_members
        where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- Indexes
create index if not exists idx_simulation_scenarios_company
  on simulation_scenarios(company_id, deleted_at)
  where deleted_at is null;

create index if not exists idx_simulation_scenarios_baseline
  on simulation_scenarios(company_id, is_baseline)
  where is_baseline = true and deleted_at is null;

-- ── D. BALANCE SHEET SNAPSHOTS ───────────────────────────────────────────────
-- Point-in-time balance sheet snapshots (computed by BalanceSheetService,
-- optionally persisted here when a period is closed).

create table if not exists balance_sheet_snapshots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  period_id     uuid references accounting_periods(id),
  as_of_date    date not null,

  -- Full balance sheet as JSONB (BalanceSheet shape from types/dto.ts)
  snapshot      jsonb not null,

  balanced      boolean not null default false,
  imbalance_try numeric(20,2) not null default 0,

  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);

alter table balance_sheet_snapshots enable row level security;

do $$ begin
  create policy "balance_sheet_snapshots_company_access" on balance_sheet_snapshots
    for all using (
      company_id in (
        select company_id from company_members
        where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists idx_balance_sheet_snapshots_company_date
  on balance_sheet_snapshots(company_id, as_of_date desc);

-- ── E. TRIGGER: updated_at maintenance ──────────────────────────────────────

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger accounting_periods_updated_at
    before update on accounting_periods
    for each row execute function touch_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger simulation_scenarios_updated_at
    before update on simulation_scenarios
    for each row execute function touch_updated_at();
exception when duplicate_object then null;
end $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Phase 1 additions complete.
-- Run flowra_install.sql first, then this file.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ─────────────────────────────────────────────────────────────────────────────
-- flowra_phase2_pcle.sql — PCLE Partner Capital & Liability Engine
--
-- ADDITIVE ONLY: No existing table modifications.
-- All new tables. Safe to run on production with zero downtime.
--
-- Tables:
--   partner_finance_events        — Immutable PCLE event ledger (append-only)
--   partner_loan_tranches         — Structured loan tracking per partner
--   partner_capital_commitments   — Equity commitment vs paid tracking
--   partner_compensation_schedules — Huzur hakkı recurring schedules
--   alert_rules                   — Configurable alert thresholds per company
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. partner_finance_events — Immutable PCLE Event Ledger ──────────────────
-- Append-only. Never updated. Never deleted.
-- Every partner financial event is recorded here for audit and projection.

CREATE TABLE IF NOT EXISTS partner_finance_events (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id    uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,
  -- Event type taxonomy:
  -- EQUITY:       EQUITY_COMMITMENT, EQUITY_PAYMENT, EQUITY_CALL, CAPITAL_RATIO_CHANGE
  -- LIABILITY:    LOAN_DISBURSEMENT, LOAN_REPAYMENT, LOAN_INTEREST_ACCRUAL, LOAN_RESTRUCTURE
  -- DISTRIBUTION: COMPENSATION_PAYMENT, DIVIDEND_DECLARED, DIVIDEND_PAID, LEGAL_RESERVE_SET
  -- RECONCILIATION: EQUALIZATION_TRANSFER, RETAINED_TRANSFER
  amount_try    numeric(15,2) NOT NULL DEFAULT 0,
  currency      text          NOT NULL DEFAULT 'TRY',
  fx_rate       numeric(12,6) NOT NULL DEFAULT 1,
  event_date    date          NOT NULL DEFAULT CURRENT_DATE,
  reference     text,           -- invoice, board-decision ref, etc.
  description   text,
  metadata      jsonb,          -- event-specific data (tranche_id, period_id, etc.)
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pfe_company    ON partner_finance_events(company_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_pfe_partner    ON partner_finance_events(partner_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_pfe_event_type ON partner_finance_events(event_type);

-- RLS
ALTER TABLE partner_finance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pfe_company_select" ON partner_finance_events
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pfe_company_insert" ON partner_finance_events
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- APPEND-ONLY: No update, no delete
CREATE POLICY "pfe_no_update" ON partner_finance_events
  FOR UPDATE USING (false);

CREATE POLICY "pfe_no_delete" ON partner_finance_events
  FOR DELETE USING (false);


-- ── 2. partner_loan_tranches — Structured Loan Tracking ─────────────────────
-- One row per loan disbursement. Tracks repayment progress.
-- net_loan = principal_try - total_repaid_try (computed, not stored)

CREATE TABLE IF NOT EXISTS partner_loan_tranches (
  id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id                uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id                uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  source_event_id           uuid        REFERENCES partner_finance_events(id),
  principal_try             numeric(15,2) NOT NULL CHECK (principal_try > 0),
  interest_rate_annual_pct  numeric(6,3) NOT NULL DEFAULT 0,
  disbursement_date         date        NOT NULL,
  expected_repayment_date   date,
  total_repaid_try          numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_repaid_try >= 0),
  status                    text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','partially_repaid','repaid','overdue','restructured')),
  notes                     text,
  deleted_at                timestamptz,
  created_by                uuid        REFERENCES auth.users(id),
  created_at                timestamptz DEFAULT now() NOT NULL,
  updated_at                timestamptz DEFAULT now() NOT NULL
);

-- Computed: remaining = principal - repaid (check constraint)
ALTER TABLE partner_loan_tranches
  ADD CONSTRAINT chk_repaid_not_exceed_principal
  CHECK (total_repaid_try <= principal_try);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plt_company   ON partner_loan_tranches(company_id);
CREATE INDEX IF NOT EXISTS idx_plt_partner   ON partner_loan_tranches(partner_id);
CREATE INDEX IF NOT EXISTS idx_plt_status    ON partner_loan_tranches(status) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE partner_loan_tranches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plt_company_select" ON partner_loan_tranches
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "plt_company_write" ON partner_loan_tranches
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 3. partner_capital_commitments — Equity Commitment Tracking ─────────────
-- Tracks committed vs paid equity per partner (TTK 588)

CREATE TABLE IF NOT EXISTS partner_capital_commitments (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id        uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  committed_try     numeric(15,2) NOT NULL CHECK (committed_try >= 0),
  paid_try          numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_try >= 0),
  commitment_date   date        NOT NULL DEFAULT CURRENT_DATE,
  due_date          date,
  board_decision_ref text,
  notes             text,
  deleted_at        timestamptz,
  created_by        uuid        REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_paid_not_exceed_committed CHECK (paid_try <= committed_try)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pcc_company ON partner_capital_commitments(company_id);
CREATE INDEX IF NOT EXISTS idx_pcc_partner ON partner_capital_commitments(partner_id);

-- RLS
ALTER TABLE partner_capital_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcc_company_select" ON partner_capital_commitments
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pcc_company_write" ON partner_capital_commitments
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 4. partner_compensation_schedules — Huzur Hakkı Schedules ───────────────
-- TTK 394: Board fee / huzur hakkı recurring schedule per partner

CREATE TABLE IF NOT EXISTS partner_compensation_schedules (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id          uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  monthly_amount_try  numeric(15,2) NOT NULL CHECK (monthly_amount_try >= 0),
  start_date          date        NOT NULL,
  end_date            date,       -- NULL = ongoing
  board_decision_ref  text,       -- TTK 394 requires General Assembly decision
  is_active           boolean     NOT NULL DEFAULT true,
  notes               text,
  deleted_at          timestamptz,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pcs_company ON partner_compensation_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_pcs_partner ON partner_compensation_schedules(partner_id);
CREATE INDEX IF NOT EXISTS idx_pcs_active  ON partner_compensation_schedules(company_id, is_active) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE partner_compensation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcs_company_select" ON partner_compensation_schedules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pcs_company_write" ON partner_compensation_schedules
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 5. alert_rules — Configurable Alert Thresholds ───────────────────────────
-- Per-company configurable thresholds (overrides defaults in AlertEngine)

CREATE TABLE IF NOT EXISTS alert_rules (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_type       text        NOT NULL,
  -- Rule type examples:
  -- RECEIVABLE_30, RECEIVABLE_60, CASH_RUNWAY_90, CASH_RUNWAY_30
  -- PARTNER_BURDEN, PARTNER_LOAN_DUE, PERIOD_OVERDUE, TAX_DUE_SOON
  -- BS_IMBALANCED, LEGAL_RESERVE_LOW, DSR_HIGH
  threshold_value numeric(15,4), -- meaning depends on rule_type (days, ratio, TRY)
  severity        text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  UNIQUE (company_id, rule_type)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_ar_company ON alert_rules(company_id, is_active);

-- RLS
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_company_select" ON alert_rules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ar_company_write" ON alert_rules
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );


-- ── 6. Seed default alert rules for existing companies ───────────────────────
-- Each company gets the standard rule set with default thresholds.
-- Only inserts if no rules exist (idempotent via ON CONFLICT DO NOTHING).

INSERT INTO alert_rules (company_id, rule_type, threshold_value, severity)
SELECT
  c.id,
  rules.rule_type,
  rules.threshold_value,
  rules.severity
FROM companies c
CROSS JOIN (VALUES
  ('RECEIVABLE_30',    30,   'warning'),
  ('RECEIVABLE_60',    60,   'critical'),
  ('CASH_RUNWAY_90',   90,   'warning'),
  ('CASH_RUNWAY_30',   30,   'critical'),
  ('PARTNER_BURDEN',   0.20, 'warning'),
  ('PERIOD_OVERDUE',   10,   'warning'),
  ('TAX_DUE_SOON',     7,    'critical'),
  ('BS_IMBALANCED',    100,  'critical'),
  ('LEGAL_RESERVE_LOW',0,    'warning'),
  ('DSR_HIGH',         0.70, 'critical')
) AS rules(rule_type, threshold_value, severity)
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, rule_type) DO NOTHING;
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- flowra_phase3_accounting.sql — Double-Entry Ledger + GL Cutover Foundation
--
-- ADDITIVE ONLY. Never drops or alters existing columns.
-- Run AFTER flowra_phase1_accounting.sql and flowra_phase2_pcle.sql.
-- Idempotent: safe to run multiple times.
--
-- New objects:
--   journal_entries              — double-entry header (append-only)
--   journal_entry_lines          — debit/credit lines (append-only)
--   backfill_runs                — idempotent historical backfill tracker
--   gl_account_balances_cache    — optional materialized cache (future)
--
-- Extensions to existing tables:
--   companies                    → gl_mode column
--   accounting_periods           → gl_enabled, pre_close_at columns
--
-- Triggers:
--   fn_check_journal_entry_balance  — DEFERRED balance-check
--   fn_guard_period_lock_*          — write-block on locked periods
--
-- Append-only RLS:
--   journal_entries, journal_entry_lines — no UPDATE, no DELETE ever
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 0. EXTENSIONS ────────────────────────────────────────────────────────────

create extension if not exists "btree_gist";

-- ── A. COMPANIES — GL MODE FLAG ──────────────────────────────────────────────
-- shadow     : journal entries not written (safe default)
-- parallel   : journal entries written alongside operational tables
-- gl_primary : journal entries are the accounting truth

alter table companies
  add column if not exists gl_mode text not null default 'shadow'
    check (gl_mode in ('shadow', 'parallel', 'gl_primary'));

-- ── B. ACCOUNTING PERIODS — EXTENDED COLUMNS ─────────────────────────────────

alter table accounting_periods
  add column if not exists pre_close_at   timestamptz,
  add column if not exists locked_at      timestamptz,
  add column if not exists locked_by      uuid references auth.users(id),
  add column if not exists gl_enabled     boolean not null default false;

-- period_status_enum: extend to include pre_close (additive)
do $$ begin
  alter type period_status_enum add value if not exists 'pre_close';
exception when others then null;
end $$;

-- ── C. JOURNAL ENTRIES ────────────────────────────────────────────────────────
-- One header per economic event. Immutable once inserted.
-- source_type + source_id point back to the originating operational record.

create table if not exists journal_entries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  period_id    uuid references accounting_periods(id),
  source_type  text not null,
  -- 'sale' | 'sale_payment' | 'expense' | 'expense_payment'
  -- 'purchase' | 'purchase_cogs' | 'partner_loan' | 'partner_repayment'
  -- 'dividend_declared' | 'dividend_paid' | 'compensation'
  -- 'period_close' | 'adjustment' | 'reversal' | 'opening_balance'
  source_id    uuid,             -- FK to originating record (nullable for manual)
  entry_date   date not null,
  description  text not null,
  reference    text,             -- e.g. "INV-2024-001"
  is_adjustment boolean not null default false,
  is_reversal   boolean not null default false,
  reversal_of   uuid references journal_entries(id),
  is_voided     boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

alter table journal_entries enable row level security;

-- INSERT only — company members
do $$ begin
  create policy "je_company_insert" on journal_entries
    for insert with check (
      company_id in (
        select company_id from company_members where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- SELECT — company members
do $$ begin
  create policy "je_company_select" on journal_entries
    for select using (
      company_id in (
        select company_id from company_members where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- UPDATE: NEVER
do $$ begin
  create policy "je_no_update" on journal_entries
    for update using (false);
exception when duplicate_object then null;
end $$;

-- DELETE: NEVER
do $$ begin
  create policy "je_no_delete" on journal_entries
    for delete using (false);
exception when duplicate_object then null;
end $$;

create index if not exists idx_je_company_date
  on journal_entries(company_id, entry_date desc);

create index if not exists idx_je_source
  on journal_entries(company_id, source_type, source_id)
  where source_id is not null;

create index if not exists idx_je_period
  on journal_entries(period_id)
  where period_id is not null;

-- ── D. JOURNAL ENTRY LINES ────────────────────────────────────────────────────
-- Each line is one side of the double entry. Debit XOR Credit per row.

create table if not exists journal_entry_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references journal_entries(id),
  account_code text not null,  -- e.g. '102', '600', '391'
  account_name text not null,  -- denormalized for readability
  debit_try    numeric(20,2) not null default 0,
  credit_try   numeric(20,2) not null default 0,
  description  text,
  created_at   timestamptz not null default now(),

  constraint jel_debit_xor_credit check (
    (debit_try > 0 and credit_try = 0)
    or
    (credit_try > 0 and debit_try = 0)
  ),
  constraint jel_no_negative check (debit_try >= 0 and credit_try >= 0)
);

alter table journal_entry_lines enable row level security;

do $$ begin
  create policy "jel_company_insert" on journal_entry_lines
    for insert with check (
      entry_id in (
        select id from journal_entries
        where company_id in (
          select company_id from company_members where user_id = auth.uid()
        )
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "jel_company_select" on journal_entry_lines
    for select using (
      entry_id in (
        select id from journal_entries
        where company_id in (
          select company_id from company_members where user_id = auth.uid()
        )
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "jel_no_update" on journal_entry_lines
    for update using (false);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "jel_no_delete" on journal_entry_lines
    for delete using (false);
exception when duplicate_object then null;
end $$;

create index if not exists idx_jel_entry
  on journal_entry_lines(entry_id);

create index if not exists idx_jel_account
  on journal_entry_lines(account_code);

-- ── E. BALANCE-CHECK TRIGGER (DEFERRED) ──────────────────────────────────────
-- Fires at transaction end, not per-row, so multi-line inserts are safe.

create or replace function fn_check_journal_entry_balance()
returns trigger
language plpgsql as $$
declare
  v_total_dr numeric;
  v_total_cr numeric;
begin
  select
    coalesce(sum(debit_try),  0),
    coalesce(sum(credit_try), 0)
  into v_total_dr, v_total_cr
  from journal_entry_lines
  where entry_id = new.entry_id;

  if abs(v_total_dr - v_total_cr) > 0.01 then
    raise exception
      'Journal entry % is unbalanced: debits=%, credits=% (diff=%)',
      new.entry_id, v_total_dr, v_total_cr, abs(v_total_dr - v_total_cr);
  end if;

  return new;
end;
$$;

do $$ begin
  create constraint trigger trg_journal_entry_balance
    after insert or update on journal_entry_lines
    deferrable initially deferred
    for each row
    execute function fn_check_journal_entry_balance();
exception when duplicate_object then null;
end $$;

-- ── F. PERIOD LOCK GUARD TRIGGERS ────────────────────────────────────────────
-- Defense-in-depth: DB rejects writes to financial tables when period is locked.
-- Application-level period-guard.ts is the primary check; this is the backstop.

create or replace function fn_guard_period_write()
returns trigger
language plpgsql as $$
declare
  v_status text;
  v_tx_date date;
begin
  -- Determine the transaction date from whichever column exists
  v_tx_date := coalesce(
    (new::jsonb->>'sale_date')::date,
    (new::jsonb->>'expense_date')::date,
    (new::jsonb->>'entry_date')::date,
    (new::jsonb->>'tx_date')::date,
    current_date
  );

  select status::text into v_status
  from accounting_periods
  where company_id = (new::jsonb->>'company_id')::uuid
    and period_start <= v_tx_date
    and period_end   >= v_tx_date
  limit 1;

  if v_status = 'locked' then
    raise exception
      'Period is locked. No financial writes allowed for date %.',
      v_tx_date;
  end if;

  return new;
end;
$$;

-- Apply to financial tables (idempotent)
do $$ begin
  create trigger trg_guard_period_sales
    before insert on sales
    for each row execute function fn_guard_period_write();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_guard_period_expenses
    before insert on expenses
    for each row execute function fn_guard_period_write();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_guard_period_purchases
    before insert on purchases
    for each row execute function fn_guard_period_write();
exception when duplicate_object then null;
end $$;

-- ── G. BACKFILL TRACKING ──────────────────────────────────────────────────────
-- Idempotent tracker for retroactive journal entry generation.

create table if not exists backfill_runs (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null,
  source_type      text not null,
  source_id        uuid not null,
  status           text not null default 'pending'
    check (status in ('pending', 'done', 'failed', 'skipped')),
  journal_entry_id uuid references journal_entries(id),
  error_message    text,
  processed_at     timestamptz,
  created_at       timestamptz not null default now(),

  unique (company_id, source_type, source_id)
);

alter table backfill_runs enable row level security;

do $$ begin
  create policy "backfill_admin_only" on backfill_runs
    for all using (
      company_id in (
        select company_id from company_members
        where user_id = auth.uid() and role = 'admin'
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists idx_backfill_company_status
  on backfill_runs(company_id, status);

create index if not exists idx_backfill_company_source
  on backfill_runs(company_id, source_type, status);

-- ── H. CREATE_JOURNAL_ENTRY RPC ───────────────────────────────────────────────
-- Atomic RPC: insert header + all lines in one transaction.
-- Application layer MUST use this; never raw inserts from outside DB.

create or replace function create_journal_entry(
  p_company_id  uuid,
  p_period_id   uuid,
  p_source_type text,
  p_source_id   uuid,
  p_entry_date  date,
  p_description text,
  p_reference   text,
  p_is_adjustment boolean,
  p_created_by  uuid,
  p_lines       jsonb  -- [{account_code, account_name, debit_try, credit_try, description}]
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_entry_id uuid;
  v_line     jsonb;
  v_dr       numeric;
  v_cr       numeric;
begin
  -- Pre-flight: compute balance before inserting
  v_dr := 0;
  v_cr := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_dr := v_dr + coalesce((v_line->>'debit_try')::numeric,  0);
    v_cr := v_cr + coalesce((v_line->>'credit_try')::numeric, 0);
  end loop;

  if abs(v_dr - v_cr) > 0.01 then
    raise exception
      'Cannot create unbalanced journal entry: debits=%, credits=%', v_dr, v_cr;
  end if;

  -- Insert header
  insert into journal_entries (
    company_id, period_id, source_type, source_id,
    entry_date, description, reference, is_adjustment, created_by
  ) values (
    p_company_id, p_period_id, p_source_type, p_source_id,
    p_entry_date, p_description, p_reference, p_is_adjustment, p_created_by
  )
  returning id into v_entry_id;

  -- Insert lines
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
$$;

-- ── I. GENERAL LEDGER VIEW ────────────────────────────────────────────────────
-- Fast account-balance lookup without materializing.

create or replace view v_gl_account_balances as
select
  je.company_id,
  je.period_id,
  jel.account_code,
  jel.account_name,
  sum(jel.debit_try)  as total_debit_try,
  sum(jel.credit_try) as total_credit_try,
  sum(jel.debit_try) - sum(jel.credit_try) as net_balance_try
from journal_entry_lines jel
join journal_entries je on je.id = jel.entry_id
where je.is_voided = false
group by je.company_id, je.period_id, jel.account_code, jel.account_name;

-- ── J. TRIAL BALANCE VIEW ─────────────────────────────────────────────────────

create or replace view v_trial_balance as
select
  company_id,
  account_code,
  account_name,
  sum(total_debit_try)  as total_debit_try,
  sum(total_credit_try) as total_credit_try,
  sum(net_balance_try)  as net_balance_try
from v_gl_account_balances
group by company_id, account_code, account_name;
-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Phase 7 — Enterprise Hardening Schema
--
-- Run after flowra_phase2_pcle.sql and flowra_phase3_accounting.sql.
-- All statements are idempotent (IF NOT EXISTS / DO NOTHING).
--
-- Sections:
--   1. audit_logs hash chain columns
--   2. job_runs table (async job tracking)
--   3. alert_rules — annual_interest_rate on partner_loan_tranches
--   4. Cron job tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Audit Hash Chain Columns ───────────────────────────────────────────────
-- Adds content_hash and prev_hash to audit_logs for tamper-evident chain.
-- Existing rows have NULL hashes until stampAuditRow() is called for new rows.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS prev_hash    text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_hash
  ON audit_logs (company_id, created_at ASC)
  WHERE content_hash IS NOT NULL;

-- ── 2. job_runs — Async Job Tracking ─────────────────────────────────────────
-- Tracks every cron/async job execution for observability and idempotency.

CREATE TABLE IF NOT EXISTS job_runs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type        text        NOT NULL,
  -- e.g. 'interest_accrual' | 'overdue_update' | 'pdf_generation' | 'cfo_pack'
  company_id      uuid        REFERENCES companies(id) ON DELETE SET NULL,
  -- NULL = system-wide job (e.g. a job that runs across all companies)
  status          text        NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  duration_ms     integer,
  records_processed integer DEFAULT 0,
  error_message   text,
  metadata        jsonb,      -- job-specific output (e.g. count of rows updated)
  idempotency_key text        UNIQUE  -- job_type + company_id + date
);

CREATE INDEX IF NOT EXISTS idx_job_runs_type_started
  ON job_runs (job_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_company
  ON job_runs (company_id, started_at DESC)
  WHERE company_id IS NOT NULL;

-- ── 3. Interest Rate Column on Loan Tranches ──────────────────────────────────
-- Cron job uses this for daily interest accrual.

ALTER TABLE partner_loan_tranches
  ADD COLUMN IF NOT EXISTS annual_interest_rate numeric(6,4) DEFAULT NULL;
  -- NULL = interest-free; 0.15 = 15% per annum; stored as decimal

COMMENT ON COLUMN partner_loan_tranches.annual_interest_rate IS
  'Annual interest rate as decimal (e.g. 0.15 = 15%). NULL = interest-free.';

-- ── 4. Ensure alert_rules table has updated_at trigger ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'alert_rules_updated_at' AND tgrelid = 'alert_rules'::regclass
  ) THEN
    CREATE TRIGGER alert_rules_updated_at
      BEFORE UPDATE ON alert_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- alert_rules table doesn't exist yet (phase2 not run) — skip
  NULL;
END $$;

-- ── 5. Settings audit trail view (convenience) ───────────────────────────────
-- Read-only view of alert_rules changes from audit_logs

CREATE OR REPLACE VIEW alert_rule_audit AS
  SELECT
    al.id,
    al.company_id,
    al.action,
    al.old_values,
    al.new_values,
    al.created_at,
    al.user_id
  FROM audit_logs al
  WHERE al.resource_type = 'alert_rule'
  ORDER BY al.created_at DESC;

-- ── 6. Verify hash chain function (SQL helper) ───────────────────────────────
-- Convenience: can be called from psql for manual verification.
-- Usage: SELECT * FROM verify_audit_chain('company-uuid', '2026-01-01', '2026-12-31');

CREATE OR REPLACE FUNCTION verify_audit_chain(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
RETURNS TABLE (
  row_id       uuid,
  created_at   timestamptz,
  has_hash     boolean,
  chain_intact boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, al.created_at, content_hash
    FROM audit_logs al
    WHERE al.company_id = p_company_id
      AND al.created_at BETWEEN p_from AND (p_to + interval '1 day')
    ORDER BY al.created_at ASC
  LOOP
    row_id      := rec.id;
    created_at  := rec.created_at;
    has_hash    := rec.content_hash IS NOT NULL;
    chain_intact := rec.content_hash IS NOT NULL;  -- full verification done in app layer
    RETURN NEXT;
  END LOOP;
END;
$$;
-- ═══════════════════════════════════════════════════════════════════════════════
-- repair_production.sql  —  Flowra ERP Production Schema Repair
-- ═══════════════════════════════════════════════════════════════════════════════
-- SAFE TO RUN REPEATEDLY — every statement is idempotent.
-- No DROP TABLE, no truncations, no data loss.
-- Apply to production Supabase via: Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION A  —  ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type payment_status_enum as enum ('pending','partial','paid','overdue','cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type payment_status_enum add value if not exists 'pending';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'partial';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'paid';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'overdue';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'cancelled';
exception when others then null;
end $$;

do $$ begin
  create type task_status_enum as enum ('open','done','cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type expense_type_enum as enum ('fixed','variable','one_time');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type member_role_enum as enum ('admin','manager','viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type job_status_enum as enum ('pending','running','done','failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type shipment_status_enum as enum ('pending','shipped','delivered','returned');
exception when duplicate_object then null;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION B  —  CORE TABLES (CREATE IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- companies
create table if not exists companies (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  logo_url     text,
  tax_id       text,
  address      text,
  phone        text,
  email        text,
  website      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- company_members
create table if not exists company_members (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references companies(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null default 'viewer',
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint uq_company_member unique (company_id, user_id)
);

-- user_settings
create table if not exists user_settings (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  company_id        uuid        references companies(id) on delete cascade,
  active_company_id uuid        references companies(id) on delete set null,
  settings          jsonb       not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_user_settings unique (user_id)
);

-- customers
create table if not exists customers (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references companies(id) on delete cascade,
  name           text        not null,
  email          text,
  phone          text,
  address        text,
  tax_id         text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- products
create table if not exists products (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  name         text        not null,
  sku          text,
  unit         text        not null default 'adet',
  description  text,
  category     text,
  cost_price   numeric(12,2),
  list_price   numeric(12,2),
  currency     text        not null default 'TRY',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- banks
create table if not exists banks (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  name         text        not null,
  account_no   text,
  iban         text,
  currency     text        not null default 'TRY',
  balance      numeric(14,2) not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- expenses
create table if not exists expenses (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  title        text        not null,
  amount       numeric(12,2) not null,
  currency     text        not null default 'TRY',
  type         text        not null default 'variable',
  category     text,
  expense_date date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- partners
create table if not exists partners (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  name         text        not null,
  email        text,
  phone        text,
  share_pct    numeric(5,2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- partner_loans
create table if not exists partner_loans (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  partner_id   uuid        not null references partners(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  amount       numeric(12,2) not null,
  currency     text        not null default 'TRY',
  direction    text        not null default 'to_partner',
  notes        text,
  loan_date    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- stock_lots
create table if not exists stock_lots (
  id                uuid        primary key default gen_random_uuid(),
  company_id        uuid        not null references companies(id) on delete cascade,
  product_id        uuid        not null references products(id) on delete cascade,
  lot_no            text,
  qty_initial       numeric(12,3) not null default 0,
  qty_remaining     numeric(12,3) not null default 0,
  cost_price        numeric(12,4) not null default 0,
  cost_currency     text        not null default 'TRY',
  cost_price_try    numeric(12,4),
  cost_fx_rate      numeric(12,6),
  cost_fx_source    text,
  received_at       date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- stock_movements
create table if not exists stock_movements (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  product_id   uuid        not null references products(id) on delete cascade,
  lot_id       uuid        references stock_lots(id) on delete set null,
  type         text        not null,
  qty          numeric(12,3) not null,
  unit_cost    numeric(12,4),
  currency     text        not null default 'TRY',
  notes        text,
  reference_id uuid,
  moved_at     timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- proformas
create table if not exists proformas (
  id                  uuid        primary key default gen_random_uuid(),
  company_id          uuid        not null references companies(id) on delete cascade,
  user_id             uuid        references auth.users(id) on delete set null,
  customer_id         uuid        references customers(id) on delete set null,
  bank_id             uuid        references banks(id) on delete set null,
  proforma_no         text        not null,
  customer_name       text        not null default '',
  currency            text        not null default 'TRY',
  total               numeric(12,2) not null default 0,
  status              text        not null default 'draft',
  validity_days       integer     not null default 30,
  valid_until         date,
  notes               text,
  internal_notes      text,
  revision_no         integer     not null default 1,
  fx_usd              numeric(12,6),
  fx_eur              numeric(12,6),
  fx_try              numeric(12,6) not null default 1,
  fx_source           text,
  fx_rate_date        date,
  fx_rate_try         numeric(12,6),
  company_snapshot    jsonb,
  customer_snapshot   jsonb,
  sent_at             timestamptz,
  accepted_at         timestamptz,
  rejected_at         timestamptz,
  converted_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint uq_proforma_no unique (company_id, proforma_no)
);

-- proforma_items
create table if not exists proforma_items (
  id              uuid        primary key default gen_random_uuid(),
  proforma_id     uuid        not null references proformas(id) on delete cascade,
  company_id      uuid        not null references companies(id) on delete cascade,
  product_id      uuid        references products(id) on delete set null,
  product_name    text        not null default '',
  qty             numeric(12,3) not null default 1,
  unit_price      numeric(12,4) not null default 0,
  currency        text        not null default 'TRY',
  discount_pct    numeric(5,2) not null default 0,
  line_total      numeric(12,2) not null default 0,
  notes           text,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now()
);

-- sales
create table if not exists sales (
  id                  uuid        primary key default gen_random_uuid(),
  company_id          uuid        not null references companies(id) on delete cascade,
  user_id             uuid        references auth.users(id) on delete set null,
  customer_id         uuid        references customers(id) on delete set null,
  bank_id             uuid        references banks(id) on delete set null,
  proforma_id         uuid        references proformas(id) on delete set null,
  sale_no             text,
  customer_name       text        not null default '',
  currency            text        not null default 'TRY',
  total               numeric(12,2) not null default 0,
  paid_amount         numeric(12,2) not null default 0,
  payment_status      text        not null default 'pending',
  shipment_status     text        not null default 'pending',
  sale_date           date,
  due_date            date,
  notes               text,
  internal_notes      text,
  fx_usd              numeric(12,6),
  fx_eur              numeric(12,6),
  fx_try              numeric(12,6) not null default 1,
  fx_source           text,
  fx_rate_date        date,
  fx_rate_try         numeric(12,6),
  company_snapshot    jsonb,
  customer_snapshot   jsonb,
  shipped_at          timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- sale_items
create table if not exists sale_items (
  id              uuid        primary key default gen_random_uuid(),
  sale_id         uuid        not null references sales(id) on delete cascade,
  company_id      uuid        not null references companies(id) on delete cascade,
  product_id      uuid        references products(id) on delete set null,
  product_name    text        not null default '',
  qty             numeric(12,3) not null default 1,
  unit_price      numeric(12,4) not null default 0,
  currency        text        not null default 'TRY',
  discount_pct    numeric(5,2) not null default 0,
  line_total      numeric(12,2) not null default 0,
  notes           text,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now()
);

-- sale_item_allocations (hard-deleted — no deleted_at column)
create table if not exists sale_item_allocations (
  id              uuid        primary key default gen_random_uuid(),
  company_id      uuid        not null references companies(id) on delete cascade,
  sale_item_id    uuid        not null references sale_items(id) on delete cascade,
  lot_id          uuid        not null references stock_lots(id) on delete cascade,
  qty_allocated   numeric(12,3) not null,
  cost_price      numeric(12,4) not null default 0,
  cost_currency   text        not null default 'TRY',
  created_at      timestamptz not null default now()
);

-- collections (receivables)
create table if not exists collections (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null references companies(id) on delete cascade,
  sale_id          uuid        references sales(id) on delete set null,
  customer_id      uuid        references customers(id) on delete set null,
  bank_id          uuid        references banks(id) on delete set null,
  amount           numeric(12,2) not null,
  currency         text        not null default 'TRY',
  collected_at     date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- tasks
create table if not exists tasks (
  id                   uuid        primary key default gen_random_uuid(),
  company_id           uuid        not null references companies(id) on delete cascade,
  user_id              uuid        references auth.users(id) on delete set null,
  title                text        not null,
  status               text        not null default 'open',
  due_date             date,
  related_customer_id  uuid        references customers(id) on delete set null,
  related_sale_id      uuid        references sales(id) on delete set null,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

-- idempotency_keys
create table if not exists idempotency_keys (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  idempotency_key text        not null,
  operation       text        not null,
  status          text        not null default 'pending',
  result_id       uuid,
  result_data     jsonb,
  request_hash    text,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint uq_idempotency_user_key unique (user_id, idempotency_key)
);

-- event_outbox
create table if not exists event_outbox (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        references companies(id) on delete cascade,
  event_type   text        not null,
  payload      jsonb       not null default '{}',
  processed    boolean     not null default false,
  claimed_by   text,
  claimed_at   timestamptz,
  processed_at timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

-- jobs
create table if not exists jobs (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        references companies(id) on delete cascade,
  type         text        not null,
  payload      jsonb       not null default '{}',
  status       text        not null default 'pending',
  attempts     integer     not null default 0,
  max_attempts integer     not null default 3,
  run_at       timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz,
  failed_at    timestamptz,
  error        text,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- monthly_metrics
create table if not exists monthly_metrics (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null references companies(id) on delete cascade,
  year             integer     not null,
  month            integer     not null,
  revenue          numeric(14,2) not null default 0,
  expense          numeric(14,2) not null default 0,
  collections      numeric(14,2) not null default 0,
  gross_profit     numeric(14,2) not null default 0,
  sale_count       integer     not null default 0,
  customer_count   integer     not null default 0,
  updated_at       timestamptz not null default now(),
  constraint uq_monthly_metrics unique (company_id, year, month)
);

-- audit_log
create table if not exists audit_log (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        references companies(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  action       text        not null,
  table_name   text,
  record_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- interest_rates
create table if not exists interest_rates (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references companies(id) on delete cascade,
  currency     text        not null default 'TRY',
  rate         numeric(8,4) not null default 0,
  source       text        not null default 'manual',
  effective_at date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION C  —  COLUMN PATCHES (ADD IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- companies
alter table companies add column if not exists tax_id     text;
alter table companies add column if not exists address    text;
alter table companies add column if not exists phone      text;
alter table companies add column if not exists email      text;
alter table companies add column if not exists website    text;
alter table companies add column if not exists logo_url   text;
alter table companies add column if not exists deleted_at timestamptz;
alter table companies add column if not exists updated_at timestamptz not null default now();

-- company_members
alter table company_members add column if not exists accepted_at timestamptz;
alter table company_members add column if not exists invited_at  timestamptz not null default now();

-- user_settings
alter table user_settings add column if not exists active_company_id uuid references companies(id) on delete set null;
alter table user_settings add column if not exists settings          jsonb not null default '{}';
alter table user_settings add column if not exists updated_at        timestamptz not null default now();

-- proformas — all extra columns
alter table proformas add column if not exists bank_id            uuid references banks(id) on delete set null;
alter table proformas add column if not exists fx_usd             numeric(12,6);
alter table proformas add column if not exists fx_eur             numeric(12,6);
alter table proformas add column if not exists fx_try             numeric(12,6) not null default 1;
alter table proformas add column if not exists fx_source          text;
alter table proformas add column if not exists fx_rate_date       date;
alter table proformas add column if not exists fx_rate_try        numeric(12,6);
alter table proformas add column if not exists company_snapshot   jsonb;
alter table proformas add column if not exists customer_snapshot  jsonb;
alter table proformas add column if not exists internal_notes     text;
alter table proformas add column if not exists revision_no        integer not null default 1;
alter table proformas add column if not exists sent_at            timestamptz;
alter table proformas add column if not exists accepted_at        timestamptz;
alter table proformas add column if not exists rejected_at        timestamptz;
alter table proformas add column if not exists converted_at       timestamptz;
alter table proformas add column if not exists valid_until        date;

-- proforma_items
alter table proforma_items add column if not exists company_id   uuid references companies(id) on delete cascade;
alter table proforma_items add column if not exists sort_order   integer not null default 0;
alter table proforma_items add column if not exists discount_pct numeric(5,2) not null default 0;
alter table proforma_items add column if not exists line_total   numeric(12,2) not null default 0;

-- sales
alter table sales add column if not exists bank_id           uuid references banks(id) on delete set null;
alter table sales add column if not exists proforma_id       uuid references proformas(id) on delete set null;
alter table sales add column if not exists sale_no           text;
alter table sales add column if not exists paid_amount       numeric(12,2) not null default 0;
alter table sales add column if not exists payment_status    text not null default 'pending';
alter table sales add column if not exists shipment_status   text not null default 'pending';
alter table sales add column if not exists due_date          date;
alter table sales add column if not exists internal_notes    text;
alter table sales add column if not exists fx_usd            numeric(12,6);
alter table sales add column if not exists fx_eur            numeric(12,6);
alter table sales add column if not exists fx_try            numeric(12,6) not null default 1;
alter table sales add column if not exists fx_source         text;
alter table sales add column if not exists fx_rate_date      date;
alter table sales add column if not exists fx_rate_try       numeric(12,6);
alter table sales add column if not exists company_snapshot  jsonb;
alter table sales add column if not exists customer_snapshot jsonb;
alter table sales add column if not exists shipped_at        timestamptz;
alter table sales add column if not exists delivered_at      timestamptz;
alter table sales add column if not exists updated_at        timestamptz not null default now();

-- sale_items
alter table sale_items add column if not exists company_id   uuid references companies(id) on delete cascade;
alter table sale_items add column if not exists sort_order   integer not null default 0;
alter table sale_items add column if not exists discount_pct numeric(5,2) not null default 0;
alter table sale_items add column if not exists line_total   numeric(12,2) not null default 0;

-- sale_item_allocations
alter table sale_item_allocations add column if not exists company_id    uuid references companies(id) on delete cascade;
alter table sale_item_allocations add column if not exists cost_price    numeric(12,4) not null default 0;
alter table sale_item_allocations add column if not exists cost_currency text not null default 'TRY';

-- stock_lots
alter table stock_lots add column if not exists cost_price_try numeric(12,4);
alter table stock_lots add column if not exists cost_fx_rate   numeric(12,6);
alter table stock_lots add column if not exists cost_fx_source text;
alter table stock_lots add column if not exists lot_no         text;
alter table stock_lots add column if not exists received_at    date;

-- collections
alter table collections add column if not exists bank_id     uuid references banks(id) on delete set null;
alter table collections add column if not exists customer_id uuid references customers(id) on delete set null;
alter table collections add column if not exists updated_at  timestamptz not null default now();

-- tasks
alter table tasks add column if not exists related_sale_id uuid references sales(id) on delete set null;
alter table tasks add column if not exists updated_at      timestamptz not null default now();

-- expenses
alter table expenses add column if not exists expense_date date;
alter table expenses add column if not exists category     text;

-- partners
alter table partners add column if not exists share_pct  numeric(5,2);
alter table partners add column if not exists updated_at timestamptz not null default now();

-- partner_loans
alter table partner_loans add column if not exists direction  text not null default 'to_partner';
alter table partner_loans add column if not exists loan_date  date;
alter table partner_loans add column if not exists updated_at timestamptz not null default now();

-- idempotency_keys
alter table idempotency_keys add column if not exists request_hash text;

-- jobs
alter table jobs add column if not exists max_attempts integer not null default 3;
alter table jobs add column if not exists run_at       timestamptz not null default now();
alter table jobs add column if not exists started_at   timestamptz;
alter table jobs add column if not exists result       jsonb;

-- interest_rates
alter table interest_rates add column if not exists source       text not null default 'manual';
alter table interest_rates add column if not exists effective_at date;

-- audit_log
alter table audit_log add column if not exists ip_address text;
alter table audit_log add column if not exists user_agent text;
alter table audit_log add column if not exists table_name text;
alter table audit_log add column if not exists record_id  uuid;
alter table audit_log add column if not exists old_data   jsonb;
alter table audit_log add column if not exists new_data   jsonb;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION D  —  PAYMENT STATUS CAST REPAIR
-- Converts sales.payment_status from plain text to payment_status_enum safely
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  col_type text;
begin
  select data_type into col_type
  from   information_schema.columns
  where  table_schema = 'public'
    and  table_name   = 'sales'
    and  column_name  = 'payment_status';

  if col_type in ('text', 'character varying') then
    update sales set payment_status = 'pending'
    where payment_status not in ('pending','partial','paid','overdue','cancelled');
    alter table sales alter column payment_status
      type payment_status_enum using payment_status::payment_status_enum;
    raise notice 'sales.payment_status converted text → payment_status_enum';
  else
    raise notice 'sales.payment_status is already %, skipping', col_type;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION E  —  DATA BACKFILLS
-- ─────────────────────────────────────────────────────────────────────────────

update proforma_items pi
set    company_id = p.company_id
from   proformas p
where  pi.proforma_id = p.id
  and  pi.company_id  is null;

update sale_items si
set    company_id = s.company_id
from   sales s
where  si.sale_id    = s.id
  and  si.company_id is null;

update sale_item_allocations sia
set    company_id = l.company_id
from   stock_lots l
where  sia.lot_id      = l.id
  and  sia.company_id  is null;

update sales set updated_at = created_at where updated_at is null;

update proformas
set    valid_until = (created_at::date + validity_days * interval '1 day')::date
where  valid_until is null and validity_days is not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION F  —  CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  alter table idempotency_keys
    add constraint uq_idempotency_user_key unique (user_id, idempotency_key);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table company_members
    add constraint uq_company_member unique (company_id, user_id);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table user_settings
    add constraint uq_user_settings unique (user_id);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table proformas
    add constraint uq_proforma_no unique (company_id, proforma_no);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table monthly_metrics
    add constraint uq_monthly_metrics unique (company_id, year, month);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table company_members
    add constraint chk_member_role check (role in ('admin','manager','viewer'));
exception when duplicate_table or duplicate_object then null;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION G  —  FOREIGN KEYS (idempotent DO blocks)
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='tasks'::regclass and conname='fk_tasks_customer') then
    alter table tasks add constraint fk_tasks_customer
      foreign key (related_customer_id) references customers(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='tasks'::regclass and conname='fk_tasks_sale') then
    alter table tasks add constraint fk_tasks_sale
      foreign key (related_sale_id) references sales(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='proforma_items'::regclass and conname='fk_proforma_items_company') then
    alter table proforma_items add constraint fk_proforma_items_company
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sale_items'::regclass and conname='fk_sale_items_company') then
    alter table sale_items add constraint fk_sale_items_company
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sale_item_allocations'::regclass and conname='fk_sia_company') then
    alter table sale_item_allocations add constraint fk_sia_company
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='collections'::regclass and conname='fk_collections_bank') then
    alter table collections add constraint fk_collections_bank
      foreign key (bank_id) references banks(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sales'::regclass and conname='fk_sales_bank') then
    alter table sales add constraint fk_sales_bank
      foreign key (bank_id) references banks(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sales'::regclass and conname='fk_sales_proforma') then
    alter table sales add constraint fk_sales_proforma
      foreign key (proforma_id) references proformas(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='proformas'::regclass and conname='fk_proformas_bank') then
    alter table proformas add constraint fk_proformas_bank
      foreign key (bank_id) references banks(id) on delete set null;
  end if;
exception when others then null;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION H  —  INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_company_members_user_id    on company_members(user_id);
create index if not exists idx_company_members_company_id on company_members(company_id);
create index if not exists idx_user_settings_user_id      on user_settings(user_id);
create index if not exists idx_customers_company_id       on customers(company_id) where deleted_at is null;
create index if not exists idx_products_company_id        on products(company_id) where deleted_at is null;
create index if not exists idx_banks_company_id           on banks(company_id) where deleted_at is null;
create index if not exists idx_expenses_company_id        on expenses(company_id) where deleted_at is null;
create index if not exists idx_expenses_expense_date      on expenses(company_id, expense_date);
create index if not exists idx_partners_company_id        on partners(company_id) where deleted_at is null;
create index if not exists idx_partner_loans_company_id   on partner_loans(company_id) where deleted_at is null;
create index if not exists idx_partner_loans_partner_id   on partner_loans(partner_id);
create index if not exists idx_stock_lots_company_product on stock_lots(company_id, product_id) where deleted_at is null;
create index if not exists idx_stock_lots_received_at     on stock_lots(company_id, received_at) where deleted_at is null;
create index if not exists idx_stock_movements_company_id on stock_movements(company_id);
create index if not exists idx_stock_movements_product_id on stock_movements(product_id);
create index if not exists idx_stock_movements_moved_at   on stock_movements(company_id, moved_at);
create index if not exists idx_proformas_company_id       on proformas(company_id) where deleted_at is null;
create index if not exists idx_proformas_customer_id      on proformas(customer_id) where deleted_at is null;
create index if not exists idx_proformas_status           on proformas(company_id, status) where deleted_at is null;
create index if not exists idx_proformas_created_at       on proformas(company_id, created_at desc) where deleted_at is null;
create index if not exists idx_proforma_items_proforma_id on proforma_items(proforma_id);
create index if not exists idx_sales_company_id           on sales(company_id) where deleted_at is null;
create index if not exists idx_sales_customer_id          on sales(customer_id) where deleted_at is null;
create index if not exists idx_sales_sale_date            on sales(company_id, sale_date) where deleted_at is null;
create index if not exists idx_sales_created_at           on sales(company_id, created_at desc) where deleted_at is null;
create index if not exists idx_sale_items_sale_id         on sale_items(sale_id);
create index if not exists idx_sia_sale_item_id           on sale_item_allocations(sale_item_id);
create index if not exists idx_sia_lot_id                 on sale_item_allocations(lot_id);
create index if not exists idx_collections_company_id     on collections(company_id) where deleted_at is null;
create index if not exists idx_collections_sale_id        on collections(sale_id) where deleted_at is null;
create index if not exists idx_collections_collected_at   on collections(company_id, collected_at);
create index if not exists idx_tasks_company_id           on tasks(company_id) where deleted_at is null;
create index if not exists idx_tasks_due_date             on tasks(company_id, due_date) where deleted_at is null;
create index if not exists idx_tasks_status               on tasks(company_id, status) where deleted_at is null;
create index if not exists idx_idempotency_user_key       on idempotency_keys(user_id, idempotency_key);
create index if not exists idx_idempotency_expires        on idempotency_keys(expires_at);
create index if not exists idx_event_outbox_unprocessed   on event_outbox(created_at) where processed = false;
create index if not exists idx_jobs_status_run_at         on jobs(status, run_at) where status in ('pending','running');
create index if not exists idx_monthly_metrics_company_ym on monthly_metrics(company_id, year, month);
create index if not exists idx_audit_log_company_id       on audit_log(company_id, created_at desc);
create index if not exists idx_audit_log_user_id          on audit_log(user_id, created_at desc);
create index if not exists idx_interest_rates_company     on interest_rates(company_id, currency);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION I  —  ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

alter table companies              enable row level security;
alter table company_members        enable row level security;
alter table user_settings          enable row level security;
alter table customers              enable row level security;
alter table products               enable row level security;
alter table banks                  enable row level security;
alter table expenses               enable row level security;
alter table partners               enable row level security;
alter table partner_loans          enable row level security;
alter table stock_lots             enable row level security;
alter table stock_movements        enable row level security;
alter table proformas              enable row level security;
alter table proforma_items         enable row level security;
alter table sales                  enable row level security;
alter table sale_items             enable row level security;
alter table sale_item_allocations  enable row level security;
alter table collections            enable row level security;
alter table tasks                  enable row level security;
alter table idempotency_keys       enable row level security;
alter table event_outbox           enable row level security;
alter table jobs                   enable row level security;
alter table monthly_metrics        enable row level security;
alter table audit_log              enable row level security;
alter table interest_rates         enable row level security;

-- Helper functions
create or replace function public.is_company_member(p_company_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = auth.uid()
  )
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = auth.uid() and role = 'admin'
  )
$$;

-- companies
drop policy if exists companies_member_select on companies;
create policy companies_member_select on companies for select
  using (is_company_member(id));

drop policy if exists companies_admin_write on companies;
create policy companies_admin_write on companies for all
  using (is_company_admin(id));

-- company_members
drop policy if exists company_members_select on company_members;
create policy company_members_select on company_members for select
  using (is_company_member(company_id));

drop policy if exists company_members_admin_write on company_members;
create policy company_members_admin_write on company_members for all
  using (is_company_admin(company_id));

-- user_settings
drop policy if exists user_settings_own on user_settings;
create policy user_settings_own on user_settings for all
  using (user_id = auth.uid());

-- customers
drop policy if exists customers_member on customers;
create policy customers_member on customers for all
  using (is_company_member(company_id));

-- products
drop policy if exists products_member on products;
create policy products_member on products for all
  using (is_company_member(company_id));

-- banks
drop policy if exists banks_member on banks;
create policy banks_member on banks for all
  using (is_company_member(company_id));

-- expenses
drop policy if exists expenses_member on expenses;
create policy expenses_member on expenses for all
  using (is_company_member(company_id));

-- partners
drop policy if exists partners_member on partners;
create policy partners_member on partners for all
  using (is_company_member(company_id));

-- partner_loans
drop policy if exists partner_loans_member on partner_loans;
create policy partner_loans_member on partner_loans for all
  using (is_company_member(company_id));

-- stock_lots
drop policy if exists stock_lots_member on stock_lots;
create policy stock_lots_member on stock_lots for all
  using (is_company_member(company_id));

-- stock_movements
drop policy if exists stock_movements_member on stock_movements;
create policy stock_movements_member on stock_movements for all
  using (is_company_member(company_id));

-- proformas
drop policy if exists proformas_member on proformas;
create policy proformas_member on proformas for all
  using (is_company_member(company_id));

-- proforma_items
drop policy if exists proforma_items_member on proforma_items;
create policy proforma_items_member on proforma_items for all
  using (is_company_member(company_id));

-- sales
drop policy if exists sales_member on sales;
create policy sales_member on sales for all
  using (is_company_member(company_id));

-- sale_items
drop policy if exists sale_items_member on sale_items;
create policy sale_items_member on sale_items for all
  using (is_company_member(company_id));

-- sale_item_allocations
drop policy if exists sia_member on sale_item_allocations;
create policy sia_member on sale_item_allocations for all
  using (is_company_member(company_id));

-- collections
drop policy if exists collections_member on collections;
create policy collections_member on collections for all
  using (is_company_member(company_id));

-- tasks
drop policy if exists tasks_member on tasks;
create policy tasks_member on tasks for all
  using (is_company_member(company_id));

-- event_outbox
drop policy if exists event_outbox_member on event_outbox;
create policy event_outbox_member on event_outbox for all
  using (company_id is null or is_company_member(company_id));

-- jobs
drop policy if exists jobs_member on jobs;
create policy jobs_member on jobs for all
  using (company_id is null or is_company_member(company_id));

-- monthly_metrics
drop policy if exists monthly_metrics_member on monthly_metrics;
create policy monthly_metrics_member on monthly_metrics for all
  using (is_company_member(company_id));

-- audit_log (admin read-only)
drop policy if exists audit_log_admin on audit_log;
create policy audit_log_admin on audit_log for select
  using (is_company_admin(company_id));

-- interest_rates
drop policy if exists interest_rates_member on interest_rates;
create policy interest_rates_member on interest_rates for all
  using (is_company_member(company_id));

-- idempotency_keys
drop policy if exists idempotency_own_rows on idempotency_keys;
create policy idempotency_own_rows on idempotency_keys for all
  using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION J  —  SECURITY DEFINER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- J1: bootstrap_user_company
-- Called on every request via resolveCompanyId(). Creates company + member +
-- user_settings atomically for new users. Safe to call repeatedly.
create or replace function public.bootstrap_user_company(
  p_user_id    uuid,
  p_company_id uuid  default null,
  p_name       text  default 'My Company'
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_company_id uuid;
  v_member_id  uuid;
begin
  if p_company_id is not null then
    if exists (
      select 1 from company_members
      where company_id = p_company_id and user_id = p_user_id
    ) then
      return jsonb_build_object('company_id', p_company_id, 'bootstrapped', false);
    end if;
  end if;

  select active_company_id into v_company_id
  from user_settings where user_id = p_user_id;

  if v_company_id is null then
    select company_id into v_company_id
    from company_members
    where user_id = p_user_id
    order by created_at limit 1;
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

  return jsonb_build_object(
    'company_id',   v_company_id,
    'member_id',    v_member_id,
    'bootstrapped', true
  );
end $$;


-- J2: create_proforma_atomic
-- Atomic proforma header + items insert with sequential proforma_no.
create or replace function public.create_proforma_atomic(
  p_user_id           uuid,
  p_customer_id       uuid    default null,
  p_bank_id           uuid    default null,
  p_customer_name     text    default '',
  p_currency          text    default 'TRY',
  p_validity_days     integer default 30,
  p_notes             text    default null,
  p_internal_notes    text    default null,
  p_total             numeric default 0,
  p_fx_usd            numeric default null,
  p_fx_eur            numeric default null,
  p_fx_try            numeric default 1,
  p_fx_source         text    default 'manual',
  p_fx_rate_date      text    default null,
  p_fx_rate_try       numeric default null,
  p_company_snapshot  jsonb   default null,
  p_customer_snapshot jsonb   default null,
  p_items             jsonb   default '[]',
  p_company_id        uuid    default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_company_id  uuid;
  v_proforma_id uuid;
  v_proforma_no text;
  v_year        text := to_char(now(), 'YYYY');
  v_seq         integer;
  v_item        jsonb;
  v_sort        integer := 0;
begin
  if v_caller_id is null or v_caller_id <> p_user_id then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_company_id := p_company_id;
  if v_company_id is null then
    select company_id into v_company_id
    from company_members where user_id = p_user_id order by created_at limit 1;
  end if;

  if v_company_id is null then
    raise exception 'COMPANY_NOT_RESOLVED' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from company_members
    where company_id = v_company_id and user_id = p_user_id
  ) then raise exception 'FORBIDDEN' using errcode = 'P0003'; end if;

  select coalesce(max(
    (regexp_match(proforma_no, 'PRF-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from proformas
  where company_id = v_company_id and proforma_no like 'PRF-' || v_year || '-%';

  v_proforma_no := 'PRF-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into proformas (
    company_id, user_id, customer_id, bank_id, proforma_no,
    customer_name, currency, total, status, validity_days,
    valid_until, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  )
  values (
    v_company_id, p_user_id, p_customer_id, p_bank_id, v_proforma_no,
    coalesce(p_customer_name, ''), p_currency, p_total, 'draft', p_validity_days,
    (now()::date + p_validity_days * interval '1 day')::date,
    p_notes, p_internal_notes,
    p_fx_usd, p_fx_eur, p_fx_try, p_fx_source,
    case when p_fx_rate_date ~ '^\d{4}-\d{2}-\d{2}$' then p_fx_rate_date::date else null end,
    p_fx_rate_try, p_company_snapshot, p_customer_snapshot
  )
  returning id into v_proforma_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into proforma_items (
      proforma_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order
    )
    values (
      v_proforma_id, v_company_id,
      nullif((v_item->>'product_id')::text, '')::uuid,
      coalesce(v_item->>'product_name', ''),
      coalesce((v_item->>'qty')::numeric, 1),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce(v_item->>'currency', p_currency),
      coalesce((v_item->>'discount_pct')::numeric, 0),
      coalesce((v_item->>'line_total')::numeric, 0),
      v_item->>'notes', v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return jsonb_build_object('id', v_proforma_id, 'proforma_no', v_proforma_no);
end $$;


-- J3: convert_proforma_to_sale
-- FIFO stock allocation. Creates a confirmed sale from a proforma.
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

        insert into sale_item_allocations (
          company_id, sale_item_id, lot_id, qty_allocated, cost_price, cost_currency
        )
        values (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_alloc_qty, v_lot.cost_price, v_lot.cost_currency
        );

        update stock_lots
        set qty_remaining = qty_remaining - v_alloc_qty, updated_at = now()
        where id = v_lot.id;

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


-- J4: claim_event_batch — FOR UPDATE SKIP LOCKED concurrent batch claiming
create or replace function public.claim_event_batch(
  p_worker_id  text,
  p_batch_size integer default 10
)
returns setof event_outbox language plpgsql security definer set search_path = public
as $$
begin
  return query
  update event_outbox
  set claimed_by = p_worker_id, claimed_at = now()
  where id in (
    select id from event_outbox
    where processed = false
      and (claimed_by is null or claimed_at < now() - interval '5 minutes')
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  returning *;
end $$;


-- J5: purge_expired_idempotency_keys
create or replace function public.purge_expired_idempotency_keys()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  delete from idempotency_keys where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- J6: upsert_monthly_metrics
create or replace function public.upsert_monthly_metrics(
  p_company_id     uuid,
  p_year           integer,
  p_month          integer,
  p_revenue        numeric default null,
  p_expense        numeric default null,
  p_collections    numeric default null,
  p_gross_profit   numeric default null,
  p_sale_count     integer default null,
  p_customer_count integer default null
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into monthly_metrics (
    company_id, year, month,
    revenue, expense, collections, gross_profit, sale_count, customer_count
  )
  values (
    p_company_id, p_year, p_month,
    coalesce(p_revenue, 0), coalesce(p_expense, 0), coalesce(p_collections, 0),
    coalesce(p_gross_profit, 0), coalesce(p_sale_count, 0), coalesce(p_customer_count, 0)
  )
  on conflict (company_id, year, month) do update set
    revenue        = coalesce(p_revenue,        monthly_metrics.revenue),
    expense        = coalesce(p_expense,        monthly_metrics.expense),
    collections    = coalesce(p_collections,    monthly_metrics.collections),
    gross_profit   = coalesce(p_gross_profit,   monthly_metrics.gross_profit),
    sale_count     = coalesce(p_sale_count,     monthly_metrics.sale_count),
    customer_count = coalesce(p_customer_count, monthly_metrics.customer_count),
    updated_at     = now();
end $$;


-- J7: restore_user_data — atomic backup restore (admin only)
create or replace function public.restore_user_data(
  p_uid                   uuid,
  p_company_id            uuid,
  p_customers             jsonb default '[]',
  p_products              jsonb default '[]',
  p_expenses              jsonb default '[]',
  p_proformas             jsonb default '[]',
  p_proforma_items        jsonb default '[]',
  p_stock_lots            jsonb default '[]',
  p_stock_movements       jsonb default '[]',
  p_sales                 jsonb default '[]',
  p_sale_items            jsonb default '[]',
  p_sale_item_allocations jsonb default '[]'
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null or v_caller <> p_uid then raise exception 'UNAUTHORIZED'; end if;
  if not exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = p_uid and role = 'admin'
  ) then raise exception 'FORBIDDEN — admin only'; end if;

  -- Soft-delete current live data
  update customers  set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update products   set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update expenses   set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update proformas  set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update sales      set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update stock_lots set deleted_at = now() where company_id = p_company_id and deleted_at is null;

  -- Hard-delete allocation tables (no deleted_at)
  delete from sale_item_allocations where company_id = p_company_id;
  delete from stock_movements       where company_id = p_company_id;

  -- Restore snapshot data
  insert into customers  select * from jsonb_populate_recordset(null::customers,  p_customers)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into products   select * from jsonb_populate_recordset(null::products,   p_products)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into expenses   select * from jsonb_populate_recordset(null::expenses,   p_expenses)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into proformas  select * from jsonb_populate_recordset(null::proformas,  p_proformas)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into proforma_items select * from jsonb_populate_recordset(null::proforma_items, p_proforma_items)
    on conflict (id) do nothing;
  insert into stock_lots select * from jsonb_populate_recordset(null::stock_lots, p_stock_lots)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into stock_movements select * from jsonb_populate_recordset(null::stock_movements, p_stock_movements)
    on conflict (id) do nothing;
  insert into sales      select * from jsonb_populate_recordset(null::sales,      p_sales)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into sale_items select * from jsonb_populate_recordset(null::sale_items, p_sale_items)
    on conflict (id) do nothing;
  insert into sale_item_allocations select * from jsonb_populate_recordset(null::sale_item_allocations, p_sale_item_allocations)
    on conflict (id) do nothing;

  return jsonb_build_object('restored', true, 'company_id', p_company_id);
end $$;


-- J8: Job queue helpers
create or replace function public.enqueue_job(
  p_type       text,
  p_payload    jsonb       default '{}',
  p_company_id uuid        default null,
  p_run_at     timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into jobs (type, payload, company_id, status, run_at)
  values (p_type, p_payload, p_company_id, 'pending', p_run_at)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.claim_next_job(p_worker_id text)
returns setof jobs language plpgsql security definer set search_path = public
as $$
begin
  return query
  update jobs
  set status = 'running', started_at = now(), updated_at = now(), attempts = attempts + 1
  where id = (
    select id from jobs
    where status = 'pending' and run_at <= now() and attempts < max_attempts
    order by run_at limit 1 for update skip locked
  )
  returning *;
end $$;

create or replace function public.complete_job(p_job_id uuid, p_result jsonb default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update jobs
  set status = 'done', completed_at = now(), result = p_result, updated_at = now()
  where id = p_job_id;
end $$;

create or replace function public.fail_job(p_job_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update jobs
  set status     = case when attempts >= max_attempts then 'failed' else 'pending' end,
      error      = p_error,
      run_at     = case when attempts >= max_attempts then run_at else now() + interval '60 seconds' end,
      updated_at = now()
  where id = p_job_id;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION K  —  PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke public execute on security definer functions
revoke execute on function public.bootstrap_user_company(uuid, uuid, text)       from public;
revoke execute on function public.create_proforma_atomic(uuid, uuid, uuid, text, text, integer, text, text, numeric, numeric, numeric, numeric, text, text, numeric, jsonb, jsonb, jsonb, uuid) from public;
revoke execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) from public;
revoke execute on function public.claim_event_batch(text, integer)               from public;
revoke execute on function public.purge_expired_idempotency_keys()               from public;
revoke execute on function public.upsert_monthly_metrics(uuid, integer, integer, numeric, numeric, numeric, numeric, integer, integer) from public;
revoke execute on function public.restore_user_data(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.enqueue_job(text, jsonb, uuid, timestamptz)   from public;
revoke execute on function public.claim_next_job(text)                           from public;
revoke execute on function public.complete_job(uuid, jsonb)                      from public;
revoke execute on function public.fail_job(uuid, text)                           from public;
revoke execute on function public.is_company_member(uuid)                        from public;
revoke execute on function public.is_company_admin(uuid)                         from public;

-- Grant to authenticated
grant execute on function public.bootstrap_user_company(uuid, uuid, text)        to authenticated;
grant execute on function public.create_proforma_atomic(uuid, uuid, uuid, text, text, integer, text, text, numeric, numeric, numeric, numeric, text, text, numeric, jsonb, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) to authenticated;
grant execute on function public.restore_user_data(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.is_company_member(uuid)                          to authenticated;
grant execute on function public.is_company_admin(uuid)                           to authenticated;

-- service_role for server-side workers
grant execute on function public.claim_event_batch(text, integer)                to service_role;
grant execute on function public.purge_expired_idempotency_keys()                to service_role;
grant execute on function public.upsert_monthly_metrics(uuid, integer, integer, numeric, numeric, numeric, numeric, integer, integer) to service_role;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz)     to service_role;
grant execute on function public.claim_next_job(text)                            to service_role;
grant execute on function public.complete_job(uuid, jsonb)                       to service_role;
grant execute on function public.fail_job(uuid, text)                            to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION L  —  db_audit.sql BUG CORRECTIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- Apply these fixes manually to supabase/db_audit.sql:
--
-- BUG 1 — sale_item_allocations has no deleted_at column (it is hard-deleted).
--   Remove every occurrence of `and a.deleted_at is null` where `a` aliases
--   sale_item_allocations. Affects ZERO_COST_LOT and over-allocation checks.
--
-- BUG 2 — Over-allocated lots HAVING clause:
--   Change `having l.qty_remaining < 0`
--   to     `having sum(a.qty_allocated) > max(l.qty_initial)`
--   This catches over-allocation even when qty_remaining was manually zeroed.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF repair_production.sql
--
-- Verify after running:
--   select count(*) from companies;
--   select count(*) from company_members;
--   select proforma_no from proformas limit 3;
--   select * from tasks limit 3;
--   select routine_name from information_schema.routines
--     where routine_schema = 'public' and routine_type = 'FUNCTION'
--     order by routine_name;
-- ═══════════════════════════════════════════════════════════════════════════════
