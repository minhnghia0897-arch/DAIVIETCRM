-- Xóa đơn (Owner chốt 05/11/2026): đơn nhập sai, đơn chạy thử thì Owner xóa ở danh sách đơn, ghi lý do.
--
-- Xóa mềm (orders.deleted_at, CLAUDE.md mục 4): đơn biến mất khỏi danh sách, hồ sơ đơn, doanh số, số lượng bán, hồ sơ
-- khách; dữ liệu vẫn còn trong database, nhật ký kiểm toán ghi người xóa và lý do. Khác Hủy đơn: hủy là việc thật đã
-- xảy ra (số tháng trước giữ nguyên, ghi dòng âm vào tháng hủy); xóa là đơn coi như chưa từng có, nên doanh số của đơn
-- bị loại khỏi mọi tháng. Sổ doanh số vẫn chỉ thêm: dòng của đơn đã xóa còn đó nhưng không ai thấy, không cộng.
--
-- Chính sách xem đơn (orders_select) và các hàm của đơn vốn đã bỏ đơn có deleted_at. Bản này vá những chỗ còn lọt:
-- thanh toán, bảo hành, giao lắp xem theo quyền riêng (payment.confirm, warranty.manage, delivery.update), sổ doanh số
-- và KPI doanh số tháng.

-- ---------------------------------------------------------------------------
-- 1. Quyền mới: order.delete (chỉ Owner, không cấp được cho vai trò khác)
-- ---------------------------------------------------------------------------

-- Chỉ thêm quyền mới, không chạy lại cả khối: chạy lại sẽ bật lại các quyền Owner đã tắt cho vai trò.
-- Dòng dưới khớp với kết quả của scripts/gen-permission-seed.mts (tests/unit/permissions.test.ts kiểm).
insert into public.permissions (key, "group", description, grantable, sensitive) values
  ('order.delete', 'Báo giá, đơn', 'Xóa đơn nhập sai, chạy thử (ẩn khỏi danh sách, doanh số)', false, true)
on conflict (key) do update set "group" = excluded."group", description = excluded.description,
  grantable = excluded.grantable, sensitive = excluded.sensitive;

insert into public.role_permissions (role_id, permission_key)
select r.id, v.permission_key from (values
  ('owner', 'order.delete')
) as v (role_key, permission_key)
join public.roles r on r.key = v.role_key
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Đơn còn hiệu lực (chưa xóa): dùng trong chính sách theo dòng
-- ---------------------------------------------------------------------------

create or replace function private.order_live(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (select 1 from public.orders o where o.id = p_order_id and o.deleted_at is null);
$fn$;

revoke all on function private.order_live(uuid) from public, anon;
grant execute on function private.order_live(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Chính sách xem theo quyền riêng: bỏ dòng của đơn đã xóa
-- ---------------------------------------------------------------------------

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (
    showroom_id = (select public.current_showroom_id())
    and (
      private.can_view_order_ctx(order_id, (select public.current_showroom_id()), (select public.effective_uid()),
                                 (select public.has_perm('order.view_all')), (select public.has_perm('order.view_own')))
      or ((select public.has_perm('payment.confirm')) and private.order_live(order_id))
    )
  );

drop policy if exists warranties_select on public.warranties;
create policy warranties_select on public.warranties for select to authenticated
  using (
    showroom_id = (select public.current_showroom_id())
    and (
      ((select public.has_perm('warranty.manage')) and private.order_live(order_id))
      or private.can_view_order_ctx(order_id, (select public.current_showroom_id()), (select public.effective_uid()),
                                    (select public.has_perm('order.view_all')), (select public.has_perm('order.view_own')))
    )
  );

drop policy if exists deliveries_select on public.deliveries;
create policy deliveries_select on public.deliveries for select to authenticated
  using (
    private.can_view_order_ctx(order_id, (select public.current_showroom_id()), (select public.effective_uid()),
                               (select public.has_perm('order.view_all')), (select public.has_perm('order.view_own')))
    or (
      showroom_id = (select public.current_showroom_id())
      and (select public.has_perm('delivery.update'))
      and private.order_live(order_id)
    )
  );

drop policy if exists sales_credits_select on public.sales_credits;
create policy sales_credits_select on public.sales_credits for select to authenticated
  using (
    showroom_id = (select public.current_showroom_id())
    and private.order_live(order_id)
    and (
      private.sales_visible_ctx(seller_id, (select public.effective_uid()), (select public.has_perm('kpi.own')),
                                (select public.has_perm('target.manage')), (select public.has_perm('kpi.team')))
      or private.can_view_order_ctx(order_id, (select public.current_showroom_id()), (select public.effective_uid()),
                                    (select public.has_perm('order.view_all')), (select public.has_perm('order.view_own')))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. KPI doanh số tháng: không cộng đơn đã xóa (như bản 20261015000100, thêm điều kiện đơn còn hiệu lực)
-- ---------------------------------------------------------------------------

create or replace function public.sales_kpi_month(p_month date)
returns table (user_id uuid, full_name text, sold bigint, reversed bigint, net bigint, orders int, target bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with m as (
    select date_trunc('month', p_month)::date as month, public.current_showroom_id() as showroom
  ),
  credits as (
    select c.*
    from public.sales_credits c
    join public.orders o on o.id = c.order_id and o.deleted_at is null
    cross join m
    where c.showroom_id = m.showroom and c.month = m.month
  ),
  people as (
    select p.id, p.full_name
    from public.profiles p, m
    where p.showroom_id = m.showroom
      and public.can_view_sales_of(p.id)
      and (
        (p.is_active and public.has_perm_for(p.id, 'order.create'))
        or exists (select 1 from credits c where c.seller_id = p.id)
        or exists (select 1 from public.targets t
                   where t.showroom_id = m.showroom and t.user_id = p.id and t.period = 'month'
                     and t.period_start = m.month and t.metric_key = 'revenue_deposit')
      )
  )
  select pe.id,
         pe.full_name,
         coalesce(sum(c.amount) filter (where c.kind = 'sale'), 0)::bigint,
         coalesce(sum(c.amount) filter (where c.kind = 'reversal'), 0)::bigint,
         coalesce(sum(c.amount), 0)::bigint,
         (count(c.id) filter (where c.kind = 'sale'))::int,
         (select t.target_value from public.targets t
          where t.showroom_id = m.showroom and t.user_id = pe.id and t.period = 'month'
            and t.period_start = m.month and t.metric_key = 'revenue_deposit')
  from people pe
  cross join m
  left join credits c on c.seller_id = pe.id
  group by pe.id, pe.full_name, m.month, m.showroom
  order by 5 desc, 2;
$fn$;

revoke all on function public.sales_kpi_month(date) from public, anon;
grant execute on function public.sales_kpi_month(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Xóa đơn
-- ---------------------------------------------------------------------------

-- Lý do bắt buộc (tới 500 ký tự), chỉ ghi vào nhật ký kiểm toán. Việc đang mở của đơn bị hủy, đề xuất đang chờ hết
-- hạn, khoản thanh toán chưa xác nhận bị từ chối, phiếu bảo hành bị vô hiệu để khách không còn "đang dùng" sản phẩm
-- của đơn. Giai đoạn lead không tự đổi (như Hủy đơn, mục 8.7).
create or replace function public.delete_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.assert_writer();
  if not public.has_perm('order.delete') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_reason) = 0 or length(v_reason) > 500 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  perform set_config('app.approval_system', 'on', true);
  update public.approvals set status = 'expired', decision_note = 'Đơn đã xóa'
  where status = 'pending' and ((entity = 'orders' and entity_id = v_o.id)
        or (entity = 'payments' and entity_id in (select id from public.payments where order_id = v_o.id)));
  perform set_config('app.approval_system', '', true);
  update public.payments set status = 'rejected', decision_note = 'Đơn đã xóa'
  where order_id = v_o.id and status = 'recorded';
  update public.tasks set status = 'cancelled', outcome = 'Đơn đã xóa'
  where order_id = v_o.id and status = 'open';
  update public.warranties set status = 'void'
  where order_id = v_o.id and status <> 'void';

  update public.orders set deleted_at = now() where id = v_o.id;
  -- Sự kiện có order_id nên vòng đời của người đặt, người nhận được tính lại (trigger events_lifecycle).
  perform public.order_event(v_o.id, 'order_deleted', jsonb_build_object('status', v_o.status));
  perform public.write_audit('order.delete', 'orders', v_o.id::text,
    jsonb_build_object('code', v_o.code, 'status', v_o.status, 'total', v_o.total, 'reason', v_reason));
end;
$$;

revoke all on function public.delete_order(uuid, text) from public, anon;
grant execute on function public.delete_order(uuid, text) to authenticated;
