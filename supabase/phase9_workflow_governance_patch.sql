-- ═══════════════════════════════════════════════════════════════════════════════
-- Flowra — Phase 9 + Governance Production Patch
-- Adds workflow_instances, workflow_instance_items, governance_reports,
-- governance_signoffs to any existing Flowra database.
--
-- SAFE TO RUN:  All statements use IF NOT EXISTS / DO $$ exception guards.
-- IDEMPOTENT:   Run multiple times, same result.
-- APPLIES TO:   Databases that ran flowra_FULL_MIGRATION.sql or repair_production.sql
--               but pre-date this patch.
--
-- Date: 2026-05-20
-- ═══════════════════════════════════════════════════════════════════════════════

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION M — WORKFLOW ENGINE (Phase 9)
-- Tracks multi-step approval workflows. Immutable once resolved.
-- ─────────────────────────────────────────────────────────────────────────────

-- workflow_instances
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
  -- Linked resource (optional — for duplicate guard and audit)
  resource_type   text,
  resource_id     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_workflow_company_status
  on workflow_instances (company_id, status, workflow_type);

create index if not exists idx_workflow_resource
  on workflow_instances (resource_id)
  where resource_id is not null;

create index if not exists idx_workflow_expires
  on workflow_instances (expires_at)
  where expires_at is not null and status = 'pending';

-- workflow_instance_items — checklist items per workflow (e.g. period_close 5/5)
create table if not exists workflow_instance_items (
  id              uuid        default gen_random_uuid() primary key,
  workflow_id     uuid        not null references workflow_instances(id) on delete cascade,
  item_key        text        not null,   -- e.g. 'trial_balance', 'bank_reconciliation'
  label           text        not null,   -- Turkish display label
  is_required     boolean     not null default true,
  is_completed    boolean     not null default false,
  completed_at    timestamptz,
  completed_by    uuid        references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_workflow_items_workflow
  on workflow_instance_items (workflow_id);

-- updated_at trigger for workflow_instances (depends on update_updated_at_column existing)
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

-- RLS
alter table workflow_instances       enable row level security;
alter table workflow_instance_items  enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_instances' and policyname = 'workflow_instances_company_member'
  ) then
    create policy workflow_instances_company_member on workflow_instances
      for all using (
        company_id in (
          select company_id from company_members where user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_instance_items' and policyname = 'workflow_items_via_workflow'
  ) then
    create policy workflow_items_via_workflow on workflow_instance_items
      for all using (
        workflow_id in (
          select id from workflow_instances
          where company_id in (
            select company_id from company_members where user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

grant all on workflow_instances      to authenticated, service_role;
grant all on workflow_instance_items to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION N — SHAREHOLDER GOVERNANCE
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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'governance_reports' and policyname = 'governance_reports_company_access'
  ) then
    create policy governance_reports_company_access on governance_reports
      for all using (
        company_id in (
          select company_id from company_members
          where user_id = auth.uid() and deleted_at is null
        )
      );
  end if;
end $$;

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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'governance_signoffs' and policyname = 'governance_signoffs_company_access'
  ) then
    create policy governance_signoffs_company_access on governance_signoffs
      for all using (
        company_id in (
          select company_id from company_members
          where user_id = auth.uid() and deleted_at is null
        )
      );
  end if;
end $$;

grant all on governance_reports  to authenticated, service_role;
grant all on governance_signoffs to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION O — FX RATES CACHE
-- Per-day TCMB buying/selling rates for TRY, USD, EUR currencies.
-- Populated by /api/fx-rates cron; upserted on every proforma creation.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fx_rates (
  id         uuid        primary key default gen_random_uuid(),
  rate_date  date        not null,
  currency   text        not null,            -- 'USD' | 'EUR' | 'GBP' etc.
  buying     numeric(14,6) not null,           -- TCMB buying rate (TRY per unit)
  selling    numeric(14,6) not null,
  source     text        not null default 'tcmb',
  fetched_at timestamptz not null default now(),
  constraint fx_rates_date_currency_uq unique (rate_date, currency)
);

create index if not exists idx_fx_rates_date_currency
  on fx_rates (rate_date desc, currency);

alter table fx_rates enable row level security;

-- fx_rates is a global reference table (no company scope) — public read, service_role write
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'fx_rates' and policyname = 'fx_rates_read_all'
  ) then
    create policy fx_rates_read_all on fx_rates
      for select using (true);
  end if;
end $$;

grant select on fx_rates to authenticated, anon;
grant all    on fx_rates to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION P — COMPANY BANKS
-- Per-company bank account details shown on proformas/invoices.
-- Distinct from the `banks` table (which tracks operational cash balances).
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

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'company_banks' and policyname = 'company_banks_member'
  ) then
    create policy company_banks_member on company_banks
      for all using (
        company_id in (
          select company_id from company_members where user_id = auth.uid()
        )
      );
  end if;
end $$;

grant all on company_banks to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION Q — POLICY RATES
-- Central bank policy rates (TCMB/FED/ECB) for carrying cost calculation.
-- Global reference table — no company scope.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists policy_rates (
  id          uuid        primary key default gen_random_uuid(),
  currency    text        not null,            -- 'TRY' | 'USD' | 'EUR'
  rate_date   date        not null,
  annual_rate numeric(8,4) not null,           -- decimal (0.40 = 40% TCMB rate)
  source      text        not null default 'manual', -- 'tcmb' | 'fed' | 'ecb' | 'manual'
  notes       text,
  created_at  timestamptz not null default now(),
  constraint policy_rates_currency_date_uq unique (currency, rate_date)
);

create index if not exists idx_policy_rates_currency_date
  on policy_rates (currency, rate_date desc);

alter table policy_rates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'policy_rates' and policyname = 'policy_rates_read_all'
  ) then
    create policy policy_rates_read_all on policy_rates
      for select using (true);
  end if;
end $$;

grant select on policy_rates to authenticated, anon;
grant all    on policy_rates to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFY after running:
--   select table_name from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('workflow_instances','workflow_instance_items',
--                        'governance_reports','governance_signoffs',
--                        'fx_rates','company_banks','policy_rates')
--   order by table_name;
-- Expected: 7 rows
-- ═══════════════════════════════════════════════════════════════════════════════
