-- Kiểm thử luồng bán hàng (supabase/migrations/20261011000500_sales_flow.sql): kho, đơn từ cọc tới hoàn tất,
-- thanh toán tách người ghi và người xác nhận, xuất kho gán serial, bảo hành, việc hậu bán, hủy đơn nhả hàng,
-- kiểm kê chờ duyệt, hết hạn giữ hàng.
-- Dữ liệu giả: Owner …0001, sale admin …0002, Thảo …0003 (telesale) giữ lead …0001 (khách Thu …0001).
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'dc302', id::text from public.product_variants where sku = 'DC302';
insert into t select 'q4', id::text from public.warehouses where code = 'Q4';
insert into t select 'tb', id::text from public.warehouses where code = 'TB';
with a as (
  insert into public.contact_addresses (showroom_id, contact_id, receiver, street, province, is_default)
  values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002', 'Bố', '12 Lê Lợi', 'Nghệ An', true)
  returning id)
insert into t select 'addr', id::text from a;
update public.leads set recipient_province = 'Nghệ An',
  occasion_id = (select id from public.occasions limit 1),
  budget_range_id = (select id from public.budget_ranges limit 1)
where id = '33333333-3333-4333-8333-000000000001';

-- Kho: sale admin nhập 2 ghế DC302 kèm serial.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
insert into t select 'pn', public.save_stock_document(jsonb_build_object(
  'kind', 'receipt', 'warehouse_id', (select v from t where k = 'q4'), 'reason', 'Đại Việt giao',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'qty', 2,
                                                'serials', jsonb_build_array('DC302-A1', 'DC302-A2')))))::text;
select is((select count(*)::int from public.stock_movements), 0, 'phiếu nháp chưa sinh sổ kho');
select is(public.post_stock_document((select v::uuid from t where k = 'pn')), 'posted', 'ghi sổ phiếu nhập');
select is((select on_hand from public.stock_levels where variant_id = (select v::uuid from t where k = 'dc302')
             and warehouse_id = (select v::uuid from t where k = 'q4')), 2, 'tồn tăng đúng số nhập');
select is((select count(*)::int from public.serial_units where status = 'in_stock'), 2, 'serial vào kho');
select throws_ok($$ update public.stock_levels set on_hand = 99 $$, '42501', null, 'không sửa thẳng số tồn');
select set_config('role', 'postgres', true);
select throws_ok($$ delete from public.stock_movements $$, '42501', null, 'sổ kho không xóa được, kể cả quyền cao');

-- Thảo lên đơn, ghi cọc.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok(format($$ select public.post_stock_document(%L) $$, (select v from t where k = 'pn')), '42501', null,
  'telesale không ghi sổ kho');
insert into t select 'o', public.create_order('33333333-3333-4333-8333-000000000001',
  jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'qty', 1)),
  (select v::uuid from t where k = 'addr'), null, 500000, 0, null, 'inbox', 'Chúc bố mạnh khỏe')::text;
select is((select deposit_min from public.orders where id = (select v::uuid from t where k = 'o')), 10000000::bigint,
  'cọc tối thiểu theo cài đặt: max(10 triệu, 10%)');
select is((select gift_message from public.orders where id = (select v::uuid from t where k = 'o')), 'Chúc bố mạnh khỏe',
  'lưu lời chúc');
select ok(cardinality(public.order_blockers((select v::uuid from t where k = 'o'))) > 0, 'chưa cọc thì chưa sang Đã cọc');
select throws_ok(format($$ select public.advance_order(%L) $$, (select v from t where k = 'o')), 'P0001', null,
  'chặn chuyển khi thiếu cọc');
insert into t select 'p1', public.record_payment((select v::uuid from t where k = 'o'), 'bank_transfer', 10000000,
  'Q4 coc')::text;
select is((select type from public.payments where id = (select v::uuid from t where k = 'p1')), 'deposit',
  'khoản đầu là cọc');
select throws_ok(format($$ select public.record_payment(%L, 'cash', 60000000, null) $$, (select v from t where k = 'o')),
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

-- Thảo chuyển Đã cọc: giữ hàng, lead sang deposit.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'deposit_paid', 'đủ cọc thì sang Đã cọc');
select is((select reserved from public.stock_levels where variant_id = (select v::uuid from t where k = 'dc302')
             and warehouse_id = (select v::uuid from t where k = 'q4')), 1, 'giữ 1 ghế');
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'deposit',
  'lead tự sang Đã cọc');
select ok(exists (select 1 from public.tasks where rule_key = 'confirm_delivery'), 'sinh việc xác nhận lịch giao');
select throws_ok(format($$ select public.advance_order(%L) $$, (select v from t where k = 'o')), 'P0001', null,
  'chưa đủ tiền, chưa duyệt thu khi giao thì chưa sẵn sàng giao');
select throws_ok(format($$ select public.approve_cod(%L) $$, (select v from t where k = 'o')), '42501', null,
  'telesale không duyệt thu khi giao');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select lives_ok(format($$ select public.approve_cod(%L) $$, (select v from t where k = 'o')),
  'sale admin duyệt thu khi giao');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'ready_to_ship', 'sang Sẵn sàng giao');
select throws_ok(format($$ select public.advance_order(%L) $$, (select v from t where k = 'o')), 'P0001', null,
  'chưa xuất kho thì chưa giao');
select throws_ok(format($$ select public.issue_order_stock(%L, '{}') $$, (select v from t where k = 'o')), 'P0001',
  'serials_required', 'xuất kho bắt buộc gán serial');
select lives_ok(format($$ select public.issue_order_stock(%L, jsonb_build_object(%L, jsonb_build_array('DC302-A1'))) $$,
  (select v from t where k = 'o'),
  (select id::text from public.order_items where order_id = (select v::uuid from t where k = 'o'))),
  'xuất kho với serial đã nhập');
select ok((select on_hand = 1 and reserved = 0 from public.stock_levels
           where variant_id = (select v::uuid from t where k = 'dc302') and warehouse_id = (select v::uuid from t where k = 'q4')),
  'xuất kho trừ tồn, nhả giữ hàng');
select is((select status from public.serial_units where serial = 'DC302-A1'), 'sold', 'serial đã bán');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'delivering', 'đang giao');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'installed', 'đã lắp');
select is(public.advance_order((select v::uuid from t where k = 'o')), 'completed', 'hoàn tất');
select is((select serial from public.warranties where order_id = (select v::uuid from t where k = 'o')), 'DC302-A1',
  'hoàn tất sinh phiếu bảo hành theo serial');
select ok(exists (select 1 from public.tasks where rule_key = 'post_delivery_call'
                    and order_id = (select v::uuid from t where k = 'o')), 'sinh việc gọi hỏi thăm sau giao');
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'won', 'lead sang Thành công');
select is((select lifecycle_stage from public.contacts where id = '22222222-2222-4222-8222-000000000001'), 'active_owner',
  'khách sang Đang sử dụng');

-- Hủy đơn đang giữ hàng thì nhả đúng số lượng.
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
select is((select reserved from public.stock_levels where variant_id = (select v::uuid from t where k = 'dc302')
             and warehouse_id = (select v::uuid from t where k = 'q4')), 0, 'hủy đơn nhả giữ hàng');

-- Kiểm kê lệch thì chờ Owner duyệt.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
insert into t select 'kk', public.save_stock_document(jsonb_build_object('kind', 'count',
  'warehouse_id', (select v from t where k = 'q4'), 'reason', 'Kiểm cuối tháng',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'counted', 0))))::text;
select is(public.post_stock_document((select v::uuid from t where k = 'kk')), 'pending_approval', 'kiểm kê lệch chờ duyệt');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
update public.approvals set status = 'approved' where entity_id = (select v::uuid from t where k = 'kk');
select is((select on_hand from public.stock_levels where variant_id = (select v::uuid from t where k = 'dc302')
             and warehouse_id = (select v::uuid from t where k = 'q4')), 0, 'Owner duyệt thì ghi sổ điều chỉnh');

select * from finish();
rollback;
