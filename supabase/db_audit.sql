-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Database Audit Script — READ-ONLY diagnostic queries
-- Run this in Supabase SQL Editor or via psql to check schema health.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ALL TABLES with row counts and soft-delete coverage
-- ═══════════════════════════════════════════════════════════════════════════════
select
  t.table_name,
  (xpath('/row/cnt/text()',
    query_to_xml('select count(*) as cnt from public.' || quote_ident(t.table_name), true, false, '')
  ))[1]::text::int as approx_rows,
  case
    when c.column_name is not null then '✓ has deleted_at'
    else '✗ NO deleted_at'
  end as soft_delete,
  case
    when ci.column_name is not null then '✓ has company_id'
    else '✗ no company_id'
  end as company_scoped
from information_schema.tables t
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'deleted_at'
left join information_schema.columns ci
  on ci.table_schema = 'public' and ci.table_name = t.table_name and ci.column_name = 'company_id'
where t.table_schema = 'public'
  and t.table_type   = 'BASE TABLE'
order by t.table_name;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. FOREIGN KEY CONSISTENCY — rows with dangling FKs (orphaned data)
-- ═══════════════════════════════════════════════════════════════════════════════

-- sale_items with no parent sale
select 'sale_items → sales' as check, count(*) as orphan_count
from sale_items si
left join sales s on s.id = si.sale_id
where s.id is null and si.deleted_at is null;

-- sale_item_allocations with no parent sale or stock_lot
select 'sale_item_allocations → sales' as check, count(*) as orphan_count
from sale_item_allocations a
left join sales s on s.id = a.sale_id
where s.id is null and a.deleted_at is null;

select 'sale_item_allocations → stock_lots' as check, count(*) as orphan_count
from sale_item_allocations a
left join stock_lots l on l.id = a.stock_lot_id
where l.id is null and a.deleted_at is null;

-- stock_lots with no parent product
select 'stock_lots → products' as check, count(*) as orphan_count
from stock_lots l
left join products p on p.id = l.product_id
where p.id is null and l.deleted_at is null;

-- proforma_items with no parent proforma
select 'proforma_items → proformas' as check, count(*) as orphan_count
from proforma_items pi2
left join proformas p on p.id = pi2.proforma_id
where p.id is null;

-- partner_transactions with no parent partner
select 'partner_transactions → partners' as check, count(*) as orphan_count
from partner_transactions pt
left join partners p on p.id = pt.partner_id
where p.id is null and pt.deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. COMPANY_ID CONSISTENCY — rows missing company_id where expected
-- ═══════════════════════════════════════════════════════════════════════════════

select 'expenses without company_id' as check, count(*) from expenses where company_id is null and deleted_at is null
union all
select 'sales without company_id', count(*) from sales where company_id is null and deleted_at is null
union all
select 'partner_tx without company_id', count(*) from partner_transactions where company_id is null and deleted_at is null
union all
select 'stock_lots without company_id', count(*) from stock_lots where company_id is null and deleted_at is null
union all
select 'products without company_id', count(*) from products where company_id is null and deleted_at is null
union all
select 'customers without company_id', count(*) from customers where company_id is null and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PAYMENT_STATUS COVERAGE — ensure all sales + expenses have valid status
-- ═══════════════════════════════════════════════════════════════════════════════

select 'sales.payment_status null', count(*) from sales where payment_status is null and deleted_at is null
union all
select 'expenses.payment_status null', count(*) from expenses where payment_status is null and deleted_at is null
union all
select 'expenses.expense_type null', count(*) from expenses where expense_type is null and deleted_at is null
union all
select 'recurring.expense_type null', count(*) from recurring_expenses where expense_type is null and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. RLS POLICY CHECK — list all tables without RLS enabled
-- ═══════════════════════════════════════════════════════════════════════════════

select
  c.relname as table_name,
  case c.relrowsecurity when true then '✓ RLS enabled' else '✗ RLS DISABLED' end as rls_status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. MISSING INDEXES — check if critical indexes exist
-- ═══════════════════════════════════════════════════════════════════════════════

select
  i.relname as index_name,
  t.relname as table_name,
  pg_get_indexdef(i.oid) as definition
from pg_index ix
join pg_class i on i.oid = ix.indexrelid
join pg_class t on t.oid = ix.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in (
    'sales', 'expenses', 'recurring_expenses', 'stock_lots',
    'sale_item_allocations', 'partner_transactions', 'proformas',
    'tasks', 'audit_logs', 'alerts', 'fx_rates', 'company_members', 'purchases'
  )
order by t.relname, i.relname;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. TRANSACTION SAFETY — stock qty integrity
-- ═══════════════════════════════════════════════════════════════════════════════

-- Stock lots with negative qty_remaining (should never happen)
select 'stock_lots with negative qty' as check, count(*)
from stock_lots
where qty_remaining < 0 and deleted_at is null;

-- FIFO allocations that exceed lot quantities
select 'over-allocated lots' as check, count(*)
from (
  select
    a.stock_lot_id,
    sum(a.qty_allocated)        as total_allocated,
    l.qty_remaining + sum(a.qty_allocated) as original_qty  -- approximation
  from sale_item_allocations a
  join stock_lots l on l.id = a.stock_lot_id
  where a.deleted_at is null and l.deleted_at is null
  group by a.stock_lot_id, l.qty_remaining
  having l.qty_remaining < 0
) over_alloc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. FINANCIAL INTEGRITY — accounting checks
-- ═══════════════════════════════════════════════════════════════════════════════

-- Partner transactions classified as financing in the expenses table
-- (should all be expense_type = 'partner_financing')
select
  'partner_loan expenses with wrong type' as check,
  count(*)
from expenses
where category = 'partner_loan'
  and expense_type != 'partner_financing'
  and deleted_at is null;

-- Sales marked paid but missing paid_at
select 'paid sales without paid_at' as check, count(*)
from sales
where payment_status = 'paid'
  and paid_at is null
  and deleted_at is null;

-- Expenses with payment_status=paid but amount<=0
select 'paid expenses with zero/negative amount' as check, count(*)
from expenses
where payment_status = 'paid'
  and amount_try <= 0
  and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. BACKUP COVERAGE — tables that exist in backup export vs restore INSERT_ORDER
-- ═══════════════════════════════════════════════════════════════════════════════

-- Expected tables in full backup (verify all exist):
select table_name, 'should be in backup' as note
from information_schema.tables
where table_schema = 'public'
  and table_type   = 'BASE TABLE'
  and table_name in (
    'customers', 'products', 'expenses', 'proformas', 'proforma_items',
    'stock_lots', 'stock_movements', 'sales', 'sale_items', 'sale_item_allocations',
    'partners', 'partner_transactions'
  )
order by table_name;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. SECURITY — SECURITY DEFINER functions (should be minimal, all audited)
-- ═══════════════════════════════════════════════════════════════════════════════

select
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  case p.prosecdef when true then '⚠ SECURITY DEFINER' else 'SECURITY INVOKER' end as security_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
