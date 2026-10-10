-- Cảnh báo lead quá hạn gọi và nhật ký sửa Cài đặt (CLAUDE.md mục 7, 11.2).
--
-- - Lead đã giao mà quá hạn SLA chưa liên hệ: báo trên chuông cho người giữ lead và người điều phối (lead.assign),
--   ghi sự kiện sla_breached vào dòng sự kiện để tính chỉ số. Mỗi lần giao (hạn SLA mới) chỉ báo một lần.
--   Tin Telegram cho cùng việc này đã có ở việc nền telegram-outbound.
-- - Sửa luật phân lead, thị trường, danh mục tra cứu đều ghi nhật ký kiểm toán kèm trước và sau.

-- ---------------------------------------------------------------------------
-- Cảnh báo quá hạn
-- ---------------------------------------------------------------------------

alter table public.leads add column sla_alerted_at timestamptz;

-- Hạn SLA đổi (giao lại, chuyển người) thì được báo lại cho hạn mới.
create or replace function public.reset_sla_alert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sla_due_at is distinct from old.sla_due_at then
    new.sla_alerted_at := null;
  end if;
  return new;
end;
$$;

create trigger leads_reset_sla_alert before update of sla_due_at on public.leads
  for each row execute function public.reset_sla_alert();

-- Job mỗi phút. Trả số lead vừa được báo.
create or replace function public.alert_sla_overdue()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
  v_late int;
begin
  for r in
    select l.id, l.showroom_id, l.contact_id, l.assigned_to, l.sla_due_at, c.full_name
    from public.leads l
    join public.contacts c on c.id = l.contact_id
    where l.first_contact_at is null and l.sla_due_at is not null and l.sla_due_at <= now()
      and l.sla_alerted_at is null and l.deleted_at is null and l.stage not in ('won', 'lost')
      and l.sla_due_at > now() - interval '7 days'
    order by l.sla_due_at
    limit 200
    for update of l skip locked
  loop
    v_late := greatest(0, floor(extract(epoch from now() - r.sla_due_at) / 60))::int;
    -- Người giữ lead và người điều phối, mỗi người một thông báo.
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select r.showroom_id, p.id, 'sla_overdue',
      case when p.id = r.assigned_to
        then 'Lead ' || r.full_name || ' đã quá hạn gọi, gọi ngay'
        else 'Lead ' || r.full_name || ' quá hạn gọi, chưa ai liên hệ' end,
      '/leads/' || r.id
    from public.profiles p
    where p.showroom_id = r.showroom_id and p.is_active
      and (p.id = r.assigned_to or public.has_perm_for(p.id, 'lead.assign'));
    perform public.record_event('sla_breached', r.showroom_id, r.contact_id, r.id,
      jsonb_build_object('assigned_to', r.assigned_to, 'due_at', r.sla_due_at, 'late_minutes', v_late), 'system');
    update public.leads set sla_alerted_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.alert_sla_overdue() from public, anon, authenticated;

select cron.schedule('alert-sla-overdue', '* * * * *', 'select public.alert_sla_overdue()');

-- ---------------------------------------------------------------------------
-- Nhật ký sửa Cài đặt
-- ---------------------------------------------------------------------------

create or replace function public.audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  perform public.write_audit('settings.' || tg_table_name || '.' || lower(tg_op), tg_table_name, v_row ->> 'id',
    jsonb_build_object('before', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                       'after', case when tg_op <> 'DELETE' then to_jsonb(new) end,
                       'showroom_id', v_row ->> 'showroom_id'));
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['assignment_rules', 'markets', 'lead_sources', 'lost_reasons', 'occasions',
                           'call_outcomes', 'budget_ranges'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function public.audit_config_change()', t);
  end loop;
end;
$$;

-- Danh mục chỉ tắt chứ không xóa: lead, cuộc gọi cũ còn trỏ tới (mục 6).
do $$
declare
  t text;
begin
  foreach t in array array['lead_sources', 'lost_reasons', 'occasions', 'call_outcomes', 'budget_ranges'] loop
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end;
$$;
revoke delete on public.markets from authenticated;
