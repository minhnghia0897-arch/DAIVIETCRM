-- Màn Khách chạy dữ liệu thật (12/10/2026): danh sách theo vòng đời và thị trường, hồ sơ khách 360.
--
-- Vòng đời khách (CLAUDE.md 1.1) tính tự động từ dữ liệu, không sửa tay:
--   Người lạ (khách đang hỏi) → Lead → Khách mới (đã cọc, chờ giao) → Đang sử dụng (đơn hoàn tất)
--   → Khách thân (mua lại từ 2 đơn hoàn tất, hoặc hộ gia đình có từ 2 đơn hoàn tất)
--   Nhánh: Ngủ đông (không tương tác quá N ngày, Cài đặt, Bán hàng), Có rủi ro (đơn đang đổi trả, bảo hành đang
--   theo dõi), Ngừng liên hệ (khách yêu cầu ngừng mọi liên hệ).
-- Tính lại ngay khi có sự kiện, đơn, việc bảo hành, đồng ý mới; job mỗi đêm tính lại cả showroom (ngủ đông).
--
-- Quyền xem khách thêm khách của đơn mình được xem (CLAUDE.md 11.1: khách thuộc lead hoặc đơn mình được xem).

-- ---------------------------------------------------------------------------
-- Cấu hình, cột mới
-- ---------------------------------------------------------------------------

alter table public.sales_settings
  add column dormant_days int not null default 180 check (dormant_days between 30 and 1095);

-- Người phụ trách khách: người giữ lead đang mở, không có thì người phụ trách hội thoại, người bán đơn gần nhất.
alter table public.customer_lifecycle
  add column owner_id uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Ai xem được khách: như bản ở 20261012000200_inquiries, thêm khách của đơn mình được xem
-- ---------------------------------------------------------------------------

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
        or (
          public.has_perm('order.view_all')
          and exists (
            select 1 from public.orders o
            where o.deleted_at is null and (o.buyer_contact_id = c.id or o.recipient_contact_id = c.id)
          )
        )
        or (
          public.has_perm('order.view_own')
          and exists (
            select 1 from public.orders o
            where o.deleted_at is null and o.seller_id = public.effective_uid()
              and (o.buyer_contact_id = c.id or o.recipient_contact_id = c.id)
          )
        )
      )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Tính vòng đời một khách
-- ---------------------------------------------------------------------------

create or replace function public.refresh_customer_lifecycle(p_contact uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_c public.contacts;
  v_dormant int;
  v_completed_buyer int;
  v_completed_any int;
  v_household_completed int := 0;
  v_new_customer boolean;
  v_open_order boolean;
  v_return boolean;
  v_paid bigint;
  v_orders int;
  v_has_lead boolean;
  v_warranty_open boolean;
  v_stop boolean;
  v_last timestamptz;
  v_owned jsonb;
  v_open_tasks int;
  v_owner uuid;
  v_flags text[] := '{}';
  v_base text;
  v_stage text;
begin
  select * into v_c from public.contacts where id = p_contact;
  if not found then
    return null;
  end if;
  select dormant_days into v_dormant from public.sales_settings where showroom_id = v_c.showroom_id;
  v_dormant := coalesce(v_dormant, 180);

  -- Đơn khách là người đặt hoặc người nhận (bỏ đơn nháp, đơn đã hủy).
  select
    count(*) filter (where o.status = 'completed' and o.buyer_contact_id = p_contact),
    count(*) filter (where o.status = 'completed'),
    coalesce(bool_or(o.status in ('deposit_paid', 'ready_to_ship', 'delivering', 'installed')), false),
    coalesce(bool_or(o.status in ('pending_approval', 'confirmed', 'deposit_paid', 'ready_to_ship', 'delivering',
                                  'installed', 'return_requested')), false),
    coalesce(bool_or(o.status = 'return_requested'), false),
    coalesce(sum(o.paid_amount) filter (where o.buyer_contact_id = p_contact), 0),
    count(*) filter (where o.buyer_contact_id = p_contact)
  into v_completed_buyer, v_completed_any, v_new_customer, v_open_order, v_return, v_paid, v_orders
  from public.orders o
  where o.deleted_at is null and o.status not in ('draft', 'cancelled')
    and (o.buyer_contact_id = p_contact or o.recipient_contact_id = p_contact);

  -- Mua thêm trong hộ: hộ có từ 2 đơn hoàn tất (người đặt hoặc người nhận là thành viên).
  if v_c.household_id is not null and v_completed_any > 0 then
    select count(distinct o.id) into v_household_completed
    from public.orders o
    join public.contacts m on m.household_id = v_c.household_id and m.deleted_at is null
      and (m.id = o.buyer_contact_id or m.id = o.recipient_contact_id)
    where o.deleted_at is null and o.status = 'completed';
  end if;

  select exists (
    select 1 from public.leads l
    where l.deleted_at is null and (l.contact_id = p_contact or l.recipient_contact_id = p_contact)
  ) into v_has_lead;

  select exists (
    select 1 from public.tasks t where t.contact_id = p_contact and t.status = 'open' and t.type = 'warranty_followup'
  ) into v_warranty_open;

  -- Ngừng liên hệ: dòng đồng ý mới nhất của "chăm sóc, mọi kênh" là từ chối hoặc đã rút (cùng cách đọc với
  -- contact_blocked).
  select coalesce((
    select not cs.granted or cs.withdrawn_at is not null
    from public.consents cs
    where cs.contact_id = p_contact and cs.purpose = 'care' and cs.channel = 'all'
    order by greatest(cs.granted_at, coalesce(cs.withdrawn_at, cs.granted_at)) desc, cs.created_at desc
    limit 1
  ), false) into v_stop;

  -- Lần tương tác gần nhất: sự kiện do khách, nhân viên hoặc AI tạo (không tính việc hệ thống tự làm).
  select max(e.occurred_at) into v_last
  from public.events e
  where e.contact_id = p_contact and e.actor_type in ('customer', 'user', 'ai');
  v_last := greatest(coalesce(v_last, v_c.created_at), v_c.created_at);

  select count(*) into v_open_tasks from public.tasks t where t.contact_id = p_contact and t.status = 'open';

  -- Sản phẩm đang dùng: phiếu bảo hành của khách, cộng món của đơn hoàn tất giao cho khách mà không có phiếu.
  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_owned
  from (
    select jsonb_build_object('name', w.product_name, 'serial', w.serial, 'warranty_ends', w.ends_on) as x
    from public.warranties w
    where w.owner_contact_id = p_contact and w.status <> 'void'
    union all
    select jsonb_build_object('name', oi.name, 'qty', oi.qty)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.deleted_at is null and o.status = 'completed' and not oi.is_gift
      and coalesce(o.recipient_contact_id, o.buyer_contact_id) = p_contact
      and not exists (select 1 from public.warranties w where w.order_item_id = oi.id)
  ) s;

  -- Phụ trách.
  select l.assigned_to into v_owner from public.leads l
  where l.deleted_at is null and l.stage not in ('won', 'lost') and l.assigned_to is not null
    and (l.contact_id = p_contact or l.recipient_contact_id = p_contact)
  order by l.created_at desc
  limit 1;
  if v_owner is null then
    select cv.assigned_to into v_owner from public.conversations cv
    where cv.contact_id = p_contact and cv.lead_id is null and cv.assigned_to is not null
    order by cv.last_message_at desc nulls last
    limit 1;
  end if;
  if v_owner is null then
    select o.seller_id into v_owner from public.orders o
    where o.deleted_at is null and o.status <> 'cancelled' and o.seller_id is not null
      and (o.buyer_contact_id = p_contact or o.recipient_contact_id = p_contact)
    order by o.created_at desc
    limit 1;
  end if;
  if v_owner is null then
    select l.assigned_to into v_owner from public.leads l
    where l.deleted_at is null and l.assigned_to is not null
      and (l.contact_id = p_contact or l.recipient_contact_id = p_contact)
    order by l.created_at desc
    limit 1;
  end if;

  v_base := case
    when v_completed_any > 0 and (v_completed_buyer >= 2 or v_household_completed >= 2) then 'loyal'
    when v_completed_any > 0 then 'active_owner'
    when v_new_customer then 'new_customer'
    when v_has_lead then 'lead'
    else 'stranger'
  end;

  if v_return then v_flags := array_append(v_flags, 'return_open'); end if;
  if v_warranty_open then v_flags := array_append(v_flags, 'warranty_open'); end if;
  if v_stop then v_flags := array_append(v_flags, 'stop_contact'); end if;
  if v_base in ('lead', 'active_owner', 'loyal') and not v_open_order
     and v_last < now() - make_interval(days => v_dormant) then
    v_flags := array_append(v_flags, 'dormant');
  end if;

  v_stage := case
    when v_stop then 'do_not_contact'
    when v_return or v_warranty_open then 'at_risk'
    when 'dormant' = any (v_flags) then 'dormant'
    else v_base
  end;

  update public.contacts set lifecycle_stage = v_stage
  where id = p_contact and lifecycle_stage is distinct from v_stage;

  insert into public.customer_lifecycle (contact_id, showroom_id, stage, stage_since, last_interaction_at, total_paid,
                                         orders_count, owned_products, open_tasks, flags, owner_id, updated_at)
  values (p_contact, v_c.showroom_id, v_stage, now(), v_last, v_paid, v_orders, v_owned, v_open_tasks, v_flags,
          v_owner, now())
  on conflict (contact_id) do update
    set stage_since = case when public.customer_lifecycle.stage is distinct from excluded.stage then now()
                           else public.customer_lifecycle.stage_since end,
        stage = excluded.stage, last_interaction_at = excluded.last_interaction_at,
        total_paid = excluded.total_paid, orders_count = excluded.orders_count,
        owned_products = excluded.owned_products, open_tasks = excluded.open_tasks, flags = excluded.flags,
        owner_id = excluded.owner_id, updated_at = now();
  return v_stage;
end;
$fn$;

revoke all on function public.refresh_customer_lifecycle(uuid) from public, anon, authenticated;

-- Tính lại cả showroom (job mỗi đêm cho ngủ đông, và lần đầu chạy migration).
create or replace function public.refresh_all_customer_lifecycles()
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from public.contacts where deleted_at is null loop
    perform public.refresh_customer_lifecycle(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

revoke all on function public.refresh_all_customer_lifecycles() from public, anon, authenticated;

-- Khách của một đơn: người đặt, người nhận và các thành viên khác trong hộ của họ (mua thêm trong hộ làm cả hộ thành
-- Khách thân).
create or replace function public.refresh_order_contacts(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  for v_id in
    select distinct x.id from (
      select c.id from public.orders o
      join public.contacts c on c.id in (o.buyer_contact_id, o.recipient_contact_id)
      where o.id = p_order_id
      union
      select m.id from public.orders o
      join public.contacts c on c.id in (o.buyer_contact_id, o.recipient_contact_id) and c.household_id is not null
      join public.contacts m on m.household_id = c.household_id and m.deleted_at is null
      where o.id = p_order_id
    ) x
  loop
    perform public.refresh_customer_lifecycle(v_id);
  end loop;
end;
$fn$;

revoke all on function public.refresh_order_contacts(uuid) from public, anon, authenticated;

-- Đơn đổi trạng thái: như cũ gọi hàm này; giờ tính lại khách của đơn theo luật chung.
create or replace function public.sync_lifecycle_from_order(p_order_id uuid, p_stage text)
returns void
language sql
security definer
set search_path = ''
as $fn$
  select public.refresh_order_contacts(p_order_id);
$fn$;

revoke all on function public.sync_lifecycle_from_order(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tính lại khi dữ liệu đổi
-- ---------------------------------------------------------------------------

create or replace function public.lifecycle_on_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.order_id is not null then
    perform public.refresh_order_contacts(new.order_id);
  elsif new.contact_id is not null then
    perform public.refresh_customer_lifecycle(new.contact_id);
  end if;
  return null;
end;
$fn$;

create trigger events_lifecycle after insert on public.events
  for each row execute function public.lifecycle_on_event();

create or replace function public.lifecycle_on_contact_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Bảng gọi: contacts (id), tasks, consents (contact_id), warranties (owner_contact_id).
  if tg_table_name = 'contacts' then
    perform public.refresh_customer_lifecycle(new.id);
    -- Đổi hộ: thành viên hộ cũ và hộ mới tính lại (Khách thân theo hộ).
    if tg_op = 'UPDATE' then
      perform public.refresh_customer_lifecycle(m.id)
      from public.contacts m
      where m.id <> new.id and m.deleted_at is null and m.household_id is not null
        and m.household_id in (old.household_id, new.household_id);
    end if;
  elsif tg_table_name = 'warranties' then
    if new.owner_contact_id is not null then
      perform public.refresh_customer_lifecycle(new.owner_contact_id);
    end if;
  elsif new.contact_id is not null then
    perform public.refresh_customer_lifecycle(new.contact_id);
  end if;
  return null;
end;
$fn$;

create trigger contacts_lifecycle after insert or update of household_id on public.contacts
  for each row execute function public.lifecycle_on_contact_row();
create trigger consents_lifecycle after insert or update on public.consents
  for each row execute function public.lifecycle_on_contact_row();
create trigger warranties_lifecycle after insert or update of status, owner_contact_id on public.warranties
  for each row execute function public.lifecycle_on_contact_row();
create trigger tasks_lifecycle after insert or update of status on public.tasks
  for each row execute function public.lifecycle_on_contact_row();

-- Lead: người đặt và người nhận (giai đoạn Lead, người phụ trách) tính lại khi tạo lead, đổi người nhận, giao lead,
-- đổi giai đoạn, xóa lead. Người nhận cũ cũng tính lại khi bị thay.
create or replace function public.lifecycle_on_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.refresh_customer_lifecycle(new.contact_id);
  if new.recipient_contact_id is not null and new.recipient_contact_id <> new.contact_id then
    perform public.refresh_customer_lifecycle(new.recipient_contact_id);
  end if;
  if tg_op = 'UPDATE' then
    if old.recipient_contact_id is not null and old.recipient_contact_id is distinct from new.recipient_contact_id
       and old.recipient_contact_id <> new.contact_id then
      perform public.refresh_customer_lifecycle(old.recipient_contact_id);
    end if;
  end if;
  return null;
end;
$fn$;

create trigger leads_lifecycle
  after insert or update of contact_id, recipient_contact_id, stage, assigned_to, deleted_at on public.leads
  for each row execute function public.lifecycle_on_lead();

-- 02:10 giờ VN mỗi đêm.
select cron.schedule('customer-lifecycle-nightly', '10 19 * * *', 'select public.refresh_all_customer_lifecycles()');

-- ---------------------------------------------------------------------------
-- Danh sách khách (RLS của contacts, customer_lifecycle áp theo người xem)
-- ---------------------------------------------------------------------------

create view public.customer_list with (security_invoker = true) as
  select c.id, c.showroom_id, c.full_name, c.relation_in_household, c.country_of_residence, c.province,
         c.household_id, c.lifecycle_stage, cl.stage_since,
         coalesce(cl.last_interaction_at, c.created_at) as last_interaction_at,
         coalesce(cl.owned_products, '[]'::jsonb) as owned_products, coalesce(cl.open_tasks, 0) as open_tasks,
         coalesce(cl.flags, '{}'::text[]) as flags, coalesce(cl.total_paid, 0) as total_paid,
         coalesce(cl.orders_count, 0) as orders_count, cl.owner_id, p.full_name as owner_name
  from public.contacts c
  left join public.customer_lifecycle cl on cl.contact_id = c.id
  left join public.profiles p on p.id = cl.owner_id
  where c.deleted_at is null;

grant select on public.customer_list to authenticated;

-- ---------------------------------------------------------------------------
-- Hồ sơ khách 360: đồng ý, thông tin khách
-- ---------------------------------------------------------------------------

-- Ghi đồng ý theo mục đích và kênh (người sửa được khách). Dòng mới nhất quyết định (contact_blocked).
-- "Chăm sóc, mọi kênh" từ chối là khách yêu cầu ngừng mọi liên hệ: giai đoạn Ngừng liên hệ.
create or replace function public.set_consent(p_contact uuid, p_purpose text, p_channel text, p_granted boolean,
                                              p_source text default 'staff')
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_showroom uuid := public.assert_contact_editor(p_contact);
begin
  if p_purpose not in ('care', 'marketing', 'ads_measurement') then
    raise exception 'bad purpose' using errcode = '22023';
  end if;
  if p_channel not in ('call', 'zalo_oa', 'zns', 'sms', 'email', 'messenger', 'all') then
    raise exception 'bad channel' using errcode = '22023';
  end if;
  if p_granted is null then
    raise exception 'granted required' using errcode = '22023';
  end if;
  -- Giờ thực lúc ghi (không phải giờ bắt đầu giao dịch) để dòng mới luôn là dòng mới nhất.
  insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source, granted_at, created_by)
  values (v_showroom, p_contact, p_purpose, p_channel, p_granted, left(coalesce(nullif(btrim(p_source), ''), 'staff'), 60),
          clock_timestamp(), auth.uid());
  perform public.record_event('consent_changed', v_showroom, p_contact, null,
    jsonb_build_object('purpose', p_purpose, 'channel', p_channel, 'granted', p_granted));
  perform public.write_audit('contact.consent', 'contacts', p_contact::text,
    jsonb_build_object('purpose', p_purpose, 'channel', p_channel, 'granted', p_granted));
end;
$fn$;

revoke all on function public.set_consent(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.set_consent(uuid, text, text, boolean, text) to authenticated;

-- Thị trường, tỉnh, quan hệ trong hộ (người sửa được khách). Thị trường phải có trong markets hoặc 'unknown'.
create or replace function public.update_contact_profile(p_contact uuid, p_country text, p_province text,
                                                         p_relation text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_showroom uuid := public.assert_contact_editor(p_contact);
  v_country text := coalesce(nullif(btrim(p_country), ''), 'unknown');
begin
  if v_country <> 'unknown' and not exists (
    select 1 from public.markets where showroom_id = v_showroom and country_code = v_country
  ) then
    raise exception 'unknown market' using errcode = '22023';
  end if;
  update public.contacts
    set country_of_residence = v_country,
        province = left(nullif(btrim(coalesce(p_province, '')), ''), 80),
        relation_in_household = left(nullif(btrim(coalesce(p_relation, '')), ''), 60)
    where id = p_contact;
  perform public.record_event('contact_updated', v_showroom, p_contact, null,
    jsonb_build_object('country', v_country), 'user');
  perform public.write_audit('contact.update', 'contacts', p_contact::text, jsonb_build_object('country', v_country));
end;
$fn$;

revoke all on function public.update_contact_profile(uuid, text, text, text) from public, anon;
grant execute on function public.update_contact_profile(uuid, text, text, text) to authenticated;

-- Mở lead mới cho khách cũ ngay trên hồ sơ khách (tái bán, CLAUDE.md 1.1). Chống trùng như ingest_lead: khách đang có
-- lead mở hoặc lead thất bại chưa quá 30 ngày thì dùng lead đó. Khách yêu cầu ngừng liên hệ thì không mở.
-- Trả về { action: 'created' | 'exists', lead_id, route, holder_name }.
create or replace function public.open_customer_lead(p_contact uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_c public.contacts;
  v_lead uuid;
  v_route text;
  v_holder text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null or (public.active_view_as()).id is not null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.has_perm('lead.create') then
    raise exception 'not allowed to create leads' using errcode = '42501';
  end if;
  select * into v_c from public.contacts
  where id = p_contact and deleted_at is null and showroom_id = public.current_showroom_id();
  if not found or not public.can_view_contact(p_contact) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if v_c.lifecycle_stage = 'do_not_contact' then
    raise exception 'contact asked to stop' using errcode = '22023';
  end if;

  v_lead := public.reusable_lead_for(p_contact);
  if v_lead is not null then
    return jsonb_build_object('action', 'exists', 'lead_id', v_lead);
  end if;

  insert into public.leads (showroom_id, contact_id, source, source_detail, created_by)
  values (v_c.showroom_id, p_contact, 'manual', jsonb_build_object('origin', 'customer_profile'), v_user)
  returning id into v_lead;
  perform public.record_event('merge', v_c.showroom_id, p_contact, v_lead,
    jsonb_build_object('reason', 'returning_customer', 'matched_by', 'profile'));
  if v_note is not null then
    perform public.record_event('note', v_c.showroom_id, p_contact, v_lead,
      jsonb_build_object('text', left(v_note, 4000), 'channel', 'crm'), 'user');
  end if;
  perform public.write_audit('lead.create', 'leads', v_lead::text,
    jsonb_build_object('source', 'manual', 'action', 'returning_customer'));
  v_route := public.route_lead(v_lead);
  select p.full_name into v_holder
  from public.leads l join public.profiles p on p.id = l.assigned_to where l.id = v_lead;
  return jsonb_build_object('action', 'created', 'lead_id', v_lead, 'route', v_route, 'holder_name', v_holder);
end;
$fn$;

revoke all on function public.open_customer_lead(uuid, text) from public, anon;
grant execute on function public.open_customer_lead(uuid, text) to authenticated;

-- Trích xuất dữ liệu của một khách theo yêu cầu của khách (CLAUDE.md 11.2, 12; Luật Bảo vệ dữ liệu cá nhân). Cần quyền
-- xuất file (lead.export); số điện thoại đầy đủ chỉ khi có contact.phone_reveal. Mỗi lần xuất ghi nhật ký kiểm toán.
create or replace function public.export_contact_data(p_contact uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_c public.contacts;
  v_full boolean := public.has_perm('contact.phone_reveal');
begin
  if auth.uid() is null or (public.active_view_as()).id is not null or not public.has_perm('lead.export') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_c from public.contacts
  where id = p_contact and deleted_at is null and showroom_id = public.current_showroom_id();
  if not found or not public.can_view_contact(p_contact) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  perform public.write_audit('contact.export', 'contacts', p_contact::text,
    jsonb_build_object('full_identities', v_full));

  return jsonb_build_object(
    'khach', jsonb_build_object('ma', v_c.id, 'ho_ten', v_c.full_name, 'noi_song', v_c.country_of_residence,
      'tinh', v_c.province, 'thanh_pho', v_c.city, 'quan_he_trong_ho', v_c.relation_in_household,
      'giai_doan', v_c.lifecycle_stage, 'tao_luc', v_c.created_at),
    'dinh_danh', (select coalesce(jsonb_agg(jsonb_build_object('loai', ci.type,
        'gia_tri', case when v_full then ci.value else ci.display_masked end, 'chinh', ci.is_primary,
        'nguon', ci.source, 'tao_luc', ci.created_at) order by ci.created_at), '[]'::jsonb)
      from public.contact_identities ci where ci.contact_id = p_contact),
    'dong_y', (select coalesce(jsonb_agg(jsonb_build_object('muc_dich', cs.purpose, 'kenh', cs.channel,
        'dong_y', cs.granted, 'nguon', cs.source, 'luc', cs.granted_at, 'rut_luc', cs.withdrawn_at)
        order by cs.granted_at), '[]'::jsonb)
      from public.consents cs where cs.contact_id = p_contact),
    'ngay_quan_trong', (select coalesce(jsonb_agg(jsonb_build_object('loai', d.type, 'ngay', d.date)
        order by d.date), '[]'::jsonb)
      from public.important_dates d where d.contact_id = p_contact),
    'lead', (select coalesce(jsonb_agg(jsonb_build_object('giai_doan', l.stage, 'nguon', l.source,
        'vai_tro', case when l.contact_id = p_contact then 'nguoi_dat' else 'nguoi_nhan' end, 'tao_luc', l.created_at)
        order by l.created_at), '[]'::jsonb)
      from public.leads l
      where l.deleted_at is null and (l.contact_id = p_contact or l.recipient_contact_id = p_contact)),
    'don_hang', (select coalesce(jsonb_agg(jsonb_build_object('ma_don', o.code, 'trang_thai', o.status,
        'tong', o.total, 'da_tra', o.paid_amount,
        'vai_tro', case when o.buyer_contact_id = p_contact then 'nguoi_dat' else 'nguoi_nhan' end,
        'tinh_giao', o.ship_province, 'tao_luc', o.created_at) order by o.created_at), '[]'::jsonb)
      from public.orders o
      where o.deleted_at is null and (o.buyer_contact_id = p_contact or o.recipient_contact_id = p_contact)),
    'bao_hanh', (select coalesce(jsonb_agg(jsonb_build_object('ma', w.code, 'san_pham', w.product_name,
        'serial', w.serial, 'tu', w.starts_on, 'den', w.ends_on, 'trang_thai', w.status) order by w.starts_on),
        '[]'::jsonb)
      from public.warranties w where w.owner_contact_id = p_contact),
    'tin_nhan', (select coalesce(jsonb_agg(jsonb_build_object('kenh', cv.channel, 'chieu', m.direction,
        'noi_dung', m.text, 'luc', m.occurred_at) order by m.occurred_at), '[]'::jsonb)
      from public.messages m join public.conversations cv on cv.id = m.conversation_id
      where cv.contact_id = p_contact),
    'su_kien', (select coalesce(jsonb_agg(jsonb_build_object('loai', e.type, 'luc', e.occurred_at,
        'nguoi_lam', e.actor_type) order by e.occurred_at), '[]'::jsonb)
      from public.events e where e.contact_id = p_contact),
    'xuat_luc', now()
  );
end;
$fn$;

revoke all on function public.export_contact_data(uuid) from public, anon;
grant execute on function public.export_contact_data(uuid) to authenticated;

-- Cài đặt, Bán hàng: như bản ở 20261011000500_sales_flow, thêm số ngày không tương tác thì Ngủ đông (đổi thì tính
-- lại vòng đời ngay).
create or replace function public.save_sales_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := public.assert_writer();
  v_old int;
begin
  if not public.has_perm('settings.integrations') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select dormant_days into v_old from public.sales_settings where showroom_id = public.current_showroom_id();
  update public.sales_settings set
    deposit_min_amount = coalesce((p ->> 'deposit_min_amount')::bigint, deposit_min_amount),
    deposit_min_pct = coalesce((p ->> 'deposit_min_pct')::numeric, deposit_min_pct),
    hold_days = coalesce((p ->> 'hold_days')::int, hold_days),
    quote_valid_days = coalesce((p ->> 'quote_valid_days')::int, quote_valid_days),
    post_delivery_call_days = coalesce((p ->> 'post_delivery_call_days')::int, post_delivery_call_days),
    dormant_days = coalesce((p ->> 'dormant_days')::int, dormant_days),
    bank_info = case when p ? 'bank_info' then nullif(btrim(p ->> 'bank_info'), '') else bank_info end,
    updated_at = now(), updated_by = v_user
  where showroom_id = public.current_showroom_id();
  -- Gọi hỏi thăm sau giao: số ngày đi theo luật sinh việc.
  if p ? 'post_delivery_call_days' then
    update public.task_rules set due_offset = make_interval(days => (p ->> 'post_delivery_call_days')::int)
    where showroom_id = public.current_showroom_id() and rule_key = 'post_delivery_call';
  end if;
  if p ? 'dormant_days' and (p ->> 'dormant_days')::int is distinct from v_old then
    perform public.refresh_customer_lifecycle(c.id)
    from public.contacts c
    where c.showroom_id = public.current_showroom_id() and c.deleted_at is null;
  end if;
  perform public.write_audit('settings.sales', 'sales_settings', public.current_showroom_id()::text, p);
end;
$fn$;

revoke all on function public.save_sales_settings(jsonb) from public, anon;
grant execute on function public.save_sales_settings(jsonb) to authenticated;

-- Lần đầu: tính vòng đời cho mọi khách đang có.
select public.refresh_all_customer_lifecycles();

-- HẾT FILE
