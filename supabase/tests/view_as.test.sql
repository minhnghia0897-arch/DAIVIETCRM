-- Kiểm thử "Xem như người dùng": Owner thấy đúng như người được xem, chỉ đọc.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.login(uid uuid, view_as uuid default null, method text default 'GET') returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', case when view_as is null then '{}' else json_build_object('x-view-as', view_as)::text end, true);
  perform set_config('request.method', method, true);
end;
$$;

-- Owner mở phiên xem như Thảo.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into public.view_as_sessions (id, showroom_id, owner_id, target_id)
values ('99999999-9999-4999-8999-000000000001', '4a000000-0000-4000-8000-000000000004',
        '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000003');
select ok(exists (select 1 from public.audit_logs where action = 'view_as.start'), 'mở phiên xem như có trong nhật ký kiểm toán');

select is((select count(*) from public.leads), 3::bigint, 'không có phiên: Owner thấy mọi lead');

select pg_temp.login('11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001');
select is((select effective_uid from public.whoami()), '11111111-1111-4111-8111-000000000003'::uuid, 'người hiệu lực là Thảo');
select is((select count(*) from public.leads), 1::bigint, 'đang xem như: chỉ thấy lead của Thảo');
select is(public.has_perm('lead.view_all'), false, 'đang xem như: quyền là quyền của Thảo');
select is(public.has_perm('settings.permissions'), false, 'đang xem như: không còn quyền Owner');

select pg_temp.login('11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'PATCH');
select throws_ok($$ select public.check_request() $$, '42501', null, 'đang xem như: mọi thao tác ghi bị chặn');
select pg_temp.login('11111111-1111-4111-8111-000000000001', null, 'PATCH');
select lives_ok($$ select public.check_request() $$, 'không xem như: ghi bình thường');

-- Người khác dùng mã phiên của Owner không có tác dụng.
select pg_temp.login('11111111-1111-4111-8111-000000000002', '99999999-9999-4999-8999-000000000001');
select is((select effective_uid from public.whoami()), '11111111-1111-4111-8111-000000000002'::uuid,
  'mã phiên của người khác bị bỏ qua');

-- Sale admin không mở được phiên xem như; không ai xem như Owner.
select throws_ok(
  $$ insert into public.view_as_sessions (showroom_id, owner_id, target_id)
     values ('4a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000003') $$,
  '42501', null, 'người không có settings.users không mở được phiên xem như');

-- Phiên hết hạn thì không còn tác dụng.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
update public.view_as_sessions set ended_at = now() where id = '99999999-9999-4999-8999-000000000001';
select pg_temp.login('11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001');
select is((select count(*) from public.leads), 3::bigint, 'phiên đã kết thúc: Owner thấy lại như mình');

select * from finish();
rollback;
