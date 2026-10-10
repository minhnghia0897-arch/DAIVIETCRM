-- Kiểm thử Telegram (supabase/migrations/20261007000100_telegram.sql): mã liên kết một lần, mỗi người chỉ thấy liên kết
-- của mình, bot làm thay người dùng đúng quyền như trên CRM, khóa người dùng thì thu hồi liên kết, gán nhóm cần quyền.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create function pg_temp.login(uid uuid, view_as uuid default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', case when view_as is null then '{}' else json_build_object('x-view-as', view_as)::text end, true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create temp table codes (who text, code text);
grant all on codes to authenticated, service_role;

-- Thảo (telesale) và Hà (Owner) lấy mã liên kết.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
insert into codes select 'thao', public.create_telegram_link_code();
select ok((select code ~ '^[0-9a-f]{32}$' from codes where who = 'thao'), 'mã liên kết là chuỗi ngẫu nhiên 32 ký tự');
select is((select count(*) from public.telegram_link_codes), 0::bigint, 'người dùng không đọc được bảng mã');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into codes select 'ha', public.create_telegram_link_code();

select pg_temp.as_service();
select ok(not exists (select 1 from public.telegram_link_codes c join codes on c.code_hash = codes.code),
  'bảng chỉ giữ bản băm, không giữ mã gốc');
select is(public.redeem_telegram_link_code((select code from codes where who = 'thao'), 1001, 1001, 'thao_tg'),
  '11111111-1111-4111-8111-000000000003'::uuid, 'bot đổi mã lấy liên kết cho Thảo');
select is(public.redeem_telegram_link_code((select code from codes where who = 'thao'), 9999, 9999, null),
  null, 'mã đã dùng không dùng lại được');
select is(public.redeem_telegram_link_code('sai-ma', 9999, 9999, null), null, 'mã sai không liên kết');
select is(public.redeem_telegram_link_code((select code from codes where who = 'ha'), 1002, 1002, 'ha_tg'),
  '11111111-1111-4111-8111-000000000001'::uuid, 'bot đổi mã lấy liên kết cho Hà');

-- Mỗi người chỉ thấy liên kết của mình (Owner thấy tất cả).
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is((select count(*) from public.telegram_links), 0::bigint, 'An không thấy liên kết của người khác');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*) from public.telegram_links), 1::bigint, 'Thảo thấy liên kết của mình');
select throws_ok($$ select public.telegram_add_note(1001, '33333333-3333-4333-8333-000000000001', 'x') $$,
  '42501', null, 'người dùng không tự gọi hàm của bot');

-- Bot ghi chú thay Thảo: được trên lead của Thảo, bị chặn trên lead của An.
select pg_temp.as_service();
select lives_ok(
  $$ select public.telegram_add_note(1001, '33333333-3333-4333-8333-000000000001', 'Khách hẹn 21h gọi lại') $$,
  'Thảo ghi chú qua Telegram vào lead của mình');
select ok(exists (
    select 1 from public.events
    where type = 'note' and lead_id = '33333333-3333-4333-8333-000000000001'
      and actor_id = '11111111-1111-4111-8111-000000000003' and payload ->> 'channel' = 'telegram'
  ), 'ghi chú nằm trên dòng sự kiện, đúng người làm, nguồn Telegram');
select pg_temp.as_service();
select throws_ok(
  $$ select public.telegram_add_note(1001, '33333333-3333-4333-8333-000000000002', 'x') $$,
  '42501', null, 'Thảo không ghi chú được vào lead của An');
select pg_temp.as_service();
select throws_ok(
  $$ select public.telegram_add_note(5555, '33333333-3333-4333-8333-000000000001', 'x') $$,
  '42501', null, 'tài khoản Telegram chưa liên kết bị từ chối');

-- Nút Xong dưới tin việc.
select pg_temp.as_service();
insert into public.tasks (id, showroom_id, type, title, lead_id, assigned_to, due_at)
values ('55555555-5555-4555-8555-000000000001', '4a000000-0000-4000-8000-000000000004', 'callback',
        'Gọi lại khách', '33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000003', now());
select is(public.telegram_task_action(1001, '55555555-5555-4555-8555-000000000001', 'done'), 'done',
  'Thảo bấm Xong từ Telegram');
select ok(exists (
    select 1 from public.events where type = 'task_done' and actor_id = '11111111-1111-4111-8111-000000000003'
  ), 'việc xong ghi đúng người làm');

-- Gán nhóm: telesale bị từ chối, Owner được.
select pg_temp.as_service();
select throws_ok($$ select public.telegram_assign_group(1001, -100123, 'Nhóm chung', 'general') $$,
  '42501', null, 'telesale không gán được nhóm');
select pg_temp.as_service();
select is(public.telegram_assign_group(1002, -100123, 'Nhóm chung', 'general'), 'general', 'Owner gán nhóm chung');

-- Quản lý nhóm từ màn CRM (migration 20261007000300): ai cũng đọc được danh sách nhóm của đội, chỉ
-- settings.integrations đổi được công dụng, và không đổi được khi đang "Xem như".
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select ok(exists (select 1 from public.telegram_groups where chat_id = -100123),
  'telesale xem được nhóm của đội');
select throws_ok($$ select public.set_telegram_group(-100123, 'care') $$,
  '42501', null, 'telesale không đổi được công dụng nhóm');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
select is(public.set_telegram_group(-100123, 'care'), 'active', 'Owner đổi công dụng nhóm từ CRM');
select is(public.set_telegram_group(-100123, 'unused'), 'inactive', 'bỏ công dụng thì nhóm thành Ngưng');
select throws_ok($$ select public.set_telegram_group(-999999, 'care') $$,
  'P0002', null, 'nhóm không có trong CRM thì báo lỗi');

-- Owner mở phiên "Xem như": phiên đó chỉ đọc, không đổi được nhóm.
insert into public.view_as_sessions (id, showroom_id, owner_id, target_id)
values ('99999999-9999-4999-8999-000000000009', '4a000000-0000-4000-8000-000000000004',
        '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000002');
select pg_temp.login('11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000009');
select throws_ok($$ select public.set_telegram_group(-100123, 'care') $$,
  '42501', null, 'đang Xem như người khác thì không đổi được nhóm');

-- Khóa Thảo: liên kết bị thu hồi ngay.
select pg_temp.as_service();
update public.profiles set is_active = false where id = '11111111-1111-4111-8111-000000000003';
select is(public.telegram_user(1001), null, 'khóa người dùng thì Telegram của họ không còn làm được gì');

select * from finish();
rollback;
