-- Zalo OA vào Hội thoại chung (CLAUDE.md mục 10.3, 10.4): nhận tin qua webhook, trả lời tin tư vấn, khách chia sẻ
-- số điện thoại thì gắn vào hồ sơ. Phần nhận tin dùng chung cho mọi kênh (ingest_channel_message): Messenger chuyển
-- sang dùng chung, hành vi giữ nguyên.
--
-- Khung tin tư vấn của Zalo: miễn phí 48 giờ sau tương tác của khách, ngoài đó tính phí theo hạn mức gói OA. CRM
-- không khóa ô soạn ngoài 48 giờ (CLAUDE.md 10.4) mà bắt nhân viên xác nhận "tin tính phí" và đếm số tin trong tháng.

-- ---------------------------------------------------------------------------
-- Token OAuth của Zalo: access token ngắn hạn, refresh token đổi mới sau mỗi lần dùng
-- ---------------------------------------------------------------------------

-- Khóa giữ chỗ khi làm mới token: hai tiến trình cùng làm mới sẽ làm mất refresh token (dùng một lần).
alter table public.integrations add column refresh_lock_until timestamptz;

create or replace function public.lease_token_refresh(p_showroom uuid, p_key text, p_seconds int default 60)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.integrations
    set refresh_lock_until = now() + make_interval(secs => greatest(5, least(p_seconds, 300)))
    where showroom_id = p_showroom and key = p_key
      and (refresh_lock_until is null or refresh_lock_until < now());
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.lease_token_refresh(uuid, text, int) from public, anon, authenticated;
grant execute on function public.lease_token_refresh(uuid, text, int) to service_role;

-- Server ghi token mới nhận từ nhà cung cấp vào Vault (không có người đăng nhập). Không ghi giá trị vào nhật ký.
create or replace function public.store_integration_token(p_showroom uuid, p_key text, p_name text, p_value text,
                                                          p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.integration_secrets;
  v_vault_name text;
begin
  if p_name !~ '^[a-z0-9_]{2,64}$' or p_value is null or length(btrim(p_value)) = 0 or length(p_value) > 8192 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  insert into public.integrations (showroom_id, key) values (p_showroom, p_key)
  on conflict (showroom_id, key) do nothing;
  select * into v_row from public.integration_secrets
  where showroom_id = p_showroom and integration_key = p_key and name = p_name
  for update;
  v_vault_name := format('integration/%s/%s/%s', p_showroom, p_key, p_name);
  if found then
    perform vault.update_secret(v_row.vault_secret_id, btrim(p_value), v_vault_name);
    update public.integration_secrets set updated_at = now(), updated_by = null where id = v_row.id;
  else
    insert into public.integration_secrets (showroom_id, integration_key, name, vault_secret_id)
    values (p_showroom, p_key, p_name, vault.create_secret(btrim(p_value), v_vault_name, 'Token đấu nối CRM'));
  end if;
  if p_expires_at is not null then
    update public.integrations set token_expires_at = p_expires_at, refresh_lock_until = null
    where showroom_id = p_showroom and key = p_key;
  end if;
end;
$$;

revoke all on function public.store_integration_token(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.store_integration_token(uuid, text, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Nhận tin dùng chung cho mọi kênh
-- ---------------------------------------------------------------------------

-- Ghi một tin của khách (hoặc bản sao tin Page/OA gửi đi) vào hội thoại, tạo khách và lead khi cần.
-- p: { showroom_id, integration_id, channel, page_id, external_user_id, identity_type, consent_channel, lead_source,
--      source_key, label, echo, crm_message_id?, mid, text?, attachments?, at, display_name? }
-- Trả về 'processed' | 'duplicate' | 'ignored'. Chỉ gọi từ các hàm xử lý webhook (không cấp quyền gọi trực tiếp).
create or replace function public.ingest_channel_message(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := (p ->> 'showroom_id')::uuid;
  v_channel text := p ->> 'channel';
  v_page text := p ->> 'page_id';
  v_uid text := p ->> 'external_user_id';
  v_echo boolean := coalesce((p ->> 'echo')::boolean, false);
  v_mid text := p ->> 'mid';
  v_text text := left(nullif(p ->> 'text', ''), 4000);
  v_attach jsonb := coalesce(p -> 'attachments', '[]'::jsonb);
  v_at timestamptz := coalesce((p ->> 'at')::timestamptz, now());
  v_label text := coalesce(p ->> 'label', v_channel);
  v_display text := nullif(btrim(coalesce(p ->> 'display_name', '')), '');
  v_conv public.conversations;
  v_contact uuid;
  v_lead uuid;
  v_new_lead boolean := false;
  v_lead_row public.leads;
  v_name text;
  v_msg uuid;
  v_crm uuid;
begin
  if v_mid is not null and exists (
    select 1 from public.messages where showroom_id = v_showroom and external_message_id = v_mid
  ) then
    return 'duplicate';
  end if;

  select * into v_conv from public.conversations
  where showroom_id = v_showroom and channel = v_channel and external_user_id = v_uid
  for update;

  if v_echo then
    -- Bản sao tin CRM vừa gửi: gắn mã tin của nhà cung cấp vào tin đã có, không tạo tin thứ hai. Kênh không gửi kèm
    -- mã của CRM (Zalo) thì nhận ra bằng tin CRM cùng nội dung chưa có mã, gửi trong 10 phút gần nhất.
    v_crm := nullif(p ->> 'crm_message_id', '')::uuid;
    if v_crm is null and v_conv.id is not null then
      select id into v_crm from public.messages
      where conversation_id = v_conv.id and direction = 'out' and sent_via = 'crm'
        and external_message_id is null and status in ('queued', 'sent')
        and text is not distinct from v_text and created_at > v_at - interval '10 minutes'
      order by created_at
      limit 1;
    end if;
    if v_crm is not null then
      update public.messages
        set external_message_id = coalesce(external_message_id, v_mid),
            status = case when status = 'queued' then 'sent' else status end
        where id = v_crm and showroom_id = v_showroom and direction = 'out';
      return 'processed';
    end if;
    if v_conv.id is null then
      -- Page, OA nhắn trước cho người chưa từng nhắn: không đủ thông tin để tạo khách.
      return 'ignored';
    end if;
  end if;

  if v_conv.id is null then
    v_name := coalesce(v_display, 'Khách ' || v_label || ' ' || right(v_uid, 4));
    -- Chống trùng theo định danh của kênh (CLAUDE.md mục 6).
    select ci.contact_id into v_contact
    from public.contact_identities ci
    join public.contacts c on c.id = ci.contact_id and c.deleted_at is null
    where ci.showroom_id = v_showroom and ci.type = p ->> 'identity_type' and ci.value = v_uid;

    if v_contact is null then
      insert into public.contacts (showroom_id, full_name, lifecycle_stage)
      values (v_showroom, v_name, 'lead')
      returning id into v_contact;
      insert into public.contact_identities
        (showroom_id, contact_id, type, value, display_masked, is_primary, source)
      values (v_showroom, v_contact, p ->> 'identity_type', v_uid, v_label, true, p ->> 'lead_source');
      -- Khách tự nhắn tới kênh: căn cứ để trả lời, chăm sóc trên chính kênh này.
      insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source)
      values (v_showroom, v_contact, 'care', p ->> 'consent_channel', true, 'customer_initiated_message');
    end if;

    insert into public.conversations (showroom_id, channel, page_id, external_user_id, contact_id, display_name)
    values (v_showroom, v_channel, v_page, v_uid, v_contact, v_name)
    returning * into v_conv;
  end if;

  -- Gắn hội thoại vào lead còn dùng được; không có thì tin của khách tạo lead mới.
  if not v_echo then
    v_lead := v_conv.lead_id;
    if v_lead is null or v_lead is distinct from public.reusable_lead_for(v_conv.contact_id) then
      v_lead := public.reusable_lead_for(v_conv.contact_id);
      if v_lead is not null then
        perform public.record_event('lead_created', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('source', p ->> 'lead_source', 'source_key', p ->> 'source_key', 'attached', true),
          'customer');
        perform public.record_event('merge', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('reason', 'open_lead', 'matched_by', p ->> 'identity_type'), 'system');
      else
        insert into public.leads (showroom_id, contact_id, source, source_detail)
        values (v_showroom, v_conv.contact_id, p ->> 'lead_source',
                jsonb_build_object('page_id', v_page, 'source_key', p ->> 'source_key'))
        returning id into v_lead;
        v_new_lead := true;
        perform public.record_event('lead_created', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('source', p ->> 'lead_source', 'source_key', p ->> 'source_key'), 'customer');
      end if;
      update public.conversations set lead_id = v_lead where id = v_conv.id;
      v_conv.lead_id := v_lead;
    end if;
  end if;

  insert into public.messages (showroom_id, conversation_id, direction, external_message_id, text, attachments,
                               sent_via, status, occurred_at)
  values (v_showroom, v_conv.id, case when v_echo then 'out' else 'in' end, v_mid, v_text, v_attach,
          case when v_echo then 'page' end, case when v_echo then 'sent' else 'received' end, v_at)
  returning id into v_msg;

  update public.conversations
    set last_message_at = greatest(coalesce(last_message_at, v_at), v_at),
        last_inbound_at = case when v_echo then last_inbound_at
                               else greatest(coalesce(last_inbound_at, v_at), v_at) end,
        unread_count = case when v_echo then unread_count else unread_count + 1 end,
        display_name = coalesce(v_display, display_name)
    where id = v_conv.id;

  perform public.record_event(v_channel || case when v_echo then '_out' else '_in' end, v_showroom,
    v_conv.contact_id, v_conv.lead_id,
    jsonb_strip_nulls(jsonb_build_object('conversation_id', v_conv.id, 'message_id', v_msg,
      'via', case when v_echo then 'page' end)),
    case when v_echo then 'user' else 'customer' end);

  if v_echo and v_conv.lead_id is not null then
    -- Nhân viên trả lời thẳng trên Page, OA cũng là lần liên hệ đi (dừng đồng hồ SLA, CLAUDE.md mục 7).
    update public.leads
      set first_contact_at = coalesce(first_contact_at, v_at),
          stage = case when stage = 'new' then 'contacted' else stage end
      where id = v_conv.lead_id;
  end if;

  if not v_echo then
    select * into v_lead_row from public.leads where id = v_conv.lead_id;
    if v_new_lead then
      perform public.route_lead(v_lead_row.id);
    elsif v_conv.unread_count = 0 then
      -- Báo một lần cho mỗi lượt tin chưa đọc, không báo từng tin.
      if v_lead_row.assigned_to is not null then
        insert into public.notifications (showroom_id, user_id, type, title, link)
        values (v_showroom, v_lead_row.assigned_to, 'message_in', 'Khách vừa nhắn qua ' || v_label,
                '/inbox?c=' || v_conv.id);
      else
        insert into public.notifications (showroom_id, user_id, type, title, link)
        select pr.showroom_id, pr.id, 'message_in', 'Khách chưa có người giữ vừa nhắn qua ' || v_label,
               '/inbox?c=' || v_conv.id
        from public.profiles pr
        where pr.showroom_id = v_showroom and pr.is_active and public.has_perm_for(pr.id, 'message.view_all');
      end if;
    end if;
  end if;

  update public.integrations set last_event_at = now(), last_success_at = now()
  where id = (p ->> 'integration_id')::uuid;
  return 'processed';
end;
$$;

revoke all on function public.ingest_channel_message(jsonb) from public, anon, authenticated;

-- Messenger dùng phần nhận tin chung; đầu vào, kết quả và luật giữ nguyên như migration 20261008000200.
create or replace function public.process_messenger_event(p_event_id bigint, p_display_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.webhook_events;
  v_item jsonb;
  v_page text;
  v_int public.integrations;
  v_echo boolean;
  v_psid text;
  v_meta text;
  v_result text;
begin
  select * into v_ev from public.webhook_events
  where id = p_event_id and provider = 'meta_messenger' and status = 'received' and signature_valid
  for update skip locked;
  if not found then
    return 'skipped';
  end if;

  v_page := v_ev.payload ->> 'page_id';
  v_item := v_ev.payload -> 'item';
  select * into v_int from public.integrations
  where key = 'meta_messenger' and config ->> 'pageId' = v_page
  order by created_at
  limit 1;
  if not found then
    update public.webhook_events set status = 'ignored', error = 'page not connected', processed_at = now()
    where id = v_ev.id;
    return 'ignored';
  end if;
  if v_int.status = 'paused' then
    -- Giữ lại, chạy lại thì job xử lý tiếp; không mất tin.
    return 'paused';
  end if;

  v_echo := coalesce((v_item -> 'message' ->> 'is_echo')::boolean, false);
  v_psid := case when v_echo then v_item -> 'recipient' ->> 'id' else v_item -> 'sender' ->> 'id' end;
  v_meta := v_item -> 'message' ->> 'metadata';
  if v_psid is null or v_psid !~ '^[0-9]{1,32}$' then
    update public.webhook_events set status = 'failed', error = 'missing sender', processed_at = now()
    where id = v_ev.id;
    return 'ignored';
  end if;

  v_result := public.ingest_channel_message(jsonb_build_object(
    'showroom_id', v_int.showroom_id,
    'integration_id', v_int.id,
    'channel', 'messenger',
    'page_id', v_page,
    'external_user_id', v_psid,
    'identity_type', 'fb_psid',
    'consent_channel', 'messenger',
    'lead_source', 'meta_messenger',
    'source_key', 'fb_messenger',
    'label', 'Messenger',
    'echo', v_echo,
    'crm_message_id', case when v_meta like 'crm:%' then nullif(substr(v_meta, 5), '') end,
    'mid', coalesce(v_item -> 'message' ->> 'mid', v_item -> 'postback' ->> 'mid', v_ev.external_id),
    'text', coalesce(v_item -> 'message' ->> 'text', v_item -> 'postback' ->> 'title'),
    'attachments', coalesce(v_item -> 'message' -> 'attachments', '[]'::jsonb),
    'at', coalesce(to_timestamp((v_item ->> 'timestamp')::bigint / 1000.0), v_ev.received_at),
    'display_name', p_display_name
  ));

  update public.webhook_events
    set status = case when v_result = 'ignored' then 'ignored' else 'processed' end,
        error = case when v_result = 'ignored' then 'echo without conversation' end,
        processed_at = now(), showroom_id = v_int.showroom_id
    where id = v_ev.id;
  return v_result;
end;
$$;

revoke all on function public.process_messenger_event(bigint, text) from public, anon, authenticated;
grant execute on function public.process_messenger_event(bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- Zalo OA: xử lý webhook
-- ---------------------------------------------------------------------------

-- Xử lý một sự kiện Zalo OA đã lưu trong webhook_events (provider 'zalo_oa'). payload là nguyên sự kiện của Zalo.
-- p_display_name: tên khách lấy từ API Zalo (nếu có). p_phone: số khách chia sẻ (user_submit_info), đã chuẩn hóa ở
-- server ứng dụng: { raw, e164, masked, valid, country? }.
create or replace function public.process_zalo_event(p_event_id bigint, p_display_name text default null,
                                                     p_phone jsonb default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.webhook_events;
  v_name text;
  v_inbound boolean;
  v_echo boolean;
  v_info boolean;
  v_oa text;
  v_user text;
  v_int public.integrations;
  v_result text;
  v_conv public.conversations;
  v_owner uuid;
  v_info_name text;
begin
  select * into v_ev from public.webhook_events
  where id = p_event_id and provider = 'zalo_oa' and status = 'received' and signature_valid
  for update skip locked;
  if not found then
    return 'skipped';
  end if;

  v_name := v_ev.payload ->> 'event_name';
  v_inbound := v_name like 'user\_send\_%';
  v_echo := v_name like 'oa\_send\_%';
  v_info := v_name = 'user_submit_info';
  if not (v_inbound or v_echo or v_info) then
    -- Theo dõi, đã nhận, đã xem…: CRM chưa dùng.
    update public.webhook_events set status = 'ignored', error = 'event not used', processed_at = now()
    where id = v_ev.id;
    return 'ignored';
  end if;

  v_oa := case when v_echo then v_ev.payload -> 'sender' ->> 'id' else v_ev.payload -> 'recipient' ->> 'id' end;
  v_user := case when v_echo then v_ev.payload -> 'recipient' ->> 'id' else v_ev.payload -> 'sender' ->> 'id' end;
  select * into v_int from public.integrations
  where key = 'zalo_oa' and config ->> 'oaId' = v_oa
  order by created_at
  limit 1;
  if not found then
    update public.webhook_events set status = 'ignored', error = 'oa not connected', processed_at = now()
    where id = v_ev.id;
    return 'ignored';
  end if;
  if v_int.status = 'paused' then
    return 'paused';
  end if;
  if v_user is null or v_user !~ '^[0-9]{1,32}$' then
    update public.webhook_events set status = 'failed', error = 'missing user', processed_at = now()
    where id = v_ev.id;
    return 'ignored';
  end if;

  v_result := public.ingest_channel_message(jsonb_build_object(
    'showroom_id', v_int.showroom_id,
    'integration_id', v_int.id,
    'channel', 'zalo',
    'page_id', v_oa,
    'external_user_id', v_user,
    'identity_type', 'zalo_user_id',
    'consent_channel', 'zalo_oa',
    'lead_source', 'zalo_oa',
    'source_key', 'zalo_oa',
    'label', 'Zalo',
    'echo', v_echo,
    'mid', coalesce(v_ev.payload -> 'message' ->> 'msg_id', v_ev.external_id),
    -- Khách gửi form thông tin: ghi một dòng trong hội thoại để người trả lời biết, số chỉ nằm ở định danh.
    'text', case when v_info then 'Khách đã chia sẻ thông tin liên hệ qua Zalo'
                 else v_ev.payload -> 'message' ->> 'text' end,
    'attachments', coalesce(v_ev.payload -> 'message' -> 'attachments', '[]'::jsonb),
    'at', coalesce(to_timestamp((v_ev.payload ->> 'timestamp')::bigint / 1000.0), v_ev.received_at),
    'display_name', coalesce(nullif(p_display_name, ''), case when v_info then v_ev.payload -> 'info' ->> 'name' end)
  ));

  -- Số điện thoại khách tự chia sẻ: thêm vào định danh của khách. Số đang thuộc khách khác thì không gộp tự động,
  -- chỉ tạo việc cho người gộp hồ sơ kiểm tra (CLAUDE.md mục 6).
  if v_info and v_result = 'processed' and coalesce((p_phone ->> 'valid')::boolean, false)
     and coalesce(p_phone ->> 'e164', '') ~ '^\+[1-9][0-9]{6,14}$' then
    select * into v_conv from public.conversations
    where showroom_id = v_int.showroom_id and channel = 'zalo' and external_user_id = v_user;
    select contact_id into v_owner from public.contact_identities
    where showroom_id = v_int.showroom_id and type = 'phone' and value = p_phone ->> 'e164';
    if v_owner is null then
      insert into public.contact_identities
        (showroom_id, contact_id, type, value, value_raw, display_masked, is_primary, source)
      values (v_int.showroom_id, v_conv.contact_id, 'phone', p_phone ->> 'e164', p_phone ->> 'raw',
              coalesce(nullif(p_phone ->> 'masked', ''), '••••••'),
              not exists (select 1 from public.contact_identities
                          where contact_id = v_conv.contact_id and type = 'phone'),
              'zalo_oa');
      perform public.record_event('identity_added', v_int.showroom_id, v_conv.contact_id, v_conv.lead_id,
        jsonb_build_object('type', 'phone', 'source', 'zalo_oa'), 'customer');
      if nullif(p_phone ->> 'country', '') is not null and exists (
        select 1 from public.markets
        where showroom_id = v_int.showroom_id and country_code = p_phone ->> 'country' and is_active
      ) then
        update public.contacts set country_of_residence = p_phone ->> 'country'
        where id = v_conv.contact_id and country_of_residence = 'unknown';
      end if;
    elsif v_owner <> v_conv.contact_id then
      insert into public.tasks (showroom_id, type, title, contact_id, lead_id, due_at, priority, source, rule_key)
      values (v_int.showroom_id, 'data_fix', 'Số khách chia sẻ qua Zalo trùng với một khách khác, kiểm tra gộp hồ sơ',
              v_conv.contact_id, v_conv.lead_id, now(), 1, 'rule', 'zalo_phone_conflict');
    end if;
    v_info_name := nullif(btrim(v_ev.payload -> 'info' ->> 'name'), '');
    if v_info_name is not null then
      update public.contacts set full_name = left(v_info_name, 200)
      where id = v_conv.contact_id and full_name like 'Khách Zalo %';
    end if;
  end if;

  update public.webhook_events
    set status = case when v_result = 'ignored' then 'ignored' else 'processed' end,
        error = case when v_result = 'ignored' then 'echo without conversation' end,
        processed_at = now(), showroom_id = v_int.showroom_id
    where id = v_ev.id;
  return v_result;
end;
$$;

revoke all on function public.process_zalo_event(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.process_zalo_event(bigint, text, jsonb) to service_role;

-- Job mỗi phút: tin Zalo chưa xử lý quá 30 giây. Không có số điện thoại chuẩn hóa ở đây: form thông tin bị sót chỉ
-- ghi dòng hội thoại, số do nhân viên nhập lại (hiếm).
create or replace function public.process_zalo_backlog()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_n int := 0;
begin
  for v_id in
    select id from public.webhook_events
    where provider = 'zalo_oa' and status = 'received' and signature_valid
      and received_at < now() - interval '30 seconds'
    order by id
    limit 500
  loop
    begin
      if public.process_zalo_event(v_id) = 'processed' then
        v_n := v_n + 1;
      end if;
    exception when others then
      update public.webhook_events set status = 'failed', error = left(sqlerrm, 500), processed_at = now()
      where id = v_id;
    end;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.process_zalo_backlog() from public, anon, authenticated;

select cron.schedule('zalo-backlog', '* * * * *', 'select public.process_zalo_backlog()');

-- ---------------------------------------------------------------------------
-- Trả lời từ CRM
-- ---------------------------------------------------------------------------

-- Luật chung trước khi gửi: đăng nhập, không "xem như", quyền gửi của kênh, xem được hội thoại, nội dung, chế độ trả
-- lời, đồng ý, giữ bất ngờ. Trả về hội thoại.
create or replace function public.assert_channel_reply(p_conversation uuid, p_channel text, p_perm text,
                                                       p_integration text, p_consent_channel text, p_text text)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_int public.integrations;
  v_text text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm(p_perm) then
    raise exception 'not allowed to send % messages', p_channel using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and channel = p_channel;
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'no_data_found';
  end if;
  if v_text = '' then
    raise exception 'empty_text' using errcode = '22023';
  end if;
  if length(v_text) > 2000 then
    raise exception 'too_long' using errcode = '22023';
  end if;
  select * into v_int from public.integrations where showroom_id = v_conv.showroom_id and key = p_integration;
  if not found or v_int.status in ('not_connected', 'not_available') then
    raise exception 'not_connected' using errcode = 'P0001';
  end if;
  if v_int.reply_mode = 'external' then
    raise exception 'reply_mode_external' using errcode = 'P0001';
  end if;
  if v_int.reply_mode = 'off' then
    raise exception 'channel_off' using errcode = 'P0001';
  end if;
  if v_int.status = 'paused' then
    raise exception 'channel_paused' using errcode = 'P0001';
  end if;
  if public.contact_blocked(v_conv.contact_id, 'care', p_consent_channel) then
    raise exception 'consent_blocked' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.leads l
    where l.recipient_contact_id = v_conv.contact_id and l.contact_id <> v_conv.contact_id
      and l.keep_surprise and l.deleted_at is null and l.stage not in ('won', 'lost')
  ) then
    raise exception 'keep_surprise' using errcode = 'P0001';
  end if;
  return v_conv;
end;
$$;

revoke all on function public.assert_channel_reply(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Tin tư vấn Zalo: trong 48 giờ sau tương tác của khách thì miễn phí; ngoài đó cần nhân viên xác nhận tin tính phí
-- (thẻ 'paid' để đếm theo tháng). Khách chưa từng nhắn thì không gửi tin tư vấn.
-- Trả về { message_id, oa_id, user_id, paid }.
create or replace function public.queue_zalo_reply(p_conversation uuid, p_text text, p_confirm_paid boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_paid boolean;
  v_msg uuid;
begin
  v_conv := public.assert_channel_reply(p_conversation, 'zalo', 'message.zalo_send', 'zalo_oa', 'zalo_oa', p_text);
  if v_conv.last_inbound_at is null then
    raise exception 'window_closed' using errcode = 'P0001';
  end if;
  v_paid := v_conv.last_inbound_at <= now() - interval '48 hours';
  if v_paid and not coalesce(p_confirm_paid, false) then
    raise exception 'paid_confirm_required' using errcode = 'P0001';
  end if;

  insert into public.messages (showroom_id, conversation_id, direction, text, sent_by, sent_via, tag, status)
  values (v_conv.showroom_id, v_conv.id, 'out', btrim(p_text), auth.uid(), 'crm',
          case when v_paid then 'paid' end, 'queued')
  returning id into v_msg;

  return jsonb_build_object('message_id', v_msg, 'oa_id', v_conv.page_id, 'user_id', v_conv.external_user_id,
                            'paid', v_paid);
end;
$$;

revoke all on function public.queue_zalo_reply(uuid, text, boolean) from public, anon;
grant execute on function public.queue_zalo_reply(uuid, text, boolean) to authenticated;

-- Kết quả gửi của mọi kênh (service_role): gửi được thì ghi mã tin, dừng đồng hồ SLA, ghi sự kiện cho người gửi.
create or replace function public.finish_channel_reply(p_message uuid, p_mid text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.messages;
  v_conv public.conversations;
  v_label text;
begin
  select * into v_msg from public.messages where id = p_message and direction = 'out' and sent_via = 'crm'
  for update;
  if not found or v_msg.status not in ('queued', 'sent') then
    return;
  end if;
  select * into v_conv from public.conversations where id = v_msg.conversation_id;
  v_label := case v_conv.channel when 'messenger' then 'Messenger' when 'zalo' then 'Zalo' else v_conv.channel end;

  if p_error is not null then
    update public.messages set status = 'failed', error = left(p_error, 300) where id = v_msg.id;
    return;
  end if;

  -- Bản sao (echo) về trước khi CRM kịp ghi kết quả và không nhận ra được: bỏ bản sao, giữ tin của CRM.
  if nullif(p_mid, '') is not null then
    delete from public.messages
    where showroom_id = v_msg.showroom_id and external_message_id = p_mid and id <> v_msg.id and sent_via = 'page';
  end if;
  update public.messages
    set status = 'sent', error = null, occurred_at = now(),
        external_message_id = coalesce(external_message_id, nullif(p_mid, ''))
    where id = v_msg.id;
  update public.conversations set last_message_at = now() where id = v_conv.id;

  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, actor_type, actor_id, payload)
  select v_conv.showroom_id, v_conv.channel || '_out', v_conv.contact_id, c.household_id, v_conv.lead_id, 'user',
         v_msg.sent_by,
         jsonb_strip_nulls(jsonb_build_object('conversation_id', v_conv.id, 'message_id', v_msg.id,
                                              'tag', v_msg.tag))
  from public.contacts c where c.id = v_conv.contact_id;

  if v_conv.lead_id is not null then
    -- Tin đi đầu tiên dừng đồng hồ SLA và đưa lead mới sang "đã liên hệ" (CLAUDE.md mục 6, 7).
    update public.leads
      set first_contact_at = coalesce(first_contact_at, now()),
          stage = case when stage = 'new' then 'contacted' else stage end
      where id = v_conv.lead_id;
    update public.tasks
      set status = 'done', outcome = 'Đã nhắn qua ' || v_label
      where lead_id = v_conv.lead_id and status = 'open' and type = 'first_contact';
  end if;
end;
$$;

revoke all on function public.finish_channel_reply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_channel_reply(uuid, text, text) to service_role;

-- Tên cũ giữ cho server đang chạy bản trước.
create or replace function public.finish_messenger_reply(p_message uuid, p_mid text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.finish_channel_reply(p_message, p_mid, p_error);
$$;

revoke all on function public.finish_messenger_reply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_messenger_reply(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Báo Owner khi đấu nối lỗi (làm mới token thất bại…), CLAUDE.md 10.4, 11.2
-- ---------------------------------------------------------------------------

-- Đặt đấu nối sang Lỗi kèm câu dễ hiểu, báo người có settings.integrations trên chuông (một lần cho mỗi lần chuyển
-- sang Lỗi). Server gọi bằng service_role.
create or replace function public.mark_integration_error(p_showroom uuid, p_key text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  select status into v_old from public.integrations where showroom_id = p_showroom and key = p_key for update;
  update public.integrations
    set status = 'error', last_error = left(p_message, 500), last_error_at = now(), refresh_lock_until = null
    where showroom_id = p_showroom and key = p_key;
  if v_old is distinct from 'error' then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select pr.showroom_id, pr.id, 'integration_error', 'Đấu nối bị lỗi, cần kết nối lại', '/settings/integrations'
    from public.profiles pr
    where pr.showroom_id = p_showroom and pr.is_active and public.has_perm_for(pr.id, 'settings.integrations');
  end if;
end;
$$;

revoke all on function public.mark_integration_error(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_integration_error(uuid, text, text) to service_role;
