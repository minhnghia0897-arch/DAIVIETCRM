-- Kiểm thử luồng bán hàng không quản lý kho (supabase/migrations/20261018000100_simple_stock.sql): đơn từ cọc tới hoàn
-- tất không cần tồn kho, không giữ hàng, không phiếu xuất kho, không serial; thanh toán tách người ghi và người xác nhận;
-- bảo hành theo từng chiếc; việc hậu bán; hủy đơn; số lượng bán theo tháng.
-- Dữ liệu giả: Owner …0001, sale admin …0002, Thảo …0003 (telesale) giữ lead …0001 (khách Thu …0001), Lan …0005
-- (marketing, không có quyền xem số lượng bán).
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.units(col text) returns int language plpgsql as $$
declare
  v int;
begin
  execute format('select %I from public.sales_units_month(current_date) where sku = %L', col, 'DC302') into v;
  return coalesce(v, 0);
end;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'dc302', id::text from public.product_variants where sku = 'DC302';
with a as (
  insert into public.contact_addresses (showroom_id, contact_id, receiver, street, province, is_default)
  values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002', 'Bố', '12 Lê Lợi', 'Nghệ An', true)
  returning id)
insert into t select 'addr', id::text from a;
update public.leads set recipient_province = 'Nghệ An',
  occasion_id = (select id from public.occasions limit 1),
  budget_range_id = (select id from public.budget_ranges limit 1)
where id = '33333333-3333-4333-8333-000000000001';

-- Thảo lên đơn 2 ghế DC302 khi kho không có gì, ghi cọc.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
insert into t select 'o', public.create_order('33333333-3333-4333-8333-000000000001',
  jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'qty', 2)),
  (select v::uuid from t where k = 'addr'), null, 500000, 0, null, 'inbox', 'Chúc bố mạnh khỏe')::text;
select is((select deposit_min from public.orders where id = (select v::uuid from t where k = 'o')), 10000000::bigint,
  'cọc tối thiểu theo cài đặt: max(10 triệu, 10%)');
select is((select gift_message from public.orders where id = (select v::uuid from t where k = 'o')), 'Chúc bố mạnh khỏe',
  'lưu lời chúc');
select ok(cardinality(public.order_blockers((select v::uuid from t where k = 'o'))) > 0, 'chưa cọc thì chưa sang Đã cọc');
select ok(not exists (select 1 from unnest(public.order_blockers((select v::uuid from t where k = 'o'))) b
                      where b like '%hàng%'), 'không có điều kiện về tồn kho');
select throws_ok(format($$ select public.advance_order(%L) $$, (select v from t where k = 'o')), 'P0001', null,
  'chặn chuyển khi thiếu cọc');
insert into t select 'p1', public.record_payment((select v::uuid from t where k = 'o'), 'bank_transfer', 10000000,
  'Q4 coc')::text;
select is((select type from public.payments where id = (select v::uuid from t where k = 'p1')), 'deposit',
  'khoản đầu là cọc');
select throws_ok(format($$ select public.record_payment(%L, 'cash', 200000000, null) $$, (select v from t where k = 'o')),
  'P0001', 'invalid_amount', 'không ghi quá số còn phải thu');
update public.approvals set status = 'approved' where entity_id = (select v::uuid from t where k = 'p1');
select is((select status from public.payments where id = (select v::uuid from t where k = 'p1')), 'recorded',
  'người ghi không tự xác nhận được');

-- Sale admin xác nhận tiền.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
update public.approvals set status = 'approved' where entity_id = (select v::uuid from t where k = 'p1');
select is((select status from public.payments where id = (select v::uuid from t where k = 'p1')), 'confirmed',
  'người khác xác nhận được');
select is((select paid_amount from public.orders where id = (select v::uuid from t where k = 'o')), 10000000::bigint,
  'số đã thu của đơn cập nhật');

-- Thảo chuyển Đã cọc: kho trống vẫn được, không giữ hàng, lead sang deposit.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'deposit_paid', 'kho trống vẫn sang Đã cọc');
select is((select count(*)::int from public.stock_reservations where order_id = (select v::uuid from t where k = 'o')), 0,
  'không giữ hàng');
select is((select hold_until from public.orders where id = (select v::uuid from t where k = 'o')), null,
  'không có hạn giữ hàng');
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'deposit',
  'lead tự sang Đã cọc');
select ok(exists (select 1 from public.tasks where rule_key = 'confirm_delivery'), 'sinh việc xác nhận lịch giao');
select is(pg_temp.units('sold'), 2, 'số lượng bán: 2 ghế đã cọc trong tháng');
select is(pg_temp.units('pending'), 2, 'số lượng bán: 2 ghế đang chờ giao');
select throws_ok(format($$ select public.advance_order(%L) $$, (select v from t where k = 'o')), 'P0001', null,
  'chưa đủ tiền, chưa duyệt thu khi giao thì chưa sẵn sàng giao');
select throws_ok(format($$ select public.approve_cod(%L) $$, (select v from t where k = 'o')), '42501', null,
  'telesale không duyệt thu khi giao');

-- Sale admin duyệt thu khi giao rồi giao thẳng, không cần phiếu xuất kho hay serial.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select lives_ok(format($$ select public.approve_cod(%L) $$, (select v from t where k = 'o')),
  'sale admin duyệt thu khi giao');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'ready_to_ship', 'sang Sẵn sàng giao');
select is(cardinality(public.order_blockers((select v::uuid from t where k = 'o'))), 0,
  'sẵn sàng giao không chờ xuất kho');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'delivering', 'giao luôn, không cần serial');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'installed', 'đã lắp');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'completed', 'hoàn tất');
select is((select count(*)::int from public.warranties where order_id = (select v::uuid from t where k = 'o')), 2,
  'mỗi ghế một phiếu bảo hành');
select ok(not exists (select 1 from public.warranties where order_id = (select v::uuid from t where k = 'o')
                        and (serial is not null or serial_unit_id is not null)), 'phiếu bảo hành không ghi serial');
select ok(exists (select 1 from public.tasks where rule_key = 'post_delivery_call'
                    and order_id = (select v::uuid from t where k = 'o')), 'sinh việc gọi hỏi thăm sau giao');
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'won', 'lead sang Thành công');
select is((select lifecycle_stage from public.contacts where id = '22222222-2222-4222-8222-000000000001'), 'active_owner',
  'khách sang Đang sử dụng');
select is(pg_temp.units('delivered'), 2, 'số lượng bán: 2 ghế đã giao xong trong tháng');
select is(pg_temp.units('pending'), 0, 'giao xong thì hết chờ giao');

-- Đơn thứ hai đã cọc rồi hủy: tính vào số bán của tháng và cột hủy, trả.
select set_config('role', 'postgres', true);
update public.leads set stage = 'contacted' where id = '33333333-3333-4333-8333-000000000001';
select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into t select 'o2', public.create_order('33333333-3333-4333-8333-000000000001',
  jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'qty', 1)),
  (select v::uuid from t where k = 'addr'))::text;
select set_config('role', 'postgres', true);
insert into public.payments (showroom_id, order_id, type, method, amount, status)
values ('4a000000-0000-4000-8000-000000000004', (select v::uuid from t where k = 'o2'), 'deposit', 'cash', 10000000, 'confirmed');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select is(public.advance_order((select v::uuid from t where k = 'o2')), 'deposit_paid', 'đơn 2 đã cọc');
select lives_ok(format($$ select public.cancel_order(%L, 'Khách đổi ý') $$, (select v from t where k = 'o2')), 'hủy đơn');
select is(pg_temp.units('sold'), 3, 'số đã cọc trong tháng gồm cả đơn sau đó bị hủy');
select is(pg_temp.units('returned'), 1, 'đơn đã cọc bị hủy hiện ở cột hủy, trả');

-- Marketing không có quyền xem số lượng bán.
select pg_temp.login('11111111-1111-4111-8111-000000000005');
select is((select count(*)::int from public.sales_units_month(current_date)), 0,
  'người không có quyền không thấy số lượng bán');

select * from finish();
rollback;
