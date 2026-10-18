-- Bán hàng không quản lý kho (Owner chốt 18/10/2026).
--
-- Hàng xuất hết từ kho Đại Việt, showroom không cần theo dõi tồn kho, kho showroom, chuyển kho, kiểm kê hay serial.
-- CRM chỉ cần biết bán được bao nhiêu. Quyết định:
--   1. Không chặn đơn vì hết hàng: khách cọc đủ là sang Đã cọc, không giữ hàng, không có hạn giữ hàng.
--   2. Không cần phiếu xuất kho, không gán serial trước khi giao; Sẵn sàng giao là bắt đầu giao được.
--   3. Bỏ hẳn serial: hoàn tất đơn sinh một phiếu bảo hành cho mỗi sản phẩm (mỗi chiếc), không ghi serial.
--   4. Màn Kho đổi thành Số lượng bán (hàm sales_units_month): theo tháng, số đã cọc, tặng kèm, đã giao xong, hủy hoặc
--      trả, cộng số đang chờ giao.
-- Bảng kho cũ (warehouses, stock_*, serial_units) và các hàm phiếu kho giữ nguyên dữ liệu, chỉ không còn dùng trên
-- giao diện; xóa bảng có dữ liệu thật cần Owner duyệt riêng (CLAUDE.md mục 14).

-- ---------------------------------------------------------------------------
-- Điều kiện chuyển bước: bỏ kiểm tồn và bỏ yêu cầu xuất kho
-- ---------------------------------------------------------------------------

create or replace function public.order_blockers(p_order_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_paid record;
  v_out text[] := '{}';
begin
  if not public.can_view_order(p_order_id) and not exists (
    select 1 from public.orders where id = p_order_id and showroom_id = public.current_showroom_id()
      and (public.has_perm('delivery.update') or public.has_perm('payment.confirm'))) then
    return v_out;
  end if;
  select * into v_o from public.orders where id = p_order_id;
  select * into v_paid from public.order_paid(p_order_id);
  case v_o.status
    when 'pending_approval' then
      v_out := v_out || 'Đơn đang chờ duyệt giảm giá'::text;
    when 'draft' then
      if v_o.recipient_contact_id is null then v_out := v_out || 'Chưa có người nhận'::text; end if;
    when 'confirmed' then
      if v_paid.confirmed < coalesce(v_o.deposit_min, 0) then
        v_out := v_out || format('Tiền cọc đã xác nhận chưa đủ mức tối thiểu %s đồng',
                                 public.money_text(v_o.deposit_min));
      end if;
    when 'deposit_paid' then
      if v_paid.confirmed < v_o.total and v_o.cod_approved_at is null then
        v_out := v_out || 'Chưa thu đủ tiền và chưa được duyệt thu khi giao'::text;
      end if;
    else
      null;
  end case;
  return v_out;
end;
$$;

revoke all on function public.order_blockers(uuid) from public, anon;
grant execute on function public.order_blockers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chuyển bước đơn: không giữ hàng khi cọc; bảo hành theo từng chiếc, không serial
-- ---------------------------------------------------------------------------

create or replace function public.advance_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
  v_to text;
  r record;
  v_no int := 0;
begin
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  v_to := case v_o.status when 'draft' then 'confirmed' when 'confirmed' then 'deposit_paid'
            when 'deposit_paid' then 'ready_to_ship' when 'ready_to_ship' then 'delivering'
            when 'delivering' then 'installed' when 'installed' then 'completed' end;
  if v_to is null then
    raise exception 'no_next_status' using errcode = 'P0001';
  end if;
  -- Bước giao lắp cần delivery.update; các bước còn lại cần quyền sửa đơn.
  if v_to in ('delivering', 'installed', 'completed') then
    if not public.has_perm('delivery.update') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  else
    perform public.assert_order_editor(p_order_id);
  end if;
  if cardinality(public.order_blockers(p_order_id)) > 0 then
    raise exception 'blocked: %', array_to_string(public.order_blockers(p_order_id), '; ') using errcode = 'P0001';
  end if;

  if v_to = 'deposit_paid' then
    update public.orders set status = v_to where id = v_o.id;
    perform public.sync_lead_from_order(v_o.id, 'deposit');
    perform public.sync_lifecycle_from_order(v_o.id, 'new_customer');
    perform public.fire_order_rules('order_deposit_paid', v_o.id);
  elsif v_to = 'ready_to_ship' then
    update public.orders set status = v_to where id = v_o.id;
    if v_o.cod_approved_at is not null then
      perform public.sync_lead_from_order(v_o.id, 'deposit');
    end if;
  elsif v_to = 'installed' then
    update public.orders set status = v_to where id = v_o.id;
    update public.deliveries set installed_at = coalesce(installed_at, now()), updated_at = now(), updated_by = v_user
    where order_id = v_o.id;
  elsif v_to = 'completed' then
    update public.orders set status = v_to, completed_at = now() where id = v_o.id;
    -- Phiếu bảo hành cho từng chiếc (không ghi serial); thời hạn theo sản phẩm. Quà tặng kèm không có phiếu.
    for r in
      select oi.id as item_id, oi.name, p.warranty_months
      from public.order_items oi
      join public.product_variants v on v.id = oi.variant_id
      join public.products p on p.id = v.product_id
      cross join lateral generate_series(1, oi.qty)
      where oi.order_id = v_o.id and not oi.is_gift
      order by oi.created_at, oi.id
    loop
      v_no := v_no + 1;
      insert into public.warranties (showroom_id, code, order_id, order_item_id, product_name, owner_contact_id,
                                     starts_on, ends_on, created_by)
      values (v_o.showroom_id, 'BH-' || v_o.code || '-' || v_no, v_o.id, r.item_id, r.name,
              coalesce(v_o.recipient_contact_id, v_o.buyer_contact_id),
              (now() at time zone 'Asia/Ho_Chi_Minh')::date,
              case when r.warranty_months is null then null
                   else ((now() at time zone 'Asia/Ho_Chi_Minh')::date + make_interval(months => r.warranty_months))::date end,
              v_user);
    end loop;
    -- Nhắc thay vật tư theo consumable_links.
    for r in
      select distinct cl.replacement_cycle_months, cv.sku
      from public.order_items oi
      join public.product_variants v on v.id = oi.variant_id
      join public.consumable_links cl on cl.product_id = v.product_id
      join public.product_variants cv on cv.id = cl.consumable_variant_id
      where oi.order_id = v_o.id
    loop
      insert into public.tasks (showroom_id, type, title, contact_id, lead_id, order_id, assigned_to, due_at, source,
                                rule_key)
      values (v_o.showroom_id, 'consumable_reminder', format('Nhắc thay %s cho khách đơn %s', r.sku, v_o.code),
              coalesce(v_o.recipient_contact_id, v_o.buyer_contact_id), v_o.lead_id, v_o.id, v_o.seller_id,
              now() + make_interval(months => r.replacement_cycle_months), 'rule', 'consumable_reminder');
    end loop;
    perform public.fire_order_rules('order_completed', v_o.id);
    perform public.sync_lead_from_order(v_o.id, 'won');
    perform public.sync_lifecycle_from_order(v_o.id, 'active_owner');
    perform public.order_event(v_o.id, 'warranty_created', jsonb_build_object('count', v_no));
  else
    update public.orders set status = v_to where id = v_o.id;
  end if;

  perform public.order_event(v_o.id, 'order_status_changed', jsonb_build_object('from', v_o.status, 'to', v_to));
  perform public.write_audit('order.advance', 'orders', v_o.id::text,
    jsonb_build_object('code', v_o.code, 'from', v_o.status, 'to', v_to));
  return v_to;
end;
$$;

revoke all on function public.advance_order(uuid) from public, anon;
grant execute on function public.advance_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dọn phần giữ hàng: nhả hàng còn giữ, tắt việc nền hết hạn giữ hàng và luật sinh việc tương ứng
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select distinct order_id from public.stock_reservations where released_at is null loop
    perform public.release_order_reservations(r.order_id, 'Bỏ quản lý kho');
  end loop;
end;
$$;

update public.orders set hold_until = null where hold_until is not null;

update public.task_rules set is_active = false, updated_at = now() where rule_key = 'hold_expired' and is_active;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'release-expired-holds') then
    perform cron.unschedule('release-expired-holds');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Số lượng bán theo tháng (màn Số lượng bán)
-- ---------------------------------------------------------------------------

-- Mỗi sản phẩm một dòng, chỉ tính sản phẩm bán (không tính quà tặng kèm, trừ cột tặng kèm):
--   sold      đã cọc trong tháng: đơn được ghi doanh số tháng đó (sales_credits, cùng mốc với doanh số từng sale);
--   gifts     quà tặng kèm theo các đơn đã cọc trong tháng;
--   delivered đã giao xong trong tháng: đơn hoàn tất trong tháng (giờ showroom);
--   returned  bị hủy hoặc trả trong tháng: đơn đã tính doanh số mà bị hủy, trả hàng trong tháng;
--   pending   đang chờ giao, tính đến lúc xem (không theo tháng): đơn đã cọc chưa hoàn tất.
-- Người xem cần inventory.view hoặc report.team; số đếm cả showroom, không có tên khách hay số tiền.
create or replace function public.sales_units_month(p_month date)
returns table (variant_id uuid, sku text, name text, sold int, gifts int, delivered int, returned int, pending int)
language sql
stable
security definer
set search_path = ''
as $fn$
  with m as (
    select date_trunc('month', p_month)::date as month, public.current_showroom_id() as showroom
    where public.has_perm('inventory.view') or public.has_perm('report.team')
  ),
  tagged as (
    select o.id,
           exists (select 1 from public.sales_credits c
                   where c.order_id = o.id and c.kind = 'sale' and c.month = m.month) as is_sold,
           exists (select 1 from public.sales_credits c
                   where c.order_id = o.id and c.kind = 'reversal' and c.month = m.month) as is_returned,
           (o.completed_at is not null and public.sales_month(o.showroom_id, o.completed_at) = m.month) as is_delivered,
           (o.status in ('deposit_paid', 'ready_to_ship', 'delivering', 'installed')) as is_pending
    from public.orders o
    cross join m
    where o.showroom_id = m.showroom and o.deleted_at is null
  ),
  lines as (
    select oi.variant_id, oi.sku, oi.name, oi.qty, oi.is_gift, t.is_sold, t.is_returned, t.is_delivered, t.is_pending
    from public.order_items oi
    join tagged t on t.id = oi.order_id
    where t.is_sold or t.is_returned or t.is_delivered or t.is_pending
  )
  select l.variant_id,
         max(l.sku),
         max(l.name),
         coalesce(sum(l.qty) filter (where l.is_sold and not l.is_gift), 0)::int,
         coalesce(sum(l.qty) filter (where l.is_sold and l.is_gift), 0)::int,
         coalesce(sum(l.qty) filter (where l.is_delivered and not l.is_gift), 0)::int,
         coalesce(sum(l.qty) filter (where l.is_returned and not l.is_gift), 0)::int,
         coalesce(sum(l.qty) filter (where l.is_pending and not l.is_gift), 0)::int
  from lines l
  group by l.variant_id
  order by 4 desc, 6 desc, 3;
$fn$;

revoke all on function public.sales_units_month(date) from public, anon;
grant execute on function public.sales_units_month(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Nhãn quyền (lib/auth/permissions.ts): quyền xem kho thành quyền xem số lượng bán; sản phẩm không còn tồn khả dụng.
-- Các quyền kho (lập, ghi sổ phiếu, duyệt kiểm kê, đặt trước) giữ trong database nhưng ẩn ở màn Phân quyền.
-- ---------------------------------------------------------------------------

insert into public.permissions (key, "group", description, grantable, sensitive) values
  ('product.view', 'Sản phẩm', 'Xem sản phẩm, giá bán', true, false),
  ('inventory.view', 'Sản phẩm', 'Xem số lượng bán theo sản phẩm', true, false)
on conflict (key) do update set "group" = excluded."group", description = excluded.description,
  grantable = excluded.grantable, sensitive = excluded.sensitive;

-- HẾT FILE
