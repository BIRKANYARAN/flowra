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
