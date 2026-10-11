-- Kiểm thử lên đơn (supabase/migrations/20261011000400_sales_orders.sql).
-- Dữ liệu giả: Thảo …0003 (telesale) giữ lead …0001 (người đặt Thu …0001, người nhận Lực …0002); An …0004 giữ lead
-- …0002; Owner …0001; sale admin …0002. Giá bán lẻ: DC108 16.050.000, DC302 49.000.000.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
insert into t select 'dc108', id::text from public.product_variants where sku = 'DC108';
insert into t select 'dc302', id::text from public.product_variants where sku = 'DC302';
with a as (
  insert into public.contact_addresses (showroom_id, contact_id, receiver, street, province, is_default)
  values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002', 'Bố', '12 Lê Lợi', 'Nghệ An', true)
  returning id)
insert into t select 'addr', id::text from a;

create function pg_temp.lines(qty108 int, qty302 int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('variant_id', (select v from t where k = 'dc108'), 'qty', qty108),
    jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'qty', qty302));
$$;

-- Sản phẩm: ai có product.view thì thấy, bảng giá chỉ đọc.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.product_variants), 5, 'telesale thấy 5 SKU ghế');
select is(public.current_price((select v::uuid from t where k = 'dc302')), 49000000::bigint, 'giá bán lẻ DC302');
select throws_ok($$ update public.price_list_items set price = 1 $$, '42501', null, 'không sửa thẳng bảng giá');

-- Thiếu bốn thông tin bắt buộc thì không lên đơn.
select throws_ok(format($$ select public.create_order('33333333-3333-4333-8333-000000000001', %L::jsonb, %L) $$,
  pg_temp.lines(1, 0), (select v from t where k = 'addr')), 'P0001', 'missing_required_info',
  'lead thiếu thông tin bắt buộc thì không tạo đơn');

select set_config('role', 'postgres', true);
update public.leads set recipient_province = 'Nghệ An',
  occasion_id = (select id from public.occasions limit 1),
  budget_range_id = (select id from public.budget_ranges limit 1)
where id = '33333333-3333-4333-8333-000000000001';
select pg_temp.login('11111111-1111-4111-8111-000000000003');

-- Số lượng 0 bị từ chối; dòng phải là SKU đang bán.
select throws_ok(format($$ select public.create_order('33333333-3333-4333-8333-000000000001', %L::jsonb, %L) $$,
  pg_temp.lines(0, 1), (select v from t where k = 'addr')), '22023', null, 'số lượng phải từ 1');
select throws_ok(format($$ select public.create_order('33333333-3333-4333-8333-000000000001',
  '[{"variant_id":"00000000-0000-4000-8000-000000000000","qty":1}]', %L) $$, (select v from t where k = 'addr')),
  '22023', null, 'SKU lạ bị từ chối');
select throws_ok($$ select public.create_order('33333333-3333-4333-8333-000000000001',
  pg_temp.lines(1, 1), '00000000-0000-4000-8000-000000000000') $$, 'P0001', 'address_required',
  'cần địa chỉ giao của người đặt hoặc người nhận');

-- Đơn trong giới hạn giảm: tiền tính ở database, giảm phân bổ về từng dòng.
insert into t select 'o1', public.create_order('33333333-3333-4333-8333-000000000001', pg_temp.lines(1, 1),
  (select v::uuid from t where k = 'addr'), '{"type":"amount","value":1000000}', 500000, 300000, 'Giao trước Tết')::text;
select is((select subtotal from public.orders where id = (select v::uuid from t where k = 'o1')), 65050000::bigint,
  'tạm tính lấy giá bảng giá');
select is((select total from public.orders where id = (select v::uuid from t where k = 'o1')), 64850000::bigint,
  'tổng = tạm tính − giảm + phí giao + phí lắp');
select is((select sum(discount)::bigint from public.order_items where order_id = (select v::uuid from t where k = 'o1')),
  1000000::bigint, 'giảm phân bổ về dòng khớp đúng tổng giảm');
select is((select sum(line_total)::bigint from public.order_items where order_id = (select v::uuid from t where k = 'o1')),
  64050000::bigint, 'thành tiền các dòng = tạm tính − giảm');
select is((select status from public.orders where id = (select v::uuid from t where k = 'o1')), 'confirmed',
  'giảm 1,5% trong giới hạn thì xác nhận luôn');
select matches((select code from public.orders where id = (select v::uuid from t where k = 'o1')),
  '^Q4-[0-9]{4}-0001$', 'mã đơn theo showroom, năm tháng, số thứ tự');
select ok((select keep_surprise and is_gift and ship_province = 'Nghệ An' and seller_id = '11111111-1111-4111-8111-000000000003'
           from public.orders where id = (select v::uuid from t where k = 'o1')),
  'đơn kế thừa giữ bất ngờ, là quà, chụp địa chỉ, ghi người bán');
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'new',
  'tạo đơn không tự đổi giai đoạn lead');
select throws_ok($$ update public.orders set total = 1 $$, '42501', null, 'không sửa thẳng đơn');

-- Giảm vượt 5% thì chờ duyệt, Owner được báo.
insert into t select 'o2', public.create_order('33333333-3333-4333-8333-000000000001',
  jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc108'), 'qty', 1)),
  (select v::uuid from t where k = 'addr'), '{"type":"pct","value":7}')::text;
select is((select status from public.orders where id = (select v::uuid from t where k = 'o2')), 'pending_approval',
  'giảm 7% vượt giới hạn thì chờ duyệt');
select is((select discount from public.orders where id = (select v::uuid from t where k = 'o2')), 1123500::bigint,
  '7% của 16.050.000');
insert into t select 'ap', id::text from public.approvals where entity_id = (select v::uuid from t where k = 'o2');
select ok((select v from t where k = 'ap') is not null, 'người tạo thấy đề xuất của mình');
select is((select count(*)::int from public.approvals where id = (select v::uuid from t where k = 'ap')
             and status = 'pending'), 1, 'đề xuất đang chờ');
update public.approvals set status = 'approved' where id = (select v::uuid from t where k = 'ap');
select is((select status from public.approvals where id = (select v::uuid from t where k = 'ap')), 'pending',
  'telesale không tự duyệt được (RLS bỏ qua lệnh)');

-- An không thấy đơn của Thảo.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is((select count(*)::int from public.orders), 0, 'An không thấy đơn của Thảo');
select throws_ok($$ select public.create_order('33333333-3333-4333-8333-000000000001', '[]', null) $$, 'P0002', null,
  'An không lên đơn cho lead của Thảo');

-- Owner duyệt: đơn sang xác nhận, người tạo được báo.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select ok(exists (select 1 from public.notifications where type = 'discount_approval'), 'Owner được báo có đơn chờ duyệt');
update public.approvals set status = 'approved' where id = (select v::uuid from t where k = 'ap');
select is((select status from public.orders where id = (select v::uuid from t where k = 'o2')), 'confirmed',
  'Owner duyệt thì đơn xác nhận');
select set_config('role', 'postgres', true);
select ok(exists (select 1 from public.notifications where user_id = '11111111-1111-4111-8111-000000000003'
                    and type = 'approval_decided'), 'người tạo được báo kết quả duyệt');

select * from finish();
rollback;
