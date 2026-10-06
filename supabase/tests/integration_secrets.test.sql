-- Kiểm thử lưu khóa đấu nối vào Vault (CLAUDE.md 10.1 quy tắc 5, 9): chỉ người có settings.integrations ghi được,
-- không ai đọc lại được giá trị qua API người dùng, mọi thao tác có nhật ký kiểm toán không kèm giá trị.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.login(uid uuid, view_as uuid default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', case when view_as is null then '{}' else json_build_object('x-view-as', view_as)::text end, true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end;
$$;

-- Owner lưu khóa.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select lives_ok(
  $$ select public.set_integration_secret('zalo_oa', 'zalo_app_secret', '  khoa-bi-mat-1  ') $$,
  'Owner lưu được khóa');
select is((select count(*) from public.integration_secrets where integration_key = 'zalo_oa'), 1::bigint,
  'Owner thấy khóa đã có (chỉ tên và ngày cập nhật)');
select ok((select secret_ref from public.integrations where key = 'zalo_oa') like 'vault:%',
  'dòng đấu nối trỏ tới kho bí mật');
select ok(exists (
    select 1 from public.audit_logs
    where action = 'integration.secret_set' and metadata ->> 'secret' = 'zalo_app_secret'
  ), 'lưu khóa có trong nhật ký kiểm toán');
select ok(not exists (select 1 from public.audit_logs where metadata::text like '%khoa-bi-mat%'),
  'nhật ký kiểm toán không chứa giá trị khóa');
select throws_ok($$ select * from vault.decrypted_secrets $$,
  '42501', null, 'người dùng không đọc được vault');
select throws_ok($$ select public.get_integration_secret('4a000000-0000-4000-8000-000000000004', 'zalo_oa', 'zalo_app_secret') $$,
  '42501', null, 'người dùng không gọi được hàm đọc khóa');
select throws_ok($$ insert into public.integration_secrets (showroom_id, integration_key, name, vault_secret_id)
  values ('4a000000-0000-4000-8000-000000000004', 'zalo_oa', 'x_y', gen_random_uuid()) $$,
  '42501', null, 'không ghi thẳng vào bảng khóa được');

-- Thay khóa: vẫn một dòng, nhật ký ghi "thay".
select lives_ok($$ select public.set_integration_secret('zalo_oa', 'zalo_app_secret', 'khoa-bi-mat-2') $$, 'Owner thay khóa');
select ok(exists (select 1 from public.audit_logs where action = 'integration.secret_replace'), 'thay khóa có nhật ký');

-- Server (service_role) đọc được giá trị mới nhất, đã cắt khoảng trắng.
select pg_temp.as_service();
select is(public.get_integration_secret('4a000000-0000-4000-8000-000000000004', 'zalo_oa', 'zalo_app_secret'),
  'khoa-bi-mat-2', 'adapter phía server đọc được khóa mới nhất');

-- Người không có quyền.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select throws_ok($$ select public.set_integration_secret('zalo_oa', 'zalo_app_secret', 'x') $$,
  '42501', null, 'sale admin không lưu được khóa');
select is((select count(*) from public.integration_secrets), 0::bigint, 'sale admin không thấy danh sách khóa');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok($$ select public.delete_integration_secret('zalo_oa', 'zalo_app_secret') $$,
  '42501', null, 'telesale không xóa được khóa');

-- Owner đang "Xem như" người khác: chỉ đọc.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into public.view_as_sessions (id, showroom_id, owner_id, target_id)
values ('99999999-9999-4999-8999-000000000002', '4a000000-0000-4000-8000-000000000004',
        '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000003');
select pg_temp.login('11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000002');
select throws_ok($$ select public.set_integration_secret('zalo_oa', 'zalo_app_secret', 'x') $$,
  '42501', null, 'đang xem như: không lưu được khóa');

-- Xóa khóa: mất cả trong vault.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select is(public.delete_integration_secret('zalo_oa', 'zalo_app_secret'), true, 'Owner xóa được khóa');

select * from finish();
rollback;
