-- Lát 0: telesale làm việc được trên CRM (docs/ke-hoach-thong-luong.md).
--   * Bảng calls (CLAUDE.md mục 4): tháng 1 chỉ có cuộc gọi ghi tay (provider = 'external'), đánh dấu khác cuộc gọi
--     tổng đài xác nhận để chỉ số tính công bằng (mục 9.4 điều 4).
--   * log_call(): ghi kết quả cuộc gọi trong MỘT giao dịch — cuộc gọi, sự kiện, dừng SLA, new → contacted, đóng việc
--     gọi đang mở, tạo hẹn gọi lại. Trước đây các bước này nằm rải trong store của bản demo.
--   * task_action(): một luật duy nhất cho Xong / Dời / Lỡ hẹn, dùng chung cho nút trên CRM và nút trên Telegram.
--   * add_lead_note(), set_lead_recipient(): người dùng không ghi thẳng bảng events, và tạo người nhận cần đi cùng
--     việc gắn vào lead.
--   * Chặn sang `demo` khi thiếu 4 thông tin bắt buộc (mục 6) ngay ở database, không chỉ ở giao diện.

-- ---------------------------------------------------------------------------
-- Cuộc gọi
-- ---------------------------------------------------------------------------

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  provider text not null default 'external',
  provider_call_id text unique,
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  channel text not null default 'phone' check (channel in ('phone', 'zalo', 'provider')),
  from_e164 text,
  to_e164 text,
  agent_id uuid references public.profiles (id),
  lead_id uuid references public.leads (id),
  contact_id uuid references public.contacts (id),
  started_at timestamptz not null default now(),
  duration_sec int,
  status text not null check (status in ('answered', 'missed', 'busy', 'failed')),
  recording_path text,
  outcome_id uuid references public.call_outcomes (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index calls_lead_idx on public.calls (lead_id, started_at desc);
create index calls_agent_idx on public.calls (agent_id, started_at desc);

create trigger calls_updated_at before update on public.calls
  for each row execute function public.set_updated_at();

alter table public.calls enable row level security;

-- Đọc như dòng hoạt động: ai xem được lead thì xem được cuộc gọi của lead đó. Ghi chỉ qua log_call().
create policy calls_select on public.calls for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.can_view_lead(lead_id));
revoke insert, update, delete on public.calls from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Kiểm chung: người đang thao tác sửa được lead này không
-- ---------------------------------------------------------------------------

create or replace function public.assert_lead_editor(p_lead public.leads)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  -- coalesce: lead ở hàng "Chưa phân" có assigned_to null; "null = người dùng" ra null chứ không ra false, và
  -- "not (null)" vẫn là null nên câu if bỏ qua — telesale nào cũng sửa được lead chưa phân. Phải ép về false.
  if p_lead.showroom_id is distinct from public.current_showroom_id() or not coalesce(
    public.has_perm('lead.edit_all')
    or (public.has_perm('lead.edit_own') and p_lead.assigned_to = v_user),
    false
  ) then
    raise exception 'not allowed to edit this lead' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke all on function public.assert_lead_editor(public.leads) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ghi kết quả cuộc gọi
-- ---------------------------------------------------------------------------

create or replace function public.log_call(
  p_lead_id uuid,
  p_channel text,
  p_outcome_key text,
  p_note text default null,
  p_callback_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_user uuid;
  v_outcome public.call_outcomes;
  v_status text;
  v_call uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'lead not found' using errcode = 'no_data_found';
  end if;
  v_user := public.assert_lead_editor(v_lead);

  if p_channel not in ('phone', 'zalo') then
    raise exception 'unknown channel' using errcode = '22023';
  end if;
  select * into v_outcome from public.call_outcomes
  where showroom_id = v_lead.showroom_id and key = p_outcome_key and is_active;
  if not found then
    raise exception 'unknown call outcome' using errcode = '22023';
  end if;
  if p_callback_at is not null and p_callback_at <= now() then
    raise exception 'callback must be in the future' using errcode = '22023';
  end if;

  v_status := case p_outcome_key
    when 'no_answer' then 'missed'
    when 'zalo_no_reply' then 'missed'
    when 'wrong_number' then 'failed'
    else 'answered'
  end;

  insert into public.calls (showroom_id, provider, direction, channel, agent_id, lead_id, contact_id, status,
                            outcome_id, created_by)
  values (v_lead.showroom_id, 'external', 'outbound', p_channel, v_user, v_lead.id, v_lead.contact_id, v_status,
          v_outcome.id, v_user)
  returning id into v_call;

  perform public.record_event('call', v_lead.showroom_id, v_lead.contact_id, v_lead.id,
    jsonb_strip_nulls(jsonb_build_object(
      'call_id', v_call,
      'channel', p_channel,
      'outcome', p_outcome_key,
      'outcome_label', v_outcome.label,
      'manual', true,
      'note', nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
      'callback_at', p_callback_at
    )),
    'user');

  -- Lần liên hệ đầu dừng đồng hồ SLA (CLAUDE.md mục 7); có liên hệ thì lead mới thành "đã liên hệ".
  update public.leads
  set first_contact_at = coalesce(first_contact_at, now()),
      stage = case when stage = 'new' then 'contacted' else stage end
  where id = v_lead.id;

  -- Cuộc gọi này làm xong các việc gọi đang chờ của lead.
  update public.tasks
  set status = 'done', outcome = 'Đã gọi: ' || v_outcome.label
  where lead_id = v_lead.id and status = 'open' and type in ('first_contact', 'callback');

  if p_callback_at is not null then
    insert into public.tasks (showroom_id, type, title, contact_id, lead_id, assigned_to, due_at, source, created_by)
    values (v_lead.showroom_id, 'callback', 'Gọi lại theo hẹn', v_lead.contact_id, v_lead.id,
            coalesce(v_lead.assigned_to, v_user), p_callback_at, 'user', v_user);
  end if;

  return v_call;
end;
$$;

revoke all on function public.log_call(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.log_call(uuid, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Ghi chú trên hồ sơ lead
-- ---------------------------------------------------------------------------

create or replace function public.add_lead_note(p_lead_id uuid, p_text text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null;
  if not found then
    raise exception 'lead not found' using errcode = 'no_data_found';
  end if;
  perform public.assert_lead_editor(v_lead);
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'empty note' using errcode = '22023';
  end if;
  return public.record_event('note', v_lead.showroom_id, v_lead.contact_id, v_lead.id,
    jsonb_build_object('text', left(btrim(p_text), 4000), 'channel', 'crm'), 'user');
end;
$$;

revoke all on function public.add_lead_note(uuid, text) from public, anon;
grant execute on function public.add_lead_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Người nhận: mua cho chính mình, hoặc mua tặng một người khác
-- ---------------------------------------------------------------------------

create or replace function public.set_lead_recipient(
  p_lead_id uuid,
  p_self boolean,
  p_name text default null,
  p_relation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_user uuid;
  v_recipient uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'lead not found' using errcode = 'no_data_found';
  end if;
  v_user := public.assert_lead_editor(v_lead);

  if p_self then
    v_recipient := v_lead.contact_id;
  else
    if coalesce(btrim(p_name), '') = '' then
      raise exception 'recipient name required' using errcode = '22023';
    end if;
    -- Đã có người nhận khác người đặt thì sửa tên, quan hệ; chưa có thì tạo người mới, cùng hộ với người đặt.
    if v_lead.recipient_contact_id is not null and v_lead.recipient_contact_id <> v_lead.contact_id then
      v_recipient := v_lead.recipient_contact_id;
      update public.contacts
      set full_name = btrim(p_name), relation_in_household = nullif(btrim(coalesce(p_relation, '')), '')
      where id = v_recipient;
    else
      insert into public.contacts (showroom_id, full_name, relation_in_household, household_id, created_by)
      select v_lead.showroom_id, btrim(p_name), nullif(btrim(coalesce(p_relation, '')), ''), c.household_id, v_user
      from public.contacts c where c.id = v_lead.contact_id
      returning id into v_recipient;
    end if;
  end if;

  update public.leads set recipient_contact_id = v_recipient where id = v_lead.id;
  return v_recipient;
end;
$$;

revoke all on function public.set_lead_recipient(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_lead_recipient(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Việc: một luật cho Xong / Dời / Lỡ hẹn, dùng chung CRM và Telegram
-- ---------------------------------------------------------------------------

create or replace function public.apply_task_action(
  p_user uuid,
  p_task_id uuid,
  p_action text,
  p_minutes int default 60,
  p_outcome text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'no_data_found';
  end if;
  -- Việc của người khác hoặc việc hàng chung: chỉ người được giao việc (lead.assign) mới xử lý.
  if v_task.assigned_to is distinct from p_user and not public.has_perm_for(p_user, 'lead.assign') then
    raise exception 'task belongs to someone else' using errcode = '42501';
  end if;
  if v_task.status <> 'open' then
    return v_task.status;
  end if;

  if p_action = 'done' then
    update public.tasks
    set status = 'done', outcome = nullif(left(btrim(coalesce(p_outcome, '')), 500), '')
    where id = p_task_id;
    return 'done';
  elsif p_action = 'snooze' then
    update public.tasks
    set due_at = greatest(due_at, now()) + make_interval(mins => least(greatest(coalesce(p_minutes, 60), 5), 1440))
    where id = p_task_id;
    return 'snoozed';
  elsif p_action = 'miss' then
    update public.tasks set status = 'missed' where id = p_task_id;
    perform public.record_event('task_missed', v_task.showroom_id, v_task.contact_id, v_task.lead_id,
      jsonb_build_object('task_id', v_task.id, 'type', v_task.type), 'user');
    return 'missed';
  end if;
  raise exception 'unknown action' using errcode = '22023';
end;
$$;

revoke all on function public.apply_task_action(uuid, uuid, text, int, text) from public, anon, authenticated;

-- Nút trên CRM.
create or replace function public.task_action(
  p_task_id uuid,
  p_action text,
  p_minutes int default 60,
  p_outcome text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (public.active_view_as()).id is not null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return public.apply_task_action(auth.uid(), p_task_id, p_action, p_minutes, p_outcome);
end;
$$;

revoke all on function public.task_action(uuid, text, int, text) from public, anon;
grant execute on function public.task_action(uuid, text, int, text) to authenticated;

-- Nút trên Telegram: cùng luật, chỉ khác cách nhận ra người bấm.
create or replace function public.telegram_task_action(
  p_telegram_user_id bigint,
  p_task_id uuid,
  p_action text,
  p_minutes int default 60
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_user(p_telegram_user_id);
begin
  if v_user is null then
    raise exception 'telegram account not linked' using errcode = '42501';
  end if;
  perform public.telegram_act_as(v_user);
  return public.apply_task_action(v_user, p_task_id, p_action, p_minutes,
    case when p_action = 'done' then 'Xong từ Telegram' end);
end;
$$;

revoke execute on function public.telegram_task_action(bigint, uuid, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chặn sang demo khi thiếu 4 thông tin bắt buộc (CLAUDE.md mục 6)
-- ---------------------------------------------------------------------------

create or replace function public.guard_lead_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.assigned_to is distinct from old.assigned_to and not public.has_perm('lead.assign') then
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
-- Vá: ghi chú từ Telegram vào lead "Chưa phân"
-- ---------------------------------------------------------------------------
-- Cùng lỗi null như assert_lead_editor ở trên: lead chưa có người giữ thì điều kiện quyền ra null, câu if bỏ qua,
-- và người không giữ lead vẫn ghi chú được qua Telegram. Định nghĩa lại hàm với điều kiện ép về false.

create or replace function public.telegram_add_note(
  p_telegram_user_id bigint,
  p_lead_id uuid,
  p_text text,
  p_file_path text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_user(p_telegram_user_id);
  v_lead public.leads;
begin
  if v_user is null then
    raise exception 'telegram account not linked' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null;
  if not found then
    raise exception 'lead not found' using errcode = 'no_data_found';
  end if;
  if not coalesce(
    public.has_perm_for(v_user, 'lead.edit_all')
    or (public.has_perm_for(v_user, 'lead.edit_own') and v_lead.assigned_to = v_user),
    false
  ) then
    raise exception 'not allowed to edit this lead' using errcode = '42501';
  end if;
  if coalesce(btrim(p_text), '') = '' and p_file_path is null then
    raise exception 'empty note' using errcode = '22023';
  end if;
  perform public.telegram_act_as(v_user);
  return public.record_event(
    'note', v_lead.showroom_id, v_lead.contact_id, v_lead.id,
    jsonb_strip_nulls(jsonb_build_object(
      'text', left(coalesce(btrim(p_text), ''), 4000),
      'channel', 'telegram',
      'file', p_file_path
    )),
    'user'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Đánh dấu thất bại
-- ---------------------------------------------------------------------------
-- Lead thất bại cần lý do; các việc đã lên lịch không xóa mà hủy kèm lý do (CLAUDE.md mục 6), để chỉ số "đánh thất
-- bại sớm" và lịch sử hẹn vẫn còn.

create or replace function public.mark_lead_lost(p_lead_id uuid, p_reason_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_reason public.lost_reasons;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'lead not found' using errcode = 'no_data_found';
  end if;
  perform public.assert_lead_editor(v_lead);
  if not public.has_perm('lead.mark_lost') then
    raise exception 'not allowed to mark leads as lost' using errcode = '42501';
  end if;
  if v_lead.stage in ('won', 'lost') then
    raise exception 'lead is already closed' using errcode = '22023';
  end if;
  select * into v_reason from public.lost_reasons
  where showroom_id = v_lead.showroom_id and key = p_reason_key and is_active;
  if not found then
    raise exception 'unknown lost reason' using errcode = '22023';
  end if;

  update public.leads set stage = 'lost', lost_reason_id = v_reason.id where id = v_lead.id;
  update public.tasks
  set status = 'cancelled', outcome = 'Lead thất bại: ' || v_reason.label
  where lead_id = v_lead.id and status = 'open';
end;
$$;

revoke all on function public.mark_lead_lost(uuid, text) from public, anon;
grant execute on function public.mark_lead_lost(uuid, text) to authenticated;
