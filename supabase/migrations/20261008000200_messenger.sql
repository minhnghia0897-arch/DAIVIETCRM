-- Tin nhắn Facebook (Messenger, CLAUDE.md mục 10.3, 10.5): hội thoại và tin nhắn, nhận webhook, trả lời trong khung
-- 24 giờ (ngoài khung chỉ thẻ Human Agent trong 7 ngày, nhân viên trả lời tay), quyền gửi riêng message.messenger_send.
--
-- Đường đi của một tin đến: route handler /api/webhooks/meta kiểm chữ ký, ghi từng tin vào webhook_events (chống
-- trùng theo mã tin), trả 200, rồi gọi process_messenger_event(); job mỗi phút xử lý lại tin còn sót.
-- Đường đi của một tin trả lời: queue_messenger_reply() kiểm quyền, khung giờ, chế độ trả lời, đồng ý, giữ bất ngờ và
-- ghi tin ở trạng thái "queued"; server gọi Send API rồi báo kết quả bằng finish_messenger_reply().
-- Nội dung tin chỉ nằm ở bảng messages (và hộp nhận thô webhook_events), không nằm trong events, audit_logs,
-- notifications.

-- ---------------------------------------------------------------------------
-- Hội thoại, tin nhắn
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  channel text not null check (channel in ('messenger', 'zalo')),
  -- Page (Messenger) hoặc OA (Zalo) nhận tin.
  page_id text not null,
  -- PSID của khách trên Page (Messenger), mã người dùng (Zalo).
  external_user_id text not null,
  contact_id uuid references public.contacts (id),
  lead_id uuid references public.leads (id),
  display_name text,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, channel, external_user_id)
);

create index conversations_lead_idx on public.conversations (lead_id);
create index conversations_recent_idx on public.conversations (showroom_id, last_message_at desc);

create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  external_message_id text,
  text text,
  attachments jsonb not null default '[]'::jsonb,
  sent_by uuid,
  -- crm: gửi từ CRM; page: nhân viên trả lời thẳng trên Page hoặc công cụ khác (Meta gửi bản sao "echo").
  sent_via text check (sent_via in ('crm', 'page')),
  tag text,
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'failed')),
  error text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (showroom_id, external_message_id)
);

create index messages_conversation_idx on public.messages (conversation_id, occurred_at);

-- Người xem được hội thoại: có message.view_all, hoặc đang giữ lead gắn với hội thoại.
create or replace function public.can_see_conversation(p_conversation public.conversations)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_conversation.showroom_id = public.current_showroom_id()
    and (
      public.has_perm('message.view_all')
      or exists (
        select 1 from public.leads l
        where l.id = p_conversation.lead_id and l.deleted_at is null
          and l.assigned_to = public.effective_uid() and public.has_perm('lead.view_own')
      )
    );
$$;

revoke all on function public.can_see_conversation(public.conversations) from public, anon;
grant execute on function public.can_see_conversation(public.conversations) to authenticated;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_select on public.conversations for select to authenticated
  using (public.can_see_conversation(conversations));
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id));

-- Ghi chỉ qua các hàm dưới đây.
revoke insert, update, delete on public.conversations, public.messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Đồng ý theo kênh Messenger
-- ---------------------------------------------------------------------------

alter table public.consents drop constraint consents_channel_check;
alter table public.consents add constraint consents_channel_check
  check (channel in ('call', 'zalo_oa', 'zns', 'sms', 'email', 'messenger', 'all'));

-- Khách có đang chặn liên hệ theo mục đích và kênh không: giai đoạn "Ngừng liên hệ", hoặc dòng đồng ý mới nhất
-- của kênh đó (hay "mọi kênh") là từ chối hoặc đã rút.
create or replace function public.contact_blocked(p_contact uuid, p_purpose text, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.contacts where id = p_contact and lifecycle_stage = 'do_not_contact'
    )
    or coalesce((
      select not c.granted or c.withdrawn_at is not null
      from public.consents c
      where c.contact_id = p_contact and c.purpose = p_purpose and c.channel in (p_channel, 'all')
      order by greatest(c.granted_at, coalesce(c.withdrawn_at, c.granted_at)) desc
      limit 1
    ), false);
$$;

revoke all on function public.contact_blocked(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nhận tin từ webhook
-- ---------------------------------------------------------------------------

-- Lead đang dùng được cho khách: lead mở, hoặc thất bại chưa quá 30 ngày (như ingest_lead).
create or replace function public.reusable_lead_for(p_contact uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.leads
  where contact_id = p_contact and deleted_at is null
    and (stage not in ('won', 'lost') or (stage = 'lost' and updated_at > now() - interval '30 days'))
  order by (stage not in ('won', 'lost')) desc, created_at desc
  limit 1;
$$;

revoke all on function public.reusable_lead_for(uuid) from public, anon, authenticated;

-- Xử lý một tin Messenger đã nằm trong webhook_events (provider 'meta_messenger').
-- payload: { page_id, item: <phần tử messaging của Meta> }. p_display_name: tên khách lấy từ Graph API (nếu có).
-- Trả về 'processed' | 'duplicate' | 'ignored' | 'paused' | 'skipped'.
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
  v_showroom uuid;
  v_int public.integrations;
  v_echo boolean;
  v_psid text;
  v_mid text;
  v_text text;
  v_attach jsonb;
  v_at timestamptz;
  v_meta text;
  v_conv public.conversations;
  v_contact uuid;
  v_lead uuid;
  v_new_lead boolean := false;
  v_lead_row public.leads;
  v_name text;
  v_msg uuid;
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
  v_showroom := v_int.showroom_id;

  v_echo := coalesce((v_item -> 'message' ->> 'is_echo')::boolean, false);
  v_psid := case when v_echo then v_item -> 'recipient' ->> 'id' else v_item -> 'sender' ->> 'id' end;
  v_mid := coalesce(v_item -> 'message' ->> 'mid', v_item -> 'postback' ->> 'mid', v_ev.external_id);
  v_text := left(coalesce(v_item -> 'message' ->> 'text', v_item -> 'postback' ->> 'title'), 4000);
  v_attach := coalesce(v_item -> 'message' -> 'attachments', '[]'::jsonb);
  v_at := coalesce(to_timestamp((v_item ->> 'timestamp')::bigint / 1000.0), v_ev.received_at);
  v_meta := v_item -> 'message' ->> 'metadata';

  if v_psid is null or v_psid !~ '^[0-9]{1,32}$' then
    update public.webhook_events set status = 'failed', error = 'missing sender', processed_at = now()
    where id = v_ev.id;
    return 'ignored';
  end if;

  if exists (select 1 from public.messages where showroom_id = v_showroom and external_message_id = v_mid) then
    update public.webhook_events set status = 'processed', processed_at = now(), showroom_id = v_showroom
    where id = v_ev.id;
    return 'duplicate';
  end if;

  select * into v_conv from public.conversations
  where showroom_id = v_showroom and channel = 'messenger' and external_user_id = v_psid
  for update;

  -- Bản sao tin CRM vừa gửi: chỉ gắn mã tin của Meta vào tin đã có.
  if v_echo and v_meta like 'crm:%' then
    update public.messages
      set external_message_id = coalesce(external_message_id, v_mid),
          status = case when status = 'queued' then 'sent' else status end
      where id = nullif(substr(v_meta, 5), '')::uuid and showroom_id = v_showroom and direction = 'out';
    update public.webhook_events set status = 'processed', processed_at = now(), showroom_id = v_showroom
    where id = v_ev.id;
    return 'processed';
  end if;

  if v_conv.id is null then
    if v_echo then
      -- Page nhắn trước cho người chưa từng nhắn: không đủ thông tin để tạo khách, bỏ qua.
      update public.webhook_events set status = 'ignored', error = 'echo without conversation',
        processed_at = now(), showroom_id = v_showroom
      where id = v_ev.id;
      return 'ignored';
    end if;
    v_name := coalesce(nullif(btrim(p_display_name), ''), 'Khách Messenger ' || right(v_psid, 4));

    -- Chống trùng theo định danh Facebook (CLAUDE.md mục 6).
    select ci.contact_id into v_contact
    from public.contact_identities ci
    join public.contacts c on c.id = ci.contact_id and c.deleted_at is null
    where ci.showroom_id = v_showroom and ci.type = 'fb_psid' and ci.value = v_psid;

    if v_contact is null then
      insert into public.contacts (showroom_id, full_name, lifecycle_stage)
      values (v_showroom, v_name, 'lead')
      returning id into v_contact;
      insert into public.contact_identities
        (showroom_id, contact_id, type, value, display_masked, is_primary, source)
      values (v_showroom, v_contact, 'fb_psid', v_psid, 'Messenger', true, 'meta_messenger');
      -- Khách tự nhắn tới Page: căn cứ để trả lời, chăm sóc trên chính kênh này.
      insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source)
      values (v_showroom, v_contact, 'care', 'messenger', true, 'customer_initiated_message');
    end if;

    insert into public.conversations (showroom_id, channel, page_id, external_user_id, contact_id, display_name)
    values (v_showroom, 'messenger', v_page, v_psid, v_contact, v_name)
    returning * into v_conv;
  end if;

  -- Gắn hội thoại vào lead còn dùng được; không có thì tin đầu của khách tạo lead mới.
  if not v_echo then
    v_lead := v_conv.lead_id;
    if v_lead is null or v_lead is distinct from public.reusable_lead_for(v_conv.contact_id) then
      v_lead := public.reusable_lead_for(v_conv.contact_id);
      if v_lead is not null then
        perform public.record_event('lead_created', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('source', 'meta_messenger', 'source_key', 'fb_messenger', 'attached', true),
          'customer');
        perform public.record_event('merge', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('reason', 'open_lead', 'matched_by', 'fb_psid'), 'system');
      else
        insert into public.leads (showroom_id, contact_id, source, source_detail)
        values (v_showroom, v_conv.contact_id, 'meta_messenger',
                jsonb_build_object('page_id', v_page, 'source_key', 'fb_messenger'))
        returning id into v_lead;
        v_new_lead := true;
        perform public.record_event('lead_created', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('source', 'meta_messenger', 'source_key', 'fb_messenger'), 'customer');
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
        display_name = coalesce(nullif(btrim(p_display_name), ''), display_name)
    where id = v_conv.id;

  perform public.record_event(case when v_echo then 'messenger_out' else 'messenger_in' end, v_showroom,
    v_conv.contact_id, v_conv.lead_id,
    jsonb_strip_nulls(jsonb_build_object('conversation_id', v_conv.id, 'message_id', v_msg,
      'via', case when v_echo then 'page' end)),
    case when v_echo then 'user' else 'customer' end);

  if v_echo and v_conv.lead_id is not null then
    -- Nhân viên trả lời thẳng trên Page cũng là lần liên hệ đi (dừng đồng hồ SLA, CLAUDE.md mục 7).
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
        values (v_showroom, v_lead_row.assigned_to, 'message_in', 'Khách vừa nhắn qua Messenger',
                '/inbox?c=' || v_conv.id);
      else
        insert into public.notifications (showroom_id, user_id, type, title, link)
        select p.showroom_id, p.id, 'message_in', 'Khách chưa có người giữ vừa nhắn qua Messenger',
               '/inbox?c=' || v_conv.id
        from public.profiles p
        where p.showroom_id = v_showroom and p.is_active and public.has_perm_for(p.id, 'message.view_all');
      end if;
    end if;
  end if;

  update public.integrations
    set last_event_at = now(), last_success_at = now()
    where id = v_int.id;
  update public.webhook_events set status = 'processed', processed_at = now(), showroom_id = v_showroom
  where id = v_ev.id;
  return 'processed';
end;
$$;

revoke all on function public.process_messenger_event(bigint, text) from public, anon, authenticated;
grant execute on function public.process_messenger_event(bigint, text) to service_role;

-- Job mỗi phút: tin chưa xử lý quá 30 giây (route handler lỗi giữa chừng, đấu nối đang tạm dừng rồi chạy lại).
create or replace function public.process_messenger_backlog()
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
    where provider = 'meta_messenger' and status = 'received' and signature_valid
      and received_at < now() - interval '30 seconds'
    order by id
    limit 500
  loop
    begin
      if public.process_messenger_event(v_id) = 'processed' then
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

revoke all on function public.process_messenger_backlog() from public, anon, authenticated;

select cron.schedule('messenger-backlog', '* * * * *', 'select public.process_messenger_backlog()');

-- ---------------------------------------------------------------------------
-- Trả lời từ CRM
-- ---------------------------------------------------------------------------

-- Kiểm mọi luật rồi ghi tin chờ gửi. Trả về thông tin để server gọi Send API:
-- { message_id, page_id, psid, messaging_type: 'RESPONSE' | 'MESSAGE_TAG', tag }.
-- Lỗi nghiệp vụ trả bằng mã trong message: window_closed, human_agent_only, reply_mode_external, channel_off,
-- channel_paused, not_connected, consent_blocked, keep_surprise, empty_text, too_long.
create or replace function public.queue_messenger_reply(p_conversation uuid, p_text text, p_human_agent boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations;
  v_int public.integrations;
  v_text text := btrim(coalesce(p_text, ''));
  v_type text;
  v_tag text;
  v_msg uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('message.messenger_send') then
    raise exception 'not allowed to send messenger messages' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and channel = 'messenger';
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'no_data_found';
  end if;
  if v_text = '' then
    raise exception 'empty_text' using errcode = '22023';
  end if;
  -- Giới hạn của Messenger cho một tin chữ.
  if length(v_text) > 2000 then
    raise exception 'too_long' using errcode = '22023';
  end if;

  select * into v_int from public.integrations
  where showroom_id = v_conv.showroom_id and key = 'meta_messenger';
  if not found or v_int.status in ('not_connected', 'not_available') then
    raise exception 'not_connected' using errcode = 'P0001';
  end if;
  -- Mỗi kênh chỉ một nơi trả lời (CLAUDE.md 10.1 điều 7).
  if v_int.reply_mode = 'external' then
    raise exception 'reply_mode_external' using errcode = 'P0001';
  end if;
  if v_int.reply_mode = 'off' then
    raise exception 'channel_off' using errcode = 'P0001';
  end if;
  if v_int.status = 'paused' then
    raise exception 'channel_paused' using errcode = 'P0001';
  end if;

  if public.contact_blocked(v_conv.contact_id, 'care', 'messenger') then
    raise exception 'consent_blocked' using errcode = 'P0001';
  end if;
  -- Khách là người nhận của một lead đang giữ bất ngờ: không liên hệ khi người đặt chưa cho phép.
  if exists (
    select 1 from public.leads l
    where l.recipient_contact_id = v_conv.contact_id and l.contact_id <> v_conv.contact_id
      and l.keep_surprise and l.deleted_at is null and l.stage not in ('won', 'lost')
  ) then
    raise exception 'keep_surprise' using errcode = 'P0001';
  end if;

  -- Khung 24 giờ sau tin cuối của khách; ngoài khung chỉ thẻ Human Agent, trong 7 ngày, nhân viên trả lời tay.
  if v_conv.last_inbound_at is not null and v_conv.last_inbound_at > now() - interval '24 hours' then
    v_type := 'RESPONSE';
  elsif v_conv.last_inbound_at is not null and v_conv.last_inbound_at > now() - interval '7 days' then
    if not coalesce(p_human_agent, false) then
      raise exception 'human_agent_only' using errcode = 'P0001';
    end if;
    v_type := 'MESSAGE_TAG';
    v_tag := 'HUMAN_AGENT';
  else
    raise exception 'window_closed' using errcode = 'P0001';
  end if;

  insert into public.messages (showroom_id, conversation_id, direction, text, sent_by, sent_via, tag, status)
  values (v_conv.showroom_id, v_conv.id, 'out', v_text, v_user, 'crm', v_tag, 'queued')
  returning id into v_msg;

  return jsonb_build_object('message_id', v_msg, 'page_id', v_conv.page_id, 'psid', v_conv.external_user_id,
                            'messaging_type', v_type, 'tag', v_tag);
end;
$$;

revoke all on function public.queue_messenger_reply(uuid, text, boolean) from public, anon;
grant execute on function public.queue_messenger_reply(uuid, text, boolean) to authenticated;

-- Server báo kết quả gửi (service_role). Gửi được: ghi mã tin của Meta, dừng đồng hồ SLA, ghi sự kiện cho người gửi.
create or replace function public.finish_messenger_reply(p_message uuid, p_mid text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.messages;
  v_conv public.conversations;
begin
  select * into v_msg from public.messages where id = p_message and direction = 'out' and sent_via = 'crm'
  for update;
  if not found or v_msg.status not in ('queued', 'sent') then
    return;
  end if;
  select * into v_conv from public.conversations where id = v_msg.conversation_id;

  if p_error is not null then
    update public.messages set status = 'failed', error = left(p_error, 300) where id = v_msg.id;
    return;
  end if;

  update public.messages
    set status = 'sent', error = null, occurred_at = now(),
        external_message_id = coalesce(external_message_id, nullif(p_mid, ''))
    where id = v_msg.id;
  update public.conversations set last_message_at = now() where id = v_conv.id;

  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, actor_type, actor_id, payload)
  select v_conv.showroom_id, 'messenger_out', v_conv.contact_id, c.household_id, v_conv.lead_id, 'user',
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
      set status = 'done', outcome = 'Đã nhắn qua Messenger'
      where lead_id = v_conv.lead_id and status = 'open' and type = 'first_contact';
  end if;
end;
$$;

revoke all on function public.finish_messenger_reply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_messenger_reply(uuid, text, text) to service_role;

-- Đánh dấu đã đọc một hội thoại (người xem được hội thoại).
create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Xem như là chỉ đọc: không đổi trạng thái chưa đọc của người thật.
  if (public.active_view_as()).id is not null then
    return;
  end if;
  select * into v_conv from public.conversations where id = p_conversation;
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'no_data_found';
  end if;
  update public.conversations set unread_count = 0 where id = v_conv.id and unread_count <> 0;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Quyền mới: message.messenger_send (Owner, Sale admin, Telesale)
-- ---------------------------------------------------------------------------

-- Chỉ thêm quyền mới, không chạy lại cả khối: chạy lại sẽ bật lại các quyền Owner đã tắt cho vai trò.
-- Dòng dưới khớp với kết quả của scripts/gen-permission-seed.mts (tests/unit/permissions.test.ts kiểm).
insert into public.permissions (key, "group", description, grantable, sensitive) values
  ('message.messenger_send', 'Tin nhắn', 'Gửi tin Messenger', true, false)
on conflict (key) do update set "group" = excluded."group", description = excluded.description,
  grantable = excluded.grantable, sensitive = excluded.sensitive;

insert into public.role_permissions (role_id, permission_key)
select r.id, v.permission_key from (values
  ('owner', 'message.messenger_send'),
  ('sale_admin', 'message.messenger_send'),
  ('telesale', 'message.messenger_send')
) as v (role_key, permission_key)
join public.roles r on r.key = v.role_key
on conflict do nothing;
