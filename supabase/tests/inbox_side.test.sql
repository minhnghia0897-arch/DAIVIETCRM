-- Kiểm thử cột phải Hội thoại (supabase/migrations/20261011000200_inbox_side.sql).
-- Dữ liệu giả: Thảo …0003 giữ lead của khách Thu …0001 (người nhận Lực …0002); An …0004 giữ lead của Lan …0003;
-- khách Phúc …0004 chưa phân; sale admin …0002 xem mọi lead.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

-- Sửa tên khách.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select lives_ok($$ select public.rename_contact('22222222-2222-4222-8222-000000000001', 'Chị Thu Daegu') $$,
  'telesale đổi tên khách của lead mình giữ');
select is((select full_name from public.contacts where id = '22222222-2222-4222-8222-000000000001'), 'Chị Thu Daegu',
  'tên mới đã lưu');
select throws_ok($$ select public.rename_contact('22222222-2222-4222-8222-000000000003', 'X') $$, 'P0002', null,
  'không đổi tên khách của người khác');
select throws_ok($$ select public.rename_contact('22222222-2222-4222-8222-000000000001', '  ') $$, '22023', null,
  'tên trống bị từ chối');

-- Lưu số điện thoại khách nhắn.
select is(public.add_contact_phone('22222222-2222-4222-8222-000000000001', '+84987654321', '0987 654 321',
  '098•••321'), 'added', 'thêm số mới cho khách');
select is(public.add_contact_phone('22222222-2222-4222-8222-000000000001', '+84987654321', '0987654321',
  '098•••321'), 'exists', 'gửi lại cùng số thì không thêm trùng');
select throws_ok($$ select public.add_contact_phone('22222222-2222-4222-8222-000000000001', '+84911234630',
  '0911234630', '091•••630') $$, 'P0001', 'phone_taken', 'số đang thuộc khách khác thì báo, không gộp');
select throws_ok($$ select public.add_contact_phone('22222222-2222-4222-8222-000000000001', '0987', '0987', 'x') $$,
  '22023', null, 'số sai định dạng bị từ chối');
select ok(exists (select 1 from public.consents where contact_id = '22222222-2222-4222-8222-000000000001'
                    and purpose = 'care' and channel = 'call' and source = 'Khách tự nhắn số trong hội thoại'),
  'ghi căn cứ đồng ý chăm sóc qua gọi');
select set_config('role', 'postgres', true);
select ok(not exists (select 1 from public.events where type = 'identity_added'
                        and payload::text like '%987654321%'),
  'dòng sự kiện không chứa số đầy đủ');
select pg_temp.login('11111111-1111-4111-8111-000000000003');

-- Địa chỉ giao.
insert into t select 'a1', public.save_contact_address(
  '{"contact_id":"22222222-2222-4222-8222-000000000002","receiver":"Bố","street":"12 Lê Lợi","district":"Diễn Châu","province":"Nghệ An"}')::text;
select ok((select is_default from public.contact_addresses where id = (select v::uuid from t where k = 'a1')),
  'địa chỉ đầu tiên là mặc định (người nhận của lead mình giữ)');
insert into t select 'a2', public.save_contact_address(
  '{"contact_id":"22222222-2222-4222-8222-000000000002","province":"TP.HCM","is_default":true}')::text;
select is((select count(*)::int from public.contact_addresses
           where contact_id = '22222222-2222-4222-8222-000000000002' and is_default), 1,
  'chỉ một địa chỉ mặc định');
select throws_ok($$ select public.save_contact_address('{"contact_id":"22222222-2222-4222-8222-000000000002","province":" "}') $$,
  '22023', null, 'địa chỉ cần tỉnh');
select throws_ok($$ insert into public.contact_addresses (showroom_id, contact_id, province)
                    values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002', 'X') $$,
  '42501', null, 'không ghi thẳng vào bảng địa chỉ');

-- Ghi chú ghim.
insert into t select 'n1', public.add_contact_note('22222222-2222-4222-8222-000000000001',
  'Khách muốn giao trước Tết, gọi sau 19h giờ Hàn', true)::text;
select ok((select pinned from public.contact_notes where id = (select v::uuid from t where k = 'n1')), 'ghi chú được ghim');
select ok(exists (select 1 from public.events where type = 'note' and lead_id = '33333333-3333-4333-8333-000000000001'
                    and payload ->> 'channel' = 'inbox'),
  'ghi chú vào dòng hoạt động của lead đang mở');

-- Telesale khác không thấy, không sửa được.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is((select count(*)::int from public.contact_notes where contact_id = '22222222-2222-4222-8222-000000000001'), 0,
  'An không thấy ghi chú khách của Thảo');
select is((select count(*)::int from public.contact_addresses where contact_id = '22222222-2222-4222-8222-000000000002'), 0,
  'An không thấy địa chỉ khách của Thảo');
select throws_ok(format($$ select public.set_contact_note_pinned(%L, false) $$, (select v from t where k = 'n1')),
  'P0002', null, 'An không bỏ ghim được');

-- Sale admin thấy và bỏ ghim được.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select lives_ok(format($$ select public.set_contact_note_pinned(%L, false) $$, (select v from t where k = 'n1')),
  'sale admin bỏ ghim');

select * from finish();
rollback;
