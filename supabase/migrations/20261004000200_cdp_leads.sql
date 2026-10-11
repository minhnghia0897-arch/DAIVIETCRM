-- Tuần 1: nền CDP và lead (CLAUDE.md mục 1.1, 4, 5, 6).

-- ---------------------------------------------------------------------------
-- Danh mục tra cứu
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['lead_sources', 'lost_reasons', 'occasions', 'call_outcomes', 'budget_ranges'] loop
    execute format($f$
      create table public.%1$I (
        id uuid primary key default gen_random_uuid(),
        showroom_id uuid not null references public.showrooms (id),
        key text not null,
        label text not null,
        sort int not null default 0,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        created_by uuid,
        unique (showroom_id, key)
      );
      create trigger %1$s_updated_at before update on public.%1$I
        for each row execute function public.set_updated_at();
      alter table public.%1$I enable row level security;
      create policy %1$s_select on public.%1$I for select to authenticated
        using (showroom_id = public.current_showroom_id() and public.has_perm('catalog.view'));
      create policy %1$s_write on public.%1$I for all to authenticated
        using (showroom_id = public.current_showroom_id() and public.has_perm('catalog.manage'))
        with check (showroom_id = public.current_showroom_id() and public.has_perm('catalog.manage'));
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hộ, khách, định danh, đồng ý, ngày quan trọng
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  display_name text not null,
  province text,
  district text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  full_name text not null,
  -- Mã thị trường trong markets, hoặc 'unknown' khi chưa xác nhận.
  country_of_residence text not null default 'unknown',
  city text,
  province text,
  household_id uuid references public.households (id),
  relation_in_household text,
  contact_via_contact_id uuid references public.contacts (id),
  lifecycle_stage text not null default 'stranger'
    check (lifecycle_stage in ('stranger', 'lead', 'new_customer', 'active_owner', 'loyal', 'dormant', 'at_risk', 'do_not_contact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz,
  check (contact_via_contact_id is distinct from id)
);

create index contacts_showroom_idx on public.contacts (showroom_id) where deleted_at is null;
create index contacts_household_idx on public.contacts (household_id);

create table public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  type text not null check (type in ('phone', 'zalo_user_id', 'fb_psid', 'email', 'tiktok')),
  value text not null,
  value_raw text,
  -- Bản che để hiển thị cho người không có quyền xem số (tính ở server bằng lib/phone).
  display_masked text not null,
  is_primary boolean not null default false,
  is_valid boolean not null default true,
  verified_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, type, value)
);

create index contact_identities_contact_idx on public.contact_identities (contact_id);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  purpose text not null check (purpose in ('care', 'marketing', 'ads_measurement')),
  channel text not null check (channel in ('call', 'zalo_oa', 'zns', 'sms', 'email', 'all')),
  granted boolean not null,
  source text not null,
  provided_by_contact_id uuid references public.contacts (id),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index consents_contact_idx on public.consents (contact_id, purpose, channel);

create table public.important_dates (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  type text not null,
  date date not null,
  recurring_yearly boolean not null default true,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index important_dates_contact_idx on public.important_dates (contact_id);

-- ---------------------------------------------------------------------------
-- Lead
-- ---------------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  contact_id uuid not null references public.contacts (id),
  recipient_contact_id uuid references public.contacts (id),
  keep_surprise boolean not null default false,
  source text not null,
  source_detail jsonb not null default '{}'::jsonb,
  product_interest_id uuid,
  occasion_id uuid references public.occasions (id),
  occasion_date date,
  budget_range_id uuid references public.budget_ranges (id),
  recipient_province text,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'demo', 'quoted', 'deposit', 'won', 'lost')),
  lost_reason_id uuid references public.lost_reasons (id),
  assigned_to uuid references public.profiles (id),
  assigned_at timestamptz,
  first_contact_at timestamptz,
  sla_due_at timestamptz,
  window_wait_until timestamptz,
  score int not null default 0,
  flags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz,
  check (stage <> 'lost' or lost_reason_id is not null)
);

create index leads_assigned_idx on public.leads (showroom_id, assigned_to) where deleted_at is null;
create index leads_contact_idx on public.leads (contact_id);
create index leads_recipient_idx on public.leads (recipient_contact_id);
create index leads_open_idx on public.leads (showroom_id, stage) where deleted_at is null and stage not in ('won', 'lost');

-- ---------------------------------------------------------------------------
-- Dòng sự kiện CDP (chỉ thêm)
-- ---------------------------------------------------------------------------

create table public.events (
  id bigint generated always as identity primary key,
  showroom_id uuid not null references public.showrooms (id),
  type text not null,
  occurred_at timestamptz not null default now(),
  contact_id uuid references public.contacts (id),
  household_id uuid references public.households (id),
  lead_id uuid references public.leads (id),
  order_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'ai', 'customer')),
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb
);

create index events_contact_idx on public.events (contact_id, occurred_at desc);
create index events_lead_idx on public.events (lead_id, occurred_at desc);
create index events_household_idx on public.events (household_id, occurred_at desc);

create trigger events_append_only before update or delete on public.events
  for each row execute function public.forbid_mutation();

create view public.activities with (security_invoker = true) as
  select id, showroom_id, type, occurred_at, contact_id, household_id, lead_id, order_id, actor_type, actor_id, payload
  from public.events;

-- Giai đoạn vòng đời và tín hiệu (tính bằng job từ events; tháng 1 tạo bảng, luật tính ở tuần 6).
create table public.customer_lifecycle (
  contact_id uuid primary key references public.contacts (id) on delete cascade,
  showroom_id uuid not null references public.showrooms (id),
  stage text not null,
  stage_since timestamptz not null default now(),
  last_interaction_at timestamptz,
  total_paid bigint not null default 0,
  orders_count int not null default 0,
  owned_products jsonb not null default '[]'::jsonb,
  open_tasks int not null default 0,
  flags text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['households', 'contacts', 'contact_identities', 'consents', 'important_dates', 'leads'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hàm truy cập
-- ---------------------------------------------------------------------------

create or replace function public.can_view_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.deleted_at is null
      and l.showroom_id = public.current_showroom_id()
      and (public.has_perm('lead.view_all') or (public.has_perm('lead.view_own') and l.assigned_to = auth.uid()))
  );
$$;

-- Khách xem được khi: có quyền xem mọi lead, hoặc là người đặt, người nhận của lead đang giao cho mình.
-- (Tuần 6 bổ sung đường xem qua đơn hàng.)
create or replace function public.can_view_contact(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contacts c
    where c.id = p_contact_id
      and c.deleted_at is null
      and c.showroom_id = public.current_showroom_id()
      and (
        public.has_perm('lead.view_all')
        or (
          public.has_perm('lead.view_own')
          and exists (
            select 1 from public.leads l
            where l.deleted_at is null
              and l.assigned_to = auth.uid()
              and (l.contact_id = c.id or l.recipient_contact_id = c.id)
          )
        )
      )
  );
$$;

grant execute on function public.can_view_lead(uuid) to authenticated;
grant execute on function public.can_view_contact(uuid) to authenticated;

-- Ghi sự kiện CDP từ server hoặc trigger.
create or replace function public.record_event(
  p_type text,
  p_showroom_id uuid,
  p_contact_id uuid default null,
  p_lead_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_actor_type text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_household uuid;
begin
  if p_contact_id is not null then
    select household_id into v_household from public.contacts where id = p_contact_id;
  end if;
  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, actor_type, actor_id, payload)
  values (
    p_showroom_id, p_type, p_contact_id, v_household, p_lead_id,
    coalesce(p_actor_type, case when auth.uid() is null then 'system' else 'user' end),
    auth.uid(), coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.record_event(text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Luật nghiệp vụ trên lead
-- ---------------------------------------------------------------------------

-- Giao lead cần lead.assign; giai đoạn từ quoted trở đi chỉ do báo giá và đơn đặt (mục 6).
create or replace function public.guard_lead_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.assigned_to is distinct from old.assigned_to and not public.has_perm('lead.assign') then
      raise exception 'not allowed to assign leads' using errcode = 'insufficient_privilege';
    end if;
    if new.stage is distinct from old.stage
       and new.stage in ('quoted', 'deposit', 'won')
       and current_setting('app.stage_source', true) is distinct from 'sales' then
      raise exception 'stage % is set by quotes and orders only', new.stage using errcode = 'check_violation';
    end if;
    if new.stage = 'lost' and old.stage <> 'lost' and not public.has_perm('lead.mark_lost') then
      raise exception 'not allowed to mark leads as lost' using errcode = 'insufficient_privilege';
    end if;
    if new.deleted_at is distinct from old.deleted_at and not public.has_perm('lead.delete') then
      raise exception 'not allowed to delete leads' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.showroom_id is distinct from old.showroom_id then
    raise exception 'showroom cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger leads_guard before update on public.leads
  for each row execute function public.guard_lead_update();

create or replace function public.log_lead_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_event('lead_created', new.showroom_id, new.contact_id, new.id,
      jsonb_build_object('source', new.source));
    if new.assigned_to is not null then
      perform public.record_event('assignment', new.showroom_id, new.contact_id, new.id,
        jsonb_build_object('from', null, 'to', new.assigned_to));
    end if;
    return null;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    perform public.record_event('assignment', new.showroom_id, new.contact_id, new.id,
      jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to,
        'reason', current_setting('app.assignment_reason', true)));
  end if;
  if new.stage is distinct from old.stage then
    perform public.record_event('stage_change', new.showroom_id, new.contact_id, new.id,
      jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return null;
end;
$$;

create trigger leads_events after insert or update on public.leads
  for each row execute function public.log_lead_changes();

-- Khóa người dùng: trả ngay lead đang mở về hàng "Chưa phân" (mục 5).
create or replace function public.release_work_on_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    perform set_config('app.assignment_reason', 'user_locked', true);
    update public.leads
      set assigned_to = null
      where assigned_to = new.id and deleted_at is null and stage not in ('won', 'lost');
    perform set_config('app.assignment_reason', '', true);
  end if;
  return new;
end;
$$;

create trigger profiles_release_work after update of is_active on public.profiles
  for each row execute function public.release_work_on_lock();

-- ---------------------------------------------------------------------------
-- Số điện thoại: chỉ trả số đầy đủ qua hàm có kiểm quyền và ghi kiểm toán (mục 5)
-- ---------------------------------------------------------------------------

-- Bản che, ai xem được khách thì xem được.
create view public.contact_identity_display as
  select ci.id, ci.showroom_id, ci.contact_id, ci.type, ci.display_masked, ci.is_primary, ci.is_valid, ci.verified_at
  from public.contact_identities ci
  where public.can_view_contact(ci.contact_id);

grant select on public.contact_identity_display to authenticated;

create or replace function public.reveal_identity(p_identity_id uuid, p_lead_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ident public.contact_identities%rowtype;
  v_allowed boolean := false;
begin
  select * into v_ident from public.contact_identities where id = p_identity_id;
  if not found or v_ident.showroom_id is distinct from public.current_showroom_id() then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  if public.has_perm('contact.phone_reveal') then
    v_allowed := true;
  elsif public.has_perm('contact.phone_reveal_assigned') and p_lead_id is not null then
    select exists (
      select 1 from public.leads l
      where l.id = p_lead_id
        and l.deleted_at is null
        and l.assigned_to = auth.uid()
        and (
          l.contact_id = v_ident.contact_id
          or (l.recipient_contact_id = v_ident.contact_id and not l.keep_surprise)
        )
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'not allowed to reveal this identity' using errcode = 'insufficient_privilege';
  end if;

  perform public.write_audit('contact.reveal_identity', 'contact_identities', v_ident.id::text,
    jsonb_build_object('contact_id', v_ident.contact_id, 'lead_id', p_lead_id, 'type', v_ident.type));
  return v_ident.value;
end;
$$;

grant execute on function public.reveal_identity(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.consents enable row level security;
alter table public.important_dates enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
alter table public.customer_lifecycle enable row level security;

-- Hộ: thấy hộ có ít nhất một thành viên mình được xem.
create policy households_select on public.households for select to authenticated
  using (
    showroom_id = public.current_showroom_id() and deleted_at is null
    and (public.has_perm('lead.view_all')
         or exists (select 1 from public.contacts c where c.household_id = households.id and public.can_view_contact(c.id)))
  );
create policy households_write on public.households for all to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('household.manage'))
  with check (showroom_id = public.current_showroom_id() and public.has_perm('household.manage'));

create policy contacts_select on public.contacts for select to authenticated
  using (public.can_view_contact(id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (showroom_id = public.current_showroom_id() and public.has_perm('lead.create'));
create policy contacts_update on public.contacts for update to authenticated
  using (
    public.can_view_contact(id)
    and (public.has_perm('lead.edit_all') or public.has_perm('lead.edit_own'))
  )
  with check (showroom_id = public.current_showroom_id());

-- Số đầy đủ: chỉ người có contact.phone_reveal đọc trực tiếp; người khác dùng contact_identity_display và reveal_identity().
create policy contact_identities_select on public.contact_identities for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('contact.phone_reveal'));
create policy contact_identities_insert on public.contact_identities for insert to authenticated
  with check (showroom_id = public.current_showroom_id() and public.can_view_contact(contact_id));

create policy consents_select on public.consents for select to authenticated
  using (public.can_view_contact(contact_id));
create policy consents_insert on public.consents for insert to authenticated
  with check (showroom_id = public.current_showroom_id() and public.can_view_contact(contact_id));
create policy consents_update on public.consents for update to authenticated
  using (public.can_view_contact(contact_id))
  with check (showroom_id = public.current_showroom_id());

create policy important_dates_select on public.important_dates for select to authenticated
  using (public.can_view_contact(contact_id));
create policy important_dates_write on public.important_dates for all to authenticated
  using (public.can_view_contact(contact_id))
  with check (showroom_id = public.current_showroom_id() and public.can_view_contact(contact_id));

create policy leads_select on public.leads for select to authenticated
  using (
    showroom_id = public.current_showroom_id() and deleted_at is null
    and (public.has_perm('lead.view_all') or (public.has_perm('lead.view_own') and assigned_to = auth.uid()))
  );
create policy leads_insert on public.leads for insert to authenticated
  with check (showroom_id = public.current_showroom_id() and public.has_perm('lead.create'));
create policy leads_update on public.leads for update to authenticated
  using (
    showroom_id = public.current_showroom_id() and deleted_at is null
    and (public.has_perm('lead.edit_all') or (public.has_perm('lead.edit_own') and assigned_to = auth.uid())
         or public.has_perm('lead.assign'))
  )
  with check (showroom_id = public.current_showroom_id());

create policy events_select on public.events for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and ((lead_id is not null and public.can_view_lead(lead_id))
         or (contact_id is not null and public.can_view_contact(contact_id)))
  );

create policy customer_lifecycle_select on public.customer_lifecycle for select to authenticated
  using (public.can_view_contact(contact_id));
