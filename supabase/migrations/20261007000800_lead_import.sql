-- Nhập file CSV dữ liệu thủ công cũ (CLAUDE.md mục 6, nguồn import; mục 15 tuần 3): xem trước dòng trùng với CRM,
-- chọn cách xử lý trùng (bỏ qua, cập nhật ô còn trống, ghi thành hoạt động), lead nhập vào mặc định ở hàng "Chưa phân".
-- ingest_lead định nghĩa lại (bản ở 20261007000700_lead_intake) với hai tùy chọn route, fill_empty và quyền
-- lead.import cho nguồn import.

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
    -- Nhập file dữ liệu cũ cần thêm quyền lead.import (CLAUDE.md mục 6, nguồn import).
    if v_source = 'import' and not public.has_perm('lead.import') then
      raise exception 'not allowed to import leads' using errcode = '42501';
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
      -- Nhập file chọn "Cập nhật ô còn trống": chỉ điền ô lead cũ đang trống, không ghi đè.
      if coalesce((p ->> 'fill_empty')::boolean, false) then
        update public.leads
          set recipient_province = coalesce(recipient_province,
                nullif(btrim(coalesce(p ->> 'recipient_province', '')), '')),
              occasion_id = coalesce(occasion_id, v_occasion),
              budget_range_id = coalesce(budget_range_id, v_budget),
              source_detail = (v_detail - 'source_key') || source_detail
          where id = v_lead.id;
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

  -- Nhập file dữ liệu cũ mặc định để ở hàng "Chưa phân" (route = false): không đổ hàng trăm lead cũ cho telesale
  -- cùng lúc kèm SLA 5 phút; sale admin chia sau.
  if coalesce((p ->> 'route')::boolean, true) then
    v_route := public.route_lead(v_lead_id);
  else
    v_route := 'held';
  end if;
  select p2.full_name into v_holder
  from public.leads l join public.profiles p2 on p2.id = l.assigned_to where l.id = v_lead_id;

  return jsonb_build_object('action', v_action, 'lead_id', v_lead_id, 'contact_id', v_contact,
                            'route', v_route, 'holder_name', v_holder,
                            'wait_until', (select window_wait_until from public.leads where id = v_lead_id));
end;
$$;

revoke all on function public.ingest_lead(jsonb) from public, anon;
grant execute on function public.ingest_lead(jsonb) to authenticated, service_role;


-- Xem trước khi nhập: số nào trong tệp đã có trong CRM. Chỉ trả trạng thái theo số (đang có lead mở hay không), không
-- trả tên khách hay người giữ, nên không lộ thêm dữ liệu cho người có quyền nhập file.
create or replace function public.import_check_phones(p_phones text[])
returns table (e164 text, has_open_lead boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_perm('lead.import') then
    raise exception 'not allowed to import leads' using errcode = '42501';
  end if;
  if coalesce(array_length(p_phones, 1), 0) > 2000 then
    raise exception 'too many rows' using errcode = '22023';
  end if;
  return query
    select ci.value,
      exists (select 1 from public.leads l
              where l.contact_id = ci.contact_id and l.deleted_at is null and l.stage not in ('won', 'lost'))
    from public.contact_identities ci
    join public.contacts c on c.id = ci.contact_id and c.deleted_at is null
    where ci.showroom_id = public.current_showroom_id() and ci.type = 'phone' and ci.value = any (p_phones);
end;
$$;

revoke all on function public.import_check_phones(text[]) from public, anon;
grant execute on function public.import_check_phones(text[]) to authenticated;
