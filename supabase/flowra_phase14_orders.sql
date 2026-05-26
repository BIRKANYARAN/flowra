-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Phase 14 — Purchase Orders (canonical schema)
-- Lightweight supplier order tracking integrated with FIFO cost-basis workflow.
--
-- Lifecycle: draft → ordered → received → cancelled
--   draft    — being prepared
--   ordered  — sent to supplier, awaiting delivery
--   received — goods received; user creates Purchase lot entry for FIFO
--   cancelled — abandoned
--
-- Auto-numbering: PO-YYYY-NNN via sequence + trigger
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Auto-number sequence ──────────────────────────────────────────────────────
create sequence if not exists purchase_order_seq start 1;

-- ── Purchase orders header ────────────────────────────────────────────────────
create table if not exists purchase_orders (
  id                     uuid        primary key default gen_random_uuid(),
  company_id             uuid        not null references companies(id) on delete cascade,
  user_id                uuid        not null references auth.users(id),
  po_number              text,                        -- PO-YYYY-NNN (auto-set by trigger)
  supplier_name          text        not null,
  status                 text        not null default 'draft'
                           check (status in ('draft', 'ordered', 'received', 'cancelled')),
  order_date             date        not null default current_date,
  expected_date          date,
  total_try              numeric(15,2) not null default 0,
  currency               text        not null default 'TRY',
  exchange_rate          numeric(10,4),               -- non-TRY orders
  notes                  text,
  received_by            uuid        references auth.users(id),
  received_at            timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── Line items per order ──────────────────────────────────────────────────────
create table if not exists purchase_order_items (
  id                uuid        primary key default gen_random_uuid(),
  purchase_order_id uuid        not null references purchase_orders(id) on delete cascade,
  product_id        uuid        references products(id) on delete set null,
  name              text        not null,
  unit              text        not null default 'adet',
  quantity          numeric(10,3) not null check (quantity > 0),
  unit_price        numeric(15,2) not null check (unit_price >= 0),
  received_quantity numeric(10,3) not null default 0,
  currency          text        not null default 'TRY',
  sort_order        int         not null default 0,
  notes             text,
  created_at        timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_purchase_orders_company
  on purchase_orders(company_id, deleted_at);

create index if not exists idx_purchase_orders_status
  on purchase_orders(company_id, status)
  where deleted_at is null;

create index if not exists idx_purchase_orders_order_date
  on purchase_orders(company_id, order_date desc)
  where deleted_at is null;

create index if not exists idx_purchase_order_items_order
  on purchase_order_items(purchase_order_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;

-- All authenticated company members may read and write purchase orders
create policy "po_company_member_select" on purchase_orders
  for select using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid()
    )
  );

create policy "po_company_member_insert" on purchase_orders
  for insert with check (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid()
    )
  );

create policy "po_company_member_update" on purchase_orders
  for update using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid()
    )
  );

-- Line items: inherit access via the parent purchase order
create policy "poi_company_member_select" on purchase_order_items
  for select using (
    purchase_order_id in (
      select po.id from purchase_orders po
      join company_members cm on cm.company_id = po.company_id
      where cm.user_id = auth.uid()
        and po.deleted_at is null
    )
  );

create policy "poi_company_member_insert" on purchase_order_items
  for insert with check (
    purchase_order_id in (
      select po.id from purchase_orders po
      join company_members cm on cm.company_id = po.company_id
      where cm.user_id = auth.uid()
        and po.deleted_at is null
    )
  );

create policy "poi_company_member_update" on purchase_order_items
  for update using (
    purchase_order_id in (
      select po.id from purchase_orders po
      join company_members cm on cm.company_id = po.company_id
      where cm.user_id = auth.uid()
        and po.deleted_at is null
    )
  );

-- ── Auto-number trigger: sets po_number = PO-YYYY-NNN on insert ──────────────
create or replace function fn_set_purchase_order_number()
returns trigger language plpgsql as $$
begin
  if new.po_number is null then
    new.po_number := 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('purchase_order_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_purchase_order_number on purchase_orders;
create trigger trg_set_purchase_order_number
  before insert on purchase_orders
  for each row execute function fn_set_purchase_order_number();

-- ── Auto-update updated_at ────────────────────────────────────────────────────
create or replace function fn_touch_purchase_orders()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_purchase_orders on purchase_orders;
create trigger trg_touch_purchase_orders
  before update on purchase_orders
  for each row execute function fn_touch_purchase_orders();
