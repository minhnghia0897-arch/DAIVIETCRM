-- Telegram cho đội (CLAUDE.md 10.3 telegram_bot, 16; docs/integrations/telegram_bot.md; kế hoạch đã duyệt 07/10/2026).
-- Nguyên tắc:
--   * Nhân viên tự liên kết tài khoản Telegram với tài khoản CRM bằng mã một lần (lưu dạng băm, hết hạn 10 phút).
--   * Bot chạy ở server bằng service_role. Mọi việc bot làm thay một người (ghi chú, xong việc) đi qua hàm
--     telegram_act_as(): kiểm người đó còn hoạt động, kiểm quyền như khi bấm trên CRM, rồi chạy dưới danh tính của họ
--     để sự kiện, nhật ký ghi đúng người làm.
--   * Nhóm Telegram nhận diện theo chat_id (không theo tên), chỉ đăng tin khi Owner đã gán công dụng.
--   * Khóa người dùng thì thu hồi liên kết Telegram ngay trong cùng giao dịch.

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  user_id uuid not null references public.profiles (id),
  telegram_user_id bigint not null,
  chat_id bigint not null,
  username text,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

-- Mỗi người, mỗi tài khoản Telegram chỉ có một liên kết đang dùng.
create unique index telegram_links_user_active on public.telegram_links (user_id) where revoked_at is null;
create unique index telegram_links_tg_active on public.telegram_links (showroom_id, telegram_user_id)
  where revoked_at is null;

create trigger telegram_links_updated_at before update on public.telegram_links
  for each row execute function public.set_updated_at();

create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  user_id uuid not null references public.profiles (id),
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create table public.telegram_groups (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  chat_id bigint not null unique,
  title text not null default '',
  purpose text not null default 'unused'
    check (purpose in ('general', 'delivery', 'care', 'announce', 'unused')),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'lost')),
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

-- Mỗi công dụng chỉ một nhóm đang hoạt động trong một showroom.
create unique index telegram_groups_purpose_active on public.telegram_groups (showroom_id, purpose)
  where status = 'active' and purpose <> 'unused';

create trigger telegram_groups_updated_at before update on public.telegram_groups
  for each row execute function public.set_updated_at();

-- Tin bot đã gửi gắn với lead hay việc nào, để biết người dùng đang trả lời tin về cái gì.
create table public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  chat_id bigint not null,
  message_id bigint not null,
  user_id uuid references public.profiles (id),
  lead_id uuid references public.leads (id),
  task_id uuid references public.tasks (id),
  event_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (chat_id, message_id)
);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles (id),
  showroom_id uuid not null references public.showrooms (id),
  level text not null default 'short' check (level in ('short', 'detail')),
  events jsonb not null default '{}'::jsonb,
  quiet_from time,
  quiet_to time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create trigger notification_prefs_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_groups enable row level security;
alter table public.telegram_messages enable row level security;
alter table public.notification_prefs enable row level security;

create policy telegram_links_select on public.telegram_links for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (user_id = public.effective_uid() or public.has_perm('settings.integrations'))
  );

-- Mã liên kết: không ai đọc trực tiếp; chỉ sinh qua create_telegram_link_code().
-- telegram_messages: chỉ bot (service_role) dùng.

create policy telegram_groups_select on public.telegram_groups for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations'));

create policy notification_prefs_select on public.notification_prefs for select to authenticated
  using (user_id = public.effective_uid());
create policy notification_prefs_insert on public.notification_prefs for insert to authenticated
  with check (
    user_id = auth.uid() and showroom_id = public.current_showroom_id() and (public.active_view_as()).id is null
  );
create policy notification_prefs_update on public.notification_prefs for update to authenticated
  using (user_id = auth.uid() and (public.active_view_as()).id is null)
  with check (user_id = auth.uid());

revoke insert, update, delete on public.telegram_links, public.telegram_link_codes, public.telegram_groups,
  public.telegram_messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Liên kết tài khoản
-- ---------------------------------------------------------------------------

-- Người đăng nhập lấy mã liên kết cho chính mình. Trả mã gốc một lần; bảng chỉ giữ bản băm.
create or replace function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.current_showroom_id();
  v_code text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if auth.uid() is null or v_showroom is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  -- Mã cũ chưa dùng của người này hết hiệu lực.
  update public.telegram_link_codes set expires_at = now()
  where user_id = auth.uid() and used_at is null and expires_at > now();
  insert into public.telegram_link_codes (showroom_id, user_id, code_hash, expires_at, created_by)
  values (v_showroom, auth.uid(), encode(extensions.digest(v_code, 'sha256'), 'hex'), now() + interval '10 minutes',
          auth.uid());
  perform public.write_audit('telegram.link_code', 'telegram_links', auth.uid()::text, '{}'::jsonb);
  return v_code;
end;
$$;

revoke execute on function public.create_telegram_link_code() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;

-- Bot đổi mã lấy liên kết (service_role). Trả user_id khi thành công, null khi mã sai, hết hạn, đã dùng,
-- hoặc người dùng đã bị khóa.
create or replace function public.redeem_telegram_link_code(
  p_code text,
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_username text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.telegram_link_codes;
begin
  update public.telegram_link_codes c
  set used_at = now()
  from public.profiles p
  where c.code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex')
    and c.used_at is null
    and c.expires_at > now()
    and p.id = c.user_id
    and p.is_active
  returning c.* into v_row;
  if not found then
    return null;
  end if;

  -- Một tài khoản Telegram chỉ gắn một người, một người chỉ một tài khoản Telegram.
  update public.telegram_links set revoked_at = now()
  where revoked_at is null
    and (user_id = v_row.user_id or (showroom_id = v_row.showroom_id and telegram_user_id = p_telegram_user_id));

  insert into public.telegram_links (showroom_id, user_id, telegram_user_id, chat_id, username, created_by)
  values (v_row.showroom_id, v_row.user_id, p_telegram_user_id, p_chat_id, p_username, v_row.user_id);

  insert into public.audit_logs (showroom_id, actor_type, actor_id, action, entity, entity_id, metadata)
  values (v_row.showroom_id, 'user', v_row.user_id, 'telegram.linked', 'telegram_links', v_row.user_id::text,
          '{}'::jsonb);
  return v_row.user_id;
end;
$$;

revoke execute on function public.redeem_telegram_link_code(text, bigint, bigint, text)
  from public, anon, authenticated;

-- Người dùng tự gỡ liên kết của mình.
create or replace function public.revoke_my_telegram_link()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (public.active_view_as()).id is not null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.telegram_links set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  if not found then
    return false;
  end if;
  perform public.write_audit('telegram.unlinked', 'telegram_links', auth.uid()::text, '{}'::jsonb);
  return true;
end;
$$;

revoke execute on function public.revoke_my_telegram_link() from public, anon;
grant execute on function public.revoke_my_telegram_link() to authenticated;

-- Khóa người dùng: thu hồi liên kết Telegram ngay.
create or replace function public.revoke_telegram_on_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    update public.telegram_links set revoked_at = now() where user_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_revoke_telegram after update of is_active on public.profiles
  for each row execute function public.revoke_telegram_on_lock();

-- ---------------------------------------------------------------------------
-- Bot làm thay một người
-- ---------------------------------------------------------------------------

-- Người đứng sau một tài khoản Telegram (liên kết còn hiệu lực, người dùng còn hoạt động).
create or replace function public.telegram_user(p_telegram_user_id bigint)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id
  from public.telegram_links l
  join public.profiles p on p.id = l.user_id
  where l.telegram_user_id = p_telegram_user_id and l.revoked_at is null and p.is_active
  limit 1;
$$;

revoke execute on function public.telegram_user(bigint) from public, anon, authenticated;

-- Chạy phần còn lại của giao dịch dưới danh tính người dùng (auth.uid() trả về họ), để trigger, record_event,
-- write_audit ghi đúng người làm. Chỉ dùng bên trong các hàm telegram_* dưới đây.
create or replace function public.telegram_act_as(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

revoke execute on function public.telegram_act_as(uuid) from public, anon, authenticated;

-- Ghi chú (kèm ảnh nếu có) vào hồ sơ lead từ tin trả lời trên Telegram.
-- Quyền như sửa lead trên CRM: lead.edit_all, hoặc lead.edit_own với lead đang giao cho người đó.
create or replace function public.telegram_add_note(
  p_telegram_user_id bigint,
  p_lead_id uuid,
  p_text text,
  p_file_path text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_user(p_telegram_user_id);
  v_lead public.leads;
begin
  if v_user is null then
    raise exception 'telegram account not linked' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null;
  if not found then
    raise exception 'lead not found' using errcode = 'no_data_found';
  end if;
  if not (
    public.has_perm_for(v_user, 'lead.edit_all')
    or (public.has_perm_for(v_user, 'lead.edit_own') and v_lead.assigned_to = v_user)
  ) then
    raise exception 'not allowed to edit this lead' using errcode = '42501';
  end if;
  if coalesce(btrim(p_text), '') = '' and p_file_path is null then
    raise exception 'empty note' using errcode = '22023';
  end if;
  perform public.telegram_act_as(v_user);
  return public.record_event(
    'note', v_lead.showroom_id, v_lead.contact_id, v_lead.id,
    jsonb_strip_nulls(jsonb_build_object(
      'text', left(coalesce(btrim(p_text), ''), 4000),
      'channel', 'telegram',
      'file', p_file_path
    )),
    'user'
  );
end;
$$;

revoke execute on function public.telegram_add_note(bigint, uuid, text, text) from public, anon, authenticated;

-- Nút Xong / Hẹn lại dưới tin việc. Chỉ người đang được giao việc (hoặc có lead.assign) mới làm được.
create or replace function public.telegram_task_action(
  p_telegram_user_id bigint,
  p_task_id uuid,
  p_action text,
  p_minutes int default 60
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_user(p_telegram_user_id);
  v_task public.tasks;
begin
  if v_user is null then
    raise exception 'telegram account not linked' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'no_data_found';
  end if;
  if v_task.assigned_to is distinct from v_user and not public.has_perm_for(v_user, 'lead.assign') then
    raise exception 'task belongs to someone else' using errcode = '42501';
  end if;
  if v_task.status <> 'open' then
    return v_task.status;
  end if;
  perform public.telegram_act_as(v_user);
  if p_action = 'done' then
    update public.tasks set status = 'done', outcome = 'Xong từ Telegram' where id = p_task_id;
    return 'done';
  elsif p_action = 'snooze' then
    update public.tasks set due_at = greatest(due_at, now()) + make_interval(mins => least(greatest(p_minutes, 5), 1440))
    where id = p_task_id;
    return 'snoozed';
  end if;
  raise exception 'unknown action' using errcode = '22023';
end;
$$;

revoke execute on function public.telegram_task_action(bigint, uuid, text, int) from public, anon, authenticated;

-- Gán công dụng cho một nhóm Telegram bằng lệnh /gan trong nhóm. Người gõ phải có settings.integrations.
create or replace function public.telegram_assign_group(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_title text,
  p_purpose text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_user(p_telegram_user_id);
  v_showroom uuid;
begin
  if v_user is null or not public.has_perm_for(v_user, 'settings.integrations') then
    raise exception 'not allowed to assign groups' using errcode = '42501';
  end if;
  if p_purpose not in ('general', 'delivery', 'care', 'announce', 'unused') then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;
  select showroom_id into v_showroom from public.profiles where id = v_user;
  -- Nhóm đang giữ công dụng này chuyển "Ngưng".
  update public.telegram_groups set status = 'inactive'
  where showroom_id = v_showroom and purpose = p_purpose and status = 'active' and chat_id <> p_chat_id;
  insert into public.telegram_groups (showroom_id, chat_id, title, purpose, status, assigned_by, assigned_at)
  values (v_showroom, p_chat_id, coalesce(p_title, ''), p_purpose,
          case when p_purpose = 'unused' then 'inactive' else 'active' end, v_user, now())
  on conflict (chat_id) do update
    set title = excluded.title, purpose = excluded.purpose, status = excluded.status,
        assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at;
  insert into public.audit_logs (showroom_id, actor_type, actor_id, action, entity, entity_id, metadata)
  values (v_showroom, 'user', v_user, 'telegram.group_assigned', 'telegram_groups', p_chat_id::text,
          jsonb_build_object('purpose', p_purpose));
  return p_purpose;
end;
$$;

revoke execute on function public.telegram_assign_group(bigint, bigint, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ảnh, giấy tờ nhân viên gửi qua Telegram: kho riêng tư, chỉ bot (service_role) ghi; xem qua link ký ngắn hạn.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('telegram-attachments', 'telegram-attachments', false, 20971520)
on conflict (id) do nothing;
