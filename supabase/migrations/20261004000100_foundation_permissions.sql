-- Tuần 1: nền tảng, phân quyền, kiểm toán (CLAUDE.md mục 4, 5).
-- Quy ước: mọi bảng nghiệp vụ có showroom_id, created_at, updated_at, created_by; RLS bật cho mọi bảng.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tiện ích chung
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Bảng chỉ thêm: chặn mọi lệnh sửa, xóa (kể cả từ service role).
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------------------
-- Showroom, thị trường
-- ---------------------------------------------------------------------------

create table public.showrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  code text not null unique,
  name text not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  call_mode text not null default 'external' check (call_mode in ('external', 'provider')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger showrooms_updated_at before update on public.showrooms
  for each row execute function public.set_updated_at();

-- call_windows: [{ "days": [1,2,3,4,5], "start": "19:00", "end": "22:30" }, …] theo giờ địa phương của khách
-- (days theo ISO: 1 = thứ Hai … 7 = Chủ nhật).
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  name text not null,
  timezone text not null,
  call_windows jsonb not null default '[]'::jsonb,
  allowed_channels text[] not null default array['call', 'zalo_oa']::text[],
  color_token text not null default 'loc-other',
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, country_code)
);

create trigger markets_updated_at before update on public.markets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vai trò, quyền, hồ sơ người dùng
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  key text not null,
  name text not null,
  is_system boolean not null default false,
  -- Vai trò chủ hệ thống: duy nhất được giữ các quyền không cấp được.
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, key)
);

create unique index roles_one_owner_per_showroom on public.roles (showroom_id) where is_owner;

create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

create table public.permissions (
  key text primary key,
  "group" text not null,
  description text not null,
  grantable boolean not null default true,
  sensitive boolean not null default false
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (role_id, permission_key)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  showroom_id uuid not null references public.showrooms (id),
  full_name text not null,
  role_id uuid not null references public.roles (id),
  is_active boolean not null default true,
  call_extension text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index profiles_showroom_idx on public.profiles (showroom_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_permission_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  effect text not null check (effect in ('grant', 'revoke')),
  set_by uuid,
  set_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Nhật ký kiểm toán
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  showroom_id uuid references public.showrooms (id),
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'ai')),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  at timestamptz not null default now()
);

create index audit_logs_showroom_at_idx on public.audit_logs (showroom_id, at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, at desc);

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Hàm quyền
-- ---------------------------------------------------------------------------

create or replace function public.current_showroom_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.showroom_id from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

-- Quyền hiệu lực = quyền vai trò + cấp riêng − thu riêng; người bị khóa không có quyền nào.
create or replace function public.has_perm_for(uid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.is_active
      and not exists (
        select 1 from public.user_permission_overrides o
        where o.user_id = p.id and o.permission_key = perm and o.effect = 'revoke'
      )
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_id = p.role_id and rp.permission_key = perm
        )
        or exists (
          select 1 from public.user_permission_overrides o
          where o.user_id = p.id and o.permission_key = perm and o.effect = 'grant'
        )
      )
  );
$$;

create or replace function public.has_perm(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm_for(auth.uid(), perm);
$$;

-- Danh sách quyền hiệu lực của người đang đăng nhập, dùng cho can() phía giao diện.
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select perm.key from public.permissions perm where public.has_perm_for(auth.uid(), perm.key);
$$;

create or replace function public.is_owner_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = uid and p.is_active and r.is_owner
  );
$$;

-- Ghi kiểm toán từ hàm khác hoặc từ server.
create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_type text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.audit_logs (showroom_id, actor_type, actor_id, action, entity, entity_id, metadata)
  values (
    coalesce(public.current_showroom_id(), (p_metadata ->> 'showroom_id')::uuid),
    coalesce(p_actor_type, case when v_actor is null then 'system' else 'user' end),
    v_actor,
    p_action,
    p_entity,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ràng buộc quyền không cấp được (kiểm ở database, CLAUDE.md mục 5 nguyên tắc 2)
-- ---------------------------------------------------------------------------

create or replace function public.guard_role_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grantable boolean;
  v_is_owner boolean;
begin
  select grantable into v_grantable from public.permissions where key = new.permission_key;
  select is_owner into v_is_owner from public.roles where id = new.role_id;
  if not v_grantable and not v_is_owner then
    raise exception 'permission % can only belong to the owner role', new.permission_key
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger role_permissions_guard before insert or update on public.role_permissions
  for each row execute function public.guard_role_permission();

create or replace function public.guard_permission_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.permissions where key = new.permission_key and not grantable) then
    raise exception 'permission % cannot be overridden per user', new.permission_key
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger user_permission_overrides_guard before insert or update on public.user_permission_overrides
  for each row execute function public.guard_permission_override();

-- Không cho xóa quyền khỏi vai trò Owner (Owner luôn toàn quyền, trừ lead.receive do Owner tự bật).
create or replace function public.guard_owner_role_permission_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.roles where id = old.role_id and is_owner)
     and old.permission_key <> 'lead.receive'
     and current_setting('app.allow_owner_perm_delete', true) is distinct from 'on' then
    raise exception 'owner role permissions cannot be removed' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger role_permissions_owner_guard before delete on public.role_permissions
  for each row execute function public.guard_owner_role_permission_delete();

-- Quyền mới thêm vào code mặc định bật cho Owner (nguyên tắc 6), trừ lead.receive.
create or replace function public.grant_new_permission_to_owners()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key <> 'lead.receive' then
    insert into public.role_permissions (role_id, permission_key)
    select r.id, new.key from public.roles r where r.is_owner
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger permissions_grant_owner after insert on public.permissions
  for each row execute function public.grant_new_permission_to_owners();

-- ---------------------------------------------------------------------------
-- Kiểm toán mọi thay đổi quyền, vai trò, trạng thái người dùng (nguyên tắc 5)
-- ---------------------------------------------------------------------------

create or replace function public.audit_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  perform public.write_audit(
    case when tg_op = 'INSERT' then 'role_permission.grant' else 'role_permission.revoke' end,
    'roles',
    r.role_id::text,
    jsonb_build_object(
      'permission', r.permission_key,
      'before', tg_op <> 'INSERT',
      'after', tg_op = 'INSERT',
      'showroom_id', (select showroom_id from public.roles where id = r.role_id)
    )
  );
  return null;
end;
$$;

create trigger role_permissions_audit after insert or delete on public.role_permissions
  for each row execute function public.audit_role_permissions();

create or replace function public.audit_permission_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_perm text := coalesce(new.permission_key, old.permission_key);
begin
  perform public.write_audit(
    'user_permission.' || lower(tg_op),
    'profiles',
    v_user::text,
    jsonb_build_object(
      'permission', v_perm,
      'before', case when tg_op = 'INSERT' then null else old.effect end,
      'after', case when tg_op = 'DELETE' then null else new.effect end,
      'showroom_id', (select showroom_id from public.profiles where id = v_user)
    )
  );
  return null;
end;
$$;

create trigger user_permission_overrides_audit after insert or update or delete on public.user_permission_overrides
  for each row execute function public.audit_permission_overrides();

-- Chỉ người có quyền mới đổi vai trò, trạng thái; ghi kiểm toán trước và sau.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.role_id is distinct from old.role_id and not public.has_perm('settings.permissions') then
      raise exception 'not allowed to change role' using errcode = 'insufficient_privilege';
    end if;
    if new.is_active is distinct from old.is_active and not public.has_perm('settings.users') then
      raise exception 'not allowed to change user status' using errcode = 'insufficient_privilege';
    end if;
    if new.is_active is distinct from old.is_active and new.id = auth.uid() then
      raise exception 'cannot lock yourself' using errcode = 'check_violation';
    end if;
    if new.showroom_id is distinct from old.showroom_id then
      raise exception 'showroom cannot be changed' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.role_id is distinct from old.role_id then
    perform public.write_audit('profile.role_change', 'profiles', new.id::text,
      jsonb_build_object('before', old.role_id, 'after', new.role_id, 'showroom_id', new.showroom_id));
  end if;
  if new.is_active is distinct from old.is_active then
    perform public.write_audit(case when new.is_active then 'profile.unlock' else 'profile.lock' end,
      'profiles', new.id::text,
      jsonb_build_object('before', old.is_active, 'after', new.is_active, 'showroom_id', new.showroom_id));
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.showrooms enable row level security;
alter table public.markets enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.audit_logs enable row level security;

create policy showrooms_select on public.showrooms for select to authenticated
  using (id = public.current_showroom_id());

create policy markets_select on public.markets for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy markets_write on public.markets for all to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.assignment'))
  with check (showroom_id = public.current_showroom_id() and public.has_perm('settings.assignment'));

create policy roles_select on public.roles for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy roles_insert on public.roles for insert to authenticated
  with check (showroom_id = public.current_showroom_id() and public.has_perm('settings.permissions') and not is_owner and not is_system);
create policy roles_update on public.roles for update to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.permissions') and not is_system)
  with check (showroom_id = public.current_showroom_id() and not is_owner and not is_system);

create policy permissions_select on public.permissions for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.showroom_id = public.current_showroom_id()));
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (
    public.has_perm('settings.permissions')
    and exists (select 1 from public.roles r where r.id = role_id and r.showroom_id = public.current_showroom_id() and not r.is_owner)
  );
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (
    public.has_perm('settings.permissions')
    and exists (select 1 from public.roles r where r.id = role_id and r.showroom_id = public.current_showroom_id() and not r.is_owner)
  );

create policy profiles_select on public.profiles for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (showroom_id = public.current_showroom_id() and (public.has_perm('settings.users') or public.has_perm('settings.permissions')))
  with check (showroom_id = public.current_showroom_id());

create policy overrides_select on public.user_permission_overrides for select to authenticated
  using (
    user_id = auth.uid()
    or (public.has_perm('settings.permissions')
        and exists (select 1 from public.profiles p where p.id = user_id and p.showroom_id = public.current_showroom_id()))
  );
create policy overrides_write on public.user_permission_overrides for all to authenticated
  using (
    public.has_perm('settings.permissions')
    and exists (select 1 from public.profiles p where p.id = user_id and p.showroom_id = public.current_showroom_id())
  )
  with check (
    public.has_perm('settings.permissions')
    and exists (select 1 from public.profiles p where p.id = user_id and p.showroom_id = public.current_showroom_id())
  );

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('audit.view'));
-- Không có policy insert: chỉ ghi qua write_audit() hoặc service role.

grant execute on function public.has_perm(text) to authenticated;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.current_showroom_id() to authenticated;
revoke execute on function public.has_perm_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, jsonb, text) from public, anon, authenticated;
