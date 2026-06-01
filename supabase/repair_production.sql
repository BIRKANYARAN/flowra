-- ═══════════════════════════════════════════════════════════════════════════════
-- repair_production.sql  —  Flowra ERP Production Schema Repair
-- ═══════════════════════════════════════════════════════════════════════════════
-- SAFE TO RUN REPEATEDLY — every statement is idempotent.
-- No DROP TABLE, no truncations, no data loss.
-- Apply to production Supabase via: Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION A  —  ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type payment_status_enum as enum ('pending','partial','paid','overdue','cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type payment_status_enum add value if not exists 'pending';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'partial';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'paid';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'overdue';
exception when others then null;
end $$;
do $$ begin
  alter type payment_status_enum add value if not exists 'cancelled';
exception when others then null;
end $$;

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


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION B  —  CORE TABLES (CREATE IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- companies
create table if not exists companies (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  logo_url     text,
  tax_id       text,
  address      text,
  phone        text,
  email        text,
  website      text,
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
  created_at  timestamptz not null default now(),
  constraint uq_company_member unique (company_id, user_id)
);

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

-- partner_loans
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
  sent_at             timestamptz,
  accepted_at         timestamptz,
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
  qty             numeric(12,3) not null default 1,
  unit_price      numeric(12,4) not null default 0,
  currency        text        not null default 'TRY',
  discount_pct    numeric(5,2) not null default 0,
  line_total      numeric(12,2) not null default 0,
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
  paid_amount         numeric(12,2) not null default 0,
  payment_status      text        not null default 'pending',
  shipment_status     text        not null default 'pending',
  sale_date           date,
  due_date            date,
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

-- sale_item_allocations (hard-deleted — no deleted_at column)
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

-- jobs
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

-- audit_log
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


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION C  —  COLUMN PATCHES (ADD IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- companies
alter table companies add column if not exists tax_id     text;
alter table companies add column if not exists address    text;
alter table companies add column if not exists phone      text;
alter table companies add column if not exists email      text;
alter table companies add column if not exists website    text;
alter table companies add column if not exists logo_url   text;
alter table companies add column if not exists deleted_at timestamptz;
alter table companies add column if not exists updated_at timestamptz not null default now();

-- company_members
alter table company_members add column if not exists accepted_at timestamptz;
alter table company_members add column if not exists invited_at  timestamptz not null default now();

-- user_settings
alter table user_settings add column if not exists active_company_id uuid references companies(id) on delete set null;
alter table user_settings add column if not exists settings          jsonb not null default '{}';
alter table user_settings add column if not exists updated_at        timestamptz not null default now();

-- proformas — all extra columns
alter table proformas add column if not exists bank_id            uuid references banks(id) on delete set null;
alter table proformas add column if not exists fx_usd             numeric(12,6);
alter table proformas add column if not exists fx_eur             numeric(12,6);
alter table proformas add column if not exists fx_try             numeric(12,6) not null default 1;
alter table proformas add column if not exists fx_source          text;
alter table proformas add column if not exists fx_rate_date       date;
alter table proformas add column if not exists fx_rate_try        numeric(12,6);
alter table proformas add column if not exists company_snapshot   jsonb;
alter table proformas add column if not exists customer_snapshot  jsonb;
alter table proformas add column if not exists internal_notes     text;
alter table proformas add column if not exists revision_no        integer not null default 1;
alter table proformas add column if not exists sent_at            timestamptz;
alter table proformas add column if not exists accepted_at        timestamptz;
alter table proformas add column if not exists rejected_at        timestamptz;
alter table proformas add column if not exists converted_at       timestamptz;
alter table proformas add column if not exists valid_until        date;

-- proforma_items
alter table proforma_items add column if not exists company_id   uuid references companies(id) on delete cascade;
alter table proforma_items add column if not exists sort_order   integer not null default 0;
alter table proforma_items add column if not exists discount_pct numeric(5,2) not null default 0;
alter table proforma_items add column if not exists line_total   numeric(12,2) not null default 0;

-- sales
alter table sales add column if not exists bank_id           uuid references banks(id) on delete set null;
alter table sales add column if not exists proforma_id       uuid references proformas(id) on delete set null;
alter table sales add column if not exists sale_no           text;
alter table sales add column if not exists paid_amount       numeric(12,2) not null default 0;
alter table sales add column if not exists payment_status    text not null default 'pending';
alter table sales add column if not exists shipment_status   text not null default 'pending';
alter table sales add column if not exists due_date          date;
alter table sales add column if not exists internal_notes    text;
alter table sales add column if not exists fx_usd            numeric(12,6);
alter table sales add column if not exists fx_eur            numeric(12,6);
alter table sales add column if not exists fx_try            numeric(12,6) not null default 1;
alter table sales add column if not exists fx_source         text;
alter table sales add column if not exists fx_rate_date      date;
alter table sales add column if not exists fx_rate_try       numeric(12,6);
alter table sales add column if not exists company_snapshot  jsonb;
alter table sales add column if not exists customer_snapshot jsonb;
alter table sales add column if not exists shipped_at        timestamptz;
alter table sales add column if not exists delivered_at      timestamptz;
alter table sales add column if not exists updated_at        timestamptz not null default now();

-- sale_items
alter table sale_items add column if not exists company_id   uuid references companies(id) on delete cascade;
alter table sale_items add column if not exists sort_order   integer not null default 0;
alter table sale_items add column if not exists discount_pct numeric(5,2) not null default 0;
alter table sale_items add column if not exists line_total   numeric(12,2) not null default 0;

-- sale_item_allocations
alter table sale_item_allocations add column if not exists company_id    uuid references companies(id) on delete cascade;
alter table sale_item_allocations add column if not exists cost_price    numeric(12,4) not null default 0;
alter table sale_item_allocations add column if not exists cost_currency text not null default 'TRY';

-- stock_lots
alter table stock_lots add column if not exists cost_price_try numeric(12,4);
alter table stock_lots add column if not exists cost_fx_rate   numeric(12,6);
alter table stock_lots add column if not exists cost_fx_source text;
alter table stock_lots add column if not exists lot_no         text;
alter table stock_lots add column if not exists received_at    date;

-- collections
alter table collections add column if not exists bank_id     uuid references banks(id) on delete set null;
alter table collections add column if not exists customer_id uuid references customers(id) on delete set null;
alter table collections add column if not exists updated_at  timestamptz not null default now();

-- tasks
alter table tasks add column if not exists related_sale_id uuid references sales(id) on delete set null;
alter table tasks add column if not exists updated_at      timestamptz not null default now();

-- expenses
alter table expenses add column if not exists expense_date date;
alter table expenses add column if not exists category     text;

-- partners
alter table partners add column if not exists share_pct  numeric(5,2);
alter table partners add column if not exists updated_at timestamptz not null default now();

-- partner_loans
alter table partner_loans add column if not exists direction  text not null default 'to_partner';
alter table partner_loans add column if not exists loan_date  date;
alter table partner_loans add column if not exists updated_at timestamptz not null default now();

-- idempotency_keys
alter table idempotency_keys add column if not exists request_hash text;

-- jobs
alter table jobs add column if not exists max_attempts integer not null default 3;
alter table jobs add column if not exists run_at       timestamptz not null default now();
alter table jobs add column if not exists started_at   timestamptz;
alter table jobs add column if not exists result       jsonb;

-- interest_rates
alter table interest_rates add column if not exists source       text not null default 'manual';
alter table interest_rates add column if not exists effective_at date;

-- audit_log
alter table audit_log add column if not exists ip_address text;
alter table audit_log add column if not exists user_agent text;
alter table audit_log add column if not exists table_name text;
alter table audit_log add column if not exists record_id  uuid;
alter table audit_log add column if not exists old_data   jsonb;
alter table audit_log add column if not exists new_data   jsonb;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION D  —  PAYMENT STATUS CAST REPAIR
-- Converts sales.payment_status from plain text to payment_status_enum safely
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  col_type text;
begin
  select data_type into col_type
  from   information_schema.columns
  where  table_schema = 'public'
    and  table_name   = 'sales'
    and  column_name  = 'payment_status';

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
-- SECTION E  —  DATA BACKFILLS
-- ─────────────────────────────────────────────────────────────────────────────

update proforma_items pi
set    company_id = p.company_id
from   proformas p
where  pi.proforma_id = p.id
  and  pi.company_id  is null;

update sale_items si
set    company_id = s.company_id
from   sales s
where  si.sale_id    = s.id
  and  si.company_id is null;

update sale_item_allocations sia
set    company_id = l.company_id
from   stock_lots l
where  sia.lot_id      = l.id
  and  sia.company_id  is null;

update sales set updated_at = created_at where updated_at is null;

update proformas
set    valid_until = (created_at::date + validity_days * interval '1 day')::date
where  valid_until is null and validity_days is not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION F  —  CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  alter table idempotency_keys
    add constraint uq_idempotency_user_key unique (user_id, idempotency_key);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table company_members
    add constraint uq_company_member unique (company_id, user_id);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table user_settings
    add constraint uq_user_settings unique (user_id);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table proformas
    add constraint uq_proforma_no unique (company_id, proforma_no);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table company_members
    add constraint chk_member_role check (role in ('admin','manager','viewer'));
exception when duplicate_table or duplicate_object then null;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION G  —  FOREIGN KEYS (idempotent DO blocks)
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='tasks'::regclass and conname='fk_tasks_customer') then
    alter table tasks add constraint fk_tasks_customer
      foreign key (related_customer_id) references customers(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='tasks'::regclass and conname='fk_tasks_sale') then
    alter table tasks add constraint fk_tasks_sale
      foreign key (related_sale_id) references sales(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='proforma_items'::regclass and conname='fk_proforma_items_company') then
    alter table proforma_items add constraint fk_proforma_items_company
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sale_items'::regclass and conname='fk_sale_items_company') then
    alter table sale_items add constraint fk_sale_items_company
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sale_item_allocations'::regclass and conname='fk_sia_company') then
    alter table sale_item_allocations add constraint fk_sia_company
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='collections'::regclass and conname='fk_collections_bank') then
    alter table collections add constraint fk_collections_bank
      foreign key (bank_id) references banks(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sales'::regclass and conname='fk_sales_bank') then
    alter table sales add constraint fk_sales_bank
      foreign key (bank_id) references banks(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='sales'::regclass and conname='fk_sales_proforma') then
    alter table sales add constraint fk_sales_proforma
      foreign key (proforma_id) references proformas(id) on delete set null;
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='proformas'::regclass and conname='fk_proformas_bank') then
    alter table proformas add constraint fk_proformas_bank
      foreign key (bank_id) references banks(id) on delete set null;
  end if;
exception when others then null;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION H  —  INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_company_members_user_id    on company_members(user_id);
create index if not exists idx_company_members_company_id on company_members(company_id);
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
create index if not exists idx_audit_log_company_id       on audit_log(company_id, created_at desc);
create index if not exists idx_audit_log_user_id          on audit_log(user_id, created_at desc);
create index if not exists idx_interest_rates_company     on interest_rates(company_id, currency);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION I  —  ROW LEVEL SECURITY
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
alter table audit_log              enable row level security;
alter table interest_rates         enable row level security;

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

-- companies
drop policy if exists companies_member_select on companies;
create policy companies_member_select on companies for select
  using (is_company_member(id));

drop policy if exists companies_admin_write on companies;
create policy companies_admin_write on companies for all
  using (is_company_admin(id));

-- company_members
drop policy if exists company_members_select on company_members;
create policy company_members_select on company_members for select
  using (is_company_member(company_id));

drop policy if exists company_members_admin_write on company_members;
create policy company_members_admin_write on company_members for all
  using (is_company_admin(company_id));

-- user_settings
drop policy if exists user_settings_own on user_settings;
create policy user_settings_own on user_settings for all
  using (user_id = auth.uid());

-- customers
drop policy if exists customers_member on customers;
create policy customers_member on customers for all
  using (is_company_member(company_id));

-- products
drop policy if exists products_member on products;
create policy products_member on products for all
  using (is_company_member(company_id));

-- banks
drop policy if exists banks_member on banks;
create policy banks_member on banks for all
  using (is_company_member(company_id));

-- expenses
drop policy if exists expenses_member on expenses;
create policy expenses_member on expenses for all
  using (is_company_member(company_id));

-- partners
drop policy if exists partners_member on partners;
create policy partners_member on partners for all
  using (is_company_member(company_id));

-- partner_loans
drop policy if exists partner_loans_member on partner_loans;
create policy partner_loans_member on partner_loans for all
  using (is_company_member(company_id));

-- stock_lots
drop policy if exists stock_lots_member on stock_lots;
create policy stock_lots_member on stock_lots for all
  using (is_company_member(company_id));

-- stock_movements
drop policy if exists stock_movements_member on stock_movements;
create policy stock_movements_member on stock_movements for all
  using (is_company_member(company_id));

-- proformas
drop policy if exists proformas_member on proformas;
create policy proformas_member on proformas for all
  using (is_company_member(company_id));

-- proforma_items
drop policy if exists proforma_items_member on proforma_items;
create policy proforma_items_member on proforma_items for all
  using (is_company_member(company_id));

-- sales
drop policy if exists sales_member on sales;
create policy sales_member on sales for all
  using (is_company_member(company_id));

-- sale_items
drop policy if exists sale_items_member on sale_items;
create policy sale_items_member on sale_items for all
  using (is_company_member(company_id));

-- sale_item_allocations
drop policy if exists sia_member on sale_item_allocations;
create policy sia_member on sale_item_allocations for all
  using (is_company_member(company_id));

-- collections
drop policy if exists collections_member on collections;
create policy collections_member on collections for all
  using (is_company_member(company_id));

-- tasks
drop policy if exists tasks_member on tasks;
create policy tasks_member on tasks for all
  using (is_company_member(company_id));

-- jobs
drop policy if exists jobs_member on jobs;
create policy jobs_member on jobs for all
  using (company_id is null or is_company_member(company_id));

-- audit_log (admin read-only)
drop policy if exists audit_log_admin on audit_log;
create policy audit_log_admin on audit_log for select
  using (is_company_admin(company_id));

-- interest_rates
drop policy if exists interest_rates_member on interest_rates;
create policy interest_rates_member on interest_rates for all
  using (is_company_member(company_id));

-- idempotency_keys
drop policy if exists idempotency_own_rows on idempotency_keys;
create policy idempotency_own_rows on idempotency_keys for all
  using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION J  —  SECURITY DEFINER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- J1: bootstrap_user_company
-- Called on every request via resolveCompanyId(). Creates company + member +
-- user_settings atomically for new users. Safe to call repeatedly.
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
    if exists (
      select 1 from company_members
      where company_id = p_company_id and user_id = p_user_id
    ) then
      return jsonb_build_object('company_id', p_company_id, 'bootstrapped', false);
    end if;
  end if;

  select active_company_id into v_company_id
  from user_settings where user_id = p_user_id;

  if v_company_id is null then
    select company_id into v_company_id
    from company_members
    where user_id = p_user_id
    order by created_at limit 1;
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

  return jsonb_build_object(
    'company_id',   v_company_id,
    'member_id',    v_member_id,
    'bootstrapped', true
  );
end $$;


-- J2: create_proforma_atomic
-- Atomic proforma header + items insert with sequential proforma_no.
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
    select company_id into v_company_id
    from company_members where user_id = p_user_id order by created_at limit 1;
  end if;

  if v_company_id is null then
    raise exception 'COMPANY_NOT_RESOLVED' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from company_members
    where company_id = v_company_id and user_id = p_user_id
  ) then raise exception 'FORBIDDEN' using errcode = 'P0003'; end if;

  select coalesce(max(
    (regexp_match(proforma_no, 'PRF-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from proformas
  where company_id = v_company_id and proforma_no like 'PRF-' || v_year || '-%';

  v_proforma_no := 'PRF-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into proformas (
    company_id, user_id, customer_id, bank_id, proforma_no,
    customer_name, currency, total, status, validity_days,
    valid_until, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  )
  values (
    v_company_id, p_user_id, p_customer_id, p_bank_id, v_proforma_no,
    coalesce(p_customer_name, ''), p_currency, p_total, 'draft', p_validity_days,
    (now()::date + p_validity_days * interval '1 day')::date,
    p_notes, p_internal_notes,
    p_fx_usd, p_fx_eur, p_fx_try, p_fx_source,
    case when p_fx_rate_date ~ '^\d{4}-\d{2}-\d{2}$' then p_fx_rate_date::date else null end,
    p_fx_rate_try, p_company_snapshot, p_customer_snapshot
  )
  returning id into v_proforma_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into proforma_items (
      proforma_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order
    )
    values (
      v_proforma_id, v_company_id,
      nullif((v_item->>'product_id')::text, '')::uuid,
      coalesce(v_item->>'product_name', ''),
      coalesce((v_item->>'qty')::numeric, 1),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce(v_item->>'currency', p_currency),
      coalesce((v_item->>'discount_pct')::numeric, 0),
      coalesce((v_item->>'line_total')::numeric, 0),
      v_item->>'notes', v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return jsonb_build_object('id', v_proforma_id, 'proforma_no', v_proforma_no);
end $$;


-- J3: convert_proforma_to_sale
-- FIFO stock allocation. Creates a confirmed sale from a proforma.
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
  if not exists (
    select 1 from company_members
    where company_id = v_proforma.company_id and user_id = p_user_id
  ) then raise exception 'FORBIDDEN'; end if;

  select coalesce(max(
    (regexp_match(sale_no, 'SAL-' || v_year || '-(\d+)'))[1]::integer
  ), 0) + 1
  into v_seq
  from sales
  where company_id = v_proforma.company_id and sale_no like 'SAL-' || v_year || '-%';

  v_sale_no := 'SAL-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into sales (
    company_id, user_id, customer_id, bank_id, proforma_id,
    sale_no, customer_name, currency, total, payment_status,
    sale_date, due_date, notes, internal_notes,
    fx_usd, fx_eur, fx_try, fx_source, fx_rate_date, fx_rate_try,
    company_snapshot, customer_snapshot
  )
  values (
    v_proforma.company_id, p_user_id, v_proforma.customer_id,
    coalesce(p_bank_id, v_proforma.bank_id), p_proforma_id,
    v_sale_no, v_proforma.customer_name, v_proforma.currency, v_proforma.total,
    'pending',
    coalesce(p_sale_date, now()::date), p_due_date, p_notes, p_internal_notes,
    v_proforma.fx_usd, v_proforma.fx_eur, v_proforma.fx_try,
    v_proforma.fx_source, v_proforma.fx_rate_date, v_proforma.fx_rate_try,
    v_proforma.company_snapshot, v_proforma.customer_snapshot
  )
  returning id into v_sale_id;

  for v_item in
    select * from proforma_items where proforma_id = p_proforma_id order by sort_order
  loop
    insert into sale_items (
      sale_id, company_id, product_id, product_name,
      qty, unit_price, currency, discount_pct, line_total, notes, sort_order
    )
    values (
      v_sale_id, v_proforma.company_id, v_item.product_id, v_item.product_name,
      v_item.qty, v_item.unit_price, v_item.currency,
      v_item.discount_pct, v_item.line_total, v_item.notes, v_item.sort_order
    )
    returning id into v_sale_item_id;

    if v_item.product_id is not null then
      v_qty_needed := v_item.qty;
      for v_lot in
        select * from stock_lots
        where product_id  = v_item.product_id
          and company_id  = v_proforma.company_id
          and qty_remaining > 0
          and deleted_at is null
        order by coalesce(received_at, created_at::date), created_at
      loop
        exit when v_qty_needed <= 0;
        v_alloc_qty := least(v_qty_needed, v_lot.qty_remaining);

        insert into sale_item_allocations (
          company_id, sale_item_id, lot_id, qty_allocated, cost_price, cost_currency
        )
        values (
          v_proforma.company_id, v_sale_item_id, v_lot.id,
          v_alloc_qty, v_lot.cost_price, v_lot.cost_currency
        );

        update stock_lots
        set qty_remaining = qty_remaining - v_alloc_qty, updated_at = now()
        where id = v_lot.id;

        insert into stock_movements (
          company_id, product_id, lot_id, type, qty, unit_cost, currency, reference_id
        )
        values (
          v_proforma.company_id, v_item.product_id, v_lot.id,
          'sale_out', -v_alloc_qty, v_lot.cost_price, v_lot.cost_currency, v_sale_id
        );

        v_qty_needed := v_qty_needed - v_alloc_qty;
      end loop;
    end if;
  end loop;

  update proformas
  set status = 'converted', converted_at = now(), updated_at = now()
  where id = p_proforma_id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no);
end $$;


-- J5: purge_expired_idempotency_keys
create or replace function public.purge_expired_idempotency_keys()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  delete from idempotency_keys where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- J7: restore_user_data — atomic backup restore (admin only)
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

  -- Soft-delete current live data
  update customers  set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update products   set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update expenses   set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update proformas  set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update sales      set deleted_at = now() where company_id = p_company_id and deleted_at is null;
  update stock_lots set deleted_at = now() where company_id = p_company_id and deleted_at is null;

  -- Hard-delete allocation tables (no deleted_at)
  delete from sale_item_allocations where company_id = p_company_id;
  delete from stock_movements       where company_id = p_company_id;

  -- Restore snapshot data
  insert into customers  select * from jsonb_populate_recordset(null::customers,  p_customers)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into products   select * from jsonb_populate_recordset(null::products,   p_products)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into expenses   select * from jsonb_populate_recordset(null::expenses,   p_expenses)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into proformas  select * from jsonb_populate_recordset(null::proformas,  p_proformas)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into proforma_items select * from jsonb_populate_recordset(null::proforma_items, p_proforma_items)
    on conflict (id) do nothing;
  insert into stock_lots select * from jsonb_populate_recordset(null::stock_lots, p_stock_lots)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into stock_movements select * from jsonb_populate_recordset(null::stock_movements, p_stock_movements)
    on conflict (id) do nothing;
  insert into sales      select * from jsonb_populate_recordset(null::sales,      p_sales)
    on conflict (id) do update set deleted_at = null, updated_at = now();
  insert into sale_items select * from jsonb_populate_recordset(null::sale_items, p_sale_items)
    on conflict (id) do nothing;
  insert into sale_item_allocations select * from jsonb_populate_recordset(null::sale_item_allocations, p_sale_item_allocations)
    on conflict (id) do nothing;

  return jsonb_build_object('restored', true, 'company_id', p_company_id);
end $$;


-- J8: Job queue helpers
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
  update jobs
  set status = 'done', completed_at = now(), result = p_result, updated_at = now()
  where id = p_job_id;
end $$;

create or replace function public.fail_job(p_job_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update jobs
  set status     = case when attempts >= max_attempts then 'failed' else 'pending' end,
      error      = p_error,
      run_at     = case when attempts >= max_attempts then run_at else now() + interval '60 seconds' end,
      updated_at = now()
  where id = p_job_id;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION K  —  PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke public execute on security definer functions
revoke execute on function public.bootstrap_user_company(uuid, uuid, text)       from public;
revoke execute on function public.create_proforma_atomic(uuid, uuid, uuid, text, text, integer, text, text, numeric, numeric, numeric, numeric, text, text, numeric, jsonb, jsonb, jsonb, uuid) from public;
revoke execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) from public;
revoke execute on function public.purge_expired_idempotency_keys()               from public;
revoke execute on function public.restore_user_data(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.enqueue_job(text, jsonb, uuid, timestamptz)   from public;
revoke execute on function public.claim_next_job(text)                           from public;
revoke execute on function public.complete_job(uuid, jsonb)                      from public;
revoke execute on function public.fail_job(uuid, text)                           from public;
revoke execute on function public.is_company_member(uuid)                        from public;
revoke execute on function public.is_company_admin(uuid)                         from public;

-- Grant to authenticated
grant execute on function public.bootstrap_user_company(uuid, uuid, text)        to authenticated;
grant execute on function public.create_proforma_atomic(uuid, uuid, uuid, text, text, integer, text, text, numeric, numeric, numeric, numeric, text, text, numeric, jsonb, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text) to authenticated;
grant execute on function public.restore_user_data(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.is_company_member(uuid)                          to authenticated;
grant execute on function public.is_company_admin(uuid)                           to authenticated;

-- service_role for server-side workers
grant execute on function public.purge_expired_idempotency_keys()                to service_role;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz)     to service_role;
grant execute on function public.claim_next_job(text)                            to service_role;
grant execute on function public.complete_job(uuid, jsonb)                       to service_role;
grant execute on function public.fail_job(uuid, text)                            to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION L  —  db_audit.sql BUG CORRECTIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- Apply these fixes manually to supabase/db_audit.sql:
--
-- BUG 1 — sale_item_allocations has no deleted_at column (it is hard-deleted).
--   Remove every occurrence of `and a.deleted_at is null` where `a` aliases
--   sale_item_allocations. Affects ZERO_COST_LOT and over-allocation checks.
--
-- BUG 2 — Over-allocated lots HAVING clause:
--   Change `having l.qty_remaining < 0`
--   to     `having sum(a.qty_allocated) > max(l.qty_initial)`
--   This catches over-allocation even when qty_remaining was manually zeroed.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF repair_production.sql
--
-- Verify after running:
--   select count(*) from companies;
--   select count(*) from company_members;
--   select proforma_no from proformas limit 3;
--   select * from tasks limit 3;
--   select routine_name from information_schema.routines
--     where routine_schema = 'public' and routine_type = 'FUNCTION'
--     order by routine_name;
-- ═══════════════════════════════════════════════════════════════════════════════
