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
