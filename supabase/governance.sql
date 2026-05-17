-- ─────────────────────────────────────────────────────────────────────────────
-- Shareholder Governance System
-- Monthly reconciliation reports + partner signoff workflow
-- Run after FLOWRA_FULL_INSTALL.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── governance_reports ───────────────────────────────────────────────────────
-- Immutable monthly snapshot of company financial state + shareholder positions.
-- Once finalized, never updated — append-only.

create table if not exists governance_reports (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references companies(id) on delete cascade,
  period_label   text        not null,  -- "Mayıs 2026"
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

create policy "governance_reports_company_access" on governance_reports
  for all using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- ── governance_signoffs ───────────────────────────────────────────────────────
-- Per-partner signoff confirmation for each governance report.
-- Partners digitally confirm they have reviewed the monthly report.

create table if not exists governance_signoffs (
  id           uuid        primary key default gen_random_uuid(),
  report_id    uuid        not null references governance_reports(id) on delete cascade,
  company_id   uuid        not null references companies(id) on delete cascade,
  partner_id   uuid        not null references partners(id) on delete cascade,
  partner_name text        not null,
  signed_by    uuid        references auth.users(id),
  signed_at    timestamptz not null default now(),
  notes        text,
  ip_hash      text,  -- optional: SHA-256 hash of IP for audit trail

  unique(report_id, partner_id)
);

create index if not exists idx_governance_signoffs_report
  on governance_signoffs(report_id);

create index if not exists idx_governance_signoffs_company
  on governance_signoffs(company_id, signed_at desc);

alter table governance_signoffs enable row level security;

create policy "governance_signoffs_company_access" on governance_signoffs
  for all using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid() and deleted_at is null
    )
  );
