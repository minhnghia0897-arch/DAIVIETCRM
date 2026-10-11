-- Kiểm thử phân quyền tuần 1 (CLAUDE.md mục 5, 15). Chạy: pnpm test:rls
-- Dựa trên dữ liệu giả trong supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Người dùng giả
-- owner      11111111-1111-4111-8111-000000000001
-- sale admin 11111111-1111-4111-8111-000000000002
-- Thảo       11111111-1111-4111-8111-000000000003 (giữ lead 1: người đặt Thu ở Hàn, người nhận Lực, giữ bất ngờ)
-- An         11111111-1111-4111-8111-000000000004 (giữ lead 2)

-- ---------------------------------------------------------------- xem lead
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*) from public.leads), 1::bigint, 'telesale chỉ thấy lead được giao cho mình');
select is((select count(*) from public.leads where id = '33333333-3333-4333-8333-000000000002'), 0::bigint,
  'telesale không đọc được lead của người khác kể cả khi hỏi đúng id');
select is((select count(*) from public.contacts), 2::bigint, 'telesale chỉ thấy người đặt và người nhận của lead mình');

update public.leads set source_detail = '{"x":1}' where id = '33333333-3333-4333-8333-000000000002';
select pg_temp.logout();
select is((select source_detail from public.leads where id = '33333333-3333-4333-8333-000000000002'), '{}'::jsonb,
  'telesale không sửa được lead của người khác');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*) from public.leads), 3::bigint, 'sale admin thấy mọi lead của showroom');

-- ---------------------------------------------------------------- số điện thoại
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*) from public.contact_identities), 0::bigint, 'telesale không đọc trực tiếp được số đầy đủ');
select is((select count(*) from public.contact_identity_display), 2::bigint, 'telesale thấy bản che của khách thuộc lead mình');
select is(
  (select display_masked from public.contact_identity_display where contact_id = '22222222-2222-4222-8222-000000000001'),
  '+82 10••••2290', 'bản che đúng định dạng');
select is(
  public.reveal_identity(
    (select id from public.contact_identity_display where contact_id = '22222222-2222-4222-8222-000000000001'),
    '33333333-3333-4333-8333-000000000001'),
  '+821012342290', 'telesale lấy được số người đặt của lead đang giao cho mình');
select throws_ok(
  $$ select public.reveal_identity(
       (select id from public.contact_identity_display where contact_id = '22222222-2222-4222-8222-000000000002'),
       '33333333-3333-4333-8333-000000000001') $$,
  '42501', null, 'giữ bất ngờ: không lấy được số người nhận');

select pg_temp.logout();
create temp table an_identity as
  select id from public.contact_identities where contact_id = '22222222-2222-4222-8222-000000000003';
grant select on an_identity to authenticated;
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok(
  $$ select public.reveal_identity((select id from an_identity), '33333333-3333-4333-8333-000000000002') $$,
  '42501', null, 'telesale không lấy được số của lead người khác');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
select ok(
  exists (select 1 from public.audit_logs where action = 'contact.reveal_identity'
          and actor_id = '11111111-1111-4111-8111-000000000003'),
  'mỗi lượt xem số có trong nhật ký kiểm toán');

-- ---------------------------------------------------------------- luật nghiệp vụ trên lead
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok(
  $$ update public.leads set stage = 'quoted' where id = '33333333-3333-4333-8333-000000000001' $$,
  '23514', null, 'không kéo tay lead sang quoted');
select throws_ok(
  $$ update public.leads set assigned_to = '11111111-1111-4111-8111-000000000004'
     where id = '33333333-3333-4333-8333-000000000001' $$,
  '42501', null, 'telesale không tự giao lead');
select lives_ok(
  $$ update public.leads set stage = 'contacted' where id = '33333333-3333-4333-8333-000000000001' $$,
  'telesale chuyển được lead của mình sang contacted');
select ok(
  exists (select 1 from public.events where lead_id = '33333333-3333-4333-8333-000000000001' and type = 'stage_change'),
  'đổi giai đoạn sinh sự kiện CDP');
update public.events set type = 'x';
select pg_temp.logout();
select ok(not exists (select 1 from public.events where type = 'x'), 'người dùng không sửa được dòng sự kiện');
select throws_ok(
  $$ update public.events set type = 'x' $$,
  '42501', null, 'dòng sự kiện không sửa được kể cả bằng quyền quản trị database');
select pg_temp.login('11111111-1111-4111-8111-000000000003');

-- ---------------------------------------------------------------- bật tắt quyền
select is(public.has_perm('lead.create'), true, 'telesale mặc định có quyền tạo lead');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
insert into public.user_permission_overrides (user_id, permission_key, effect, set_by)
values ('11111111-1111-4111-8111-000000000003', 'lead.create', 'revoke', '11111111-1111-4111-8111-000000000001');
select ok(
  exists (select 1 from public.audit_logs where action = 'user_permission.insert'
          and entity_id = '11111111-1111-4111-8111-000000000003' and metadata ->> 'permission' = 'lead.create'),
  'thay đổi quyền có trong nhật ký kiểm toán');

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(public.has_perm('lead.create'), false, 'Owner thu quyền thì có hiệu lực ở lần gọi tiếp theo');
select throws_ok(
  $$ insert into public.leads (showroom_id, contact_id, source)
     values ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000001', 'walk_in') $$,
  '42501', null, 'API từ chối tạo lead khi bị thu quyền');
select is((select count(*) from public.my_permissions() where my_permissions = 'lead.create'), 0::bigint,
  'danh sách quyền hiệu lực không còn lead.create');

-- ---------------------------------------------------------------- quyền chỉ Owner
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select throws_ok(
  $$ insert into public.role_permissions (role_id, permission_key)
     select id, 'settings.permissions' from public.roles where key = 'sale_admin' $$,
  '23514', null, 'không cấp được quyền chỉ Owner cho vai trò khác');
select throws_ok(
  $$ insert into public.user_permission_overrides (user_id, permission_key, effect)
     values ('11111111-1111-4111-8111-000000000002', 'settings.users', 'grant') $$,
  '23514', null, 'không cấp riêng được quyền chỉ Owner cho từng người');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select throws_ok(
  $$ insert into public.role_permissions (role_id, permission_key)
     select id, 'lead.export' from public.roles where key = 'telesale' $$,
  '42501', null, 'sale admin không bật tắt quyền được');
update public.profiles set is_active = false where id = '11111111-1111-4111-8111-000000000004';
select is((select is_active from public.profiles where id = '11111111-1111-4111-8111-000000000004'), true,
  'sale admin không khóa người dùng được');
select throws_ok(
  $$ update public.profiles set role_id = (select id from public.roles where key = 'owner')
     where id = '11111111-1111-4111-8111-000000000002' $$,
  '42501', null, 'người dùng không tự nâng vai trò của mình');

-- ---------------------------------------------------------------- khóa người dùng
select pg_temp.login('11111111-1111-4111-8111-000000000001');
update public.profiles set is_active = false where id = '11111111-1111-4111-8111-000000000004';
select is(
  (select assigned_to from public.leads where id = '33333333-3333-4333-8333-000000000002'), null,
  'khóa người dùng trả lead đang mở về hàng chưa phân');
select ok(
  exists (select 1 from public.events where lead_id = '33333333-3333-4333-8333-000000000002'
          and type = 'assignment' and payload ->> 'reason' = 'user_locked'),
  'việc trả lead ghi sự kiện kèm lý do');
select ok(
  exists (select 1 from public.audit_logs where action = 'profile.lock'
          and entity_id = '11111111-1111-4111-8111-000000000004'),
  'khóa người dùng có trong nhật ký kiểm toán');

select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is(public.has_perm('lead.view_own'), false, 'người bị khóa không còn quyền nào');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select ok(
  exists (select 1 from public.notifications where type = 'user_locked'),
  'sale admin được báo khi có người bị khóa');

select pg_temp.logout();
select * from finish();
rollback;
