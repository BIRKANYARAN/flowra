-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Phase 14 — Purchase Orders
-- Lightweight supplier order tracking (pre-FIFO-lot stage).
--
-- Lifecycle: draft → ordered → received → cancelled
-- When status = received, user manually creates a Purchase (cost-basis entry).
-- ─────────────────────────────────────────────────────────────────────────────

-- Purchase orders header
create table if not exists purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  supplier_name text not null,
  order_date    date not null default current_date,
  expected_date date,
  status        text not null default 'draft'
                  check (status in ('draft', 'ordered', 'received', 'cancelled')),
  currency      text not null default 'TRY',
  total_try     numeric(15,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Line items per order
create table if not exists purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id        uuid references products(id) on delete set null,
  name              text not null,
  unit              text not null default 'adet',
  quantity          numeric(10,3) not null check (quantity > 0),
  unit_price        numeric(15,2) not null check (unit_price >= 0),
  currency          text not null default 'TRY',
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_purchase_orders_company   on purchase_orders(company_id, deleted_at);
create index if not exists idx_purchase_orders_status    on purchase_orders(company_id, status)    where deleted_at is null;
create index if not exists idx_purchase_order_items_ord  on purchase_order_items(purchase_order_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;

-- purchase_orders: only company members can read/write
create policy "po_company_member_rw" on purchase_orders
  for all using (
    company_id in (
      select company_id from company_members
      where user_id = auth.uid()
    )
  );

-- purchase_order_items: inherit via purchase_order's company
create policy "poi_company_member_rw" on purchase_order_items
  for all using (
    purchase_order_id in (
      select po.id from purchase_orders po
      join company_members cm on cm.company_id = po.company_id
      where cm.user_id = auth.uid()
        and po.deleted_at is null
    )
  );

-- ── Auto-update updated_at ─────────────────────────────────────────────────────
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
