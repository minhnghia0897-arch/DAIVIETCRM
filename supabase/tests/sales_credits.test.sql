-- Kiểm thử doanh số từng sale và chỉ tiêu (supabase/migrations/20261015000100_sales_credits.sql).
-- Dữ liệu giả: Owner …0001, sale admin …0002, Thảo …0003 và An …0004 (telesale); khách …0001, …0003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

create function pg_temp.order(code text, seller uuid, subtotal bigint, discount bigint, fee bigint) returns uuid
language sql as $$
  insert into public.orders (showroom_id, code, buyer_contact_id, recipient_contact_id, ship_province, subtotal,
                             discount, delivery_fee, total, status, seller_id)
  values ('4a000000-0000-4000-8000-000000000004', code, '22222222-2222-4222-8222-000000000001',
          '22222222-2222-4222-8222-000000000001', 'Nghệ An', subtotal, discount, fee, subtotal - discount + fee,
          'confirmed', seller)
  returning id;
$$;

create temp table t (k text primary key, v uuid);
grant all on t to authenticated;
insert into t values
  ('thao', '11111111-1111-4111-8111-000000000003'),
  ('an', '11111111-1111-4111-8111-000000000004'),
  ('owner', '11111111-1111-4111-8111-000000000001'),
  ('admin', '11111111-1111-4111-8111-000000000002');

-- Đơn của Thảo: tiền hàng 50 triệu, giảm 2 triệu, phí giao 500 nghìn.
insert into t values ('o1', pg_temp.order('T-0001', '11111111-1111-4111-8111-000000000003', 50000000, 2000000, 500000));
select is((select count(*)::int from public.sales_credits where order_id = (select v from t where k = 'o1')), 0,
  'đơn chưa cọc thì chưa có doanh số');
update public.orders set status = 'deposit_paid' where id = (select v from t where k = 'o1');
select is((select amount from public.sales_credits where order_id = (select v from t where k = 'o1') and kind = 'sale'),
  48000000::bigint, 'cọc xong: doanh số = tiền hàng sau giảm, không tính phí giao');
select is((select seller_id from public.sales_credits where order_id = (select v from t where k = 'o1')),
  (select v from t where k = 'thao'), 'ghi cho người bán trên đơn');
select is((select month from public.sales_credits where order_id = (select v from t where k = 'o1')),
  date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date, 'tính vào tháng cọc (giờ VN)');
update public.orders set status = 'ready_to_ship' where id = (select v from t where k = 'o1');
update public.orders set status = 'completed' where id = (select v from t where k = 'o1');
select is((select count(*)::int from public.sales_credits where order_id = (select v from t where k = 'o1')), 1,
  'đi tiếp các bước sau không ghi thêm');

-- Đơn của An cọc rồi hủy: trừ vào tháng hủy. Đơn hủy khi chưa cọc thì không có dòng nào.
insert into t values ('o2', pg_temp.order('T-0002', '11111111-1111-4111-8111-000000000004', 30000000, 0, 0));
update public.orders set status = 'deposit_paid' where id = (select v from t where k = 'o2');
update public.orders set status = 'cancelled' where id = (select v from t where k = 'o2');
select is((select amount from public.sales_credits where order_id = (select v from t where k = 'o2') and kind = 'reversal'),
  -30000000::bigint, 'đơn đã tính bị hủy: ghi dòng âm đúng số đã tính');
select is((select reason from public.sales_credits where order_id = (select v from t where k = 'o2') and kind = 'reversal'),
  'Hủy đơn', 'ghi lý do trừ');
insert into t values ('o3', pg_temp.order('T-0003', '11111111-1111-4111-8111-000000000004', 20000000, 0, 0));
update public.orders set status = 'cancelled' where id = (select v from t where k = 'o3');
select is((select count(*)::int from public.sales_credits where order_id = (select v from t where k = 'o3')), 0,
  'hủy khi chưa cọc thì không có doanh số, không có dòng trừ');

-- Đơn đi thẳng Sẵn sàng giao (duyệt thu khi giao) vẫn được tính. Đơn của Owner để kiểm phạm vi xem.
insert into t values ('o4', pg_temp.order('T-0004', '11111111-1111-4111-8111-000000000001', 10000000, 0, 0));
update public.orders set status = 'ready_to_ship' where id = (select v from t where k = 'o4');
select is((select amount from public.sales_credits where order_id = (select v from t where k = 'o4')), 10000000::bigint,
  'được duyệt thu khi giao: tính doanh số');

select throws_ok($$ update public.sales_credits set amount = 1 $$, '42501', null,
  'sổ doanh số không sửa được, kể cả quyền cao');
select throws_ok($$ delete from public.sales_credits $$, '42501', null, 'sổ doanh số không xóa được');

-- Thảo: thấy doanh số của mình, không thấy của An.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.sales_credits where seller_id = (select v from t where k = 'thao')), 1,
  'telesale thấy doanh số của mình');
select is((select count(*)::int from public.sales_credits where seller_id = (select v from t where k = 'an')), 0,
  'telesale không thấy doanh số người khác');
select throws_ok(format($$ select public.set_sales_target(%L, current_date, 100000000) $$, (select v from t where k = 'thao')),
  '42501', null, 'telesale không đặt được chỉ tiêu');
select throws_ok($$ insert into public.sales_credits (showroom_id, order_id, kind, amount, month)
  values ('4a000000-0000-4000-8000-000000000004', gen_random_uuid(), 'sale', 1, current_date) $$, '42501', null,
  'không tự ghi doanh số được');

-- Owner đặt chỉ tiêu cho Thảo; KPI tháng so doanh số với chỉ tiêu.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select lives_ok(format($$ select public.set_sales_target(%L, current_date, 100000000) $$, (select v from t where k = 'thao')),
  'Owner đặt chỉ tiêu tháng');
select is((select target from public.sales_kpi_month(current_date) where user_id = (select v from t where k = 'thao')),
  100000000::bigint, 'KPI có chỉ tiêu');
select is((select net from public.sales_kpi_month(current_date) where user_id = (select v from t where k = 'thao')),
  48000000::bigint, 'KPI có doanh số tháng của Thảo');
select is((select net from public.sales_kpi_month(current_date) where user_id = (select v from t where k = 'an')),
  0::bigint, 'An: cọc rồi hủy trong tháng thì doanh số tháng về 0');
select ok(exists (select 1 from public.audit_logs where action = 'target.set'), 'đặt chỉ tiêu có nhật ký kiểm toán');

-- Sale admin (kpi.team) xem được telesale, không xem chỉ số của Owner.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select ok(exists (select 1 from public.sales_kpi_month(current_date) where user_id = (select v from t where k = 'thao')),
  'sale admin thấy doanh số telesale');
select ok(not exists (select 1 from public.sales_kpi_month(current_date) where user_id = (select v from t where k = 'owner')),
  'sale admin không thấy chỉ số của Owner');

select * from finish();
rollback;
