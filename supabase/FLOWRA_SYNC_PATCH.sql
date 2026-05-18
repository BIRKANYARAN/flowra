-- ═══════════════════════════════════════════════════════════════════════════════
-- FLOWRA_SYNC_PATCH.sql  —  Production-safe incremental patch
-- Generated: 2026-05-18
--
-- PURPOSE:
--   Apply this to ANY existing Flowra production database to bring the schema
--   into sync with FLOWRA_FULL_INSTALL.sql v2.0 (May 2026 enterprise release).
--
-- SAFETY:
--   ✓ Fully idempotent — safe to run multiple times
--   ✓ No DROP TABLE / TRUNCATE / destructive statements
--   ✓ All column additions use ADD COLUMN IF NOT EXISTS
--   ✓ All policies use DROP POLICY IF EXISTS before CREATE
--   ✓ All functions use CREATE OR REPLACE
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste and execute
--   OR: supabase db execute -f FLOWRA_SYNC_PATCH.sql
--
-- WHAT THIS PATCHES:
--   GAP 6b  sales.total_try, sales.revenue_try, sales.paid_at
--   GAP 14  proformas.approved_at
--   GAP 15  proforma_items.unit, unit_cost, line_subtotal, vat_amount
--   (Previous patches GAP 1–13 are assumed to have been applied already;
--    they are included here as idempotent ADD COLUMN IF NOT EXISTS for safety.)
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── SECTION 1: sales — accounting truth columns ──────────────────────────────

-- Previously patched (idempotent re-include):
alter table public.sales
  add column if not exists kdv_amount_try numeric(12,2) not null default 0;

-- New in this patch:
alter table public.sales
  add column if not exists total_try   numeric(15,2) not null default 0;
alter table public.sales
  add column if not exists revenue_try numeric(15,2) not null default 0;
alter table public.sales
  add column if not exists paid_at     timestamptz;

comment on column public.sales.total_try
  is 'Total in TRY, frozen at sale creation time (FX-converted from native currency).';
comment on column public.sales.revenue_try
  is 'Net revenue in TRY excluding VAT (= total_try - kdv_amount_try).';
comment on column public.sales.paid_at
  is 'Timestamp when first payment received (partial or full). Null = unpaid.';

-- ── SECTION 2: Backfill existing sales rows where total_try = 0 ──────────────
-- For TRY sales: total_try = total. For FX sales: total_try = total × fx_rate_try.
-- Run once — subsequent runs are no-ops because total_try will already be set.
update public.sales
set
  total_try   = round(total * coalesce(fx_rate_try, 1), 2),
  revenue_try = round(
    total * coalesce(fx_rate_try, 1) -
    coalesce(kdv_amount_try, 0),
    2
  )
where total_try = 0 and total > 0;

-- ── SECTION 3: proformas — approved_at column ────────────────────────────────

alter table public.proformas
  add column if not exists approved_at timestamptz;

comment on column public.proformas.approved_at
  is 'Set when status transitions to ''accepted'' or ''approved''. See also: accepted_at.';

-- Backfill approved_at from accepted_at for existing rows
update public.proformas
set approved_at = accepted_at
where approved_at is null and accepted_at is not null;

-- ── SECTION 4: proforma_items — additional columns ───────────────────────────

-- Previously patched (idempotent re-include):
alter table public.proforma_items
  add column if not exists kdv_rate numeric(5,2) not null default 20;

-- New in this patch:
alter table public.proforma_items
  add column if not exists unit         text          not null default 'adet';
alter table public.proforma_items
  add column if not exists unit_cost    numeric(12,4);
alter table public.proforma_items
  add column if not exists line_subtotal numeric(12,2) not null default 0;
alter table public.proforma_items
  add column if not exists vat_amount   numeric(12,2)  not null default 0;

comment on column public.proforma_items.unit
  is 'Unit of measure (adet, kg, saat, m², paket, etc.)';
comment on column public.proforma_items.unit_cost
  is 'FIFO cost per unit at proforma time — informational, not used for pricing calculations.';
comment on column public.proforma_items.line_subtotal
  is 'qty × unit_price × (1 − discount_pct/100), excludes VAT.';
comment on column public.proforma_items.vat_amount
  is 'line_subtotal × kdv_rate / 100.';

-- Backfill line_subtotal / vat_amount for existing rows where both are 0
-- line_subtotal ≈ line_total / (1 + kdv_rate/100)
update public.proforma_items
set
  line_subtotal = round(line_total / (1 + coalesce(kdv_rate, 20) / 100.0), 2),
  vat_amount    = round(line_total - line_total / (1 + coalesce(kdv_rate, 20) / 100.0), 2)
where line_subtotal = 0 and line_total > 0;

-- ── SECTION 5: sale_items — kdv_rate (previously patched, idempotent) ─────────

alter table public.sale_items
  add column if not exists kdv_rate numeric(5,2) not null default 20;
comment on column public.sale_items.kdv_rate
  is 'KDV (VAT) rate for this line (0, 10, or 20). Copied from proforma_items.kdv_rate on conversion.';

-- ── SECTION 6: stock_lots — alias columns (previously patched, idempotent) ───

alter table public.stock_lots add column if not exists source_id          uuid references public.stock_movements(id) on delete set null;
alter table public.stock_lots add column if not exists purchase_item_id   uuid;
alter table public.stock_lots add column if not exists allocated_cost_try numeric(12,4);
alter table public.stock_lots add column if not exists entry_cost_try     numeric(12,4);
alter table public.stock_lots add column if not exists fx_rate_at_entry   numeric(12,6);
alter table public.stock_lots add column if not exists unit_cost          numeric(12,4);

-- ── SECTION 7: sale_item_allocations — cost_price_try ────────────────────────

alter table public.sale_item_allocations
  add column if not exists cost_price_try numeric(12,4);
comment on column public.sale_item_allocations.cost_price_try
  is 'Frozen TRY cost per unit at allocation time (from FIFO lot cost_price_try). Used for COGS.';

-- ── SECTION 8: accounting_periods — pre_close / locked columns ───────────────

alter table public.accounting_periods add column if not exists pre_close_at timestamptz;
alter table public.accounting_periods add column if not exists locked_at    timestamptz;
alter table public.accounting_periods add column if not exists locked_by    uuid references auth.users(id);
alter table public.accounting_periods add column if not exists gl_enabled   boolean not null default false;

-- ── SECTION 9: partner_loan_tranches — annual_interest_rate ──────────────────

alter table public.partner_loan_tranches
  add column if not exists annual_interest_rate numeric(6,4) default null;

-- ── SECTION 10: audit_logs — hash chain columns ───────────────────────────────

alter table public.audit_logs add column if not exists content_hash text;
alter table public.audit_logs add column if not exists prev_hash    text;

-- ── SECTION 11: companies — gl_mode ───────────────────────────────────────────

alter table public.companies
  add column if not exists gl_mode text not null default 'shadow'
  check (gl_mode in ('shadow', 'parallel', 'gl_primary'));

-- ── SECTION 12: Verify critical tables exist ─────────────────────────────────
-- These should already exist. If they don't, something is badly wrong.
do $$
declare
  missing_tables text[] := array[]::text[];
  t text;
begin
  foreach t in array array[
    'sales', 'sale_items', 'proformas', 'proforma_items',
    'stock_lots', 'customers', 'products', 'banks',
    'partners', 'partner_finance_events', 'accounting_periods',
    'journal_entries', 'audit_logs', 'companies', 'company_members'
  ] loop
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      missing_tables := array_append(missing_tables, t);
    end if;
  end loop;
  if array_length(missing_tables, 1) > 0 then
    raise exception 'SCHEMA_INCOMPLETE: Missing tables: %. Run FLOWRA_FULL_INSTALL.sql first.', array_to_string(missing_tables, ', ');
  end if;
  raise notice 'Schema verification passed — all critical tables present.';
end $$;

-- ── SECTION 13: Final notice ──────────────────────────────────────────────────
do $$
begin
  raise notice '✓ FLOWRA_SYNC_PATCH.sql applied successfully (2026-05-18).';
  raise notice '  Patched: sales.total_try/revenue_try/paid_at, proformas.approved_at,';
  raise notice '  proforma_items.unit/unit_cost/line_subtotal/vat_amount';
  raise notice '  Backfilled: sales.total_try for existing rows, proforma_items.line_subtotal/vat_amount';
  raise notice '  All changes are idempotent — safe to re-run.';
end $$;

commit;
