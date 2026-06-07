-- workflow_instance_items: present in FLOWRA_PRODUCTION_INSTALL.sql but missing from
-- pre-existing production DBs (this prod predates that canonical version). Idempotent.
create table if not exists workflow_instance_items (
  id              uuid        default gen_random_uuid() primary key,
  workflow_id     uuid        not null references workflow_instances(id) on delete cascade,
  item_key        text        not null,
  label           text        not null,
  is_required     boolean     not null default true,
  is_completed    boolean     not null default false,
  completed_at    timestamptz,
  completed_by    uuid        references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_workflow_items_workflow
  on workflow_instance_items (workflow_id);

alter table workflow_instance_items enable row level security;

drop policy if exists workflow_items_via_workflow on workflow_instance_items;
create policy workflow_items_via_workflow on workflow_instance_items
  for all using (
    workflow_id in (
      select id from workflow_instances
      where company_id in (
        select company_id from company_members where user_id = auth.uid()
      )
    )
  );

-- ensure anon has no write path
revoke insert, update, delete, truncate on workflow_instance_items from anon;
