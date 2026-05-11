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

-- ── 11. RLS grants ────────────────────────────────────────────────────────────

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ── 12. Sales rep support on proformas ───────────────────────────────────────

alter table proformas add column if not exists sales_rep_name  text;
alter table proformas add column if not exists sales_rep_title text;
alter table proformas add column if not exists sales_rep_phone text;
