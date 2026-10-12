-- AI tự trả lời tin nhắn khách (Owner chốt 12/10/2026, CLAUDE.md 10.7, docs/integrations/ai_llm.md).
--
-- Trợ lý AI trả lời trước mọi tin Messenger, Zalo trên kênh Owner bật; chỉ chuyển cho người khi khẩn cấp, cần gọi điện,
-- hỏi sức khỏe, xin giảm giá, khách đòi gặp người hoặc AI không biết. Khách cần gọi (để số, xin gọi, muốn mua) thì tự
-- thành lead, giao telesale đang trực và tính SLA. AI không phải người dùng: server gọi các hàm dưới đây bằng
-- service_role, các hàm tự kiểm đủ luật như khi nhân viên gửi (chế độ trả lời, đồng ý, giữ bất ngờ, khung miễn phí).
--
-- Bật tắt: Owner bật AI và chọn kênh ở Cài đặt, Tích hợp, Trợ lý AI (integrations.config.autoReply). Từng hội thoại:
-- nhân viên Tiếp quản thì AI dừng (conversations.ai_paused_at), Trả lại AI thì chạy lại; nhân viên tự gửi tin (từ
-- CRM hay thẳng trên Page, OA) thì AI cũng dừng.
--
-- Không lưu số điện thoại hay nội dung tin trong events, audit_logs, notifications.

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

-- Kiến thức Owner viết cho AI: địa chỉ, giờ mở cửa, giao lắp, bảo hành, thanh toán, khách ở nước ngoài…
create table public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 8000),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index ai_knowledge_showroom_idx on public.ai_knowledge (showroom_id, sort);

create trigger ai_knowledge_updated_at before update on public.ai_knowledge
  for each row execute function public.set_updated_at();
create trigger ai_knowledge_audit after insert or update or delete on public.ai_knowledge
  for each row execute function public.audit_config_change();

alter table public.ai_knowledge enable row level security;

create policy ai_knowledge_select on public.ai_knowledge for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations'));
create policy ai_knowledge_write on public.ai_knowledge for all to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations')
         and (public.active_view_as()).id is null)
  with check (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations')
              and (public.active_view_as()).id is null);

-- Mỗi lượt AI xét một tin của khách. Một tin chỉ được xét một lần (unique trigger_message_id), để webhook và job quét
-- không trả lời trùng. Chi phí tính ở server theo bảng giá mô hình (lib/ai/models.ts).
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  trigger_message_id uuid not null unique references public.messages (id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'replied', 'handed_off', 'skipped', 'failed')),
  model text,
  action text check (action in ('reply', 'handoff', 'none')),
  handoff_reason text check (handoff_reason in (
    'call_request', 'purchase', 'urgent', 'complaint', 'health', 'discount', 'human_request', 'unknown',
    'budget', 'error'
  )),
  -- Tóm tắt nhu cầu cho nhân viên (số điện thoại đã được che trước khi gửi sang mô hình).
  summary text check (length(summary) <= 1000),
  lead_id uuid references public.leads (id),
  reply_message_id uuid references public.messages (id) on delete set null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  -- Phần triệu đô la Mỹ (nhà cung cấp tính tiền theo USD) và số đồng quy đổi theo tỷ giá Owner đặt.
  cost_usd_micros bigint not null default 0,
  cost_vnd bigint not null default 0,
  error text check (length(error) <= 300),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_runs_conversation_idx on public.ai_runs (conversation_id, started_at desc);
create index ai_runs_showroom_idx on public.ai_runs (showroom_id, started_at desc);

create trigger ai_runs_updated_at before update on public.ai_runs
  for each row execute function public.set_updated_at();

alter table public.ai_runs enable row level security;
revoke insert, update, delete on public.ai_runs from authenticated, anon;

-- Người xem được hội thoại thấy lượt AI của hội thoại đó (lý do chuyển, tóm tắt); Owner thấy hết để theo dõi chi phí.
create policy ai_runs_select on public.ai_runs for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (
      public.has_perm('settings.integrations')
      or exists (select 1 from public.conversations c where c.id = conversation_id and public.can_see_conversation(c))
    )
  );

alter table public.messages
  add column ai_run_id uuid references public.ai_runs (id) on delete set null;

alter table public.conversations
  add column ai_paused_at timestamptz,
  add column ai_pause_reason text check (ai_pause_reason in ('takeover', 'handoff', 'staff_reply', 'existing')),
  add column ai_paused_by uuid references public.profiles (id);

-- Hội thoại đã có nhân viên trả lời trước khi bật AI: giữ cho người đang làm, Trả lại AI khi muốn.
update public.conversations c
  set ai_paused_at = now(), ai_pause_reason = 'existing'
  where exists (select 1 from public.messages m where m.conversation_id = c.id and m.direction = 'out');

-- ---------------------------------------------------------------------------
-- Cấu hình và điều kiện AI trả lời
-- ---------------------------------------------------------------------------

-- Kênh AI đang tự trả lời của showroom: Trợ lý AI đã kết nối, đang bật, Owner chọn kênh.
create or replace function public.ai_reply_channels_for(p_showroom uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select array(
      select jsonb_array_elements_text(case when jsonb_typeof(i.config -> 'autoReply') = 'array'
                                            then i.config -> 'autoReply' else '[]'::jsonb end)
    )
    from public.integrations i
    where i.showroom_id = p_showroom and i.key = 'ai_llm' and i.status = 'connected' and i.enabled
  ), '{}');
$fn$;

revoke all on function public.ai_reply_channels_for(uuid) from public, anon, authenticated;
grant execute on function public.ai_reply_channels_for(uuid) to service_role;

-- Cho màn Hội thoại: kênh AI đang tự trả lời của showroom người đang dùng.
create or replace function public.ai_reply_channels()
returns text[]
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.ai_reply_channels_for(public.current_showroom_id());
$fn$;

revoke all on function public.ai_reply_channels() from public, anon;
grant execute on function public.ai_reply_channels() to authenticated;

-- AI đang phụ trách trả lời hội thoại: kênh được bật, hội thoại không bị dừng, kênh đang trả lời trên CRM.
create or replace function public.ai_handles(p_conv public.conversations)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_conv.ai_paused_at is null
    and p_conv.channel = any (public.ai_reply_channels_for(p_conv.showroom_id))
    and exists (
      select 1 from public.integrations i
      where i.showroom_id = p_conv.showroom_id
        and i.key = case p_conv.channel when 'zalo' then 'zalo_oa' else 'meta_messenger' end
        and i.status = 'connected' and coalesce(i.reply_mode, 'crm') = 'crm'
    );
$fn$;

revoke all on function public.ai_handles(public.conversations) from public, anon, authenticated;

-- Chi phí AI tháng này (giờ VN) của showroom, đồng.
create or replace function public.ai_month_spend(p_showroom uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(sum(cost_vnd), 0)::bigint from public.ai_runs
  where showroom_id = p_showroom
    and started_at >= (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
$fn$;

revoke all on function public.ai_month_spend(uuid) from public, anon, authenticated;
grant execute on function public.ai_month_spend(uuid) to service_role;

-- Luật kênh chung cho tin AI gửi (như assert_channel_reply, không có người dùng): kênh kết nối, trả lời trên CRM,
-- không tạm dừng, khách không từ chối, không phải người nhận đang giữ bất ngờ. Lỗi trả bằng mã trong message.
create or replace function public.ai_channel_block(p_conv public.conversations)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_int public.integrations;
  v_free interval := case when p_conv.channel = 'zalo' then interval '48 hours' else interval '24 hours' end;
  v_consent text := case when p_conv.channel = 'zalo' then 'zalo_oa' else 'messenger' end;
begin
  select * into v_int from public.integrations
  where showroom_id = p_conv.showroom_id
    and key = case when p_conv.channel = 'zalo' then 'zalo_oa' else 'meta_messenger' end;
  if not found or v_int.status in ('not_connected', 'not_available') then
    return 'not_connected';
  end if;
  if coalesce(v_int.reply_mode, 'crm') <> 'crm' then
    return 'reply_mode_external';
  end if;
  if v_int.status = 'paused' then
    return 'channel_paused';
  end if;
  if public.contact_blocked(p_conv.contact_id, 'care', v_consent) then
    return 'consent_blocked';
  end if;
  if exists (
    select 1 from public.leads l
    where l.recipient_contact_id = p_conv.contact_id and l.contact_id <> p_conv.contact_id
      and l.keep_surprise and l.deleted_at is null and l.stage not in ('won', 'lost')
  ) then
    return 'keep_surprise';
  end if;
  -- AI chỉ nhắn trong khung miễn phí: Messenger 24 giờ, Zalo 48 giờ sau tin cuối của khách.
  if p_conv.last_inbound_at is null or p_conv.last_inbound_at <= now() - v_free then
    return 'window_closed';
  end if;
  return null;
end;
$fn$;

revoke all on function public.ai_channel_block(public.conversations) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Một lượt AI
-- ---------------------------------------------------------------------------

-- Bắt đầu lượt AI cho tin mới nhất của khách trong hội thoại. Trả về { run_id, … } hoặc { skip: lý do }.
-- Bỏ qua khi: AI không phụ trách, tin cuối không phải của khách, tin quá 30 phút (không trả lời tin cũ khi vừa bật),
-- tin đã được xét, đang có lượt khác chạy, kênh không cho nhắn. Hết ngân sách tháng thì vẫn mở lượt, kèm cờ
-- budget_exceeded để server chuyển cho người.
create or replace function public.start_ai_run(p_conversation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_conv public.conversations;
  v_cfg jsonb;
  v_msg public.messages;
  v_block text;
  v_budget bigint;
  v_spent bigint;
  v_run uuid;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found then
    return jsonb_build_object('skip', 'not_found');
  end if;
  if not public.ai_handles(v_conv) then
    return jsonb_build_object('skip', case when v_conv.ai_paused_at is not null then 'paused' else 'disabled' end);
  end if;

  select * into v_msg from public.messages
  where conversation_id = v_conv.id
  order by occurred_at desc, created_at desc
  limit 1;
  if not found or v_msg.direction <> 'in' then
    return jsonb_build_object('skip', 'answered');
  end if;
  if v_msg.occurred_at < now() - interval '30 minutes' then
    return jsonb_build_object('skip', 'stale');
  end if;
  if exists (select 1 from public.ai_runs where trigger_message_id = v_msg.id) then
    return jsonb_build_object('skip', 'duplicate');
  end if;
  if exists (
    select 1 from public.ai_runs
    where conversation_id = v_conv.id and status = 'running' and started_at > now() - interval '3 minutes'
  ) then
    return jsonb_build_object('skip', 'busy');
  end if;
  v_block := public.ai_channel_block(v_conv);
  if v_block is not null then
    return jsonb_build_object('skip', v_block);
  end if;

  select config into v_cfg from public.integrations where showroom_id = v_conv.showroom_id and key = 'ai_llm';
  v_budget := case when coalesce(v_cfg ->> 'monthlyBudget', '') ~ '^\d{1,12}$'
                   then (v_cfg ->> 'monthlyBudget')::bigint end;
  v_spent := public.ai_month_spend(v_conv.showroom_id);

  insert into public.ai_runs (showroom_id, conversation_id, trigger_message_id, model)
  values (v_conv.showroom_id, v_conv.id, v_msg.id, v_cfg ->> 'model')
  returning id into v_run;

  return jsonb_build_object(
    'run_id', v_run,
    'conversation_id', v_conv.id,
    'showroom_id', v_conv.showroom_id,
    'channel', v_conv.channel,
    'model', v_cfg ->> 'model',
    'usd_rate', v_cfg ->> 'usdRate',
    'trigger_message_id', v_msg.id,
    'lead_id', v_conv.lead_id,
    'budget_exceeded', v_budget is not null and v_spent >= v_budget,
    'on_duty', exists (select 1 from public.lead_receivers(v_conv.showroom_id))
  );
end;
$fn$;

revoke all on function public.start_ai_run(uuid) from public, anon, authenticated;
grant execute on function public.start_ai_run(uuid) to service_role;

-- Ghi tin AI chờ gửi. Kiểm lại ngay trước khi gửi (nhân viên có thể vừa Tiếp quản trong lúc AI soạn). Trả về thông
-- tin để server gọi API của kênh: { message_id, channel, page_id, user_id }.
create or replace function public.queue_ai_reply(p_run uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_run public.ai_runs;
  v_conv public.conversations;
  v_text text := btrim(coalesce(p_text, ''));
  v_block text;
  v_msg uuid;
begin
  select * into v_run from public.ai_runs where id = p_run for update;
  if not found or v_run.status <> 'running' then
    raise exception 'run_closed' using errcode = 'P0001';
  end if;
  select * into v_conv from public.conversations where id = v_run.conversation_id for update;
  if v_conv.ai_paused_at is not null then
    raise exception 'ai_paused' using errcode = 'P0001';
  end if;
  if v_text = '' then
    raise exception 'empty_text' using errcode = '22023';
  end if;
  if length(v_text) > 2000 then
    raise exception 'too_long' using errcode = '22023';
  end if;
  v_block := public.ai_channel_block(v_conv);
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001';
  end if;

  insert into public.messages (showroom_id, conversation_id, direction, text, sent_via, status, ai_run_id)
  values (v_conv.showroom_id, v_conv.id, 'out', v_text, 'crm', 'queued', v_run.id)
  returning id into v_msg;
  update public.ai_runs set reply_message_id = v_msg where id = v_run.id;

  return jsonb_build_object('message_id', v_msg, 'channel', v_conv.channel, 'page_id', v_conv.page_id,
                            'user_id', v_conv.external_user_id);
end;
$fn$;

revoke all on function public.queue_ai_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.queue_ai_reply(uuid, text) to service_role;

-- Đóng lượt AI: kết quả, số token, chi phí. Lượt đã chuyển cho người (ai_handoff) giữ trạng thái handed_off.
create or replace function public.finish_ai_run(
  p_run uuid,
  p_status text,
  p_action text default null,
  p_summary text default null,
  p_usage jsonb default '{}'::jsonb,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_status not in ('replied', 'handed_off', 'skipped', 'failed') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  update public.ai_runs
    set status = case when status = 'handed_off' then status else p_status end,
        action = coalesce(action, p_action),
        summary = coalesce(summary, left(p_summary, 1000)),
        input_tokens = input_tokens + coalesce((p_usage ->> 'input_tokens')::int, 0),
        output_tokens = output_tokens + coalesce((p_usage ->> 'output_tokens')::int, 0),
        cache_read_tokens = cache_read_tokens + coalesce((p_usage ->> 'cache_read_tokens')::int, 0),
        cache_write_tokens = cache_write_tokens + coalesce((p_usage ->> 'cache_write_tokens')::int, 0),
        cost_usd_micros = cost_usd_micros + coalesce((p_usage ->> 'cost_usd_micros')::bigint, 0),
        cost_vnd = cost_vnd + coalesce((p_usage ->> 'cost_vnd')::bigint, 0),
        error = coalesce(left(p_error, 300), error),
        finished_at = now()
    where id = p_run;
end;
$fn$;

revoke all on function public.finish_ai_run(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_ai_run(uuid, text, text, text, jsonb, text) to service_role;

-- Chuyển hội thoại cho người: AI dừng ở hội thoại, báo người phụ trách kèm lý do. Khách cần gọi (p_create_lead) thì
-- tự thành lead (Owner chốt 12/10/2026): giao người đang phụ trách hội thoại nếu họ đang trực, không thì chia vòng như
-- lead mới; tin AI không tính là đã liên hệ nên SLA chạy như lead mới. Khách đã có lead thì tạo việc gọi lại cho người
-- giữ lead. Trả về mã lead (nếu có).
create or replace function public.ai_handoff(p_run uuid, p_reason text, p_summary text default null,
                                             p_create_lead boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_run public.ai_runs;
  v_conv public.conversations;
  v_lead uuid;
  v_new boolean := false;
  v_to uuid;
  v_first_out timestamptz;
  v_rules public.assignment_rules;
  v_title text;
  v_call boolean := p_reason in ('call_request', 'purchase');
begin
  if p_reason not in ('call_request', 'purchase', 'urgent', 'complaint', 'health', 'discount', 'human_request',
                      'unknown', 'budget', 'error') then
    raise exception 'bad reason' using errcode = '22023';
  end if;
  select * into v_run from public.ai_runs where id = p_run for update;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  select * into v_conv from public.conversations where id = v_run.conversation_id for update;

  update public.conversations
    set ai_paused_at = coalesce(ai_paused_at, now()),
        ai_pause_reason = case when ai_paused_at is null then 'handoff' else ai_pause_reason end
    where id = v_conv.id;

  v_lead := v_conv.lead_id;
  if v_lead is null and coalesce(p_create_lead, false) and v_conv.contact_id is not null then
    -- Khách đã có lead đang mở (vào từ nguồn khác): gắn hội thoại vào lead đó.
    select id into v_lead from public.leads
    where contact_id = v_conv.contact_id and deleted_at is null and stage not in ('won', 'lost')
    order by created_at desc
    limit 1;
    if v_lead is null then
      select min(occurred_at) into v_first_out from public.messages
      where conversation_id = v_conv.id and direction = 'out' and status = 'sent' and ai_run_id is null;
      insert into public.leads (showroom_id, contact_id, source, source_detail, first_contact_at, stage)
      values (
        v_conv.showroom_id, v_conv.contact_id,
        case v_conv.channel when 'zalo' then 'zalo_oa' else 'meta_messenger' end,
        jsonb_build_object('page_id', v_conv.page_id,
          'source_key', case v_conv.channel when 'zalo' then 'zalo_oa' else 'fb_messenger' end,
          'qualified_from', 'ai', 'conversation_id', v_conv.id, 'ai_reason', p_reason),
        v_first_out, case when v_first_out is null then 'new' else 'contacted' end
      )
      returning id into v_lead;
      v_new := true;
      update public.contacts set lifecycle_stage = 'lead'
        where id = v_conv.contact_id and lifecycle_stage = 'stranger';

      -- Người đang phụ trách hội thoại mà đang trực thì giữ khách đó; không thì chia vòng như lead mới.
      if v_conv.assigned_to is not null
         and exists (select 1 from public.lead_receivers(v_conv.showroom_id) r where r.id = v_conv.assigned_to) then
        select * into v_rules from public.assignment_rules where showroom_id = v_conv.showroom_id;
        perform set_config('app.assignment_reason', 'AI chuyển khách cần gọi', true);
        update public.leads
          set assigned_to = v_conv.assigned_to,
              sla_due_at = case when first_contact_at is null
                                then now() + make_interval(mins => coalesce(v_rules.sla_minutes, 5)) end
          where id = v_lead;
        perform set_config('app.assignment_reason', '', true);
      else
        perform public.route_lead(v_lead);
      end if;
      perform public.record_event('lead_qualified', v_conv.showroom_id, v_conv.contact_id, v_lead,
        jsonb_build_object('conversation_id', v_conv.id, 'channel', v_conv.channel, 'by', 'ai', 'reason', p_reason),
        'ai');
      perform public.write_audit('lead.qualify', 'leads', v_lead::text,
        jsonb_build_object('conversation_id', v_conv.id, 'by', 'ai', 'reason', p_reason), 'ai');
    end if;
    update public.conversations set lead_id = v_lead where id = v_conv.id;
  end if;

  -- Người xử lý: người giữ lead, không có thì người phụ trách hội thoại.
  select assigned_to into v_to from public.leads where id = v_lead and deleted_at is null;
  v_to := coalesce(v_to, case when v_lead is null then v_conv.assigned_to end);

  -- Khách đã có lead từ trước mà cần gọi hoặc cần xử lý gấp: việc gọi lại cho người giữ lead (lead mới tạo đã có SLA).
  if v_lead is not null and not v_new and (v_call or p_reason in ('urgent', 'complaint')) then
    insert into public.tasks (showroom_id, type, title, contact_id, lead_id, assigned_to, due_at, priority, source,
                              rule_key)
    values (v_conv.showroom_id, 'callback',
            case when v_call then 'Gọi lại khách: AI chuyển vì khách cần gọi'
                 else 'Gọi khách gấp: AI chuyển vì khách cần xử lý gấp' end,
            v_conv.contact_id, v_lead, v_to, now(), 1, 'ai', 'ai_handoff');
  end if;

  v_title := case p_reason
    when 'call_request' then 'AI chuyển khách cần gọi điện'
    when 'purchase' then 'AI chuyển khách muốn mua, cần gọi'
    when 'urgent' then 'AI chuyển khách cần xử lý gấp'
    when 'complaint' then 'AI chuyển khách khiếu nại, cần xử lý gấp'
    when 'health' then 'AI chuyển câu hỏi sức khỏe của khách'
    when 'discount' then 'AI chuyển khách xin giảm giá'
    when 'human_request' then 'Khách muốn nói chuyện với nhân viên'
    when 'budget' then 'AI đã hết ngân sách tháng, nhân viên trả lời khách'
    when 'error' then 'AI không trả lời được, nhân viên trả lời khách'
    else 'AI chuyển câu hỏi AI chưa trả lời được' end;
  if v_to is not null then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    values (v_conv.showroom_id, v_to, 'ai_handoff', v_title, '/inbox?c=' || v_conv.id);
  else
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select pr.showroom_id, pr.id, 'ai_handoff', v_title, '/inbox?c=' || v_conv.id
    from public.profiles pr
    where pr.showroom_id = v_conv.showroom_id and pr.is_active and public.has_perm_for(pr.id, 'message.view_all');
  end if;

  -- Hết ngân sách tháng: báo Owner một lần trong tháng (giờ VN).
  if p_reason = 'budget' and not exists (
    select 1 from public.notifications
    where showroom_id = v_conv.showroom_id and type = 'ai_budget'
      and created_at >= (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')
  ) then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select pr.showroom_id, pr.id, 'ai_budget', 'Trợ lý AI đã dùng hết giới hạn chi phí tháng, tin mới chuyển cho nhân viên',
           '/settings/ai'
    from public.profiles pr
    where pr.showroom_id = v_conv.showroom_id and pr.is_active and public.has_perm_for(pr.id, 'settings.integrations');
  end if;

  perform public.record_event('ai_handoff', v_conv.showroom_id, v_conv.contact_id, v_lead,
    jsonb_build_object('conversation_id', v_conv.id, 'reason', p_reason, 'lead_created', v_new), 'ai');

  update public.ai_runs
    set status = 'handed_off', action = coalesce(action, 'handoff'), handoff_reason = p_reason,
        summary = left(nullif(btrim(coalesce(p_summary, '')), ''), 1000), lead_id = v_lead
    where id = v_run.id;
  return v_lead;
end;
$fn$;

revoke all on function public.ai_handoff(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.ai_handoff(uuid, text, text, boolean) to service_role;

-- Hội thoại đang chờ AI (cho job quét mỗi phút): AI phụ trách, tin cuối của khách trong 30 phút, đã qua 20 giây (để
-- đường webhook xử lý trước), chưa có lượt nào xét tin đó.
create or replace function public.pending_ai_conversations(p_limit int default 10)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.id
  from public.conversations c
  cross join lateral (
    select m.id, m.direction from public.messages m
    where m.conversation_id = c.id
    order by m.occurred_at desc, m.created_at desc
    limit 1
  ) last
  where c.ai_paused_at is null
    and c.last_inbound_at > now() - interval '30 minutes'
    and c.last_inbound_at < now() - interval '20 seconds'
    and last.direction = 'in'
    and not exists (select 1 from public.ai_runs r where r.trigger_message_id = last.id)
    and public.ai_handles(c)
  order by c.last_inbound_at
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$fn$;

revoke all on function public.pending_ai_conversations(int) from public, anon, authenticated;
grant execute on function public.pending_ai_conversations(int) to service_role;

-- pg_cron mỗi phút: chỉ gọi CRM khi thật sự có hội thoại đang chờ AI (không tốn lượt gọi Vercel khi rảnh).
create or replace function public.dispatch_ai_replies()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_base text;
  v_key text;
begin
  if not exists (select 1 from public.pending_ai_conversations(1)) then
    return;
  end if;
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'cron_invoke_token';
  if v_base is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/api/cron/ai-replies',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$fn$;

revoke all on function public.dispatch_ai_replies() from public, anon, authenticated;

select cron.schedule('ai-replies', '* * * * *', 'select public.dispatch_ai_replies()');

-- ---------------------------------------------------------------------------
-- Nhân viên Tiếp quản, Trả lại AI
-- ---------------------------------------------------------------------------

create or replace function public.assert_ai_switch(p_conversation uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_conv public.conversations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if not public.has_perm(case v_conv.channel when 'zalo' then 'message.zalo_send' else 'message.messenger_send' end) then
    raise exception 'not allowed to reply on this channel' using errcode = '42501';
  end if;
  return v_conv;
end;
$fn$;

revoke all on function public.assert_ai_switch(uuid) from public, anon, authenticated;

-- Tiếp quản: AI dừng ở hội thoại này, nhân viên trả lời.
create or replace function public.ai_takeover(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_conv public.conversations := public.assert_ai_switch(p_conversation);
begin
  if v_conv.ai_paused_at is not null then
    return;
  end if;
  update public.conversations
    set ai_paused_at = now(), ai_pause_reason = 'takeover', ai_paused_by = auth.uid()
    where id = v_conv.id;
  perform public.record_event('ai_takeover', v_conv.showroom_id, v_conv.contact_id, v_conv.lead_id,
    jsonb_build_object('conversation_id', v_conv.id));
end;
$fn$;

revoke all on function public.ai_takeover(uuid) from public, anon;
grant execute on function public.ai_takeover(uuid) to authenticated;

-- Trả lại AI: AI trả lời tiếp từ tin sau của khách (kênh phải đang bật AI).
create or replace function public.ai_release(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_conv public.conversations := public.assert_ai_switch(p_conversation);
begin
  if not (v_conv.channel = any (public.ai_reply_channels_for(v_conv.showroom_id))) then
    raise exception 'ai_off' using errcode = 'P0001';
  end if;
  if v_conv.ai_paused_at is null then
    return;
  end if;
  update public.conversations
    set ai_paused_at = null, ai_pause_reason = null, ai_paused_by = null
    where id = v_conv.id;
  perform public.record_event('ai_release', v_conv.showroom_id, v_conv.contact_id, v_conv.lead_id,
    jsonb_build_object('conversation_id', v_conv.id));
end;
$fn$;

revoke all on function public.ai_release(uuid) from public, anon;
grant execute on function public.ai_release(uuid) to authenticated;

-- Nhân viên tự gửi tin (từ CRM, hoặc thẳng trên Page, OA mà CRM nhận bản sao) thì AI dừng ở hội thoại đó.
create or replace function public.pause_ai_on_staff_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.direction = 'out' and new.ai_run_id is null then
    update public.conversations
      set ai_paused_at = now(), ai_pause_reason = 'staff_reply', ai_paused_by = new.sent_by
      where id = new.conversation_id and ai_paused_at is null;
  end if;
  return new;
end;
$fn$;

create trigger messages_pause_ai after insert on public.messages
  for each row execute function public.pause_ai_on_staff_reply();

-- ---------------------------------------------------------------------------
-- Kết quả gửi: như bản ở 20261009000100_zalo_oa; tin AI ghi sự kiện với actor 'ai' và không tính là nhân viên đã
-- liên hệ (không dừng đồng hồ SLA, không đóng việc liên hệ đầu).
-- ---------------------------------------------------------------------------

create or replace function public.finish_channel_reply(p_message uuid, p_mid text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
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
  select v_conv.showroom_id, v_conv.channel || '_out', v_conv.contact_id, c.household_id, v_conv.lead_id,
         case when v_msg.ai_run_id is null then 'user' else 'ai' end, v_msg.sent_by,
         jsonb_strip_nulls(jsonb_build_object('conversation_id', v_conv.id, 'message_id', v_msg.id,
                                              'tag', v_msg.tag, 'ai_run_id', v_msg.ai_run_id))
  from public.contacts c where c.id = v_conv.contact_id;

  if v_conv.lead_id is not null and v_msg.ai_run_id is null then
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
$fn$;

revoke all on function public.finish_channel_reply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_channel_reply(uuid, text, text) to service_role;

-- Chuyển thành lead (Sale admin): như bản ở 20261012000200_inquiries; giờ liên hệ đầu chỉ tính tin của nhân viên,
-- không tính tin AI.
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
  where conversation_id = v_conv.id and direction = 'out' and status = 'sent' and ai_run_id is null;
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
-- Nhận tin: như bản ở 20261012000200_inquiries; hội thoại AI đang trả lời thì không báo nhân viên từng tin (AI báo
-- khi chuyển cho người).
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

  -- Đọc lại hội thoại: bản sao tin nhân viên gửi thẳng trên Page, OA vừa làm AI dừng (trigger trên messages).
  select * into v_conv from public.conversations where id = v_conv.id;

  if not v_echo and (v_conv.unread_count = 1 or v_routed) and not public.ai_handles(v_conv) then
    -- Báo một lần cho mỗi lượt tin chưa đọc, không báo từng tin. Người nhận: người giữ lead, không có thì người phụ
    -- trách hội thoại, không có ai thì những người xem mọi hội thoại. AI đang trả lời thì không báo (AI báo khi chuyển).
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

-- HẾT FILE
