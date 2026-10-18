-- Số điện thoại hiện đầy đủ theo quyền (supabase/migrations/20261018000200_phone_display.sql). Chạy: pnpm test:rls
-- Dữ liệu giả: Owner …0001, sale admin …0002, Thảo …0003 (telesale) giữ lead 1 (người đặt Thu …0001, người nhận Lực
-- …0002, Giữ bất ngờ), An …0004 (telesale) giữ lead 2 (Lan …0003 mua cho mình), Lan …0005 (marketing).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
end;
$$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create function pg_temp.shown(c uuid) returns text language sql as $$
  select display from public.contact_identity_display where contact_id = c and type = 'phone';
$$;

-- Owner: số đầy đủ của mọi khách, trừ người nhận đang Giữ bất ngờ.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000001'), '+821012342290', 'Owner thấy số đầy đủ người đặt');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000003'), '+84911234630',
  'Owner thấy số đầy đủ khách của lead người khác giữ');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000002'), '090•••215',
  'Giữ bất ngờ: Owner cũng chỉ thấy bản che của người nhận');
select is((select is_full from public.contact_identity_display where contact_id = '22222222-2222-4222-8222-000000000001'),
  true, 'cột is_full báo đang là số đầy đủ');
select is((select display_masked from public.contact_identity_display
           where contact_id = '22222222-2222-4222-8222-000000000001'), '+82 10••••2290', 'cột bản che giữ nguyên');

-- Sale admin: như Owner (có contact.phone_reveal).
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000004'), '+821055555103',
  'sale admin thấy số đầy đủ cả lead chưa phân');

-- Telesale Thảo: số đầy đủ của người đặt thuộc lead mình giữ; người nhận Giữ bất ngờ vẫn che.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000001'), '+821012342290',
  'telesale thấy số đầy đủ người đặt của lead mình giữ');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000002'), '090•••215',
  'telesale chỉ thấy bản che người nhận đang Giữ bất ngờ');
select is((select count(*)::int from public.contact_identities), 0, 'telesale vẫn không đọc thẳng được bảng số');

-- Bỏ Giữ bất ngờ thì người giữ lead thấy số người nhận.
select pg_temp.logout();
update public.leads set keep_surprise = false where id = '33333333-3333-4333-8333-000000000001';
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000002'), '+84901234215',
  'bỏ Giữ bất ngờ: telesale thấy số người nhận của lead mình');

-- Lead chuyển cho An: Thảo không còn thấy khách, An thấy số đầy đủ.
select pg_temp.logout();
update public.leads set assigned_to = '11111111-1111-4111-8111-000000000004'
where id = '33333333-3333-4333-8333-000000000001';
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000001'), null, 'lead chuyển đi thì Thảo không còn thấy số');
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000001'), '+821012342290', 'người giữ mới thấy số đầy đủ');

-- Bỏ quyền xem số theo lead được giao thì chỉ còn bản che.
select pg_temp.logout();
insert into public.user_permission_overrides (user_id, permission_key, effect)
values ('11111111-1111-4111-8111-000000000004', 'contact.phone_reveal_assigned', 'revoke');
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select is(pg_temp.shown('22222222-2222-4222-8222-000000000001'), '+82 10••••2290',
  'thu quyền xem số theo lead được giao thì chỉ còn bản che');

-- Marketing không xem được khách: không có dòng nào.
select pg_temp.login('11111111-1111-4111-8111-000000000005');
select is((select count(*)::int from public.contact_identity_display), 0, 'marketing không thấy số khách');

select * from finish();
rollback;
