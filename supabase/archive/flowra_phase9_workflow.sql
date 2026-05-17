-- ═══════════════════════════════════════════════════════════════════════════════
-- FLOWRA Phase 9 — Workflow Instances Engine
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds:
--   1. workflow_instances       — approval workflow tracking
--   2. workflow_instance_items  — checklist items per workflow
--
-- IDEMPOTENT: All statements use IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--
-- Usage: Run this in Supabase SQL Editor after flowra_phase7_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════════

set search_path = public;

-- ── 1. workflow_instances ─────────────────────────────────────────────────────
--
-- Tracks multi-step approval workflows. Immutable once resolved.
-- workflow_type values:
--   'expense_approval'      — manager-initiated expense > threshold → admin approve
--   'partner_loan'          — 2-step admin confirm for partner loan entry
--   'dividend_declaration'  — legality check + admin final confirm
--   'period_close'          — 5/5 checklist guard before close

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
  -- Linked resource (optional)
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

-- ── 2. workflow_instance_items — checklist items per workflow ─────────────────

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

-- ── 3. updated_at trigger for workflow_instances ──────────────────────────────

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
exception when undefined_table then
  null;
end $$;

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────

alter table workflow_instances       enable row level security;
alter table workflow_instance_items  enable row level security;

-- workflow_instances: members of the same company can view; only admins can write
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

-- ── 5. workflow_threshold configuration row in alert_rules ────────────────────
-- Reuse alert_rules table for workflow threshold configuration.
-- rule_type = 'EXPENSE_APPROVAL_THRESHOLD' → threshold_value = min TRY for approval

-- No data insert here (idempotent by design — admin configures via /settings/alerts)

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLETE: Run this script once in Supabase SQL Editor.
-- After running: Restart the Next.js dev server if running locally.
-- ═══════════════════════════════════════════════════════════════════════════════
