-- Tin nhắn Facebook ngoài 24 giờ (Owner chốt 13/10/2026): để Page không bị Meta hạn chế, mặc định CRM không gửi
-- tin Messenger khi khách nhắn lần cuối đã quá 24 giờ, kể cả nhân viên trả lời tay. Owner bật lại trong Cài đặt,
-- Tích hợp, Tin nhắn Facebook (config.humanAgent = 'on') khi ứng dụng Meta đã được duyệt dùng thẻ Human Agent; khi đó
-- nhân viên trả lời tay được tới 7 ngày như trước. Trợ lý AI vẫn chỉ nhắn trong 24 giờ (ai_channel_block), không đổi.
-- Chỉ thay nhánh khung giờ; mọi luật khác của queue_messenger_reply giữ nguyên.

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

  -- Khung 24 giờ sau tin cuối của khách. Ngoài khung, trong 7 ngày, chỉ nhân viên trả lời tay bằng thẻ Human Agent,
  -- và chỉ khi Owner bật trong Cài đặt, Tích hợp, Tin nhắn Facebook (config.humanAgent = 'on'); mặc định không gửi.
  if v_conv.last_inbound_at is not null and v_conv.last_inbound_at > now() - interval '24 hours' then
    v_type := 'RESPONSE';
  elsif v_conv.last_inbound_at is not null and v_conv.last_inbound_at > now() - interval '7 days' then
    if coalesce(v_int.config ->> 'humanAgent', 'off') <> 'on' then
      raise exception 'window_24h' using errcode = 'P0001';
    end if;
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

-- HẾT FILE
