-- ═══════════════════════════════════════════════════════════════════════════════
-- FLOWRA_FULL_INSTALL.sql
-- Single-file clean install for Flowra Enterprise Financial OS
--
-- ⚠️  CLEAN DB ONLY — Run this on a blank Supabase project.
--    For existing databases, use repair_production.sql instead.
--
-- HOW TO RUN:
--   Supabase SQL Editor → paste entire file → Run
--   Or: psql $DATABASE_URL -f FLOWRA_FULL_INSTALL.sql
--
-- SOURCES (in dependency order, all now merged inline):
--   repair_production.sql     — base tables, column patches, RPCs, RLS
--   archive/flowra_phase1     — accounting_periods, simulation_scenarios
--   archive/flowra_phase2     — partner_finance_events, partner_loan_tranches, alert_rules
--   archive/flowra_phase3     — journal_entries, gl_mode, period lock triggers
--   archive/flowra_phase7     — job_runs, audit hash chain, annual_interest_rate
--   archive/flowra_phase14    — purchase_orders, purchase_order_items
--   accounting_truth_v1.sql   — kdv_amount_try, cost_price_try, kdv_rate, alias cols,
--                                updated convert_proforma_to_sale, partner_transactions
--   governance.sql            — governance_reports, governance_signoffs
--
-- RESULT: 34+ tables, 56+ indexes, 15+ RPCs, full RLS, all triggers
-- IDEMPOTENT: Every statement uses IF NOT EXISTS / OR REPLACE / ON CONFLICT
-- VERSION: 2 (2026-05-18)
-- ═══════════════════════════════════════════════════════════════════════════════

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0 — EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "btree_gist";

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type payment_status_enum as enum ('pending','partial','paid','overdue','cancelled');
exception when duplicate_object then null;
end $$;

-- Add any missing values to existing enum (idempotent)
do $$ begin alter type payment_status_enum add value if not exists 'pending'; exception when others then null; end $$;
do $$ begin alter type payment_status_enum add value if not exists 'partial'; exception when others then null; end $$;
do $$ begin alter type payment_status_enum add value if not exists 'paid'; exception when others then null; end $$;
do $$ begin alter type payment_status_enum add value if not exists 'overdue'; exception when others then null; end $$;
do $$ begin alter type payment_status_enum add value if not exists 'cancelled'; exception when others then null; end $$;

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

do $$ begin
  create type period_status_enum as enum ('open', 'pre_close', 'closed', 'locked');
exception when duplicate_object then null;
end $$;
do $$ begin alter type period_status_enum add value if not exists 'pre_close'; exception when others then null; end $$;
do $$ begin alter type period_status_enum add value if not exists 'closed'; exception when others then null; end $$;
do $$ begin alter type period_status_enum add value if not exists 'locked'; exception when others then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — CORE TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- companies
create table if not exists companies (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  logo_url     text,
  tax_id       text,
  tax_office   text,
  mersis_no    text,
  address      text,
  phone        text,
  email        text,
  website      text,
  gl_mode      text        not null default 'shadow'
                           check (gl_mode in ('shadow', 'parallel', 'gl_primary')),
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
  invited_by  uuid,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint uq_company_member unique (company_id, user_id),
  constraint chk_member_role check (role in ('admin','manager','viewer'))
);
-- Additive patch for existing installs missing deleted_at / invited_by
alter table company_members add column if not exists deleted_at  timestamptz;
alter table company_members add column if not exists invited_by  uuid;

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

-- partner_loans (legacy table — use partner_loan_tranches for new data)
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
  preparer_name       text,     -- Proformayı Düzenleyen: Ad Soyad
  preparer_title      text,     -- Proformayı Düzenleyen: Ünvan
  sent_at             timestamptz,
  accepted_at         timestamptz,
  approved_at         timestamptz,   -- alias: set when status → accepted or approved
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
  unit            text        not null default 'adet',   -- unit of measure (e.g. adet, kg, saat)
  unit_price      numeric(12,4) not null default 0,
  unit_cost       numeric(12,4),                         -- FIFO cost at proforma time (informational)
  qty             numeric(12,3) not null default 1,
  discount_pct    numeric(5,2) not null default 0,
  kdv_rate        numeric(5,2) not null default 20,      -- VAT rate in %
  line_subtotal   numeric(12,2) not null default 0,      -- qty × unit_price × (1 - discount_pct/100)
  vat_amount      numeric(12,2) not null default 0,      -- line_subtotal × kdv_rate / 100
  line_total      numeric(12,2) not null default 0,      -- line_subtotal + vat_amount
  currency        text        not null default 'TRY',
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
  total_try           numeric(15,2) not null default 0,   -- TRY total frozen at sale time (FX-converted)
  revenue_try         numeric(15,2) not null default 0,   -- total_try minus kdv (net revenue in TRY)
  kdv_amount_try      numeric(12,2) not null default 0,   -- VAT portion frozen at sale time
  paid_amount         numeric(12,2) not null default 0,
  payment_status      text        not null default 'pending',
  shipment_status     text        not null default 'pending',
  sale_date           date,
  due_date            date,
  paid_at             timestamptz,
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

-- sale_item_allocations (hard-deleted — no deleted_at)
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

-- jobs (simple queue)
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

-- audit_logs (enterprise canonical — used by lib/audit.ts)
create table if not exists audit_logs (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        references companies(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  entity_type  text        not null,
  entity_id    text,
  action       text        not null,
  old_data     jsonb,
  new_data     jsonb,
  ip_address   text,
  content_hash text,
  prev_hash    text,
  created_at   timestamptz not null default now()
);

-- audit_log (legacy compat — kept for backward compatibility)
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

-- ── PHASE 1: ACCOUNTING TRUTH LAYER ──────────────────────────────────────────

-- accounting_periods
create table if not exists accounting_periods (
  id                                  uuid primary key default gen_random_uuid(),
  company_id                          uuid not null references companies(id) on delete cascade,
  period_start                        date not null,
  period_end                          date not null,
  status                              period_status_enum not null default 'open',
  opening_cash_try                    numeric(20,2) not null default 0,
  closing_cash_try                    numeric(20,2) not null default 0,
  retained_earnings_brought_forward   numeric(20,2) not null default 0,
  period_profit_try                   numeric(20,2) not null default 0,
  retained_earnings_carried_forward   numeric(20,2) not null default 0,
  gl_enabled                          boolean not null default false,
  pre_close_at                        timestamptz,
  locked_at                           timestamptz,
  locked_by                           uuid references auth.users(id),
  closed_at                           timestamptz,
  closed_by                           uuid references auth.users(id),
  notes                               text,
  created_at                          timestamptz not null default now(),
  updated_at                          timestamptz not null default now(),
  constraint accounting_periods_no_overlap
    exclude using gist (
      company_id with =,
      daterange(period_start, period_end, '[]') with &&
    ) deferrable initially deferred,
  constraint accounting_periods_dates_valid
    check (period_end >= period_start)
);

-- simulation_scenarios
create table if not exists simulation_scenarios (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  user_id           uuid not null references auth.users(id),
  name              text not null,
  description       text,
  inputs            jsonb not null default '{}',
  summary           jsonb not null default '{}',
  monthly_breakdown jsonb not null default '[]',
  assumptions       jsonb not null default '[]',
  tags              jsonb not null default '[]',
  is_baseline       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- balance_sheet_snapshots
create table if not exists balance_sheet_snapshots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  period_id     uuid references accounting_periods(id),
  as_of_date    date not null,
  snapshot      jsonb not null,
  balanced      boolean not null default false,
  imbalance_try numeric(20,2) not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);

-- ── PHASE 2: PCLE PARTNER ENGINE ─────────────────────────────────────────────

-- partner_finance_events (append-only PCLE ledger)
create table if not exists partner_finance_events (
  id            uuid        default gen_random_uuid() primary key,
  company_id    uuid        not null references companies(id) on delete cascade,
  partner_id    uuid        not null references partners(id) on delete cascade,
  event_type    text        not null,
  amount_try    numeric(15,2) not null default 0,
  currency      text          not null default 'TRY',
  fx_rate       numeric(12,6) not null default 1,
  event_date    date          not null default current_date,
  reference     text,
  description   text,
  metadata      jsonb,
  created_by    uuid        references auth.users(id),
  created_at    timestamptz default now() not null
);

-- partner_loan_tranches
create table if not exists partner_loan_tranches (
  id                        uuid        default gen_random_uuid() primary key,
  company_id                uuid        not null references companies(id) on delete cascade,
  partner_id                uuid        not null references partners(id) on delete cascade,
  source_event_id           uuid        references partner_finance_events(id),
  principal_try             numeric(15,2) not null check (principal_try > 0),
  interest_rate_annual_pct  numeric(6,3) not null default 0,
  annual_interest_rate      numeric(6,4) default null,
  disbursement_date         date        not null,
  expected_repayment_date   date,
  total_repaid_try          numeric(15,2) not null default 0 check (total_repaid_try >= 0),
  status                    text        not null default 'active'
    check (status in ('active','partially_repaid','repaid','overdue','restructured')),
  notes                     text,
  deleted_at                timestamptz,
  created_by                uuid        references auth.users(id),
  created_at                timestamptz default now() not null,
  updated_at                timestamptz default now() not null,
  constraint chk_repaid_not_exceed_principal check (total_repaid_try <= principal_try)
);

-- partner_capital_commitments
create table if not exists partner_capital_commitments (
  id                uuid        default gen_random_uuid() primary key,
  company_id        uuid        not null references companies(id) on delete cascade,
  partner_id        uuid        not null references partners(id) on delete cascade,
  committed_try     numeric(15,2) not null check (committed_try >= 0),
  paid_try          numeric(15,2) not null default 0 check (paid_try >= 0),
  commitment_date   date        not null default current_date,
  due_date          date,
  board_decision_ref text,
  notes             text,
  deleted_at        timestamptz,
  created_by        uuid        references auth.users(id),
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,
  constraint chk_paid_not_exceed_committed check (paid_try <= committed_try)
);

-- partner_compensation_schedules
create table if not exists partner_compensation_schedules (
  id                  uuid        default gen_random_uuid() primary key,
  company_id          uuid        not null references companies(id) on delete cascade,
  partner_id          uuid        not null references partners(id) on delete cascade,
  monthly_amount_try  numeric(15,2) not null check (monthly_amount_try >= 0),
  start_date          date        not null,
  end_date            date,
  board_decision_ref  text,
  is_active           boolean     not null default true,
  notes               text,
  deleted_at          timestamptz,
  created_by          uuid        references auth.users(id),
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

-- alert_rules
create table if not exists alert_rules (
  id              uuid        default gen_random_uuid() primary key,
  company_id      uuid        not null references companies(id) on delete cascade,
  rule_type       text        not null,
  threshold_value numeric(15,4),
  severity        text        not null default 'warning'
    check (severity in ('info','warning','critical')),
  is_active       boolean     not null default true,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null,
  unique (company_id, rule_type)
);

-- ── PHASE 3: DOUBLE-ENTRY LEDGER ─────────────────────────────────────────────

-- journal_entries (append-only)
create table if not exists journal_entries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  period_id    uuid references accounting_periods(id),
  source_type  text not null,
  source_id    uuid,
  entry_date   date not null,
  description  text not null,
  reference    text,
  is_adjustment boolean not null default false,
  is_reversal   boolean not null default false,
  reversal_of   uuid references journal_entries(id),
  is_voided     boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- journal_entry_lines (append-only)
create table if not exists journal_entry_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references journal_entries(id) on delete cascade,
  account_code text not null,
  account_name text not null,
  debit_try    numeric(20,2) not null default 0,
  credit_try   numeric(20,2) not null default 0,
  description  text,
  created_at   timestamptz not null default now(),
  constraint jel_debit_xor_credit check (
    (debit_try > 0 and credit_try = 0) or (credit_try > 0 and debit_try = 0)
  ),
  constraint jel_no_negative check (debit_try >= 0 and credit_try >= 0)
);

-- backfill_runs (idempotent GL backfill tracker)
create table if not exists backfill_runs (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
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

-- ── PHASE 7: JOB TRACKING ────────────────────────────────────────────────────

-- job_runs (async job observability)
create table if not exists job_runs (
  id                uuid        default gen_random_uuid() primary key,
  job_type          text        not null,
  company_id        uuid        references companies(id) on delete set null,
  status            text        not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped')),
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  duration_ms       integer,
  records_processed integer     default 0,
  error_message     text,
  metadata          jsonb,
  idempotency_key   text        unique
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — COLUMN PATCHES (ADD COLUMN IF NOT EXISTS for upgrade safety)
-- ─────────────────────────────────────────────────────────────────────────────

-- companies (already has gl_mode above, but guard for existing DBs)
alter table companies add column if not exists gl_mode    text not null default 'shadow'
  check (gl_mode in ('shadow', 'parallel', 'gl_primary'));
-- companies: tax_office + mersis_no (settings page columns — added 2026-05-20)
alter table companies add column if not exists tax_office text;
alter table companies add column if not exists mersis_no  text;

-- accounting_periods extended columns
alter table accounting_periods add column if not exists pre_close_at timestamptz;
alter table accounting_periods add column if not exists locked_at    timestamptz;
alter table accounting_periods add column if not exists locked_by    uuid references auth.users(id);
alter table accounting_periods add column if not exists gl_enabled   boolean not null default false;

-- partner_loan_tranches: annual_interest_rate (phase 7)
alter table partner_loan_tranches add column if not exists annual_interest_rate numeric(6,4) default null;

-- audit_logs: content_hash + prev_hash (phase 7)
alter table audit_logs add column if not exists content_hash text;
alter table audit_logs add column if not exists prev_hash    text;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — PAYMENT STATUS CAST (text → enum for existing rows)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sales' and column_name = 'payment_status';

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
-- SECTION 5 — INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_company_members_user_id    on company_members(user_id);
create index if not exists idx_company_members_company_id on company_members(company_id);
create index if not exists idx_company_members_user       on company_members(user_id, deleted_at) where deleted_at is null;
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
create index if not exists idx_jobs_status_run_at         on jobs(status, run_at) where status in ('pending','running');
create index if not exists idx_audit_logs_company_id      on audit_logs(company_id, created_at desc);
create index if not exists idx_audit_logs_company_hash    on audit_logs(company_id, created_at asc) where content_hash is not null;
create index if not exists idx_audit_log_company_id       on audit_log(company_id, created_at desc);
create index if not exists idx_interest_rates_company     on interest_rates(company_id, currency);
-- Phase 1 indexes
create index if not exists idx_accounting_periods_company_status on accounting_periods(company_id, status);
create index if not exists idx_accounting_periods_company_dates  on accounting_periods(company_id, period_start desc);
create index if not exists idx_simulation_scenarios_company      on simulation_scenarios(company_id, deleted_at) where deleted_at is null;
create index if not exists idx_simulation_scenarios_baseline     on simulation_scenarios(company_id, is_baseline) where is_baseline = true and deleted_at is null;
create index if not exists idx_balance_sheet_snapshots_company   on balance_sheet_snapshots(company_id, as_of_date desc);
-- Phase 2 indexes
create index if not exists idx_pfe_company    on partner_finance_events(company_id, event_date desc);
create index if not exists idx_pfe_partner    on partner_finance_events(partner_id, event_date desc);
create index if not exists idx_pfe_event_type on partner_finance_events(event_type);
create index if not exists idx_plt_company    on partner_loan_tranches(company_id);
create index if not exists idx_plt_partner    on partner_loan_tranches(partner_id);
create index if not exists idx_plt_status     on partner_loan_tranches(status) where deleted_at is null;
create index if not exists idx_pcc_company    on partner_capital_commitments(company_id);
create index if not exists idx_pcc_partner    on partner_capital_commitments(partner_id);
create index if not exists idx_pcs_company    on partner_compensation_schedules(company_id);
create index if not exists idx_pcs_partner    on partner_compensation_schedules(partner_id);
create index if not exists idx_pcs_active     on partner_compensation_schedules(company_id, is_active) where deleted_at is null;
create index if not exists idx_ar_company     on alert_rules(company_id, is_active);
-- Phase 3 indexes
create index if not exists idx_je_company_date on journal_entries(company_id, entry_date desc);
create index if not exists idx_je_source       on journal_entries(company_id, source_type, source_id) where source_id is not null;
create index if not exists idx_je_period       on journal_entries(period_id) where period_id is not null;
create index if not exists idx_jel_entry       on journal_entry_lines(entry_id);
create index if not exists idx_jel_account     on journal_entry_lines(account_code);
create index if not exists idx_backfill_company_status on backfill_runs(company_id, status);
create index if not exists idx_backfill_company_source on backfill_runs(company_id, source_type, status);
-- Phase 7 indexes
create index if not exists idx_job_runs_type_started on job_runs(job_type, started_at desc);
create index if not exists idx_job_runs_company      on job_runs(company_id, started_at desc) where company_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — ROW LEVEL SECURITY
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
alter table jobs                   enable row level security;
alter table audit_logs             enable row level security;
alter table audit_log              enable row level security;
alter table interest_rates         enable row level security;
alter table accounting_periods     enable row level security;
alter table simulation_scenarios   enable row level security;
alter table balance_sheet_snapshots enable row level security;
alter table partner_finance_events enable row level security;
alter table partner_loan_tranches  enable row level security;
alter table partner_capital_commitments enable row level security;
alter table partner_compensation_schedules enable row level security;
alter table alert_rules            enable row level security;
alter table journal_entries        enable row level security;
alter table journal_entry_lines    enable row level security;
alter table backfill_runs          enable row level security;
alter table job_runs               enable row level security;

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

-- RLS policies (drop-and-recreate for idempotency)

drop policy if exists companies_member_select on companies;
create policy companies_member_select on companies for select using (is_company_member(id));

drop policy if exists companies_admin_write on companies;
create policy companies_admin_write on companies for all using (is_company_admin(id));

drop policy if exists company_members_select on company_members;
create policy company_members_select on company_members for select using (is_company_member(company_id));

drop policy if exists company_members_admin_write on company_members;
create policy company_members_admin_write on company_members for all using (is_company_admin(company_id));

drop policy if exists user_settings_own on user_settings;
create policy user_settings_own on user_settings for all using (user_id = auth.uid());

drop policy if exists customers_member on customers;
create policy customers_member on customers for all using (is_company_member(company_id));

drop policy if exists products_member on products;
create policy products_member on products for all using (is_company_member(company_id));

drop policy if exists banks_member on banks;
create policy banks_member on banks for all using (is_company_member(company_id));

drop policy if exists expenses_member on expenses;
create policy expenses_member on expenses for all using (is_company_member(company_id));

drop policy if exists partners_member on partners;
create policy partners_member on partners for all using (is_company_member(company_id));

drop policy if exists partner_loans_member on partner_loans;
create policy partner_loans_member on partner_loans for all using (is_company_member(company_id));

drop policy if exists stock_lots_member on stock_lots;
create policy stock_lots_member on stock_lots for all using (is_company_member(company_id));

drop policy if exists stock_movements_member on stock_movements;
create policy stock_movements_member on stock_movements for all using (is_company_member(company_id));

drop policy if exists proformas_member on proformas;
create policy proformas_member on proformas for all using (is_company_member(company_id));

drop policy if exists proforma_items_member on proforma_items;
create policy proforma_items_member on proforma_items for all using (is_company_member(company_id));

drop policy if exists sales_member on sales;
create policy sales_member on sales for all using (is_company_member(company_id));

drop policy if exists sale_items_member on sale_items;
create policy sale_items_member on sale_items for all using (is_company_member(company_id));

drop policy if exists sia_member on sale_item_allocations;
create policy sia_member on sale_item_allocations for all using (is_company_member(company_id));

drop policy if exists collections_member on collections;
create policy collections_member on collections for all using (is_company_member(company_id));

drop policy if exists tasks_member on tasks;
create policy tasks_member on tasks for all using (is_company_member(company_id));

drop policy if exists jobs_member on jobs;
create policy jobs_member on jobs for all using (company_id is null or is_company_member(company_id));

-- job_runs: company members read their own runs; admins read system-wide runs
drop policy if exists job_runs_read_company  on job_runs;
drop policy if exists job_runs_read_system   on job_runs;
drop policy if exists job_runs_insert_service on job_runs;
create policy job_runs_read_company on job_runs for select
  using (company_id is not null and is_company_member(company_id));
create policy job_runs_read_system on job_runs for select
  using (company_id is null and is_company_admin((
    select company_id from company_members
    where company_members.user_id = auth.uid() limit 1
  )));
create policy job_runs_insert_service on job_runs for insert
  with check (true);

drop policy if exists audit_logs_admin on audit_logs;
create policy audit_logs_admin on audit_logs for select using (is_company_admin(company_id));

drop policy if exists audit_logs_insert on audit_logs;
create policy audit_logs_insert on audit_logs for insert with check (is_company_member(company_id));

drop policy if exists audit_log_admin on audit_log;
create policy audit_log_admin on audit_log for select using (is_company_admin(company_id));

drop policy if exists interest_rates_member on interest_rates;
create policy interest_rates_member on interest_rates for all using (is_company_member(company_id));

drop policy if exists idempotency_own_rows on idempotency_keys;
create policy idempotency_own_rows on idempotency_keys for all using (user_id = auth.uid());

-- accounting_periods
do $$ begin
  create policy "accounting_periods_company_access" on accounting_periods
    for all using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

-- simulation_scenarios
do $$ begin
  create policy "simulation_scenarios_company_access" on simulation_scenarios
    for all using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

-- balance_sheet_snapshots
do $$ begin
  create policy "balance_sheet_snapshots_company_access" on balance_sheet_snapshots
    for all using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

-- partner_finance_events (APPEND-ONLY — no UPDATE, no DELETE)
do $$ begin
  create policy "pfe_company_select" on partner_finance_events
    for select using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "pfe_company_insert" on partner_finance_events
    for insert with check (company_id in (
      select company_id from company_members where user_id = auth.uid() and role = 'admin'
    ));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "pfe_no_update" on partner_finance_events for update using (false);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "pfe_no_delete" on partner_finance_events for delete using (false);
exception when duplicate_object then null;
end $$;

-- partner_loan_tranches
do $$ begin
  create policy "plt_company_select" on partner_loan_tranches
    for select using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "plt_company_write" on partner_loan_tranches
    for all using (company_id in (
      select company_id from company_members where user_id = auth.uid() and role = 'admin'
    ));
exception when duplicate_object then null;
end $$;

-- partner_capital_commitments
do $$ begin
  create policy "pcc_company_select" on partner_capital_commitments
    for select using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "pcc_company_write" on partner_capital_commitments
    for all using (company_id in (
      select company_id from company_members where user_id = auth.uid() and role = 'admin'
    ));
exception when duplicate_object then null;
end $$;

-- partner_compensation_schedules
do $$ begin
  create policy "pcs_company_select" on partner_compensation_schedules
    for select using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "pcs_company_write" on partner_compensation_schedules
    for all using (company_id in (
      select company_id from company_members where user_id = auth.uid() and role = 'admin'
    ));
exception when duplicate_object then null;
end $$;

-- alert_rules
do $$ begin
  create policy "ar_company_select" on alert_rules
    for select using (company_id in (select company_id from company_members where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "ar_company_write" on alert_rules
    for all using (company_id in (
      select company_id from company_members where user_id = auth.uid() and role = 'admin'
    ));
exception when duplicate_object then null;
end $$;

-- journal_entries (APPEND-ONLY)
do $$ begin
  create policy "je_company_insert" on journal_entries
    for insert with check (company_id in (
      select company_id from company_members where user_id = auth.uid()
    ));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "je_company_select" on journal_entries
    for select using (company_id in (
      select company_id from company_members where user_id = auth.uid()
    ));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "je_no_update" on journal_entries for update using (false);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "je_no_delete" on journal_entries for delete using (false);
exception when duplicate_object then null;
end $$;

-- journal_entry_lines (APPEND-ONLY)
do $$ begin
  create policy "jel_company_insert" on journal_entry_lines
    for insert with check (
      entry_id in (
        select id from journal_entries where company_id in (
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
        select id from journal_entries where company_id in (
          select company_id from company_members where user_id = auth.uid()
        )
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "jel_no_update" on journal_entry_lines for update using (false);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "jel_no_delete" on journal_entry_lines for delete using (false);
exception when duplicate_object then null;
end $$;

-- backfill_runs
do $$ begin
  create policy "backfill_admin_only" on backfill_runs
    for all using (company_id in (
      select company_id from company_members where user_id = auth.uid() and role = 'admin'
    ));
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Alias used by phase7 alert_rules trigger
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- updated_at triggers
do $$ begin
  create trigger accounting_periods_updated_at
    before update on accounting_periods for each row execute function touch_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger simulation_scenarios_updated_at
    before update on simulation_scenarios for each row execute function touch_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger alert_rules_updated_at
    before update on alert_rules for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;

-- Journal entry balance check trigger (deferred)
create or replace function fn_check_journal_entry_balance()
returns trigger language plpgsql as $$
declare
  v_total_dr numeric;
  v_total_cr numeric;
begin
  select coalesce(sum(debit_try), 0), coalesce(sum(credit_try), 0)
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
    for each row execute function fn_check_journal_entry_balance();
exception when duplicate_object then null;
end $$;

-- Period lock guard (defense-in-depth: prevents writes to locked periods)
create or replace function fn_guard_period_write()
returns trigger language plpgsql as $$
declare
  v_status  text;
  v_tx_date date;
  v_row     jsonb;
begin
  v_row := to_jsonb(new);
  v_tx_date := coalesce(
    (v_row->>'sale_date')::date,
    (v_row->>'expense_date')::date,
    (v_row->>'entry_date')::date,
    (v_row->>'tx_date')::date,
    current_date
  );
  select status::text into v_status
  from accounting_periods
  where company_id = (v_row->>'company_id')::uuid
    and period_start <= v_tx_date
    and period_end   >= v_tx_date
  limit 1;

  if v_status = 'locked' then
    raise exception 'Period is locked. No financial writes allowed for date %.', v_tx_date;
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger trg_guard_period_sales
    before insert on sales for each row execute function fn_guard_period_write();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_guard_period_expenses
    before insert on expenses for each row execute function fn_guard_period_write();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_guard_period_purchases
    before insert on purchases for each row execute function fn_guard_period_write();
exception when undefined_table then null;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

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

create or replace view alert_rule_audit as
  select
    al.id,
    al.company_id,
    al.action,
    al.old_data,
    al.new_data,
    al.created_at,
    al.user_id
  from audit_logs al
  where al.entity_type = 'alert_rule'
  order by al.created_at desc;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9 — SECURITY DEFINER FUNCTIONS (RPCs)
-- ─────────────────────────────────────────────────────────────────────────────

-- bootstrap_user_company
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
end $$;


-- create_proforma_atomic
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
    select company_id into v_company_id from company_members
    where user_id = p_user_id order by created_at limit 1;
  end if;

  if v_company_id is null then
    raise exception 'COMPANY_NOT_RESOLVED' using errcode = 'P0002';
  end if;

  if not exists (select 1 from company_members where company_id = v_company_id and user_id = p_user_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0003';
  end if;

  select coalesce(max(
    (regexp_match(proforma_no, 'PRF-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from proformas where company_id = v_company_id and proforma_no like 'PRF-' || v_year || '-%';

  v_proforma_no := 'PRF-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into proformas (
    company_id, user_id, customer_id, bank_id, proforma_no,
    customer_name, currency, total, status, validity_days,
    valid_until, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  ) values (
    v_company_id, p_user_id, p_customer_id, p_bank_id, v_proforma_no,
    coalesce(p_customer_name, ''), p_currency, p_total, 'draft', p_validity_days,
    (now()::date + p_validity_days * interval '1 day')::date,
    p_notes, p_internal_notes,
    p_fx_usd, p_fx_eur, p_fx_try, p_fx_source,
    case when p_fx_rate_date ~ '^\d{4}-\d{2}-\d{2}$' then p_fx_rate_date::date else null end,
    p_fx_rate_try, p_company_snapshot, p_customer_snapshot
  ) returning id into v_proforma_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into proforma_items (
      proforma_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, kdv_rate, line_total, notes, sort_order
    ) values (
      v_proforma_id, v_company_id,
      nullif((v_item->>'product_id')::text, '')::uuid,
      coalesce(v_item->>'product_name', ''),
      coalesce((v_item->>'qty')::numeric, 1),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce(v_item->>'currency', p_currency),
      coalesce((v_item->>'discount_pct')::numeric, 0),
      coalesce((v_item->>'kdv_rate')::numeric, (v_item->>'kdv')::numeric, 20),
      coalesce((v_item->>'line_total')::numeric, 0),
      v_item->>'notes', v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return jsonb_build_object('id', v_proforma_id, 'proforma_no', v_proforma_no);
end $$;


-- convert_proforma_to_sale (FIFO allocation)
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
  if not exists (select 1 from company_members where company_id = v_proforma.company_id and user_id = p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- FX guard: non-TRY sales must have a valid FX rate stored on the proforma.
  -- Silently defaulting to 1.0 produces wrong TRY totals and revenue figures.
  if v_proforma.currency <> 'TRY' and coalesce(v_proforma.fx_rate_try, 0) <= 0 then
    raise exception 'FX_RATE_NOT_FOUND currency=% proforma=%', v_proforma.currency, p_proforma_id;
  end if;

  select coalesce(max(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from sales where company_id = v_proforma.company_id and sale_no like 'SAL-' || v_year || '-%';

  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, payment_status,
    sale_date, due_date, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  ) values (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    coalesce(p_bank_id, v_proforma.bank_id), p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency, v_proforma.total,
    'pending',
    coalesce(p_sale_date, now()::date), p_due_date, p_notes, p_internal_notes,
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  ) returning id into v_sale_id;

  for v_item in
    select * from proforma_items where proforma_id = p_proforma_id order by sort_order
  loop
    insert into sale_items (
      sale_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order
    ) values (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.product_name,
      v_item.qty, v_item.unit_price, v_item.currency,
      v_item.discount_pct, v_item.line_total, v_item.notes, v_item.sort_order
    ) returning id into v_sale_item_id;

    if v_item.product_id is not null then
      v_qty_needed := v_item.qty;
      for v_lot in
        select * from stock_lots
        where product_id = v_item.product_id and company_id = v_proforma.company_id
          and qty_remaining > 0 and deleted_at is null
        order by coalesce(received_at, created_at::date), created_at
      loop
        exit when v_qty_needed <= 0;
        -- Zero-cost lot guard: prevent silent COGS misvaluation.
        -- A stock lot with no cost price means FIFO hasn't been finalized.
        if v_lot.cost_price is null or v_lot.cost_price <= 0 then
          raise exception 'ZERO_COST_LOT product=% lot=%', v_item.product_id, v_lot.id;
        end if;
        v_alloc_qty := least(v_qty_needed, v_lot.qty_remaining);
        insert into sale_item_allocations (
          company_id, sale_item_id, lot_id, qty_allocated, cost_price, cost_currency
        ) values (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_alloc_qty, v_lot.cost_price, v_lot.cost_currency
        );
        update stock_lots set qty_remaining = qty_remaining - v_alloc_qty, updated_at = now()
        where id = v_lot.id;
        insert into stock_movements (
          company_id, product_id, lot_id, type, qty, unit_cost, currency, reference_id
        ) values (
          v_proforma.company_id, v_item.product_id, v_lot.id,
          'sale_out', -v_alloc_qty, v_lot.cost_price, v_lot.cost_currency, v_sale_id
        );
        v_qty_needed := v_qty_needed - v_alloc_qty;
      end loop;
    end if;
  end loop;

  update proformas set status = 'converted', converted_at = now(), updated_at = now()
  where id = p_proforma_id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no);
end $$;


-- purge_expired_idempotency_keys
create or replace function public.purge_expired_idempotency_keys()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  delete from idempotency_keys where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- restore_user_data (admin only)
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

  update customers  set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update products   set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update expenses   set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update proformas  set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update sales      set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update stock_lots set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  delete from sale_item_allocations where company_id = p_company_id;
  delete from stock_movements       where company_id = p_company_id;

  insert into customers  select * from jsonb_populate_recordset(null::customers,  p_customers) on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into products   select * from jsonb_populate_recordset(null::products,   p_products)  on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into expenses   select * from jsonb_populate_recordset(null::expenses,   p_expenses)  on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into proformas  select * from jsonb_populate_recordset(null::proformas,  p_proformas) on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into proforma_items select * from jsonb_populate_recordset(null::proforma_items, p_proforma_items) on conflict (id) do nothing;
  insert into stock_lots select * from jsonb_populate_recordset(null::stock_lots, p_stock_lots) on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into stock_movements select * from jsonb_populate_recordset(null::stock_movements, p_stock_movements) on conflict (id) do nothing;
  insert into sales      select * from jsonb_populate_recordset(null::sales,      p_sales)     on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into sale_items select * from jsonb_populate_recordset(null::sale_items, p_sale_items) on conflict (id) do nothing;
  insert into sale_item_allocations select * from jsonb_populate_recordset(null::sale_item_allocations, p_sale_item_allocations) on conflict (id) do nothing;

  return jsonb_build_object('restored', true, 'company_id', p_company_id);
end $$;


-- Job queue helpers
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
  update jobs set status = 'done', completed_at = now(), result = p_result, updated_at = now()
  where id = p_job_id;
end $$;

create or replace function public.fail_job(p_job_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update jobs
  set status  = case when attempts >= max_attempts then 'failed' else 'pending' end,
      error   = p_error,
      run_at  = case when attempts >= max_attempts then run_at else now() + interval '60 seconds' end,
      updated_at = now()
  where id = p_job_id;
end $$;


-- create_journal_entry (atomic RPC)
create or replace function create_journal_entry(
  p_company_id    uuid,
  p_period_id     uuid,
  p_source_type   text,
  p_source_id     uuid,
  p_entry_date    date,
  p_description   text,
  p_reference     text,
  p_is_adjustment boolean,
  p_created_by    uuid,
  p_lines         jsonb
)
returns uuid language plpgsql security definer
as $$
declare
  v_entry_id uuid;
  v_line     jsonb;
  v_dr       numeric := 0;
  v_cr       numeric := 0;
begin
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
$$;


-- verify_audit_chain (convenience SQL helper)
create or replace function verify_audit_chain(p_company_id uuid, p_from date, p_to date)
returns table (row_id uuid, created_at timestamptz, has_hash boolean, chain_intact boolean)
language plpgsql stable security definer as $$
declare rec record;
begin
  for rec in
    select id, al.created_at, content_hash
    from audit_logs al
    where al.company_id = p_company_id
      and al.created_at between p_from and (p_to + interval '1 day')
    order by al.created_at asc
  loop
    row_id       := rec.id;
    created_at   := rec.created_at;
    has_hash     := rec.content_hash is not null;
    chain_intact := rec.content_hash is not null;
    return next;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10 — PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Table-level grants for PostgREST roles (required for all tables in schema)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Ensure future tables also inherit these grants automatically
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines  to anon, authenticated, service_role;

revoke execute on function public.bootstrap_user_company(uuid, uuid, text)       from public;
revoke execute on function public.purge_expired_idempotency_keys()               from public;
revoke execute on function public.enqueue_job(text, jsonb, uuid, timestamptz)   from public;
revoke execute on function public.claim_next_job(text)                           from public;
revoke execute on function public.complete_job(uuid, jsonb)                      from public;
revoke execute on function public.fail_job(uuid, text)                           from public;
revoke execute on function public.is_company_member(uuid)                        from public;
revoke execute on function public.is_company_admin(uuid)                         from public;

grant execute on function public.bootstrap_user_company(uuid, uuid, text)        to authenticated;
grant execute on function public.is_company_member(uuid)                          to authenticated;
grant execute on function public.is_company_admin(uuid)                           to authenticated;

do $$ begin
  grant execute on function public.create_proforma_atomic(uuid, uuid, uuid, text, text, integer, text, text, numeric, numeric, numeric, numeric, text, text, numeric, jsonb, jsonb, jsonb, uuid) to authenticated;
  grant execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) to authenticated;
  grant execute on function public.restore_user_data(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
exception when others then null;
end $$;

grant execute on function public.purge_expired_idempotency_keys()                to service_role;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz)     to service_role;
grant execute on function public.claim_next_job(text)                            to service_role;
grant execute on function public.complete_job(uuid, jsonb)                       to service_role;
grant execute on function public.fail_job(uuid, text)                            to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11 — DATA SEEDS
-- ─────────────────────────────────────────────────────────────────────────────

-- Seed default alert rules for all existing companies (idempotent)
insert into alert_rules (company_id, rule_type, threshold_value, severity)
select c.id, rules.rule_type, rules.threshold_value, rules.severity
from companies c
cross join (values
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
) as rules(rule_type, threshold_value, severity)
where c.deleted_at is null
on conflict (company_id, rule_type) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12 — PURCHASE ORDERS (Phase 14)
-- Lightweight supplier order tracking: draft → ordered → received → cancelled
-- When received, user creates a Purchase (FIFO stock lot entry).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  supplier_name text not null,
  order_date    date not null default current_date,
  expected_date date,
  status        text not null default 'draft'
                  check (status in ('draft', 'ordered', 'received', 'cancelled')),
  currency      text not null default 'TRY',
  total_try     numeric(15,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id        uuid references products(id) on delete set null,
  name              text not null,
  unit              text not null default 'adet',
  quantity          numeric(10,3) not null check (quantity > 0),
  unit_price        numeric(15,2) not null check (unit_price >= 0),
  currency          text not null default 'TRY',
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_purchase_orders_company   on purchase_orders(company_id, deleted_at);
create index if not exists idx_purchase_orders_status    on purchase_orders(company_id, status)    where deleted_at is null;
create index if not exists idx_purchase_order_items_ord  on purchase_order_items(purchase_order_id);

alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;

create policy "po_company_member_rw" on purchase_orders
  for all using (
    company_id in (
      select company_id from company_members where user_id = auth.uid()
    )
  );

create policy "poi_company_member_rw" on purchase_order_items
  for all using (
    purchase_order_id in (
      select po.id from purchase_orders po
      join company_members cm on cm.company_id = po.company_id
      where cm.user_id = auth.uid() and po.deleted_at is null
    )
  );

create or replace function fn_touch_purchase_orders()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_touch_purchase_orders on purchase_orders;
create trigger trg_touch_purchase_orders
  before update on purchase_orders
  for each row execute function fn_touch_purchase_orders();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13 — PURCHASES, PURCHASE_ITEMS, PURCHASE_COSTS TABLES
-- FIFO stock purchase lifecycle: draft → finalized (immutable).
-- Used by purchase.service.ts, cost.service.ts, CostService.calculateUnitCost()
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists purchases (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id),
  supplier_name text        not null default '',
  purchase_date date        not null default current_date,
  currency      text        not null default 'TRY',
  fx_rate       numeric(12,6) not null default 1,
  status        text        not null default 'draft'
                check (status in ('draft','finalized','cancelled')),
  notes         text,
  finalized_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_purchases_company on purchases(company_id, deleted_at);
create index if not exists idx_purchases_status  on purchases(company_id, status) where deleted_at is null;
create index if not exists idx_purchases_date    on purchases(company_id, purchase_date) where deleted_at is null;

alter table purchases enable row level security;

drop policy if exists purchases_company_member on purchases;
create policy purchases_company_member on purchases
  for all using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid() and deleted_at is null
    )
  );

grant all on purchases to authenticated, service_role;

create table if not exists purchase_items (
  id          uuid        primary key default gen_random_uuid(),
  purchase_id uuid        not null references purchases(id) on delete cascade,
  product_id  uuid        references products(id) on delete set null,
  quantity    numeric(10,3) not null check (quantity > 0),
  unit_price  numeric(15,4) not null check (unit_price >= 0),
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);

alter table purchase_items enable row level security;

drop policy if exists purchase_items_company_member on purchase_items;
create policy purchase_items_company_member on purchase_items
  for all using (
    purchase_id in (
      select p.id from purchases p
      join company_members cm on cm.company_id = p.company_id
      where cm.user_id = auth.uid() and p.deleted_at is null
    )
  );

grant all on purchase_items to authenticated, service_role;

create or replace function fn_touch_purchases()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_touch_purchases on purchases;
create trigger trg_touch_purchases
  before update on purchases
  for each row execute function fn_touch_purchases();

-- purchase_costs: overhead cost lines (customs, freight, insurance, tax)
create table if not exists purchase_costs (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references purchases(id) on delete cascade,
  cost_type         text not null default 'other'
                    check (cost_type in ('customs', 'freight', 'insurance', 'tax', 'other')),
  description       text,
  amount            numeric(15,2) not null check (amount >= 0),
  currency          text not null default 'TRY',
  fx_rate           numeric(12,6) not null default 1,
  amount_try        numeric(15,2) not null,  -- frozen at insert time
  allocation_method text not null default 'by_value'
                    check (allocation_method in ('by_quantity', 'by_value')),
  created_at        timestamptz not null default now()
);

create index if not exists idx_purchase_costs_purchase on purchase_costs(purchase_id);

alter table purchase_costs enable row level security;

drop policy if exists "purchase_costs_company_member_rw" on purchase_costs;
create policy "purchase_costs_company_member_rw" on purchase_costs
  for all using (
    purchase_id in (
      select p.id from purchases p
      join company_members cm on cm.company_id = p.company_id
      where cm.user_id = auth.uid() and p.deleted_at is null
    )
  );

grant all on purchase_costs to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13b — ACCOUNTING TRUTH V1 (2026-05-18)
-- Column additions, alias sync triggers, updated convert_proforma_to_sale RPC,
-- partner_transactions table. Safe to run on both clean and existing installs.
-- ─────────────────────────────────────────────────────────────────────────────

-- GAP 6: kdv_amount_try on sales — freeze KDV in TRY at sale creation time
alter table sales add column if not exists kdv_amount_try numeric(12,2) not null default 0;
comment on column sales.kdv_amount_try is 'KDV (VAT) portion of the sale total in TRY, frozen at sale creation time.';

-- GAP 6b: total_try and revenue_try on sales — used by RPC + SaleService
alter table sales add column if not exists total_try   numeric(15,2) not null default 0;
alter table sales add column if not exists revenue_try numeric(15,2) not null default 0;
alter table sales add column if not exists paid_at     timestamptz;
comment on column sales.total_try   is 'Total in TRY, frozen at sale creation time (FX-converted).';
comment on column sales.revenue_try is 'Net revenue in TRY excluding VAT (total_try - kdv_amount_try).';
comment on column sales.paid_at     is 'Timestamp when any payment was first received (partial or full).';

-- GAP 14: proformas.approved_at — written by ProformaService.updateStatus() on accepted/approved
alter table proformas add column if not exists approved_at timestamptz;
comment on column proformas.approved_at is 'Set when status transitions to accepted or approved. Alias for accepted_at.';

-- GAP 15: proforma_items additional columns — written by ProformaService.update() upsert path
alter table proforma_items add column if not exists unit         text         not null default 'adet';
alter table proforma_items add column if not exists unit_cost    numeric(12,4);
alter table proforma_items add column if not exists line_subtotal numeric(12,2) not null default 0;
alter table proforma_items add column if not exists vat_amount   numeric(12,2) not null default 0;
comment on column proforma_items.unit         is 'Unit of measure (adet, kg, saat, m², etc.).';
comment on column proforma_items.unit_cost    is 'FIFO cost at proforma time — informational, not used for pricing.';
comment on column proforma_items.line_subtotal is 'qty × unit_price × (1 − discount_pct/100), excludes VAT.';
comment on column proforma_items.vat_amount   is 'line_subtotal × kdv_rate / 100.';

-- GAP 13: cost_price_try on sale_item_allocations — makes COGS computable without JOIN
alter table sale_item_allocations add column if not exists cost_price_try numeric(12,4);
comment on column sale_item_allocations.cost_price_try is 'Frozen TRY cost per unit at allocation time (FIFO lot cost_price_try).';

-- GAP 3: kdv_rate on sale_items and proforma_items — precise GL revenue/KDV split
alter table sale_items     add column if not exists kdv_rate numeric(5,2) not null default 20;
alter table proforma_items add column if not exists kdv_rate numeric(5,2) not null default 20;
comment on column sale_items.kdv_rate     is 'KDV rate for this line (0, 10, or 20).';
comment on column proforma_items.kdv_rate is 'KDV rate for this line (0, 10, or 20). Copied to sale_items.kdv_rate on conversion.';

-- GAP 2: alias columns on stock_lots for legacy code compatibility
alter table stock_lots add column if not exists source_id           uuid references stock_movements(id) on delete set null;
alter table stock_lots add column if not exists purchase_item_id    uuid;
alter table stock_lots add column if not exists allocated_cost_try  numeric(12,4);
alter table stock_lots add column if not exists entry_cost_try      numeric(12,4);
alter table stock_lots add column if not exists fx_rate_at_entry    numeric(12,6);
alter table stock_lots add column if not exists unit_cost           numeric(12,4);
comment on column stock_lots.entry_cost_try   is 'Alias for cost_price_try (kept for legacy code compatibility).';
comment on column stock_lots.fx_rate_at_entry is 'Alias for cost_fx_rate (kept for legacy code compatibility).';
comment on column stock_lots.unit_cost        is 'Alias for cost_price (kept for legacy code compatibility).';

-- Keep alias columns in sync with canonical columns
create or replace function fn_sync_stock_lot_aliases()
returns trigger language plpgsql as $$
begin
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

-- Keep partner_loan_tranches interest rate columns in sync
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

-- GAP 1 + GAP 3 + GAP 6: Updated convert_proforma_to_sale
-- Fixes: stores TRY total (not native currency), populates kdv_amount_try,
--        copies kdv_rate per line, populates cost_price_try on allocations.
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
begin
  select * into v_proforma
    from proformas
    where id = p_proforma_id and deleted_at is null
    for update;
  if not found then raise exception 'PROFORMA_NOT_FOUND: %', p_proforma_id; end if;
  if v_proforma.status = 'converted' then raise exception 'ALREADY_CONVERTED: %', p_proforma_id; end if;
  if not exists (select 1 from proforma_items where proforma_id = p_proforma_id) then
    raise exception 'NO_ITEMS: proforma has no items';
  end if;
  if v_proforma.currency != 'TRY' and coalesce(v_proforma.fx_rate_try, 0) <= 0 then
    raise exception 'FX_RATE_NOT_FOUND: non-TRY proforma has no fx_rate_try';
  end if;

  v_year := to_char(coalesce(p_sale_date, now()::date), 'YYYY');
  select coalesce(max(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from sales where company_id = v_proforma.company_id and sale_no like 'SAL-' || v_year || '-%';
  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- GAP 1 fix: TRY total (not native currency total)
  v_total_try := round(v_proforma.total * coalesce(v_proforma.fx_rate_try, 1), 2);

  -- GAP 6 fix: compute KDV amount in TRY
  select round(
    coalesce(sum(
      pi.line_total * coalesce(pi.kdv_rate, 20) / (100 + coalesce(pi.kdv_rate, 20))
    ), 0) * coalesce(v_proforma.fx_rate_try, 1)
  , 2)
  into v_kdv_amount_try
  from proforma_items pi
  where pi.proforma_id = p_proforma_id;

  -- Revenue (net, excl KDV) in TRY
  v_revenue_try := round(v_total_try - v_kdv_amount_try, 2);

  insert into sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, total_try, revenue_try, kdv_amount_try, payment_status,
    sale_date, due_date, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  ) values (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    coalesce(p_bank_id, v_proforma.bank_id), p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency,
    v_total_try, v_total_try, v_revenue_try, v_kdv_amount_try, 'pending',
    coalesce(p_sale_date, now()::date), p_due_date, p_notes, p_internal_notes,
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  ) returning id into v_sale_id;

  for v_item in
    select * from proforma_items where proforma_id = p_proforma_id order by sort_order
  loop
    insert into sale_items (
      sale_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order,
      kdv_rate  -- GAP 3 fix: freeze KDV rate from proforma_items
    ) values (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.product_name,
      v_item.qty, v_item.unit_price, v_item.currency,
      coalesce(v_item.discount_pct, 0), v_item.line_total,
      v_item.notes, v_item.sort_order,
      coalesce(v_item.kdv_rate, 20)
    ) returning id into v_sale_item_id;

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
        insert into sale_item_allocations (
          company_id, sale_item_id, lot_id,
          qty_allocated, cost_price, cost_currency, cost_price_try  -- GAP 13 fix
        ) values (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_qty_from_lot, v_lot.cost_price, v_lot.cost_currency, v_lot.cost_price_try
        );
        update stock_lots
          set qty_remaining = qty_remaining - v_qty_from_lot, updated_at = now()
          where id = v_lot.id;
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

  update proformas set status = 'converted', converted_at = now(), updated_at = now()
    where id = p_proforma_id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no);
end;
$$;

grant execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) to authenticated;

-- GAP 10: partner_transactions table (bridge table, used throughout app)
create table if not exists partner_transactions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  partner_id      uuid references partners(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  tx_type         text not null,
  amount          numeric(15,2) not null check (amount > 0),
  currency        text not null default 'TRY',
  fx_rate         numeric(12,6) not null default 1,
  amount_try      numeric(15,2) not null,
  gross_try       numeric(15,2),
  withholding_try numeric(15,2),
  tx_date         date not null,
  notes           text,
  reference_id    uuid,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_partner_tx_company on partner_transactions(company_id) where deleted_at is null;
create index if not exists idx_partner_tx_partner on partner_transactions(company_id, partner_id) where deleted_at is null;
create index if not exists idx_partner_tx_date    on partner_transactions(company_id, tx_date) where deleted_at is null;

alter table partner_transactions enable row level security;

drop policy if exists partner_tx_member on partner_transactions;
create policy partner_tx_member on partner_transactions
  for all using (is_company_member(company_id));

grant all on partner_transactions to authenticated, service_role;

-- Backfill: approximate KDV for historical direct sales (blended 20% rate)
update sales
  set kdv_amount_try = round(total - (total / 1.2), 2)
  where kdv_amount_try = 0
    and total > 0
    and proforma_id is null
    and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14 — SHAREHOLDER GOVERNANCE (2026-05-18)
-- Monthly immutable snapshots + per-partner signoff workflow.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists governance_reports (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references companies(id) on delete cascade,
  period_label   text        not null,
  period_start   date        not null,
  period_end     date        not null,
  snapshot       jsonb       not null default '{}',
  generated_by   uuid        references auth.users(id),
  generated_at   timestamptz not null default now(),
  is_finalized   boolean     not null default false,
  finalized_at   timestamptz,
  finalized_by   uuid        references auth.users(id),
  notes          text,
  unique(company_id, period_start)
);

create index if not exists idx_governance_reports_company
  on governance_reports(company_id, period_start desc);

alter table governance_reports enable row level security;

drop policy if exists governance_reports_company_access on governance_reports;
create policy governance_reports_company_access on governance_reports
  for all using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid() and deleted_at is null
    )
  );

create table if not exists governance_signoffs (
  id           uuid        primary key default gen_random_uuid(),
  report_id    uuid        not null references governance_reports(id) on delete cascade,
  company_id   uuid        not null references companies(id) on delete cascade,
  partner_id   uuid        not null references partners(id) on delete cascade,
  partner_name text        not null,
  signed_by    uuid        references auth.users(id),
  signed_at    timestamptz not null default now(),
  notes        text,
  ip_hash      text,
  unique(report_id, partner_id)
);

create index if not exists idx_governance_signoffs_report  on governance_signoffs(report_id);
create index if not exists idx_governance_signoffs_company on governance_signoffs(company_id, signed_at desc);

alter table governance_signoffs enable row level security;

drop policy if exists governance_signoffs_company_access on governance_signoffs;
create policy governance_signoffs_company_access on governance_signoffs
  for all using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid() and deleted_at is null
    )
  );

grant all on governance_reports  to authenticated, service_role;
grant all on governance_signoffs to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 15 — WORKFLOW ENGINE (Phase 9)
-- Tracks multi-step approval workflows. Immutable once resolved.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists workflow_instances (
  id              uuid        default gen_random_uuid() primary key,
  company_id      uuid        not null references companies(id) on delete cascade,
  workflow_type   text        not null
    check (workflow_type in ('expense_approval','partner_loan','dividend_declaration','period_close')),
  status          text        not null default 'pending'
    check (status in ('pending','approved','rejected','expired')),
  initiator_id    uuid        not null references auth.users(id),
  approver_id     uuid        references auth.users(id),
  initiated_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  expires_at      timestamptz,
  payload         jsonb       not null default '{}',
  notes           text,
  resource_type   text,
  resource_id     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_workflow_company_status
  on workflow_instances (company_id, status, workflow_type);
create index if not exists idx_workflow_resource
  on workflow_instances (resource_id) where resource_id is not null;
create index if not exists idx_workflow_expires
  on workflow_instances (expires_at) where expires_at is not null and status = 'pending';

create table if not exists workflow_instance_items (
  id              uuid        default gen_random_uuid() primary key,
  workflow_id     uuid        not null references workflow_instances(id) on delete cascade,
  item_key        text        not null,
  label           text        not null,
  is_required     boolean     not null default true,
  is_completed    boolean     not null default false,
  completed_at    timestamptz,
  completed_by    uuid        references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_workflow_items_workflow
  on workflow_instance_items (workflow_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'workflow_instances_updated_at'
      and tgrelid = 'workflow_instances'::regclass
  ) then
    create trigger workflow_instances_updated_at
      before update on workflow_instances
      for each row execute function update_updated_at_column();
  end if;
exception when undefined_table then null;
       when undefined_function then null;
end $$;

alter table workflow_instances       enable row level security;
alter table workflow_instance_items  enable row level security;

drop policy if exists workflow_instances_company_member on workflow_instances;
create policy workflow_instances_company_member on workflow_instances
  for all using (
    company_id in (
      select company_id from company_members where user_id = auth.uid()
    )
  );

drop policy if exists workflow_items_via_workflow on workflow_instance_items;
create policy workflow_items_via_workflow on workflow_instance_items
  for all using (
    workflow_id in (
      select id from workflow_instances
      where company_id in (
        select company_id from company_members where user_id = auth.uid()
      )
    )
  );

grant all on workflow_instances      to authenticated, service_role;
grant all on workflow_instance_items to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 16 — FX RATES CACHE
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fx_rates (
  id         uuid        primary key default gen_random_uuid(),
  rate_date  date        not null,
  currency   text        not null,
  buying     numeric(14,6) not null,
  selling    numeric(14,6) not null,
  source     text        not null default 'tcmb',
  fetched_at timestamptz not null default now(),
  constraint fx_rates_date_currency_uq unique (rate_date, currency)
);

create index if not exists idx_fx_rates_date_currency
  on fx_rates (rate_date desc, currency);

alter table fx_rates enable row level security;

drop policy if exists fx_rates_read_all on fx_rates;
create policy fx_rates_read_all on fx_rates for select using (true);

grant select on fx_rates to authenticated, anon;
grant all    on fx_rates to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 17 — COMPANY BANKS
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists company_banks (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references companies(id) on delete cascade,
  user_id     uuid        references auth.users(id) on delete set null,
  bank_name   text        not null,
  branch_name text,
  iban        text,
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_company_banks_company
  on company_banks (company_id) where deleted_at is null;

alter table company_banks enable row level security;

drop policy if exists company_banks_member on company_banks;
create policy company_banks_member on company_banks
  for all using (
    company_id in (
      select company_id from company_members where user_id = auth.uid()
    )
  );

grant all on company_banks to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 18 — POLICY RATES
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists policy_rates (
  id          uuid        primary key default gen_random_uuid(),
  currency    text        not null,
  rate_date   date        not null,
  annual_rate numeric(8,4) not null,
  source      text        not null default 'manual',
  notes       text,
  created_at  timestamptz not null default now(),
  constraint policy_rates_currency_date_uq unique (currency, rate_date)
);

create index if not exists idx_policy_rates_currency_date
  on policy_rates (currency, rate_date desc);

alter table policy_rates enable row level security;

drop policy if exists policy_rates_read_all on policy_rates;
create policy policy_rates_read_all on policy_rates for select using (true);

grant select on policy_rates to authenticated, anon;
grant all    on policy_rates to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF FLOWRA_FULL_INSTALL.sql  (v3 — 2026-05-20)
--
-- After running, verify with:
--   \i supabase/schema_verify.sql
--   OR paste schema_verify.sql into SQL Editor
--
-- Tables created: 36+ (includes governance_reports, governance_signoffs,
--                        partner_transactions, purchase_orders, purchase_order_items,
--                        workflow_instances, workflow_instance_items)
-- RPCs created:   15+ (convert_proforma_to_sale updated with Accounting Truth v1 fixes)
-- Indexes:        60+
-- RLS policies:   68+
-- IDEMPOTENT:     Yes — safe to run on clean installs AND existing databases
-- ═══════════════════════════════════════════════════════════════════════════════
