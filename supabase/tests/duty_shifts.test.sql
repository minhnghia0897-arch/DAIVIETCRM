-- Kiểm thử ca trực, công tắc Trực và ngày nghỉ (supabase/migrations/20261007000900_duty_shifts.sql). Chạy: pnpm test:rls
-- Dữ liệu giả (supabase/seed.sql): Hà Owner …0001, sale admin …0002, telesale Thảo …0003 và An …0004 (đang bật Trực).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

create function pg_temp.lead(name text, phone text, route boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('full_name', name, 'country', 'unknown', 'source', 'walk_in', 'source_key', 'walk_in',
    'route', route,
    'phone', jsonb_build_object('raw', phone, 'e164', phone, 'masked', '090•••000', 'valid', true));
$$;

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;

-- Mọi người đang trống việc, để giới hạn N không ảnh hưởng.
update public.leads set first_contact_at = now() where first_contact_at is null;

-- ---------------------------------------------------------------------------
-- Ai nhận lead
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.lead_receivers('4a000000-0000-4000-8000-000000000004')), 2,
  'hai telesale đang bật Trực đều nhận lead');

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((public.set_my_duty(false)) ->> 'on', 'false', 'Thảo tắt Trực');
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select public.set_my_duty(false);
select pg_temp.logout();
select is((select count(*)::int from public.lead_receivers('4a000000-0000-4000-8000-000000000004')), 0,
  'tắt Trực thì không còn trong danh sách nhận lead');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
insert into r select 'a', public.ingest_lead(pg_temp.lead('Khách trực A', '+84902220001'));
insert into r select 'h', public.ingest_lead(pg_temp.lead('Khách nhập file', '+84902220002', false));
select pg_temp.logout();
select is((select v ->> 'route' from r where k = 'a'), 'unassigned', 'không ai trực: lead vào hàng Chưa phân');
select ok((select 'no_receiver' = any (flags) from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  'lead chờ người trực được đánh dấu no_receiver');

-- Owner không có lead.receive thì không bật Trực được.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select throws_ok($$ select public.set_my_duty(true) $$, '42501', null, 'không có lead.receive thì không bật Trực');

-- An bật Trực: lead chờ người trực được chia ngay, lead nhập file để Chưa phân thì không.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
insert into r select 'on', public.set_my_duty(true);
select pg_temp.logout();
select is((select (v ->> 'routed')::int from r where k = 'on'), 1, 'bật Trực chia lại lead đang chờ người trực');
select is((select assigned_to from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  '11111111-1111-4111-8111-000000000004'::uuid, 'lead chờ được giao cho An');
select ok((select not ('no_receiver' = any (flags)) and sla_due_at is not null from public.leads
           where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')), 'giao xong thì bỏ cờ và bắt đầu tính SLA');
select ok((select assigned_to is null from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'h')),
  'lead nhập file để Chưa phân không bị chia tự động');
select ok(exists (select 1 from public.audit_logs where action = 'duty.start'
                  and entity_id = '11111111-1111-4111-8111-000000000004'), 'bật Trực ghi nhật ký kiểm toán');

-- Bật lại lần nữa không mở phiên thứ hai.
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select public.set_my_duty(true);
select pg_temp.logout();
select is((select count(*)::int from public.duty_sessions
           where user_id = '11111111-1111-4111-8111-000000000004' and ended_at is null), 1, 'mỗi người một phiên mở');

-- ---------------------------------------------------------------------------
-- Quyền xem, ghi
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(distinct user_id)::int from public.duty_sessions), 1, 'telesale chỉ thấy phiên trực của mình');
select throws_ok($$ insert into public.duty_sessions (showroom_id, user_id)
  values ('4a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000003') $$,
  '42501', null, 'không ghi thẳng vào phiên trực');
select throws_ok($$ insert into public.absences (showroom_id, user_id, kind, starts_on, ends_on)
  values ('4a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000003', 'annual', current_date, current_date) $$,
  '42501', null, 'telesale không tự ghi ngày nghỉ');
select throws_ok($$ insert into public.shifts (showroom_id, name, days, start_time, end_time)
  values ('4a000000-0000-4000-8000-000000000004', 'Ca lạ', '{1}', '08:00', '09:00') $$,
  '42501', null, 'telesale không sửa lịch ca');
select throws_ok($$ select public.end_duty_for('11111111-1111-4111-8111-000000000004') $$,
  '42501', null, 'telesale không tắt Trực hộ người khác');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select ok((select count(distinct user_id)::int from public.duty_sessions) >= 2, 'sale admin xem giờ trực cả đội');
select is((select count(*)::int from public.shifts), 3, 'seed ba ca gợi ý');

-- ---------------------------------------------------------------------------
-- Ngày nghỉ
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into public.absences (showroom_id, user_id, kind, starts_on, ends_on)
values ('4a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000003', 'sick',
        (now() at time zone 'Asia/Ho_Chi_Minh')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok($$ select public.set_my_duty(true) $$, '22023', null, 'ngày nghỉ thì không bật Trực được');
-- Owner hủy ngày nghỉ (xóa mềm) thì Thảo bật Trực lại được.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select lives_ok($$ update public.absences set deleted_at = now()
  where user_id = '11111111-1111-4111-8111-000000000003' $$, 'quản lý hủy được ngày nghỉ');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((public.set_my_duty(true)) ->> 'on', 'true', 'hủy ngày nghỉ thì bật Trực lại được');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- Tự tắt Trực
-- ---------------------------------------------------------------------------
-- An được xếp vào một ca không chạy lúc này (ngày khác hôm nay), bật Trực từ 1 giờ trước: job tắt.
update public.duty_sessions set started_at = now() - interval '1 hour'
where user_id = '11111111-1111-4111-8111-000000000004' and ended_at is null;
insert into public.shifts (id, showroom_id, name, days, start_time, end_time)
values ('55555555-5555-4555-8555-000000000001', '4a000000-0000-4000-8000-000000000004', 'Ca thử',
        array[(extract(isodow from (now() at time zone 'Asia/Ho_Chi_Minh') + interval '3 days'))::int], '08:00', '09:00');
insert into public.shift_members (shift_id, user_id, showroom_id)
values ('55555555-5555-4555-8555-000000000001', '11111111-1111-4111-8111-000000000004', '4a000000-0000-4000-8000-000000000004');
select is(public.close_stale_duty_sessions(), 1, 'hết ca cộng 30 phút thì hệ thống tắt Trực');
select ok(exists (select 1 from public.duty_sessions where user_id = '11111111-1111-4111-8111-000000000004'
                  and end_source = 'system' and ended_at is not null), 'ghi nguồn tắt là hệ thống');

-- Khóa tài khoản tắt Trực ngay.
insert into public.duty_sessions (showroom_id, user_id)
values ('4a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000004');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
update public.profiles set is_active = false where id = '11111111-1111-4111-8111-000000000004';
select pg_temp.logout();
select is((select end_source from public.duty_sessions where user_id = '11111111-1111-4111-8111-000000000004'
           order by started_at desc limit 1), 'locked', 'khóa tài khoản thì tắt Trực');

select * from finish();
rollback;
