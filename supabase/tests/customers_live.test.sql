-- Kiểm thử màn Khách thật (supabase/migrations/20261012000400_customers_live.sql): vòng đời tính tự động từ đơn, lead,
-- việc bảo hành, đồng ý, thời gian không tương tác; quyền xem khách theo đơn mình bán; đồng ý và thông tin khách chỉ
-- người sửa được khách mới đổi.
-- Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003 (giữ lead của Thu), An …0004 (giữ lead của Lan).
-- Khách: Thu …01 (KR), Lực …02 (người nhận lead của Thu), Lan …03, Phúc …04 (lead chưa giao).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Đơn giả (bỏ qua luồng tạo đơn): người đặt, người nhận, trạng thái, người bán; một dòng ghế DC108.
create function pg_temp.order_for(code text, buyer uuid, recipient uuid, st text, seller uuid default null)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.orders (showroom_id, code, buyer_contact_id, recipient_contact_id, ship_province, subtotal, total,
                             paid_amount, status, seller_id)
  values ('4a000000-0000-4000-8000-000000000004', code, buyer, recipient, 'TP.HCM', 45000000, 45000000,
          case when st = 'completed' then 45000000 else 10000000 end, st, seller)
  returning id into v_id;
  insert into public.order_items (showroom_id, order_id, variant_id, sku, name, qty, unit_price, line_total)
  select '4a000000-0000-4000-8000-000000000004', v_id, id, sku, 'Ghế massage DC108', 1, 45000000, 45000000
  from public.product_variants where sku = 'DC108';
  perform public.sync_lifecycle_from_order(v_id, null);
  return v_id;
end;
$$;

create function pg_temp.stage(c uuid) returns text language sql as $$
  select lifecycle_stage from public.contacts where id = c;
$$;

-- Lần đầu chạy migration: khách có lead là Lead.
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'lead', 'khách có lead là Lead');
select is((select stage from public.customer_lifecycle where contact_id = '22222222-2222-4222-8222-000000000003'), 'lead',
  'bảng vòng đời có dòng của khách');
select is((select owner_id::text from public.customer_lifecycle where contact_id = '22222222-2222-4222-8222-000000000003'),
  '11111111-1111-4111-8111-000000000004', 'phụ trách là người giữ lead đang mở');

-- Người nhận của lead cũng là Lead, phụ trách là người giữ lead; giao lead cho người khác thì người phụ trách đổi theo.
select is(pg_temp.stage('22222222-2222-4222-8222-000000000002'), 'lead', 'người nhận của lead là Lead');
update public.leads set assigned_to = '11111111-1111-4111-8111-000000000004'
where id = '33333333-3333-4333-8333-000000000001';
select is((select owner_id::text from public.customer_lifecycle where contact_id = '22222222-2222-4222-8222-000000000002'),
  '11111111-1111-4111-8111-000000000004', 'giao lead: người nhận đổi người phụ trách');
update public.leads set assigned_to = '11111111-1111-4111-8111-000000000003'
where id = '33333333-3333-4333-8333-000000000001';
select is((select owner_id::text from public.customer_lifecycle where contact_id = '22222222-2222-4222-8222-000000000001'),
  '11111111-1111-4111-8111-000000000003', 'giao lại: người đặt về người giữ cũ');

-- Đơn đã cọc: Khách mới. Hoàn tất: Đang sử dụng, có sản phẩm đang dùng. Đơn hoàn tất thứ hai: Khách thân.
select pg_temp.order_for('T-1', '22222222-2222-4222-8222-000000000004', null, 'deposit_paid');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000004'), 'new_customer', 'đơn đã cọc: Khách mới');
select pg_temp.order_for('T-2', '22222222-2222-4222-8222-000000000003', null, 'completed',
                         '11111111-1111-4111-8111-000000000003');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'active_owner', 'đơn hoàn tất: Đang sử dụng');
select ok((select owned_products @> '[{"name": "Ghế massage DC108"}]'::jsonb from public.customer_lifecycle
           where contact_id = '22222222-2222-4222-8222-000000000003'), 'sản phẩm đang dùng lấy từ đơn hoàn tất');
select pg_temp.order_for('T-3', '22222222-2222-4222-8222-000000000003', null, 'completed');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'loyal', 'mua lại đơn thứ hai: Khách thân');

-- Quà tặng: người nhận của đơn hoàn tất cũng Đang sử dụng; hộ có hai đơn hoàn tất thì thành viên có đơn là Khách thân.
insert into public.households (id, showroom_id, display_name)
values ('55555555-5555-4555-8555-000000000001', '4a000000-0000-4000-8000-000000000004', 'Nhà ông Lực');
update public.contacts set household_id = '55555555-5555-4555-8555-000000000001'
where id in ('22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-000000000002');
select pg_temp.order_for('T-4', '22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-000000000002',
                         'completed');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000002'), 'active_owner', 'người nhận quà: Đang sử dụng');
select pg_temp.order_for('T-5', '22222222-2222-4222-8222-000000000002', null, 'completed');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000001'), 'loyal', 'hộ có hai đơn hoàn tất: Khách thân');

-- Đơn đang đổi trả hoặc việc bảo hành đang mở: Có rủi ro.
select pg_temp.order_for('T-6', '22222222-2222-4222-8222-000000000003', null, 'return_requested');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'at_risk', 'đơn đang đổi trả: Có rủi ro');
update public.orders set status = 'returned' where code = 'T-6';
select public.sync_lifecycle_from_order((select id from public.orders where code = 'T-6'), null);
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'loyal', 'đổi trả xong: về giai đoạn cũ');
insert into public.tasks (showroom_id, type, title, contact_id, due_at)
values ('4a000000-0000-4000-8000-000000000004', 'warranty_followup', 'Theo dõi bảo hành',
        '22222222-2222-4222-8222-000000000004', now());
select is(pg_temp.stage('22222222-2222-4222-8222-000000000004'), 'at_risk', 'việc bảo hành đang mở: Có rủi ro');

-- Ngủ đông: không tương tác quá số ngày trong Cài đặt, Bán hàng.
update public.sales_settings set dormant_days = 30 where showroom_id = '4a000000-0000-4000-8000-000000000004';
insert into public.contacts (id, showroom_id, full_name, created_at)
values ('22222222-2222-4222-8222-000000000009', '4a000000-0000-4000-8000-000000000004', 'Khách cũ', now() - interval '100 days');
insert into public.leads (showroom_id, contact_id, source)
values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000009', 'import');
select public.refresh_customer_lifecycle('22222222-2222-4222-8222-000000000009');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000009'), 'dormant', 'quá 30 ngày không tương tác: Ngủ đông');
select public.record_event('note', '4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000009',
  null, '{}'::jsonb, 'user');
select is(pg_temp.stage('22222222-2222-4222-8222-000000000009'), 'lead', 'có tương tác mới thì tính lại ngay');

-- Bán đơn thì xem được khách của đơn; telesale khác thì không. Danh sách khách theo đúng quyền xem.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.contacts where id = '22222222-2222-4222-8222-000000000003'), 1,
  'người bán đơn xem được khách của đơn');
select is((select count(*)::int from public.customer_list where id = '22222222-2222-4222-8222-000000000003'), 1,
  'danh sách khách có khách của đơn mình bán');
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is((select count(*)::int from public.customer_list where id = '22222222-2222-4222-8222-000000000004'), 0,
  'telesale không giữ lead, không bán đơn thì không thấy khách');
select is((select owner_name from public.customer_list where id = '22222222-2222-4222-8222-000000000003'), 'An',
  'danh sách có tên người phụ trách');

-- Đồng ý: người không sửa được khách thì không đổi; Ngừng liên hệ chặn mọi liên hệ.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select throws_ok($$ select public.set_consent('22222222-2222-4222-8222-000000000001', 'care', 'all', false) $$,
  'P0002', null, 'telesale không thấy khách thì không đổi đồng ý');
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select public.set_consent('22222222-2222-4222-8222-000000000003', 'care', 'all', false, 'Khách gọi lên yêu cầu');
select pg_temp.logout();
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'do_not_contact', 'khách yêu cầu: Ngừng liên hệ');
select ok(public.contact_blocked('22222222-2222-4222-8222-000000000003', 'care', 'zalo_oa'),
  'Ngừng liên hệ chặn nhắn tin chăm sóc');
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select public.set_consent('22222222-2222-4222-8222-000000000003', 'care', 'all', true, 'Khách đồng ý lại');
select pg_temp.logout();
select is(pg_temp.stage('22222222-2222-4222-8222-000000000003'), 'loyal', 'khách đồng ý lại: về giai đoạn cũ');

-- Thông tin khách: thị trường phải có trong danh sách thị trường.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select throws_ok($$ select public.update_contact_profile('22222222-2222-4222-8222-000000000003', 'XX', null, null) $$,
  '22023', null, 'thị trường lạ bị từ chối');
select public.update_contact_profile('22222222-2222-4222-8222-000000000003', 'KR', 'Daegu', 'Con gái');
select ok((select country_of_residence = 'KR' and relation_in_household = 'Con gái' from public.contacts
           where id = '22222222-2222-4222-8222-000000000003'), 'sửa thị trường, quan hệ trong hộ');

-- Mở lead mới cho khách cũ (tái bán): khách đang có lead mở thì dùng lead đó; khách không có lead thì mở lead mới;
-- người không xem được khách, khách ngừng liên hệ thì không mở.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is((public.open_customer_lead('22222222-2222-4222-8222-000000000003') ->> 'action'), 'exists',
  'khách đang có lead mở: dùng lead đó');
select throws_ok($$ select public.open_customer_lead('22222222-2222-4222-8222-000000000001') $$,
  'P0002', null, 'không xem được khách thì không mở lead');
select pg_temp.logout();
insert into public.contacts (id, showroom_id, full_name)
values ('22222222-2222-4222-8222-00000000000a', '4a000000-0000-4000-8000-000000000004', 'Khách đã mua lâu');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select is((public.open_customer_lead('22222222-2222-4222-8222-00000000000a', 'Mua thêm máy lọc') ->> 'action'),
  'created', 'khách chưa có lead mở: mở lead mới');
select pg_temp.logout();
select ok((select source = 'manual' and source_detail ->> 'origin' = 'customer_profile' from public.leads
           where contact_id = '22222222-2222-4222-8222-00000000000a'), 'lead mới ghi nguồn từ hồ sơ khách');
select is(pg_temp.stage('22222222-2222-4222-8222-00000000000a'), 'lead', 'mở lead xong: khách là Lead');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select public.set_consent('22222222-2222-4222-8222-00000000000a', 'care', 'all', false, 'Khách yêu cầu');
select throws_ok($$ select public.open_customer_lead('22222222-2222-4222-8222-00000000000a') $$,
  '22023', null, 'khách ngừng liên hệ thì không mở lead');

-- Trích xuất dữ liệu một khách: cần quyền xuất file, có số đầy đủ khi xem được mọi số, ghi nhật ký kiểm toán.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select throws_ok($$ select public.export_contact_data('22222222-2222-4222-8222-000000000003') $$,
  '42501', null, 'không có quyền xuất file thì không trích xuất');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select ok((select (d -> 'dinh_danh' -> 0 ->> 'gia_tri') like '+%' and d -> 'khach' ->> 'ho_ten' is not null
           from (select public.export_contact_data('22222222-2222-4222-8222-000000000003') as d) x),
  'Owner trích xuất có số đầy đủ');
select pg_temp.logout();
select ok(exists (select 1 from public.audit_logs where action = 'contact.export'
                  and entity_id = '22222222-2222-4222-8222-000000000003'), 'lượt trích xuất ghi nhật ký');

select * from finish();
rollback;
