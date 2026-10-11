-- Tuần 1: việc cần làm, hàng chờ duyệt, thông báo, đấu nối, hàng đợi (CLAUDE.md mục 4, 10.2).

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  type text not null check (type in (
    'callback', 'first_contact', 'post_delivery_call', 'consumable_reminder', 'occasion_reminder',
    'reactivation', 'delivery_step', 'warranty_followup', 'data_fix', 'other'
  )),
  title text not null,
  contact_id uuid references public.contacts (id),
  lead_id uuid references public.leads (id),
  order_id uuid,
  -- null: việc nằm ở hàng chung, chờ người có lead.assign giao.
  assigned_to uuid references public.profiles (id),
  due_at timestamptz not null,
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled', 'missed')),
  done_at timestamptz,
  outcome text,
  source text not null default 'user' check (source in ('user', 'rule', 'ai')),
  rule_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index tasks_assignee_open_idx on public.tasks (assigned_to, due_at) where status = 'open';
create index tasks_lead_idx on public.tasks (lead_id);
create index tasks_contact_idx on public.tasks (contact_id);

create table public.task_rules (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  rule_key text not null,
  name text not null,
  trigger jsonb not null,
  conditions jsonb not null default '{}'::jsonb,
  task_type text not null,
  title_template text not null,
  due_offset interval not null default interval '0',
  assignee text not null default 'lead_owner' check (assignee in ('lead_owner', 'order_seller', 'shared_queue')),
  priority smallint not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, rule_key)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  type text not null check (type in ('discount', 'payment_confirm', 'stock_count', 'ai_proposal')),
  entity text not null,
  entity_id uuid not null,
  requested_by uuid,
  requested_by_type text not null default 'user' check (requested_by_type in ('user', 'system', 'ai')),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index approvals_pending_idx on public.approvals (showroom_id, type) where status = 'pending';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.webhook_events (
  id bigint generated always as identity primary key,
  showroom_id uuid references public.showrooms (id),
  provider text not null,
  external_id text not null,
  event_type text,
  signature_valid boolean not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_id)
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  key text not null,
  status text not null default 'not_connected'
    check (status in ('not_available', 'not_connected', 'connecting', 'connected', 'error', 'paused')),
  enabled boolean not null default false,
  reply_mode text check (reply_mode in ('crm', 'external', 'off')),
  config jsonb not null default '{}'::jsonb,
  secret_ref text,
  prerequisites_done jsonb not null default '{}'::jsonb,
  connected_by uuid,
  connected_at timestamptz,
  last_event_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (showroom_id, key)
);

create table public.jobs (
  id bigint generated always as identity primary key,
  showroom_id uuid references public.showrooms (id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_due_idx on public.jobs (run_at) where status = 'pending';

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'task_rules', 'approvals', 'integrations', 'jobs'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Luật
-- ---------------------------------------------------------------------------

-- Quyền duyệt theo loại; người đề xuất không tự duyệt (trừ Owner, có ghi nhận riêng).
create or replace function public.approval_permission(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'discount' then 'order.discount_approve'
    when 'payment_confirm' then 'payment.confirm'
    when 'stock_count' then 'inventory.count_approve'
    when 'ai_proposal' then 'settings.permissions'
  end;
$$;

create or replace function public.guard_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'approval already decided' using errcode = 'check_violation';
    end if;
    if auth.uid() is not null then
      if not public.has_perm(public.approval_permission(new.type)) then
        raise exception 'not allowed to decide this approval' using errcode = 'insufficient_privilege';
      end if;
      if old.requested_by = auth.uid() and not public.is_owner_user(auth.uid()) then
        raise exception 'cannot approve your own request' using errcode = 'insufficient_privilege';
      end if;
      new.decided_by := auth.uid();
    end if;
    new.decided_at := now();
    perform public.write_audit('approval.' || new.status, 'approvals', new.id::text,
      jsonb_build_object('type', new.type, 'entity', new.entity, 'entity_id', new.entity_id,
        'self_approved', old.requested_by = auth.uid(), 'showroom_id', new.showroom_id));
  end if;
  return new;
end;
$$;

create trigger approvals_guard before update on public.approvals
  for each row execute function public.guard_approval_decision();

-- Giao việc cho người khác cần lead.assign; hoàn thành việc ghi sự kiện CDP.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.assigned_to is distinct from old.assigned_to
     and not public.has_perm('lead.assign') then
    raise exception 'not allowed to reassign tasks' using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.done_at := coalesce(new.done_at, now());
    perform public.record_event('task_done', new.showroom_id, new.contact_id, new.lead_id,
      jsonb_build_object('task_id', new.id, 'type', new.type, 'outcome', new.outcome));
  end if;
  return new;
end;
$$;

create trigger tasks_guard before update on public.tasks
  for each row execute function public.guard_task_update();

-- Khóa người dùng: việc đang mở về hàng chung, báo người có quyền giao việc.
create or replace function public.release_tasks_on_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    update public.tasks set assigned_to = null where assigned_to = new.id and status = 'open';
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select p.showroom_id, p.id, 'user_locked',
           'Lead và việc của ' || new.full_name || ' đã chuyển về hàng chưa phân', '/leads?filter=unassigned'
    from public.profiles p
    where p.showroom_id = new.showroom_id and p.id <> new.id and public.has_perm_for(p.id, 'lead.assign');
  end if;
  return new;
end;
$$;

create trigger profiles_release_tasks after update of is_active on public.profiles
  for each row execute function public.release_tasks_on_lock();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.task_rules enable row level security;
alter table public.approvals enable row level security;
alter table public.notifications enable row level security;
alter table public.webhook_events enable row level security;
alter table public.integrations enable row level security;
alter table public.jobs enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (assigned_to = auth.uid() or public.has_perm('lead.view_all'))
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    showroom_id = public.current_showroom_id()
    and (assigned_to = auth.uid() or public.has_perm('lead.assign'))
    and (lead_id is null or public.can_view_lead(lead_id))
    and (contact_id is null or public.can_view_contact(contact_id))
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (assigned_to = auth.uid() or public.has_perm('lead.assign'))
  )
  with check (showroom_id = public.current_showroom_id());

create policy task_rules_select on public.task_rules for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy task_rules_write on public.task_rules for all to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.assignment'))
  with check (showroom_id = public.current_showroom_id() and public.has_perm('settings.assignment'));

create policy approvals_select on public.approvals for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (requested_by = auth.uid() or public.has_perm(public.approval_permission(type)))
  );
create policy approvals_update on public.approvals for update to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm(public.approval_permission(type)))
  with check (showroom_id = public.current_showroom_id());
-- Không có policy insert: đề xuất được tạo qua hàm nghiệp vụ ở server.

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- webhook_events, jobs: không có policy, chỉ service role đọc ghi.

create policy integrations_select on public.integrations for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations'));
create policy integrations_write on public.integrations for all to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations'))
  with check (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations'));
