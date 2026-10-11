-- Kiểm thử lát 0 (supabase/migrations/20261007000600_lat0_work.sql): ghi kết quả cuộc gọi trong một giao dịch,
-- một luật cho Xong / Dời / Lỡ hẹn, ghi chú, người nhận, chặn sang demo khi thiếu 4 thông tin. Chạy: pnpm test:rls
-- Dựa trên dữ liệu giả trong supabase/seed.sql:
--   Thảo 11111111-1111-4111-8111-000000000003 giữ lead 1 (33333333-…0001), An …0004 giữ lead 2 (…0002).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.login(uid uuid, view_as uuid default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', case when view_as is null then '{}' else json_build_object('x-view-as', view_as)::text end, true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '{}', true);
end;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- Điều kiện đầu cố định, để chạy được cả trên database đã dùng thử (mọi thay đổi đều bị rollback).
update public.leads
set stage = 'new', first_contact_at = null, recipient_province = null, occasion_id = null, budget_range_id = null
where id = '33333333-3333-4333-8333-000000000001';
update public.tasks set status = 'cancelled'
where lead_id = '33333333-3333-4333-8333-000000000001' and status = 'open';

-- ---------------------------------------------------------------------------
-- Ghi kết quả cuộc gọi
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000003');

insert into ids select 'call1', public.log_call(
  '33333333-3333-4333-8333-000000000001', 'phone', 'callback', 'Khách hẹn tối gọi lại', now() + interval '3 hours');
select isnt((select v from ids where k = 'call1'), null, 'Thảo ghi được cuộc gọi cho lead của mình');

select pg_temp.logout();
select is(
  (select status || '/' || provider || '/' || channel from public.calls where id = (select v from ids where k = 'call1')),
  'answered/external/phone',
  'cuộc gọi ghi tay đánh dấu external, khác cuộc gọi tổng đài');
select ok(
  (select first_contact_at is not null and stage = 'contacted' from public.leads
   where id = '33333333-3333-4333-8333-000000000001'),
  'lần liên hệ đầu dừng SLA và lead sang Đã liên hệ');
select ok(exists (
    select 1 from public.events where type = 'call' and actor_id = '11111111-1111-4111-8111-000000000003'
      and payload ->> 'outcome' = 'callback' and payload ->> 'manual' = 'true'
  ), 'dòng hoạt động có cuộc gọi, ghi đúng người gọi');
select is(
  (select count(*) from public.tasks where lead_id = '33333333-3333-4333-8333-000000000001'
     and type = 'callback' and status = 'open' and due_at > now()),
  1::bigint, 'hẹn gọi lại thành một việc có hạn');

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok($$ select public.log_call('33333333-3333-4333-8333-000000000002', 'phone', 'no_answer') $$,
  '42501', null, 'Thảo không ghi được cuộc gọi cho lead của An');
-- Lead 3 ở hàng "Chưa phân" (assigned_to null). Trước bản vá, điều kiện quyền ra null và không chặn được.
select throws_ok($$ select public.log_call('33333333-3333-4333-8333-000000000003', 'phone', 'no_answer') $$,
  '42501', null, 'telesale không ghi được cuộc gọi vào lead chưa phân');
select throws_ok($$ select public.add_lead_note('33333333-3333-4333-8333-000000000003', 'thử') $$,
  '42501', null, 'telesale không ghi chú được vào lead chưa phân');
select throws_ok($$ select public.log_call('33333333-3333-4333-8333-000000000001', 'phone', 'khong_co') $$,
  '22023', null, 'kết quả không có trong danh mục bị từ chối');
select throws_ok($$ select public.log_call('33333333-3333-4333-8333-000000000001', 'phone', 'callback', null,
  now() - interval '1 hour') $$, '22023', null, 'hẹn gọi lại vào quá khứ bị từ chối');
select throws_ok($$ insert into public.calls (showroom_id, status) values ('4a000000-0000-4000-8000-000000000004', 'answered') $$,
  '42501', null, 'không ghi thẳng bảng calls được, phải qua log_call');

-- Gọi lần hai: việc hẹn đang mở được đóng.
select lives_ok($$ select public.log_call('33333333-3333-4333-8333-000000000001', 'zalo', 'zalo_interested') $$,
  'gọi qua Zalo cũng ghi được');
select pg_temp.logout();
select is(
  (select count(*) from public.tasks where lead_id = '33333333-3333-4333-8333-000000000001' and status = 'open'
     and type = 'callback'),
  0::bigint, 'cuộc gọi sau đóng việc hẹn gọi lại đang chờ');

-- An không thấy cuộc gọi trên lead của Thảo.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is((select count(*) from public.calls where lead_id = '33333333-3333-4333-8333-000000000001'), 0::bigint,
  'An không thấy cuộc gọi trên lead người khác');

-- ---------------------------------------------------------------------------
-- Việc: Xong / Dời / Lỡ hẹn
-- ---------------------------------------------------------------------------
select pg_temp.logout();
insert into public.tasks (id, showroom_id, type, title, lead_id, assigned_to, due_at) values
  ('55555555-5555-4555-8555-000000000011', '4a000000-0000-4000-8000-000000000004', 'callback', 'Việc thử 1',
   '33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000003', now() + interval '10 minutes'),
  ('55555555-5555-4555-8555-000000000012', '4a000000-0000-4000-8000-000000000004', 'callback', 'Việc thử 2',
   '33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000003', now() - interval '10 minutes'),
  ('55555555-5555-4555-8555-000000000013', '4a000000-0000-4000-8000-000000000004', 'callback', 'Việc của An',
   '33333333-3333-4333-8333-000000000002', '11111111-1111-4111-8111-000000000004', now());

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(public.task_action('55555555-5555-4555-8555-000000000011', 'snooze', 60), 'snoozed', 'Thảo dời việc 1 giờ');
select ok((select due_at > now() + interval '65 minutes' from public.tasks where id = '55555555-5555-4555-8555-000000000011'),
  'hạn mới tính từ hạn cũ cộng 60 phút');
select is(public.task_action('55555555-5555-4555-8555-000000000011', 'done', 60, 'Khách chốt lịch'), 'done',
  'Thảo đánh dấu xong kèm kết quả');
select is(public.task_action('55555555-5555-4555-8555-000000000011', 'done'), 'done',
  'bấm lại việc đã xong không đổi gì');
select is(public.task_action('55555555-5555-4555-8555-000000000012', 'miss'), 'missed', 'ghi lỡ hẹn');
select throws_ok($$ select public.task_action('55555555-5555-4555-8555-000000000013', 'done') $$,
  '42501', null, 'Thảo không xử lý được việc của An');

-- ---------------------------------------------------------------------------
-- Ghi chú, người nhận, chặn sang demo
-- ---------------------------------------------------------------------------
select ok(public.add_lead_note('33333333-3333-4333-8333-000000000001', 'Khách thích màu nâu') > 0,
  'ghi chú vào hồ sơ lead');
select throws_ok($$ select public.add_lead_note('33333333-3333-4333-8333-000000000001', '   ') $$,
  '22023', null, 'ghi chú rỗng bị từ chối');

-- Lead 1 đã có người nhận nhưng chưa có tỉnh, dịp, ngân sách.
select throws_ok($$ update public.leads set stage = 'demo' where id = '33333333-3333-4333-8333-000000000001' $$,
  '23514', null, 'chưa đủ 4 thông tin thì không sang Demo được');

update public.leads
set recipient_province = 'Nghệ An',
    occasion_id = (select id from public.occasions where key = 'longevity'),
    budget_range_id = (select id from public.budget_ranges order by sort limit 1)
where id = '33333333-3333-4333-8333-000000000001';
select lives_ok($$ update public.leads set stage = 'demo' where id = '33333333-3333-4333-8333-000000000001' $$,
  'đủ 4 thông tin thì sang Demo được');

select is(public.set_lead_recipient('33333333-3333-4333-8333-000000000001', true),
  '22222222-2222-4222-8222-000000000001'::uuid, 'mua cho chính mình thì người nhận là người đặt');

-- Đánh dấu thất bại: cần lý do, hủy việc đang mở kèm lý do; người không giữ lead không đánh được.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select throws_ok($$ select public.mark_lead_lost('33333333-3333-4333-8333-000000000001', 'price_high') $$,
  '42501', null, 'An không đánh thất bại được lead của Thảo');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select public.log_call('33333333-3333-4333-8333-000000000001', 'phone', 'callback', null, now() + interval '1 day');
select throws_ok($$ select public.mark_lead_lost('33333333-3333-4333-8333-000000000001', 'no_such_reason') $$,
  '22023', null, 'lý do lạ bị từ chối');
select lives_ok($$ select public.mark_lead_lost('33333333-3333-4333-8333-000000000001', 'price_high') $$,
  'Thảo đánh thất bại lead của mình');
select pg_temp.logout();
select is((select stage from public.leads where id = '33333333-3333-4333-8333-000000000001'), 'lost',
  'lead sang Thất bại');
select is((select count(*)::int from public.tasks
           where lead_id = '33333333-3333-4333-8333-000000000001' and status = 'open'), 0,
  'việc đang mở của lead bị hủy kèm lý do');

-- Đang "Xem như": chỉ đọc.
select pg_temp.logout();
insert into public.view_as_sessions (id, showroom_id, owner_id, target_id)
values ('99999999-9999-4999-8999-000000000021', '4a000000-0000-4000-8000-000000000004',
        '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000003');
select pg_temp.login('11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000021');
select throws_ok($$ select public.log_call('33333333-3333-4333-8333-000000000001', 'phone', 'no_answer') $$,
  '42501', null, 'đang Xem như thì không ghi cuộc gọi được');

select * from finish();
rollback;
