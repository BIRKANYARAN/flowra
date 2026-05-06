-- Flowra financial correctness hard fix.
--
-- Idempotent patch for cash/burn correctness:
--   * expenses.payment_status tracks paid vs unpaid expense rows.
--   * expenses.expense_type stores the cash-flow type used by burn/cash filters.
--   * partner-loan expense RPC writes partner financing rows as paid and excluded.

do $$ begin
  create type payment_status_enum as enum ('unpaid', 'paid', 'partial', 'overdue');
exception when duplicate_object then null;
end $$;

alter table expenses
  add column if not exists payment_status payment_status_enum not null default 'paid';

alter table expenses
  add column if not exists expense_type text;

alter table recurring_expenses
  add column if not exists expense_type text;

do $$
declare
  col_type text;
begin
  select udt_name into col_type
  from   information_schema.columns
  where  table_schema = 'public'
    and  table_name = 'expenses'
    and  column_name = 'payment_status';

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

update expenses
set    payment_status = 'paid'
where  payment_status is null;

alter table expenses
  alter column payment_status set default 'paid',
  alter column payment_status set not null;

update expenses
set    expense_type = case category
  when 'equipment'    then 'capital'
  when 'tax'          then 'tax'
  when 'interest'     then 'financial'
  when 'principal'    then 'loan_repayment'
  when 'dividend'     then 'dividend'
  when 'partner_loan' then 'partner_financing'
  else 'operational'
end
where  expense_type is null
   or  expense_type not in (
     'operational', 'fixed', 'variable', 'capital', 'financial', 'tax',
     'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer', 'other'
   );

update recurring_expenses
set    expense_type = case category
  when 'equipment'    then 'capital'
  when 'tax'          then 'tax'
  when 'interest'     then 'financial'
  when 'principal'    then 'loan_repayment'
  when 'dividend'     then 'dividend'
  when 'partner_loan' then 'partner_financing'
  else 'operational'
end
where  expense_type is null
   or  expense_type not in (
     'operational', 'fixed', 'variable', 'capital', 'financial', 'tax',
     'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer', 'other'
   );

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
  v_partner_ok boolean;
  v_tx_id      uuid;
  v_expense_id uuid;
begin
  if auth.uid() is distinct from p_uid then
    raise exception 'create_partner_loan_expense: unauthorized';
  end if;

  select exists(
    select 1
    from partners
    where id = p_partner_id
      and user_id = p_uid
      and deleted_at is null
  ) into v_partner_ok;

  if not v_partner_ok then
    raise exception 'PARTNER_NOT_FOUND: Ortak bulunamadı (id: %)', p_partner_id;
  end if;

  insert into partner_transactions (
    partner_id, user_id, tx_type, amount, currency, fx_rate, amount_try, tx_date, notes, company_id
  ) values (
    p_partner_id, p_uid, 'loan_to_company', p_amount, p_currency, p_fx_rate, p_amount_try,
    p_expense_date, p_description, p_company_id
  ) returning id into v_tx_id;

  insert into expenses (
    user_id, amount, currency, amount_try, fx_rate, fx_source, description,
    category, payment_status, expense_type, expense_date, kdv, company_id
  ) values (
    p_uid, p_amount, p_currency, p_amount_try, p_fx_rate, p_fx_source, p_description,
    'partner_loan', 'paid', 'partner_financing', p_expense_date, p_kdv, p_company_id
  ) returning id into v_expense_id;

  return jsonb_build_object('expense_id', v_expense_id, 'tx_id', v_tx_id);
end;
$$;

revoke execute on function create_partner_loan_expense from public;
grant execute on function create_partner_loan_expense to authenticated;
