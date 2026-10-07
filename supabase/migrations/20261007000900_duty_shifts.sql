-- Ca trực, công tắc Trực và ngày nghỉ (CLAUDE.md mục 7, 9.2). Từ bản này lead chỉ phân tự động cho người có quyền
-- lead.receive, đang hoạt động, đang bật Trực (có duty_sessions đang mở) và không nghỉ hôm nay (absences).
--
-- - shifts, shift_members: lịch ca cấu hình được (giờ VN). Seed ba ca gợi ý ở mục 7.
-- - duty_sessions: mỗi lần bật, tắt Trực. Chấm công nhẹ, không dùng tính lương. Chỉ ghi qua hàm set_my_duty,
--   end_duty_for và job close_stale_duty_sessions.
-- - absences: nghỉ phép, nghỉ ốm, công tác. Ngày nghỉ thì không bật Trực được và không được phân lead.
-- - Bật Trực thì lead đang ở hàng Chưa phân vì lúc vào không ai trực (cờ no_receiver) được chia lại ngay.
--   Lead nhập file để ở hàng Chưa phân (không có cờ này) vẫn chờ sale admin chia.

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Ngày trong tuần theo ISO: 1 = thứ Hai … 7 = Chủ nhật.
  days int[] not null check (days <@ array[1, 2, 3, 4, 5, 6, 7] and cardinality(days) between 1 and 7),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create trigger shifts_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();

create table public.shift_members (
  shift_id uuid not null references public.shifts (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  showroom_id uuid not null references public.showrooms (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (shift_id, user_id)
);

create table public.duty_sessions (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  user_id uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Ai bật: người dùng tự bật. Ai tắt: tự tắt, hệ thống tắt khi hết ca, quản lý tắt hộ, khóa tài khoản.
  start_source text not null default 'user' check (start_source in ('user')),
  end_source text check (end_source in ('user', 'system', 'manager', 'locked')),
  ended_by uuid,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check ((ended_at is null) = (end_source is null))
);

-- Mỗi người chỉ có một phiên đang mở.
create unique index duty_sessions_open_one on public.duty_sessions (user_id) where ended_at is null;
create index duty_sessions_showroom_started on public.duty_sessions (showroom_id, started_at desc);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('annual', 'sick', 'business', 'other')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  note text check (length(note) <= 500),
  approved_by uuid references public.profiles (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create trigger absences_updated_at before update on public.absences
  for each row execute function public.set_updated_at();
create index absences_user_dates on public.absences (user_id, starts_on, ends_on) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.shifts enable row level security;
alter table public.shift_members enable row level security;
alter table public.duty_sessions enable row level security;
alter table public.absences enable row level security;

-- Lịch ca: mọi người trong showroom xem được (biết ca của mình); sửa cần settings.assignment hoặc staff.manage.
create policy shifts_select on public.shifts for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy shifts_insert on public.shifts for insert to authenticated
  with check (showroom_id = public.current_showroom_id()
              and (public.has_perm('settings.assignment') or public.has_perm('staff.manage')));
create policy shifts_update on public.shifts for update to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('settings.assignment') or public.has_perm('staff.manage')))
  with check (showroom_id = public.current_showroom_id()
              and (public.has_perm('settings.assignment') or public.has_perm('staff.manage')));

create policy shift_members_select on public.shift_members for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy shift_members_insert on public.shift_members for insert to authenticated
  with check (showroom_id = public.current_showroom_id()
              and (public.has_perm('settings.assignment') or public.has_perm('staff.manage'))
              and exists (select 1 from public.shifts s
                          where s.id = shift_members.shift_id and s.showroom_id = shift_members.showroom_id)
              and exists (select 1 from public.profiles p
                          where p.id = shift_members.user_id and p.showroom_id = shift_members.showroom_id));
create policy shift_members_delete on public.shift_members for delete to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('settings.assignment') or public.has_perm('staff.manage')));

-- Phiên trực: xem của mình; xem cả đội cần attendance.view_team hoặc staff.manage. Không ghi trực tiếp.
create policy duty_sessions_select on public.duty_sessions for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (user_id = public.effective_uid()
              or public.has_perm('attendance.view_team') or public.has_perm('staff.manage')));

-- Ngày nghỉ: xem của mình; xem cả đội như trên; ghi cần staff.manage (duyệt nghỉ, mục 5).
-- Không lọc deleted_at ở đây: hủy ngày nghỉ là đặt deleted_at, dòng sau khi sửa vẫn phải đọc được. Màn hình tự lọc.
create policy absences_select on public.absences for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (user_id = public.effective_uid()
              or public.has_perm('attendance.view_team') or public.has_perm('staff.manage')));
create policy absences_insert on public.absences for insert to authenticated
  with check (showroom_id = public.current_showroom_id() and public.has_perm('staff.manage')
              and exists (select 1 from public.profiles p
                          where p.id = absences.user_id and p.showroom_id = absences.showroom_id));
create policy absences_update on public.absences for update to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('staff.manage'))
  with check (showroom_id = public.current_showroom_id() and public.has_perm('staff.manage'));

grant select, insert, update on public.shifts to authenticated;
grant select, insert, delete on public.shift_members to authenticated;
grant select on public.duty_sessions to authenticated;
grant select, insert, update on public.absences to authenticated;

-- Xem như người dùng: mọi lệnh ghi đã bị chặn ở public.check_request (20261004000500_view_as).

-- Nhật ký kiểm toán cho lịch ca và ngày nghỉ.
create or replace function public.audit_duty_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  perform public.write_audit(tg_table_name || '.' || lower(tg_op), tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'shift_id'),
    jsonb_build_object('before', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                       'after', case when tg_op <> 'DELETE' then to_jsonb(new) end,
                       'showroom_id', v_row ->> 'showroom_id'));
  return coalesce(new, old);
end;
$$;

create trigger shifts_audit after insert or update on public.shifts
  for each row execute function public.audit_duty_config();
create trigger shift_members_audit after insert or delete on public.shift_members
  for each row execute function public.audit_duty_config();
create trigger absences_audit after insert or update on public.absences
  for each row execute function public.audit_duty_config();

-- ---------------------------------------------------------------------------
-- Trạng thái trực
-- ---------------------------------------------------------------------------

-- Hôm nay (giờ VN) người này có ngày nghỉ không.
create or replace function public.is_absent_today(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.absences a
    where a.user_id = p_user and a.deleted_at is null
      and (now() at time zone 'Asia/Ho_Chi_Minh')::date between a.starts_on and a.ends_on
  );
$$;

revoke all on function public.is_absent_today(uuid) from public, anon, authenticated;

-- Người nhận lead theo thứ tự vòng tròn: thêm điều kiện đang trực và không nghỉ hôm nay.
create or replace function public.lead_receivers(p_showroom_id uuid)
returns table (id uuid, full_name text, uncontacted bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name,
    (select count(*) from public.leads l
     where l.assigned_to = p.id and l.deleted_at is null and l.stage not in ('won', 'lost')
       and l.first_contact_at is null
       and (l.window_wait_until is null or l.window_wait_until <= now()))
  from public.profiles p
  where p.showroom_id = p_showroom_id and p.is_active and public.has_perm_for(p.id, 'lead.receive')
    and exists (select 1 from public.duty_sessions d where d.user_id = p.id and d.ended_at is null)
    and not public.is_absent_today(p.id)
  order by p.created_at, p.id;
$$;

revoke all on function public.lead_receivers(uuid) from public, anon, authenticated;

-- route_lead giống bản ở 20261007000700_lead_intake, thêm cờ no_receiver khi không có ai trực để bật Trực thì chia lại.
create or replace function public.route_lead(p_lead_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_market text;
  v_rules public.assignment_rules;
  v_wait timestamptz;
  v_last uuid;
  v_pick uuid;
  v_found_last boolean := false;
  v_first uuid;
  r record;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or v_lead.deleted_at is not null or v_lead.assigned_to is not null
     or v_lead.stage in ('won', 'lost') then
    return 'skipped';
  end if;

  select * into v_rules from public.assignment_rules where showroom_id = v_lead.showroom_id;
  select country_of_residence into v_market from public.contacts where id = v_lead.contact_id;

  v_wait := public.market_wait_until(v_lead.showroom_id, v_market, now());
  if v_wait is not null then
    update public.leads set window_wait_until = v_wait where id = v_lead.id;
    return 'waiting';
  end if;

  perform pg_advisory_xact_lock(hashtext('lead_routing:' || v_lead.showroom_id::text));

  select (e.payload ->> 'to')::uuid into v_last
  from public.events e
  where e.showroom_id = v_lead.showroom_id and e.type = 'assignment' and e.payload ->> 'reason' = 'auto'
  order by e.id desc
  limit 1;

  for r in select * from public.lead_receivers(v_lead.showroom_id) loop
    if r.uncontacted < coalesce(v_rules.max_uncontacted_per_person, 10) then
      if v_first is null then v_first := r.id; end if;
      if v_found_last and v_pick is null then v_pick := r.id; end if;
    end if;
    if r.id = v_last then v_found_last := true; end if;
  end loop;
  v_pick := coalesce(v_pick, v_first);

  if v_pick is null then
    update public.leads
      set window_wait_until = null,
          flags = case when 'no_receiver' = any (flags) then flags else array_append(flags, 'no_receiver') end
      where id = v_lead.id;
    if not ('no_receiver' = any (v_lead.flags)) then
      perform public.notify_lead_assigners(v_lead.showroom_id, v_lead.id,
        'Có lead vào hàng Chưa phân: không có người nhận đang trực');
    end if;
    return 'unassigned';
  end if;

  perform set_config('app.lead_routing', 'on', true);
  perform set_config('app.assignment_reason', 'auto', true);
  update public.leads
    set assigned_to = v_pick,
        window_wait_until = null,
        flags = array_remove(flags, 'no_receiver'),
        sla_due_at = case when first_contact_at is null
                          then now() + make_interval(mins => coalesce(v_rules.sla_minutes, 5))
                          else sla_due_at end
    where id = v_lead.id;
  perform set_config('app.assignment_reason', '', true);
  perform set_config('app.lead_routing', '', true);

  insert into public.notifications (showroom_id, user_id, type, title, link)
  values (v_lead.showroom_id, v_pick, 'lead_assigned', 'Anh chị được giao một lead mới', '/leads/' || v_lead.id);
  return 'assigned';
end;
$$;

revoke all on function public.route_lead(uuid) from public, anon, authenticated;

-- Chia lại lead đang chờ người trực (cờ no_receiver), cũ trước. Gọi khi có người bật Trực.
create or replace function public.route_no_receiver_leads(p_showroom_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select id from public.leads
    where showroom_id = p_showroom_id and 'no_receiver' = any (flags)
      and assigned_to is null and deleted_at is null and stage not in ('won', 'lost')
    order by created_at
    limit 200
  loop
    if public.route_lead(v_id) = 'assigned' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.route_no_receiver_leads(uuid) from public, anon, authenticated;

-- Người dùng bật, tắt Trực của chính mình. Trả { on, routed }: routed là số lead vừa được chia khi bật.
create or replace function public.set_my_duty(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_showroom uuid := public.current_showroom_id();
  v_open uuid;
  v_routed int := 0;
begin
  if v_user is null or v_showroom is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('lead.receive') then
    raise exception 'not a lead receiver' using errcode = '42501';
  end if;

  select id into v_open from public.duty_sessions where user_id = v_user and ended_at is null;
  if p_on then
    if public.is_absent_today(v_user) then
      raise exception 'absent today' using errcode = '22023';
    end if;
    if v_open is null then
      insert into public.duty_sessions (showroom_id, user_id) values (v_showroom, v_user);
      perform public.write_audit('duty.start', 'profiles', v_user::text, '{}'::jsonb);
    end if;
    v_routed := public.route_no_receiver_leads(v_showroom);
  elsif v_open is not null then
    update public.duty_sessions set ended_at = now(), end_source = 'user', ended_by = v_user where id = v_open;
    perform public.write_audit('duty.end', 'profiles', v_user::text, '{}'::jsonb);
  end if;
  return jsonb_build_object('on', p_on, 'routed', v_routed);
end;
$$;

revoke all on function public.set_my_duty(boolean) from public, anon;
grant execute on function public.set_my_duty(boolean) to authenticated;

-- Quản lý tắt Trực hộ (staff.manage), ví dụ người quên tắt khi về.
create or replace function public.end_duty_for(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or (public.active_view_as()).id is not null or not public.has_perm('staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.duty_sessions d
    set ended_at = now(), end_source = 'manager', ended_by = auth.uid()
    where d.user_id = p_user and d.ended_at is null and d.showroom_id = public.current_showroom_id()
    returning d.id into v_id;
  if v_id is not null then
    perform public.write_audit('duty.end_by_manager', 'profiles', p_user::text, '{}'::jsonb);
  end if;
  return v_id is not null;
end;
$$;

revoke all on function public.end_duty_for(uuid) from public, anon;
grant execute on function public.end_duty_for(uuid) to authenticated;

-- Job mỗi 5 phút: tự tắt Trực khi hết ca cộng 30 phút (người đã được xếp ca nhưng giờ không còn ca nào của
-- họ đang chạy), người có ngày nghỉ hôm nay, hoặc phiên mở quá 14 giờ (quên tắt). Người chưa được xếp ca nào thì
-- chỉ áp hai điều kiện sau, vì lịch ca đang được sắp xếp (mục 7). Báo người đó trên chuông.
create or replace function public.close_stale_duty_sessions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_grace timestamp := (now() - interval '30 minutes') at time zone 'Asia/Ho_Chi_Minh';
  r record;
  v_n int := 0;
begin
  for r in
    select d.id, d.user_id, d.showroom_id from public.duty_sessions d
    join public.profiles p on p.id = d.user_id
    where d.ended_at is null
      and (
        d.started_at < now() - interval '14 hours'
        or public.is_absent_today(d.user_id)
        or (
          exists (select 1 from public.shift_members m join public.shifts s on s.id = m.shift_id
                  where m.user_id = d.user_id and s.is_active)
          and not exists (
            select 1 from public.shift_members m join public.shifts s on s.id = m.shift_id
            where m.user_id = d.user_id and s.is_active
              and (
                (extract(isodow from v_vn)::int = any (s.days)
                 and v_vn::time >= s.start_time - interval '30 minutes' and v_vn::time < s.end_time)
                or (extract(isodow from v_grace)::int = any (s.days)
                    and v_grace::time >= s.start_time and v_grace::time < s.end_time)
              )
          )
          -- Bật trực ngoài ca thì cho 30 phút trước khi tự tắt.
          and d.started_at < now() - interval '30 minutes'
        )
      )
  loop
    update public.duty_sessions set ended_at = now(), end_source = 'system' where id = r.id;
    insert into public.notifications (showroom_id, user_id, type, title, link)
    values (r.showroom_id, r.user_id, 'duty_auto_off', 'Hệ thống đã tắt Trực vì hết ca', '/home');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.close_stale_duty_sessions() from public, anon, authenticated;

select cron.schedule('close-stale-duty', '*/5 * * * *', 'select public.close_stale_duty_sessions()');

-- Khóa tài khoản thì tắt Trực ngay (mục 5, khóa người dùng).
create or replace function public.end_duty_on_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    update public.duty_sessions set ended_at = now(), end_source = 'locked', ended_by = auth.uid()
    where user_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_end_duty_on_lock after update of is_active on public.profiles
  for each row execute function public.end_duty_on_lock();

-- ---------------------------------------------------------------------------
-- Seed ca gợi ý (mục 7), sửa được trong Cài đặt, Ca trực
-- ---------------------------------------------------------------------------

insert into public.shifts (showroom_id, name, days, start_time, end_time, sort)
select s.id, x.name, x.days, x.st, x.en, x.sort
from public.showrooms s
cross join (values
  ('Ca ngày', array[1, 2, 3, 4, 5, 6], time '08:30', time '17:30', 1),
  ('Ca tối', array[1, 2, 3, 4, 5, 6], time '16:30', time '21:00', 2),
  ('Ca Chủ nhật', array[7], time '09:00', time '17:00', 3)
) as x (name, days, st, en, sort)
where not exists (select 1 from public.shifts t where t.showroom_id = s.id);
