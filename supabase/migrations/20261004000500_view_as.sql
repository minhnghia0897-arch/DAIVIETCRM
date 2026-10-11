-- "Xem như người dùng" (CLAUDE.md mục 11.1, DESIGN.md 4, 7): Owner thấy đúng dữ liệu một người khác thấy, chỉ đọc.
-- Cách làm: phiên xem như lưu ở view_as_sessions; server gửi mã phiên qua header x-view-as.
-- effective_uid() trả người được xem như khi phiên hợp lệ, mọi hàm quyền và policy đọc qua hàm này.
-- check_request() chạy trước mọi request của PostgREST và chặn mọi thao tác ghi khi đang xem như.

create table public.view_as_sessions (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  ended_at timestamptz,
  check (owner_id <> target_id)
);

alter table public.view_as_sessions enable row level security;

create or replace function public.view_as_header()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-view-as';
  return nullif(v, '')::uuid;
exception when others then
  return null;
end;
$$;

-- Phiên xem như hợp lệ: đúng người mở phiên, còn hạn, người mở vẫn có settings.users.
create or replace function public.active_view_as()
returns public.view_as_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.view_as_sessions s
  where s.id = public.view_as_header()
    and s.owner_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now()
    and public.has_perm_for(auth.uid(), 'settings.users');
$$;

create or replace function public.effective_uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.active_view_as()).target_id, auth.uid());
$$;

-- Người đang đăng nhập thật, người đang được xem như (nếu có), mã phiên.
create or replace function public.whoami()
returns table (real_uid uuid, effective_uid uuid, view_as_session_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid(), public.effective_uid(), (public.active_view_as()).id;
$$;

-- Quyền của chính người đăng nhập (bỏ qua phiên xem như), dùng cho việc mở, đóng phiên.
create or replace function public.has_real_perm(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm_for(auth.uid(), perm);
$$;

grant execute on function public.has_real_perm(text) to authenticated;
grant execute on function public.effective_uid() to authenticated;
grant execute on function public.whoami() to authenticated;

-- Chặn ghi khi đang xem như. GET (kể cả gọi hàm bằng GET) chạy trong giao dịch chỉ đọc của PostgREST.
create or replace function public.check_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.view_as_header() is not null
     and coalesce(current_setting('request.method', true), 'GET') not in ('GET', 'HEAD', 'OPTIONS') then
    raise exception 'read-only: viewing as another user' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

grant execute on function public.check_request() to authenticated, anon;

alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------------
-- Hàm quyền đọc theo người hiệu lực
-- ---------------------------------------------------------------------------

create or replace function public.current_showroom_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.showroom_id from public.profiles p where p.id = public.effective_uid() and p.is_active;
$$;

create or replace function public.has_perm(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm_for(public.effective_uid(), perm);
$$;

create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select perm.key from public.permissions perm where public.has_perm_for(public.effective_uid(), perm.key);
$$;

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
              and l.assigned_to = public.effective_uid()
              and (l.contact_id = c.id or l.recipient_contact_id = c.id)
          )
        )
      )
  );
$$;

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
      and (public.has_perm('lead.view_all')
           or (public.has_perm('lead.view_own') and l.assigned_to = public.effective_uid()))
  );
$$;

-- ---------------------------------------------------------------------------
-- Policy dùng người hiệu lực thay cho auth.uid()
-- ---------------------------------------------------------------------------

drop policy leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (
    showroom_id = public.current_showroom_id() and deleted_at is null
    and (public.has_perm('lead.view_all') or (public.has_perm('lead.view_own') and assigned_to = public.effective_uid()))
  );

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (assigned_to = public.effective_uid() or public.has_perm('lead.view_all'))
  );

drop policy approvals_select on public.approvals;
create policy approvals_select on public.approvals for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (requested_by = public.effective_uid() or public.has_perm(public.approval_permission(type)))
  );

drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = public.effective_uid());

drop policy overrides_select on public.user_permission_overrides;
create policy overrides_select on public.user_permission_overrides for select to authenticated
  using (
    user_id = public.effective_uid()
    or (public.has_perm('settings.permissions')
        and exists (select 1 from public.profiles p where p.id = user_id and p.showroom_id = public.current_showroom_id()))
  );

-- Phiên xem như: chỉ người mở phiên thấy và tạo được; không xem như Owner khác.
create policy view_as_sessions_select on public.view_as_sessions for select to authenticated
  using (owner_id = auth.uid());
create policy view_as_sessions_insert on public.view_as_sessions for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.has_real_perm('settings.users')
    and showroom_id = (select p.showroom_id from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.profiles t join public.roles r on r.id = t.role_id
      where t.id = view_as_sessions.target_id and t.showroom_id = view_as_sessions.showroom_id and not r.is_owner
    )
  );
create policy view_as_sessions_update on public.view_as_sessions for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.audit_view_as()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('view_as.start', 'profiles', new.target_id::text,
      jsonb_build_object('session_id', new.id, 'showroom_id', new.showroom_id));
  elsif new.ended_at is not null and old.ended_at is null then
    perform public.write_audit('view_as.end', 'profiles', new.target_id::text,
      jsonb_build_object('session_id', new.id, 'showroom_id', new.showroom_id));
  end if;
  return null;
end;
$$;

create trigger view_as_sessions_audit after insert or update on public.view_as_sessions
  for each row execute function public.audit_view_as();
