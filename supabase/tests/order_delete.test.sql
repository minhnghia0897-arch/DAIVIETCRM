-- Kiểm thử Xóa đơn (supabase/migrations/20261105000100_order_delete.sql). Chạy: pnpm test:rls
-- Dữ liệu giả: Owner …0001, sale admin …0002 (có payment.confirm, warranty.manage, không có order.delete),
-- Thảo …0003 (telesale, người bán); khách …0001; ghế DC302.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create temp table t (k text primary key, v uuid);
grant all on t to authenticated;

-- Đơn của Thảo đã cọc (có doanh số), một khoản chờ xác nhận, một đề xuất đang chờ, một việc đang mở, một phiếu bảo hành.
with x as (
  insert into public.orders (showroom_id, code, buyer_contact_id, recipient_contact_id, ship_province, subtotal,
                             discount, total, status, seller_id)
  values ('4a000000-0000-4000-8000-000000000004', 'X-0001', '22222222-2222-4222-8222-000000000001',
          '22222222-2222-4222-8222-000000000001', 'Nghệ An', 40000000, 0, 40000000, 'confirmed',
          '11111111-1111-4111-8111-000000000003')
  returning id)
insert into t select 'o', id from x;
update public.orders set status = 'deposit_paid' where id = (select v from t where k = 'o');
with x as (
  insert into public.order_items (showroom_id, order_id, variant_id, sku, name, qty, unit_price, line_total)
  select '4a000000-0000-4000-8000-000000000004', (select v from t where k = 'o'), v.id, v.sku, 'Ghế DC302', 1,
         40000000, 40000000
  from public.product_variants v where v.sku = 'DC302'
  returning id)
insert into t select 'i', id from x;
with x as (
  insert into public.payments (showroom_id, order_id, type, method, amount, status)
  values ('4a000000-0000-4000-8000-000000000004', (select v from t where k = 'o'), 'balance', 'bank_transfer',
          5000000, 'recorded')
  returning id)
insert into t select 'p', id from x;
insert into public.approvals (showroom_id, type, entity, entity_id, reason, status)
values ('4a000000-0000-4000-8000-000000000004', 'payment_confirm', 'payments', (select v from t where k = 'p'),
        'Xác nhận tiền về', 'pending');
insert into public.tasks (showroom_id, type, title, order_id, due_at, status)
values ('4a000000-0000-4000-8000-000000000004', 'post_delivery_call', 'Gọi hỏi thăm', (select v from t where k = 'o'),
        now() + interval '3 days', 'open');
insert into public.warranties (showroom_id, code, order_id, order_item_id, product_name, owner_contact_id, starts_on)
values ('4a000000-0000-4000-8000-000000000004', 'BH-X-0001', (select v from t where k = 'o'),
        (select v from t where k = 'i'), 'Ghế DC302', '22222222-2222-4222-8222-000000000001', current_date);

select is((select count(*)::int from public.sales_credits where order_id = (select v from t where k = 'o')), 1,
  'đơn đã cọc có doanh số trước khi xóa');

-- Chỉ Owner xóa được, phải có lý do.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select throws_ok(format($$ select public.delete_order(%L, 'Nhập trùng') $$, (select v from t where k = 'o')),
  '42501', null, 'sale admin không xóa được đơn');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok(format($$ select public.delete_order(%L, 'Nhập trùng') $$, (select v from t where k = 'o')),
  '42501', null, 'người bán không tự xóa được đơn của mình');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select throws_ok(format($$ select public.delete_order(%L, '  ') $$, (select v from t where k = 'o')),
  '22023', null, 'xóa đơn phải có lý do');
select is((select (sold, net) from public.sales_kpi_month(current_date)
           where user_id = '11111111-1111-4111-8111-000000000003'), (40000000::bigint, 40000000::bigint),
  'trước khi xóa: KPI tháng tính đơn này');
select lives_ok(format($$ select public.delete_order(%L, 'Đơn chạy thử') $$, (select v from t where k = 'o')),
  'Owner xóa được đơn');

-- Đơn biến mất khỏi mọi màn, kể cả với Owner.
select is((select count(*)::int from public.orders where id = (select v from t where k = 'o')), 0,
  'Owner không còn thấy đơn đã xóa');
select is((select count(*)::int from public.sales_credits where order_id = (select v from t where k = 'o')), 0,
  'dòng doanh số của đơn đã xóa không hiện');
select is((select (sold, net) from public.sales_kpi_month(current_date)
           where user_id = '11111111-1111-4111-8111-000000000003'), (0::bigint, 0::bigint),
  'KPI tháng không cộng đơn đã xóa');
select throws_ok(format($$ select public.delete_order(%L, 'Lần hai') $$, (select v from t where k = 'o')),
  'P0002', null, 'đơn đã xóa không xóa lại được');
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*)::int from public.payments where order_id = (select v from t where k = 'o')), 0,
  'người xác nhận tiền không còn thấy khoản của đơn đã xóa');
select is((select count(*)::int from public.warranties where order_id = (select v from t where k = 'o')), 0,
  'người quản lý bảo hành không còn thấy phiếu của đơn đã xóa');

-- Việc đi kèm được dọn; sổ doanh số vẫn giữ dòng cũ (chỉ thêm); nhật ký ghi lý do.
select pg_temp.as_service();
select is((select status from public.tasks where order_id = (select v from t where k = 'o')), 'cancelled',
  'việc đang mở của đơn bị hủy');
select is((select status from public.payments where id = (select v from t where k = 'p')), 'rejected',
  'khoản chưa xác nhận bị từ chối');
select is((select status from public.approvals where entity_id = (select v from t where k = 'p')), 'expired',
  'đề xuất đang chờ hết hạn');
select is((select status from public.warranties where order_id = (select v from t where k = 'o')), 'void',
  'phiếu bảo hành bị vô hiệu');
select is((select metadata ->> 'reason' from public.audit_logs
           where action = 'order.delete' and entity_id = (select v from t where k = 'o')::text), 'Đơn chạy thử',
  'nhật ký kiểm toán ghi lý do xóa');

select * from finish();
rollback;
