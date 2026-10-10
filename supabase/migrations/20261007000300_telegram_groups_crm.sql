-- Quản lý nhóm Telegram ngay trên CRM (màn Nhóm nội bộ), thay vì chỉ gõ /gan trong nhóm.
--
-- Đọc: mọi người trong showroom thấy danh sách nhóm của đội (tên nhóm, công dụng, trạng thái). Đây là nhóm làm việc
-- của chính họ, không phải dữ liệu khách, nên không giới hạn theo quyền; trước đây chỉ settings.integrations đọc
-- được nên màn Nhóm nội bộ trống với telesale.
-- Ghi: vẫn chỉ settings.integrations, qua hàm dưới (bảng không cho authenticated ghi thẳng).
--
-- Bot KHÔNG đọc nội dung trò chuyện trong nhóm (chế độ riêng tư của Telegram, CLAUDE.md 10.3), nên CRM chỉ nắm
-- được nhóm nào dùng vào việc gì và những tin chính CRM đã đăng vào nhóm.

drop policy telegram_groups_select on public.telegram_groups;

create policy telegram_groups_select on public.telegram_groups for select to authenticated
  using (showroom_id = public.current_showroom_id());

-- Tin CRM đã đăng vào nhóm: ai trong showroom cũng đọc được, vì đó là tin đăng công khai trong nhóm của đội.
-- Tin nhắn riêng bot gửi cho một người (user_id khác null) thì chỉ người đó đọc.
create policy telegram_messages_select on public.telegram_messages for select to authenticated
  using (
    showroom_id = public.current_showroom_id()
    and (user_id is null or user_id = public.effective_uid())
  );

-- Owner đổi công dụng, tạm ngưng hoặc dùng lại một nhóm từ màn CRM. Cùng quy tắc với lệnh /gan trong nhóm:
-- mỗi công dụng chỉ một nhóm đang dùng, nhóm cũ chuyển "Ngưng".
create or replace function public.set_telegram_group(
  p_chat_id bigint,
  p_purpose text,
  p_active boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_showroom uuid := public.current_showroom_id();
  v_status text;
  v_current public.telegram_groups;
begin
  if v_user is null or not public.has_perm('settings.integrations') then
    raise exception 'not allowed to manage telegram groups' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if p_purpose not in ('general', 'delivery', 'care', 'announce', 'unused') then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;

  select * into v_current from public.telegram_groups
  where chat_id = p_chat_id and showroom_id = v_showroom;
  if not found then
    raise exception 'telegram group not found' using errcode = 'no_data_found';
  end if;
  -- Bot đã rời nhóm thì không gán lại được; phải thêm bot vào nhóm trước.
  if v_current.status = 'lost' then
    raise exception 'bot is no longer in this group' using errcode = '22023';
  end if;

  v_status := case when p_purpose = 'unused' or not p_active then 'inactive' else 'active' end;

  if v_status = 'active' then
    update public.telegram_groups set status = 'inactive'
    where showroom_id = v_showroom and purpose = p_purpose and status = 'active' and chat_id <> p_chat_id;
  end if;

  update public.telegram_groups
  set purpose = p_purpose, status = v_status, assigned_by = v_user, assigned_at = now()
  where chat_id = p_chat_id and showroom_id = v_showroom;

  insert into public.audit_logs (showroom_id, actor_type, actor_id, action, entity, entity_id, metadata)
  values (v_showroom, 'user', v_user, 'telegram.group_assigned', 'telegram_groups', p_chat_id::text,
          jsonb_build_object('purpose', p_purpose, 'status', v_status, 'source', 'crm'));
  return v_status;
end;
$$;

revoke execute on function public.set_telegram_group(bigint, text, boolean) from public, anon;
grant execute on function public.set_telegram_group(bigint, text, boolean) to authenticated;
