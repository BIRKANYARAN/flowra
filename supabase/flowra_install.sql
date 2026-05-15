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

-- sales: financing interest written by convert_proforma_to_sale
alter table sales
  add column if not exists interest_rate numeric(8,6),
  add column if not exists interest_days integer;

-- sales: line-item totals aggregated by convert_proforma_to_sale
alter table sales
  add column if not exists subtotal  numeric(14,2),
  add column if not exists kdv_total numeric(14,2);

-- sale_items: TRY equivalent of line_total (currency-converted)
alter table sale_items
  add column if not exists line_total_try numeric(14,2) not null default 0;

-- sale_item_allocations: financing cost tracking per allocation slice
alter table sale_item_allocations
  add column if not exists holding_days  integer,
  add column if not exists interest_cost numeric(14,2);

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

-- proformas: sales rep info shown in PDF signature block
alter table proformas
  add column if not exists sales_rep_name  text;
alter table proformas
  add column if not exists sales_rep_title text;
alter table proformas
  add column if not exists sales_rep_phone text;

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

-- Drop + recreate constraint so new tx_types are included on re-run even
-- when the constraint already exists.
-- FAZ 2: added 'correction' for immutable ledger (wrong entries reversed,
-- never deleted).
do $$ begin
  alter table partner_transactions drop constraint if exists chk_partner_tx_type;
exception when others then null;
end $$;
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

-- Unique partial index: enforces exactly one live sale per proforma at DB level.
-- convert_proforma_to_sale relies on this as a last-resort duplicate barrier.
-- TypeScript SaleService catches the index name in error messages → ALREADY_CONVERTED.
create unique index if not exists uq_sales_proforma_live
  on sales (proforma_id)
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

  -- Generate sequential proforma number within the company (year-scoped).
  -- Use count(*)+1 NOT max(revision_no)+1: revision_no is always 1 at creation
  -- so max(revision_no) = 1 for every proforma, causing duplicate numbers.
  select coalesce(count(*), 0) + 1
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- H. ROW LEVEL SECURITY — COMPANY ISOLATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- DESIGN:
--   • Every company-scoped table uses the same isolation pattern:
--       company_id IN (SELECT company_id FROM company_members
--                      WHERE user_id = auth.uid()
--                        AND deleted_at IS NULL
--                        AND accepted_at IS NOT NULL)
--
--   • A stable SECURITY DEFINER helper function is defined once and reused
--     in all policies.  Postgres evaluates it once per query, not per row.
--
--   • Child tables (proforma_items, sale_items, etc.) are isolated by
--     checking their parent row's company membership via EXISTS.
--
--   • All policy names are prefixed with "flowra_" to avoid collisions
--     with any future Supabase auto-generated policies.
--
--   • All policy-create blocks use DO $$ BEGIN ... EXCEPTION WHEN
--     duplicate_object THEN null; END $$; — safe to re-run (idempotent).
--
--   • company_members itself has a dual policy: a user may see all
--     members of every company they belong to (needed for admin UI).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: returns the set of company_ids accessible to the current user ────
-- SECURITY DEFINER so it can read company_members without recursive RLS.
-- stable = Postgres may cache the result within one query.
create or replace function flowra_user_companies()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select company_id
  from   company_members
  where  user_id      = auth.uid()
    and  deleted_at   is null
    and  accepted_at  is not null
$$;

grant execute on function flowra_user_companies to authenticated;

-- ── Macro shorthand — used inline in each do-block below ─────────────────────
-- Policy pattern for direct company_id column:
--   USING (company_id IN (select flowra_user_companies()))
-- Policy pattern for child tables (no direct company_id):
--   USING (EXISTS (SELECT 1 FROM <parent> p WHERE p.id = <fk> AND p.company_id IN (select flowra_user_companies())))

-- ─────────────────────────────────────────────────────────────────────────────
-- DIRECT COMPANY-SCOPED TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- sales
alter table sales enable row level security;
do $$ begin
  create policy "flowra_sales_company_isolation" on sales
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- expenses
alter table expenses enable row level security;
do $$ begin
  create policy "flowra_expenses_company_isolation" on expenses
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- recurring_expenses
alter table recurring_expenses enable row level security;
do $$ begin
  create policy "flowra_recurring_expenses_company_isolation" on recurring_expenses
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- products
alter table products enable row level security;
do $$ begin
  create policy "flowra_products_company_isolation" on products
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- customers
alter table customers enable row level security;
do $$ begin
  create policy "flowra_customers_company_isolation" on customers
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- stock_lots
alter table stock_lots enable row level security;
do $$ begin
  create policy "flowra_stock_lots_company_isolation" on stock_lots
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- stock_movements
alter table stock_movements enable row level security;
do $$ begin
  create policy "flowra_stock_movements_company_isolation" on stock_movements
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- proformas
alter table proformas enable row level security;
do $$ begin
  create policy "flowra_proformas_company_isolation" on proformas
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- partners
alter table partners enable row level security;
do $$ begin
  create policy "flowra_partners_company_isolation" on partners
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- partner_transactions
alter table partner_transactions enable row level security;
do $$ begin
  create policy "flowra_partner_transactions_company_isolation" on partner_transactions
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- company_banks
alter table company_banks enable row level security;
do $$ begin
  create policy "flowra_company_banks_company_isolation" on company_banks
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- tasks
alter table tasks enable row level security;
do $$ begin
  create policy "flowra_tasks_company_isolation" on tasks
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- alerts
alter table alerts enable row level security;
do $$ begin
  create policy "flowra_alerts_company_isolation" on alerts
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- audit_logs
alter table audit_logs enable row level security;
do $$ begin
  create policy "flowra_audit_logs_company_isolation" on audit_logs
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- purchases
alter table purchases enable row level security;
do $$ begin
  create policy "flowra_purchases_company_isolation" on purchases
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- user_settings (company-scoped configuration)
alter table user_settings enable row level security;
do $$ begin
  create policy "flowra_user_settings_company_isolation" on user_settings
    for all using (company_id in (select flowra_user_companies()));
exception when duplicate_object then null; end $$;

-- fx_rates (global but authenticated-only — prevent unauthenticated reads)
alter table fx_rates enable row level security;
do $$ begin
  create policy "flowra_fx_rates_authenticated_read" on fx_rates
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- interest_rates (global reference data — authenticated read)
alter table interest_rates enable row level security;
do $$ begin
  create policy "flowra_interest_rates_authenticated_read" on interest_rates
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- company_members — SPECIAL POLICY
-- A user may see and manage all membership rows within any company they belong to.
-- This enables the admin users page (/dashboard/admin/users).
-- ─────────────────────────────────────────────────────────────────────────────
alter table company_members enable row level security;
do $$ begin
  create policy "flowra_company_members_isolation" on company_members
    for all using (
      company_id in (select flowra_user_companies())
      or user_id = auth.uid()   -- always see own memberships (even pending)
    );
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHILD TABLES — isolated via parent company membership
-- These tables have no direct company_id; isolation is enforced by their parent.
-- ─────────────────────────────────────────────────────────────────────────────

-- sale_items → sales
alter table sale_items enable row level security;
do $$ begin
  create policy "flowra_sale_items_company_isolation" on sale_items
    for all using (
      exists (
        select 1 from sales s
        where  s.id = sale_items.sale_id
          and  s.company_id in (select flowra_user_companies())
      )
    );
exception when duplicate_object then null; end $$;

-- sale_item_allocations → sales
alter table sale_item_allocations enable row level security;
do $$ begin
  create policy "flowra_sale_item_allocations_company_isolation" on sale_item_allocations
    for all using (
      exists (
        select 1 from sales s
        where  s.id = sale_item_allocations.sale_id
          and  s.company_id in (select flowra_user_companies())
      )
    );
exception when duplicate_object then null; end $$;

-- proforma_items → proformas
alter table proforma_items enable row level security;
do $$ begin
  create policy "flowra_proforma_items_company_isolation" on proforma_items
    for all using (
      exists (
        select 1 from proformas p
        where  p.id = proforma_items.proforma_id
          and  p.company_id in (select flowra_user_companies())
      )
    );
exception when duplicate_object then null; end $$;

-- purchase_items → purchases
alter table purchase_items enable row level security;
do $$ begin
  create policy "flowra_purchase_items_company_isolation" on purchase_items
    for all using (
      exists (
        select 1 from purchases p
        where  p.id = purchase_items.purchase_id
          and  p.company_id in (select flowra_user_companies())
      )
    );
exception when duplicate_object then null; end $$;

-- purchase_costs → purchases
alter table purchase_costs enable row level security;
do $$ begin
  create policy "flowra_purchase_costs_company_isolation" on purchase_costs
    for all using (
      exists (
        select 1 from purchases p
        where  p.id = purchase_costs.purchase_id
          and  p.company_id in (select flowra_user_companies())
      )
    );
exception when duplicate_object then null; end $$;
