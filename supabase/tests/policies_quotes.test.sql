-- Kiểm thử chính sách, combo, báo giá và đơn đã định giá (supabase/migrations/20261011000600_policies_quotes.sql).
-- Dữ liệu giả: Owner …0001, sale admin …0002, Thảo …0003 giữ lead …0001 (khách …0001, người nhận …0002), An …0004.
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
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role;
insert into t select 'dc302', id::text from public.product_variants where sku = 'DC302';
with a as (
  insert into public.contact_addresses (showroom_id, contact_id, receiver, street, province, is_default)
  values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002', 'Bố', '12 Lê Lợi', 'Nghệ An', true)
  returning id)
insert into t select 'addr', id::text from a;

-- Dữ liệu định giá mẫu: một ghế 49tr, giảm 2tr, phí giao 500k.
create function pg_temp.priced(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'lead_id', '33333333-3333-4333-8333-000000000001',
    'address_id', (select v from t where k = 'addr'),
    'lines', jsonb_build_array(jsonb_build_object('variant_id', (select v from t where k = 'dc302'),
      'name', 'Ghế DC302', 'qty', 1, 'unit_price', 49000000, 'discount', 2000000, 'total', 47000000,
      'is_gift', false)),
    'subtotal', 49000000, 'discount', 2000000, 'delivery_fee', 500000, 'installation_fee', 0,
    'total', 47500000, 'deposit_min', 10000000, 'applied', '[]'::jsonb, 'approvals', '[]'::jsonb) || extra;
$$;

-- Quyền thực thi: người dùng đăng nhập không gọi trực tiếp được hàm ghi đã định giá.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok($$ select public.persist_priced_order('11111111-1111-4111-8111-000000000003', pg_temp.priced('{}')) $$,
  '42501', null, 'người dùng không gọi được persist_priced_order');
select throws_ok($$ select public.persist_quote('11111111-1111-4111-8111-000000000003', pg_temp.priced('{}')) $$,
  '42501', null, 'người dùng không gọi được persist_quote');

-- Combo, chính sách: chỉ người có quyền.
select throws_ok($$ select public.save_combo(jsonb_build_object('code', 'cb1', 'name', 'Combo', 'pricing_mode',
  'sum_minus', 'discount', 1000000, 'items', jsonb_build_array(jsonb_build_object('variant_id',
  (select v from t where k = 'dc302'), 'qty', 1)))) $$, '42501', null, 'telesale không tạo được combo');
select throws_ok($$ select public.save_policy(jsonb_build_object('type', 'deposit', 'name', 'Cọc', 'status', 'active',
  'valid_from', '2026-01-01', 'rules', '{"minAmount":1,"minPercent":0,"holdDays":7}'::jsonb)) $$,
  '42501', null, 'telesale không tạo được chính sách');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into t select 'combo', public.save_combo(jsonb_build_object('code', 'cb1', 'name', 'Ghế + gối', 'pricing_mode',
  'sum_minus', 'discount', 1000000, 'status', 'active', 'items', jsonb_build_array(
  jsonb_build_object('variant_id', (select v from t where k = 'dc302'), 'qty', 1))))::text;
select is((select code from public.combos where id = (select v from t where k = 'combo')::uuid), 'CB1',
  'Owner tạo combo, mã viết hoa');
select throws_ok($$ select public.save_combo(jsonb_build_object('code', 'CB1', 'name', 'Trùng', 'pricing_mode',
  'fixed_price', 'price', 1, 'items', jsonb_build_array(jsonb_build_object('variant_id',
  (select v from t where k = 'dc302'), 'qty', 1)))) $$, 'P0001', 'code_taken', 'mã combo không trùng');

insert into t select 'pol', public.save_policy(jsonb_build_object('type', 'deposit', 'name', 'Cọc 10tr',
  'status', 'draft', 'valid_from', '2026-01-01', 'rules', '{"minAmount":10000000,"minPercent":0,"holdDays":14}'::jsonb))::text;
insert into t select 'key', policy_key::text from public.policies where id = (select v from t where k = 'pol')::uuid;
select is(public.save_policy(jsonb_build_object('policy_key', (select v from t where k = 'key'), 'type', 'deposit',
  'name', 'Cọc 10tr (sửa)', 'status', 'draft', 'valid_from', '2026-01-01',
  'rules', '{"minAmount":10000000,"minPercent":0,"holdDays":10}'::jsonb))::text, (select v from t where k = 'pol'),
  'nháp sửa tại chỗ, không sinh phiên bản');
select lives_ok($$ select public.set_policy_status((select v from t where k = 'key')::uuid, 'active') $$, 'bật chính sách');
insert into t select 'pol2', public.save_policy(jsonb_build_object('policy_key', (select v from t where k = 'key'),
  'type', 'deposit', 'name', 'Cọc 12tr', 'status', 'active', 'valid_from', '2026-01-01',
  'rules', '{"minAmount":12000000,"minPercent":0,"holdDays":10}'::jsonb))::text;
select results_eq($$ select version, is_current from public.policies
  where policy_key = (select v from t where k = 'key')::uuid order by version $$,
  $$ values (1, false), (2, true) $$, 'sửa chính sách đang chạy tạo phiên bản 2, giữ phiên bản 1');
select is((select count(*)::int from public.audit_logs where action in ('policy.save', 'policy.status', 'combo.save')),
  5, 'thao tác chính sách, combo có audit log');

-- Ghi báo giá, đơn (service_role, người thao tác truyền vào).
select pg_temp.as_service();
select throws_ok($$ select public.persist_quote('11111111-1111-4111-8111-000000000003', pg_temp.priced('{}')) $$,
  'P0001', 'missing_required_info', 'lead thiếu bốn thông tin thì không báo giá');
reset role;
update public.leads set recipient_province = 'Nghệ An',
  occasion_id = (select id from public.occasions limit 1),
  budget_range_id = (select id from public.budget_ranges limit 1)
where id = '33333333-3333-4333-8333-000000000001';
select pg_temp.as_service();
select throws_ok($$ select public.persist_quote('11111111-1111-4111-8111-000000000004', pg_temp.priced('{}')) $$,
  'P0002', null, 'An không báo giá được lead của Thảo');
select throws_ok($$ select public.persist_quote('11111111-1111-4111-8111-000000000003',
  pg_temp.priced('{"total": 1}')) $$, '22023', null, 'tổng tiền không khớp dòng hàng thì bị từ chối');
select throws_ok($$ select public.persist_quote('11111111-1111-4111-8111-000000000003',
  pg_temp.priced('{"deposit_min": 99000000}')) $$, '22023', null, 'cọc tối thiểu không vượt tổng');

insert into t select 'q', public.persist_quote('11111111-1111-4111-8111-000000000003', pg_temp.priced('{}'))::text;
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'quoted',
  'gửi báo giá đầu tiên đưa lead sang Đã báo giá');
select ok((select length(token) = 36 and status = 'sent' and total = 47500000 from public.quotes
  where id = (select v from t where k = 'q')::uuid), 'báo giá có mã khó đoán, trạng thái đã gửi');
select lives_ok($$ select public.mark_quote_viewed((select token from public.quotes
  where id = (select v from t where k = 'q')::uuid)) $$, 'khách mở link');
select is((select status from public.quotes where id = (select v from t where k = 'q')::uuid), 'viewed',
  'lượt xem đầu tiên được ghi');

insert into t select 'o', public.persist_priced_order('11111111-1111-4111-8111-000000000003',
  pg_temp.priced(jsonb_build_object('quote_id', (select v from t where k = 'q'), 'by_customer', true)))::text;
select results_eq($$ select status, order_id::text from public.quotes where id = (select v from t where k = 'q')::uuid $$,
  $$ select 'accepted', (select v from t where k = 'o') $$, 'khách đồng ý: báo giá gắn đơn trong cùng giao dịch');
select throws_ok($$ select public.persist_priced_order('11111111-1111-4111-8111-000000000003',
  pg_temp.priced(jsonb_build_object('quote_id', (select v from t where k = 'q')))) $$, 'P0001', 'quote_closed',
  'đồng ý lần hai không sinh đơn thứ hai');

-- Giảm vượt giới hạn: đơn chờ duyệt (người thao tác không phải Owner), Owner thì tự xác nhận có ghi nhận.
insert into t select 'o2', public.persist_priced_order('11111111-1111-4111-8111-000000000003',
  pg_temp.priced('{"approvals": ["Giảm tay 7% vượt giới hạn 5%"]}'))::text;
select is((select status from public.orders where id = (select v from t where k = 'o2')::uuid), 'pending_approval',
  'telesale giảm vượt mức thì đơn chờ duyệt');
insert into t select 'o3', public.persist_priced_order('11111111-1111-4111-8111-000000000001',
  pg_temp.priced('{"approvals": ["Giảm tay 7% vượt giới hạn 5%"]}'))::text;
select ok((select status = 'confirmed' and (select (metadata ->> 'self_approved')::boolean from public.audit_logs
  where entity_id = (select v from t where k = 'o3') and action = 'order.create') from public.orders
  where id = (select v from t where k = 'o3')::uuid), 'Owner giảm vượt mức: xác nhận ngay, audit ghi tự duyệt');

select * from finish();
rollback;
