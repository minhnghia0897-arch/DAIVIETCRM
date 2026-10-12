-- Khách đang hỏi (Owner chốt 12/10/2026, sửa CLAUDE.md mục 6 và 16).
--
-- Không phải khách nào nhắn hỏi cũng mua, nên tin của người lạ qua Messenger, Zalo không còn tự thành lead:
--   * Tin đầu tiên tạo khách (giai đoạn "Người lạ") và hội thoại, chưa có lead. Hội thoại được chia vòng cho telesale
--     đang trực (có lead.receive, như phân lead) để trả lời; không ai trực thì người xem mọi hội thoại được báo.
--   * Sale admin, Owner (lead.assign) thấy khách có tiềm năng thì bấm "Chuyển thành lead" (qualify_conversation): lead
--     mới giao cho chính người đang trả lời hội thoại (hoặc người được chọn), tính SLA như mọi lead.
--   * Khách đã có lead đang mở (hoặc thất bại chưa quá 30 ngày) thì tin vẫn nối vào lead đó như trước.
--   * Form quảng cáo Facebook, nhập tay, nhập file vẫn thành lead ngay (ingest_lead không đổi).
--   * Lead đã tự tạo từ tin nhắn mà chưa có báo giá, đơn thì đưa về khách đang hỏi (cuối file).

-- ---------------------------------------------------------------------------
-- Người phụ trách hội thoại khi chưa có lead
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column assigned_to uuid references public.profiles (id),
  add column assigned_at timestamptz;

create index conversations_assigned_idx on public.conversations (assigned_to) where assigned_to is not null;

-- Ai xem được hội thoại: có message.view_all; đang giữ lead gắn với hội thoại; hoặc được giao hội thoại chưa có lead.
-- Hội thoại đã có lead thì chỉ theo người giữ lead: lead chuyển người khác là người cũ mất quyền xem ngay.
create or replace function public.can_see_conversation(p_conversation public.conversations)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_conversation.showroom_id = public.current_showroom_id()
    and (
      public.has_perm('message.view_all')
      or exists (
        select 1 from public.leads l
        where l.id = p_conversation.lead_id and l.deleted_at is null
          and l.assigned_to = public.effective_uid() and public.has_perm('lead.view_own')
      )
      or (
        p_conversation.lead_id is null
        and p_conversation.assigned_to = public.effective_uid()
        and public.has_perm('lead.view_own')
      )
    );
$fn$;

-- Ai xem được khách: như cũ, thêm người được giao hội thoại chưa có lead của khách đó.
create or replace function public.can_view_contact(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.contacts c
    where c.id = p_contact_id
      and c.deleted_at is null
      and c.showroom_id = public.current_showroom_id()
      and (
        public.has_perm('lead.view_all')
        or (
          public.has_perm('lead.view_own')
          and (
            exists (
              select 1 from public.leads l
              where l.deleted_at is null
                and l.assigned_to = public.effective_uid()
                and (l.contact_id = c.id or l.recipient_contact_id = c.id)
            )
            or exists (
              select 1 from public.conversations cv
              where cv.contact_id = c.id and cv.lead_id is null and cv.assigned_to = public.effective_uid()
            )
          )
        )
      )
  );
$fn$;

-- Ai sửa được hồ sơ khách (cột phải Hội thoại): như cũ, thêm người được giao hội thoại chưa có lead của khách đó.
create or replace function public.assert_contact_editor(p_contact_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_showroom uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  select showroom_id into v_showroom from public.contacts
  where id = p_contact_id and deleted_at is null and showroom_id = public.current_showroom_id();
  if v_showroom is null or not public.can_view_contact(p_contact_id) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if not coalesce(
    public.has_perm('lead.edit_all')
    or (public.has_perm('lead.edit_own') and (
      exists (
        select 1 from public.leads l
        where l.deleted_at is null and l.assigned_to = v_user
          and (l.contact_id = p_contact_id or l.recipient_contact_id = p_contact_id)
      )
      or exists (
        select 1 from public.conversations cv
        where cv.contact_id = p_contact_id and cv.lead_id is null and cv.assigned_to = v_user
      )
    )),
    false
  ) then
    raise exception 'not allowed to edit this contact' using errcode = '42501';
  end if;
  return v_showroom;
end;
$fn$;

revoke all on function public.assert_contact_editor(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chia hội thoại chưa có lead cho telesale đang trực
-- ---------------------------------------------------------------------------

-- Vòng tròn theo người nhận lead (lead_receivers: có lead.receive, đang trực, không nghỉ), tiếp sau người được giao
-- hội thoại gần nhất. Không ai trực thì trả null, hội thoại nằm ở "Chưa giao".
create or replace function public.route_conversation(p_conversation uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_conv public.conversations;
  v_last uuid;
  v_pick uuid;
  v_first uuid;
  v_found_last boolean := false;
  r record;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or v_conv.lead_id is not null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('conversation_routing:' || v_conv.showroom_id::text));

  select assigned_to into v_last from public.conversations
  where showroom_id = v_conv.showroom_id and assigned_to is not null and assigned_at is not null
  order by assigned_at desc
  limit 1;

  for r in select * from public.lead_receivers(v_conv.showroom_id) loop
    if v_first is null then v_first := r.id; end if;
    if v_found_last and v_pick is null then v_pick := r.id; end if;
    if r.id = v_last then v_found_last := true; end if;
  end loop;
  v_pick := coalesce(v_pick, v_first);
  if v_pick is null then
    return null;
  end if;

  update public.conversations set assigned_to = v_pick, assigned_at = now() where id = v_conv.id;
  perform public.record_event('conversation_assignment', v_conv.showroom_id, v_conv.contact_id, null,
    jsonb_build_object('conversation_id', v_conv.id, 'from', v_conv.assigned_to, 'to', v_pick, 'reason', 'auto'),
    'system');
  return v_pick;
end;
$fn$;

revoke all on function public.route_conversation(uuid) from public, anon, authenticated;

-- Chia lại hội thoại chưa có người phụ trách (khách nhắn trong 7 ngày, chưa xong), cũ trước. Gọi khi có người bật Trực.
create or replace function public.route_unassigned_conversations(p_showroom_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select id from public.conversations
    where showroom_id = p_showroom_id and lead_id is null and assigned_to is null and status = 'open'
      and last_inbound_at > now() - interval '7 days'
    order by last_inbound_at
    limit 200
  loop
    if public.route_conversation(v_id) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$fn$;

revoke all on function public.route_unassigned_conversations(uuid) from public, anon, authenticated;

-- Bật Trực: như bản ở 20261007000900_duty_shifts, chia thêm hội thoại chưa có người phụ trách.
create or replace function public.route_no_receiver_leads(p_showroom_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
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
  perform public.route_unassigned_conversations(p_showroom_id);
  return v_n;
end;
$fn$;

revoke all on function public.route_no_receiver_leads(uuid) from public, anon, authenticated;

-- Khóa người dùng: như cũ trả lead đang mở về "Chưa phân", thêm trả hội thoại chưa có lead về "Chưa giao".
create or replace function public.release_work_on_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if old.is_active and not new.is_active then
    perform set_config('app.assignment_reason', 'user_locked', true);
    update public.leads
      set assigned_to = null
      where assigned_to = new.id and deleted_at is null and stage not in ('won', 'lost');
    perform set_config('app.assignment_reason', '', true);
    update public.conversations
      set assigned_to = null, assigned_at = null
      where assigned_to = new.id and lead_id is null;
  end if;
  return new;
end;
$fn$;

-- Giao, chuyển hội thoại chưa có lead (ô "Nhân viên phụ trách" ở Hội thoại). Hội thoại đã có lead thì giao lead
-- (assign_leads). Cần lead.assign.
create or replace function public.assign_conversation(p_conversation uuid, p_assignee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('lead.assign') then
    raise exception 'not allowed to assign conversations' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if v_conv.lead_id is not null then
    raise exception 'conversation has a lead, assign the lead instead' using errcode = '22023';
  end if;
  if p_assignee is not null and not exists (
    select 1 from public.profiles
    where id = p_assignee and showroom_id = v_conv.showroom_id and is_active
      and (public.has_perm_for(id, 'lead.view_own') or public.has_perm_for(id, 'lead.view_all'))
  ) then
    raise exception 'assignee cannot hold conversations' using errcode = '22023';
  end if;
  if v_conv.assigned_to is not distinct from p_assignee then
    return;
  end if;

  update public.conversations
    set assigned_to = p_assignee, assigned_at = case when p_assignee is null then null else now() end
    where id = v_conv.id;
  perform public.record_event('conversation_assignment', v_conv.showroom_id, v_conv.contact_id, null,
    jsonb_build_object('conversation_id', v_conv.id, 'from', v_conv.assigned_to, 'to', p_assignee,
      'reason', 'manual'));
  if p_assignee is not null and p_assignee <> v_user then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    values (v_conv.showroom_id, p_assignee, 'conversation_assigned', 'Anh chị được giao một hội thoại',
            '/inbox?c=' || v_conv.id);
  end if;
  perform public.write_audit('conversation.assign', 'conversations', v_conv.id::text,
    jsonb_build_object('from', v_conv.assigned_to, 'to', p_assignee));
end;
$fn$;

revoke all on function public.assign_conversation(uuid, uuid) from public, anon;
grant execute on function public.assign_conversation(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chuyển thành lead
-- ---------------------------------------------------------------------------

-- Sale admin, Owner (lead.assign) chuyển khách đang hỏi thành lead. Lead giao cho người được chọn, không chọn thì
-- người đang phụ trách hội thoại, không có ai thì chia vòng như lead mới. Hội thoại đã có tin trả lời thì lead tính là
-- đã liên hệ (giờ liên hệ đầu là tin trả lời đầu tiên). Trả về mã lead.
create or replace function public.qualify_conversation(p_conversation uuid, p_assignee uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations;
  v_lead uuid;
  v_to uuid;
  v_first_out timestamptz;
  v_rules public.assignment_rules;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('lead.assign') then
    raise exception 'not allowed to qualify conversations' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if v_conv.contact_id is null then
    raise exception 'conversation has no contact' using errcode = '22023';
  end if;

  -- Khách đã có lead đang mở: gắn hội thoại vào lead đó, không tạo lead thứ hai.
  select id into v_lead from public.leads
  where contact_id = v_conv.contact_id and deleted_at is null and stage not in ('won', 'lost')
  order by created_at desc
  limit 1;
  if v_lead is not null then
    update public.conversations set lead_id = v_lead where id = v_conv.id;
    return v_lead;
  end if;

  v_to := coalesce(p_assignee, v_conv.assigned_to);
  if v_to is not null and not exists (
    select 1 from public.profiles
    where id = v_to and showroom_id = v_conv.showroom_id and is_active
      and (public.has_perm_for(id, 'lead.view_own') or public.has_perm_for(id, 'lead.view_all'))
  ) then
    if p_assignee is not null then
      raise exception 'assignee cannot hold leads' using errcode = '22023';
    end if;
    v_to := null;
  end if;

  select min(occurred_at) into v_first_out from public.messages
  where conversation_id = v_conv.id and direction = 'out' and status = 'sent';
  select * into v_rules from public.assignment_rules where showroom_id = v_conv.showroom_id;

  insert into public.leads (showroom_id, contact_id, source, source_detail, created_by, first_contact_at, stage)
  values (
    v_conv.showroom_id, v_conv.contact_id,
    case v_conv.channel when 'zalo' then 'zalo_oa' else 'meta_messenger' end,
    jsonb_build_object('page_id', v_conv.page_id,
      'source_key', case v_conv.channel when 'zalo' then 'zalo_oa' else 'fb_messenger' end,
      'qualified_from', 'conversation', 'conversation_id', v_conv.id),
    v_user, v_first_out, case when v_first_out is null then 'new' else 'contacted' end
  )
  returning id into v_lead;

  update public.conversations set lead_id = v_lead where id = v_conv.id;
  update public.contacts set lifecycle_stage = 'lead' where id = v_conv.contact_id and lifecycle_stage = 'stranger';

  if v_to is not null then
    perform set_config('app.assignment_reason', 'Chuyển từ hội thoại', true);
    update public.leads
      set assigned_to = v_to,
          sla_due_at = case when first_contact_at is null
                            then now() + make_interval(mins => coalesce(v_rules.sla_minutes, 5)) end
      where id = v_lead;
    perform set_config('app.assignment_reason', '', true);
    if v_to <> v_user then
      insert into public.notifications (showroom_id, user_id, type, title, link)
      values (v_conv.showroom_id, v_to, 'lead_assigned', 'Khách anh chị đang trả lời đã được chuyển thành lead',
              '/inbox?c=' || v_conv.id);
    end if;
  else
    perform public.route_lead(v_lead);
  end if;

  perform public.record_event('lead_qualified', v_conv.showroom_id, v_conv.contact_id, v_lead,
    jsonb_build_object('conversation_id', v_conv.id, 'channel', v_conv.channel));
  perform public.write_audit('lead.qualify', 'leads', v_lead::text,
    jsonb_build_object('conversation_id', v_conv.id, 'to', v_to));
  return v_lead;
end;
$fn$;

revoke all on function public.qualify_conversation(uuid, uuid) from public, anon;
grant execute on function public.qualify_conversation(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Nhận tin: như bản ở 20261009000100_zalo_oa, bỏ phần tạo lead mới
-- ---------------------------------------------------------------------------

create or replace function public.ingest_channel_message(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
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
  v_name text;
  v_msg uuid;
  v_crm uuid;
  v_holder uuid;
  v_routed boolean := false;
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
      -- Khách đang hỏi: giai đoạn "Người lạ" cho tới khi được chuyển thành lead.
      insert into public.contacts (showroom_id, full_name)
      values (v_showroom, v_name)
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

  if not v_echo then
    -- Gắn hội thoại vào lead còn dùng được (lead mở, hoặc thất bại chưa quá 30 ngày). Không có thì là khách đang hỏi:
    -- không tạo lead, Sale admin chuyển thành lead khi thấy tiềm năng.
    v_lead := v_conv.lead_id;
    if v_lead is null or v_lead is distinct from public.reusable_lead_for(v_conv.contact_id) then
      v_lead := public.reusable_lead_for(v_conv.contact_id);
      if v_lead is not null then
        perform public.record_event('lead_created', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('source', p ->> 'lead_source', 'source_key', p ->> 'source_key', 'attached', true),
          'customer');
        perform public.record_event('merge', v_showroom, v_conv.contact_id, v_lead,
          jsonb_build_object('reason', 'open_lead', 'matched_by', p ->> 'identity_type'), 'system');
      end if;
      if v_lead is distinct from v_conv.lead_id then
        update public.conversations set lead_id = v_lead where id = v_conv.id;
        v_conv.lead_id := v_lead;
      end if;
    end if;
    -- Khách đang hỏi chưa có người phụ trách (hoặc người phụ trách đã bị khóa): chia cho telesale đang trực.
    if v_conv.lead_id is null and (v_conv.assigned_to is null or not exists (
      select 1 from public.profiles where id = v_conv.assigned_to and is_active
    )) then
      v_conv.assigned_to := public.route_conversation(v_conv.id);
      v_routed := v_conv.assigned_to is not null;
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

  if not v_echo and (v_conv.unread_count = 0 or v_routed) then
    -- Báo một lần cho mỗi lượt tin chưa đọc, không báo từng tin. Người nhận: người giữ lead, không có thì người phụ
    -- trách hội thoại, không có ai thì những người xem mọi hội thoại.
    select assigned_to into v_holder from public.leads where id = v_conv.lead_id and deleted_at is null;
    v_holder := coalesce(v_holder, case when v_conv.lead_id is null then v_conv.assigned_to end);
    if v_holder is not null then
      insert into public.notifications (showroom_id, user_id, type, title, link)
      values (v_showroom, v_holder, 'message_in',
              case when v_routed then 'Anh chị được giao khách mới nhắn qua ' || v_label
                   else 'Khách vừa nhắn qua ' || v_label end,
              '/inbox?c=' || v_conv.id);
    else
      insert into public.notifications (showroom_id, user_id, type, title, link)
      select pr.showroom_id, pr.id, 'message_in', 'Khách chưa có người phụ trách vừa nhắn qua ' || v_label,
             '/inbox?c=' || v_conv.id
      from public.profiles pr
      where pr.showroom_id = v_showroom and pr.is_active and public.has_perm_for(pr.id, 'message.view_all');
    end if;
  end if;

  update public.integrations set last_event_at = now(), last_success_at = now()
  where id = (p ->> 'integration_id')::uuid;
  return 'processed';
end;
$fn$;

revoke all on function public.ingest_channel_message(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Đưa lead đã tự tạo từ tin nhắn mà chưa có báo giá, đơn về khách đang hỏi (Owner chốt 12/10/2026)
-- ---------------------------------------------------------------------------

-- Lead giữ ở dạng xóa mềm (deleted_at) để còn tra lại; hội thoại giao cho đúng người đang giữ lead; việc đang mở của
-- lead được hủy kèm lý do; khách không còn lead, đơn nào thì về giai đoạn "Người lạ".
do $do$
declare
  v_ids uuid[];
  v_n int;
  r record;
begin
  select coalesce(array_agg(l.id), '{}') into v_ids
  from public.leads l
  where l.deleted_at is null and l.source in ('meta_messenger', 'zalo_oa')
    and l.stage in ('new', 'contacted', 'demo')
    and coalesce(l.source_detail ->> 'qualified_from', '') <> 'conversation'
    and not exists (select 1 from public.quotes q where q.lead_id = l.id)
    and not exists (select 1 from public.orders o where o.lead_id = l.id);
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;
  end if;

  update public.conversations c
    set lead_id = null, assigned_to = l.assigned_to,
        assigned_at = case when l.assigned_to is null then null else now() end
    from public.leads l
    where c.lead_id = l.id and l.id = any (v_ids);

  update public.tasks
    set status = 'cancelled', outcome = 'Lead tự tạo từ tin nhắn được đưa về khách đang hỏi'
    where lead_id = any (v_ids) and status = 'open';

  for r in select id, showroom_id, contact_id from public.leads where id = any (v_ids) loop
    perform public.record_event('lead_reverted', r.showroom_id, r.contact_id, r.id,
      jsonb_build_object('reason', 'inquiry_rule_2026_10_12'), 'system');
  end loop;

  update public.leads set deleted_at = now() where id = any (v_ids);

  update public.contacts c
    set lifecycle_stage = 'stranger'
    where c.lifecycle_stage = 'lead'
      and c.id in (select contact_id from public.leads where id = any (v_ids))
      and not exists (select 1 from public.leads l where l.contact_id = c.id and l.deleted_at is null)
      and not exists (select 1 from public.orders o where o.buyer_contact_id = c.id);

  perform public.write_audit('lead.revert_to_inquiry', 'leads', null,
    jsonb_build_object('count', v_n, 'showroom_id', (select showroom_id from public.leads where id = v_ids[1])),
    'system');
end
$do$;

-- HẾT FILE
