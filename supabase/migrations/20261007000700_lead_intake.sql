-- Thu lead và phân lead (CLAUDE.md mục 6, 7): nhập lead nhanh trên CRM, chống trùng theo định danh, phân vòng tròn,
-- chờ khung gọi theo thị trường của khách, giao và chuyển lead bằng tay. Mọi đường thu lead về sau (nhập CSV,
-- webhook Meta, Zalo) gọi cùng hàm ingest_lead để luật chống trùng và phân lead chỉ có một chỗ.
--
-- Giai đoạn này chưa có ca trực (shifts, duty_sessions) và ngày nghỉ (absences): mọi người đang hoạt động có quyền
-- lead.receive được coi là đang trực. Khi có duty_sessions thì chỉ cần thêm điều kiện vào public.lead_receivers().

-- ---------------------------------------------------------------------------
-- Luật phân lead (Cài đặt, Phân lead)
-- ---------------------------------------------------------------------------

create table public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null unique references public.showrooms (id),
  mode text not null default 'round_robin' check (mode in ('round_robin')),
  sla_minutes int not null default 5 check (sla_minutes between 1 and 1440),
  -- N: bỏ qua người đang giữ quá N lead chưa liên hệ (lead đang chờ khung gọi không tính).
  max_uncontacted_per_person int not null default 10 check (max_uncontacted_per_person between 1 and 500),
  working_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create trigger assignment_rules_updated_at before update on public.assignment_rules
  for each row execute function public.set_updated_at();

alter table public.assignment_rules enable row level security;

create policy assignment_rules_select on public.assignment_rules for select to authenticated
  using (showroom_id = public.current_showroom_id());
create policy assignment_rules_write on public.assignment_rules for update to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.assignment'))
  with check (showroom_id = public.current_showroom_id() and public.has_perm('settings.assignment'));

insert into public.assignment_rules (showroom_id)
select id from public.showrooms
on conflict (showroom_id) do nothing;

-- ---------------------------------------------------------------------------
-- Giao lead: cho phép phân tự động đi qua trigger chặn giao tay
-- ---------------------------------------------------------------------------

-- Giống bản ở 20261007000600_lat0_work, thêm một ngoại lệ: route_lead() (phân tự động theo luật) bật app.lead_routing
-- trong giao dịch của nó. Người dùng không tự bật được cờ này vì PostgREST không mở set_config.
create or replace function public.guard_lead_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.assigned_to is distinct from old.assigned_to
       and current_setting('app.lead_routing', true) is distinct from 'on'
       and not public.has_perm('lead.assign') then
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
  -- Mua cho ai, người nhận ở tỉnh nào, dịp, ngân sách: thiếu một thì chưa tư vấn sâu được.
  if new.stage = 'demo' and old.stage is distinct from 'demo' and (
    new.recipient_contact_id is null or new.recipient_province is null
    or new.occasion_id is null or new.budget_range_id is null
  ) then
    raise exception 'missing required info before demo' using errcode = 'check_violation';
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

-- ---------------------------------------------------------------------------
-- Khung gọi theo thị trường
-- ---------------------------------------------------------------------------

-- Lead phải chờ tới lúc nào mới gọi được: null khi đang trong khung gọi, thị trường không rõ hoặc không khai khung.
-- call_windows: [{"days":[1..7 (1 = Thứ Hai, 7 = Chủ nhật)],"start":"HH:MM","end":"HH:MM"}] theo giờ địa phương.
create or replace function public.market_wait_until(p_showroom_id uuid, p_market text, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_market public.markets;
  v_day date;
  v_win record;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_market from public.markets
  where showroom_id = p_showroom_id and country_code = p_market and is_active;
  if not found or jsonb_array_length(coalesce(v_market.call_windows, '[]'::jsonb)) = 0 then
    return null;
  end if;
  for d in 0..7 loop
    v_day := (p_at at time zone v_market.timezone)::date + d;
    for v_win in
      select (w ->> 'start')::time as s, (w ->> 'end')::time as e
      from jsonb_array_elements(v_market.call_windows) w
      where (w -> 'days') @> to_jsonb(extract(isodow from v_day)::int)
      order by 1
    loop
      v_start := (v_day + v_win.s) at time zone v_market.timezone;
      v_end := (v_day + v_win.e) at time zone v_market.timezone;
      if p_at < v_end then
        return case when p_at >= v_start then null else v_start end;
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

revoke all on function public.market_wait_until(uuid, text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Phân lead tự động
-- ---------------------------------------------------------------------------

-- Người nhận lead theo thứ tự vòng tròn, kèm số lead đang giữ mà chưa liên hệ.
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
  order by p.created_at, p.id;
$$;

revoke all on function public.lead_receivers(uuid) from public, anon, authenticated;

-- Báo người điều phối (có lead.assign) trên chuông.
create or replace function public.notify_lead_assigners(p_showroom_id uuid, p_lead_id uuid, p_title text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (showroom_id, user_id, type, title, link)
  select p.showroom_id, p.id, 'lead_unassigned', p_title, '/leads?view=unassigned'
  from public.profiles p
  where p.showroom_id = p_showroom_id and p.is_active and public.has_perm_for(p.id, 'lead.assign');
$$;

revoke all on function public.notify_lead_assigners(uuid, uuid, text) from public, anon, authenticated;

-- Phân một lead đang ở hàng "Chưa phân": chờ khung gọi, giao vòng tròn, hoặc để lại và báo người điều phối.
-- Trả về 'assigned' | 'waiting' | 'unassigned' | 'skipped'.
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

  -- Hai lead vào cùng lúc không được rơi vào cùng một lượt vòng tròn.
  perform pg_advisory_xact_lock(hashtext('lead_routing:' || v_lead.showroom_id::text));

  select (e.payload ->> 'to')::uuid into v_last
  from public.events e
  where e.showroom_id = v_lead.showroom_id and e.type = 'assignment' and e.payload ->> 'reason' = 'auto'
  order by e.id desc
  limit 1;

  -- Người kế tiếp sau người được phân gần nhất, bỏ qua người đang giữ quá N lead chưa liên hệ.
  for r in select * from public.lead_receivers(v_lead.showroom_id) loop
    if r.uncontacted < coalesce(v_rules.max_uncontacted_per_person, 10) then
      if v_first is null then v_first := r.id; end if;
      if v_found_last and v_pick is null then v_pick := r.id; end if;
    end if;
    if r.id = v_last then v_found_last := true; end if;
  end loop;
  v_pick := coalesce(v_pick, v_first);

  if v_pick is null then
    update public.leads set window_wait_until = null where id = v_lead.id;
    perform public.notify_lead_assigners(v_lead.showroom_id, v_lead.id,
      'Có lead vào hàng Chưa phân: không có người nhận đang trực');
    return 'unassigned';
  end if;

  perform set_config('app.lead_routing', 'on', true);
  perform set_config('app.assignment_reason', 'auto', true);
  update public.leads
    set assigned_to = v_pick,
        window_wait_until = null,
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

-- Job mỗi phút: lead đã tới đầu khung gọi thì phân cho người đang trực lúc đó.
create or replace function public.route_waiting_leads()
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
    where window_wait_until is not null and window_wait_until <= now()
      and assigned_to is null and deleted_at is null and stage not in ('won', 'lost')
    order by window_wait_until, created_at
    limit 200
  loop
    if public.route_lead(v_id) = 'assigned' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.route_waiting_leads() from public, anon, authenticated;

select cron.schedule('route-waiting-leads', '* * * * *', 'select public.route_waiting_leads()');

-- ---------------------------------------------------------------------------
-- Thu lead
-- ---------------------------------------------------------------------------

-- Nhận một lead từ mọi nguồn (nhập tay, CSV, webhook). Số điện thoại đã được chuẩn hóa và che ở server ứng dụng
-- (lib/phone) trước khi gọi. Người dùng cần lead.create; service_role (webhook, job) truyền showroom_id.
--
-- p: { showroom_id?, full_name, country, source, source_key?, source_detail?, note?,
--      phone: { raw, e164?, masked, valid }, marketing_consent?, occasion_key?, budget_key?, recipient_province? }
-- Trả về: { action: 'created' | 'new_lead_existing_contact' | 'attached', lead_id, contact_id, route?, holder_name? }
create or replace function public.ingest_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_showroom uuid;
  v_name text := btrim(coalesce(p ->> 'full_name', ''));
  v_country text := coalesce(nullif(p ->> 'country', ''), 'unknown');
  v_source text := coalesce(p ->> 'source', '');
  v_source_key text := nullif(p ->> 'source_key', '');
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_phone jsonb := p -> 'phone';
  v_valid boolean := coalesce((p -> 'phone' ->> 'valid')::boolean, false);
  v_value text;
  v_detail jsonb := coalesce(p -> 'source_detail', '{}'::jsonb);
  v_contact uuid;
  v_lead public.leads;
  v_lead_id uuid;
  v_action text;
  v_route text;
  v_occasion uuid;
  v_budget uuid;
  v_holder text;
begin
  if v_user is not null then
    if (public.active_view_as()).id is not null then
      raise exception 'view-as session is read-only' using errcode = '42501';
    end if;
    if not public.has_perm('lead.create') then
      raise exception 'not allowed to create leads' using errcode = '42501';
    end if;
    v_showroom := public.current_showroom_id();
  elsif (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
        or session_user = 'postgres' then
    -- Webhook, job dùng khóa service_role; hoặc chạy thẳng trong database (pg_cron, kiểm thử).
    v_showroom := (p ->> 'showroom_id')::uuid;
  else
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_showroom is null or not exists (select 1 from public.showrooms where id = v_showroom) then
    raise exception 'unknown showroom' using errcode = '22023';
  end if;

  if v_name = '' or length(v_name) > 200 then
    raise exception 'full name is required' using errcode = '22023';
  end if;
  if v_source not in ('meta_lead_ads', 'zalo_oa', 'hotline', 'walk_in', 'tiktok_live', 'referral', 'import', 'manual') then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  if v_source_key is not null and not exists (
    select 1 from public.lead_sources where showroom_id = v_showroom and key = v_source_key and is_active
  ) then
    raise exception 'unknown lead source' using errcode = '22023';
  end if;
  if v_country <> 'unknown' and not exists (
    select 1 from public.markets where showroom_id = v_showroom and country_code = v_country and is_active
  ) then
    raise exception 'unknown market' using errcode = '22023';
  end if;
  if v_phone is null or btrim(coalesce(v_phone ->> 'raw', '')) = '' then
    raise exception 'a phone number is required' using errcode = '22023';
  end if;
  if v_valid and coalesce(v_phone ->> 'e164', '') !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid e164' using errcode = '22023';
  end if;
  -- Số sai vẫn nhận lead nhưng không dùng để chống trùng; lưu kèm tiền tố để không đụng số đúng của người khác.
  v_value := case when v_valid then v_phone ->> 'e164'
                  else 'invalid:' || regexp_replace(v_phone ->> 'raw', '\s', '', 'g') end;

  if nullif(p ->> 'occasion_key', '') is not null then
    select id into v_occasion from public.occasions
    where showroom_id = v_showroom and key = p ->> 'occasion_key' and is_active;
  end if;
  if nullif(p ->> 'budget_key', '') is not null then
    select id into v_budget from public.budget_ranges
    where showroom_id = v_showroom and key = p ->> 'budget_key' and is_active;
  end if;
  if v_source_key is not null then
    v_detail := v_detail || jsonb_build_object('source_key', v_source_key);
  end if;

  -- 1. Tìm khách qua định danh (mục 6, Chống trùng). Số đang dùng chung trong hộ không có định danh riêng nên
  --    không bao giờ làm gộp hai người.
  select ci.contact_id into v_contact
  from public.contact_identities ci
  join public.contacts c on c.id = ci.contact_id and c.deleted_at is null
  where ci.showroom_id = v_showroom and ci.type = 'phone' and ci.value = v_value;

  if v_contact is not null then
    -- 2. Đang có lead mở: không tạo lead mới. 3. Thất bại trong 30 ngày: tạm nối vào lead đó (open-questions).
    --    updated_at được dùng làm mốc đóng lead (xấp xỉ: lead thất bại hiếm khi còn bị sửa).
    select * into v_lead from public.leads
    where contact_id = v_contact and deleted_at is null
      and (stage not in ('won', 'lost') or (stage = 'lost' and updated_at > now() - interval '30 days'))
    order by (stage not in ('won', 'lost')) desc, created_at desc
    limit 1;
    if found then
      perform public.record_event('lead_created', v_showroom, v_contact, v_lead.id,
        jsonb_build_object('source', v_source, 'source_key', v_source_key, 'attached', true));
      perform public.record_event('merge', v_showroom, v_contact, v_lead.id,
        jsonb_build_object('reason', case when v_lead.stage = 'lost' then 'recent_lost_lead' else 'open_lead' end,
                           'matched_by', 'phone'));
      if v_note is not null then
        perform public.record_event('note', v_showroom, v_contact, v_lead.id,
          jsonb_build_object('text', left(v_note, 4000), 'channel', 'crm'), 'user');
      end if;
      if v_lead.assigned_to is not null then
        insert into public.notifications (showroom_id, user_id, type, title, link)
        values (v_showroom, v_lead.assigned_to, 'lead_reentry',
                'Khách anh chị đang giữ vừa liên hệ lại qua nguồn mới', '/leads/' || v_lead.id);
        select full_name into v_holder from public.profiles where id = v_lead.assigned_to;
      else
        perform public.notify_lead_assigners(v_showroom, v_lead.id, 'Khách ở hàng Chưa phân vừa liên hệ lại');
      end if;
      if v_user is not null then
        perform public.write_audit('lead.attach', 'leads', v_lead.id::text,
          jsonb_build_object('source', v_source, 'source_key', v_source_key));
      end if;
      return jsonb_build_object('action', 'attached', 'lead_id', v_lead.id, 'contact_id', v_contact,
                                'holder_name', v_holder);
    end if;
    v_action := 'new_lead_existing_contact';
    if v_country <> 'unknown' then
      update public.contacts set country_of_residence = v_country
      where id = v_contact and country_of_residence = 'unknown';
    end if;
    perform public.record_event('merge', v_showroom, v_contact, null,
      jsonb_build_object('reason', 'returning_customer', 'matched_by', 'phone'));
  else
    v_action := 'created';
    insert into public.contacts (showroom_id, full_name, country_of_residence, lifecycle_stage, created_by)
    values (v_showroom, v_name, v_country, 'lead', v_user)
    returning id into v_contact;
    insert into public.contact_identities
      (showroom_id, contact_id, type, value, value_raw, display_masked, is_primary, is_valid, source, created_by)
    values (v_showroom, v_contact, 'phone', v_value, v_phone ->> 'raw',
            coalesce(nullif(v_phone ->> 'masked', ''), '••••••'), true, v_valid, v_source, v_user);
  end if;

  if coalesce((p ->> 'marketing_consent')::boolean, false) then
    insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source, created_by)
    values (v_showroom, v_contact, 'marketing', 'all', true, 'lead:' || v_source, v_user);
  end if;

  insert into public.leads (showroom_id, contact_id, source, source_detail, occasion_id, budget_range_id,
                            recipient_province, flags, created_by)
  values (v_showroom, v_contact, v_source, v_detail, v_occasion, v_budget,
          nullif(btrim(coalesce(p ->> 'recipient_province', '')), ''),
          case when v_valid then '{}'::text[] else array['phone_invalid'] end, v_user)
  returning id into v_lead_id;

  if v_note is not null then
    perform public.record_event('note', v_showroom, v_contact, v_lead_id,
      jsonb_build_object('text', left(v_note, 4000), 'channel', 'crm'), 'user');
  end if;
  if not v_valid then
    -- Mục 6: số không hợp lệ vào hàng chờ sale admin kiểm tra.
    insert into public.tasks (showroom_id, type, title, contact_id, lead_id, due_at, priority, source, rule_key)
    values (v_showroom, 'data_fix', 'Kiểm tra số điện thoại không hợp lệ', v_contact, v_lead_id, now(), 1,
            'rule', 'phone_invalid');
  end if;
  if v_user is not null then
    perform public.write_audit('lead.create', 'leads', v_lead_id::text,
      jsonb_build_object('source', v_source, 'source_key', v_source_key, 'action', v_action));
  end if;

  v_route := public.route_lead(v_lead_id);
  select p2.full_name into v_holder
  from public.leads l join public.profiles p2 on p2.id = l.assigned_to where l.id = v_lead_id;

  return jsonb_build_object('action', v_action, 'lead_id', v_lead_id, 'contact_id', v_contact,
                            'route', v_route, 'holder_name', v_holder,
                            'wait_until', (select window_wait_until from public.leads where id = v_lead_id));
end;
$$;

revoke all on function public.ingest_lead(jsonb) from public, anon;
grant execute on function public.ingest_lead(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Giao, chuyển lead bằng tay
-- ---------------------------------------------------------------------------

-- Giao hoặc chuyển nhiều lead một lần; p_assignee null là trả về hàng "Chưa phân". Cần lead.assign.
-- Người nhận phải đang hoạt động và xem được lead của mình. Trả về số lead đã đổi người giữ.
create or replace function public.assign_leads(p_lead_ids uuid[], p_assignee uuid, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_showroom uuid := public.current_showroom_id();
  v_rules public.assignment_rules;
  v_n int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('lead.assign') then
    raise exception 'not allowed to assign leads' using errcode = '42501';
  end if;
  if coalesce(array_length(p_lead_ids, 1), 0) = 0 or array_length(p_lead_ids, 1) > 500 then
    raise exception 'choose between 1 and 500 leads' using errcode = '22023';
  end if;
  if p_assignee is not null and not exists (
    select 1 from public.profiles
    where id = p_assignee and showroom_id = v_showroom and is_active
      and (public.has_perm_for(id, 'lead.view_own') or public.has_perm_for(id, 'lead.view_all'))
  ) then
    raise exception 'assignee cannot hold leads' using errcode = '22023';
  end if;

  select * into v_rules from public.assignment_rules where showroom_id = v_showroom;
  perform set_config('app.assignment_reason', left(coalesce(nullif(btrim(p_reason), ''), 'manual'), 200), true);
  with changed as (
    update public.leads
      set assigned_to = p_assignee,
          window_wait_until = null,
          sla_due_at = case
            when p_assignee is not null and first_contact_at is null
              then now() + make_interval(mins => coalesce(v_rules.sla_minutes, 5))
            else sla_due_at end
      where id = any (p_lead_ids) and showroom_id = v_showroom and deleted_at is null
        and stage not in ('won', 'lost') and assigned_to is distinct from p_assignee
      returning id
  )
  select count(*) into v_n from changed;
  perform set_config('app.assignment_reason', '', true);

  if p_assignee is not null and v_n > 0 and p_assignee <> v_user then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    values (v_showroom, p_assignee, 'lead_assigned',
            case when v_n = 1 then 'Anh chị được giao một lead' else 'Anh chị được giao ' || v_n || ' lead' end,
            '/leads?view=mine');
  end if;
  perform public.write_audit('lead.assign', 'leads', null,
    jsonb_build_object('count', v_n, 'to', p_assignee, 'reason', p_reason));
  return v_n;
end;
$$;

revoke all on function public.assign_leads(uuid[], uuid, text) from public, anon;
grant execute on function public.assign_leads(uuid[], uuid, text) to authenticated;

-- Người có thể nhận lead (cho ô chọn người khi giao). Ai có lead.assign mới được xem.
create or replace function public.lead_assignees()
returns table (id uuid, full_name text, receives boolean, uncontacted bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_perm('lead.assign') then
    raise exception 'not allowed to assign leads' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, public.has_perm_for(p.id, 'lead.receive'),
      (select count(*) from public.leads l
       where l.assigned_to = p.id and l.deleted_at is null and l.stage not in ('won', 'lost')
         and l.first_contact_at is null)
    from public.profiles p
    where p.showroom_id = public.current_showroom_id() and p.is_active
      and (public.has_perm_for(p.id, 'lead.view_own') or public.has_perm_for(p.id, 'lead.view_all'))
    order by 3 desc, p.full_name;
end;
$$;

revoke all on function public.lead_assignees() from public, anon;
grant execute on function public.lead_assignees() to authenticated;
