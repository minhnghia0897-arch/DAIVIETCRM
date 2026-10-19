-- Link mời theo vị trí (supabase/migrations/20261019000100_invite_links.sql). Chạy: pnpm test:rls
-- Dữ liệu giả: Owner …0001, sale admin …0002, Thảo …0003 (telesale).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
end;
$$;

-- Máy chủ CRM (service role) tạo link sau khi kiểm settings.users.
insert into public.invite_links (showroom_id, role_id, token_hash, note, expires_at, created_by)
select '4a000000-0000-4000-8000-000000000004', r.id, repeat('ab', 32), 'Chị Hoa', now() + interval '7 days',
       '11111111-1111-4111-8111-000000000001'
from public.roles r where r.key = 'telesale' and r.showroom_id = '4a000000-0000-4000-8000-000000000004';

select throws_ok($$ insert into public.invite_links (showroom_id, role_id, token_hash, expires_at, created_by)
  values ('4a000000-0000-4000-8000-000000000004', (select role_id from public.invite_links limit 1), 'khong-phai-ma-bam',
          now(), '11111111-1111-4111-8111-000000000001') $$,
  '23514', null, 'chỉ nhận mã băm SHA-256, không nhận mã gốc');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
select is((select count(*)::int from public.invite_links where token_hash = repeat('ab', 32)), 1,
  'Owner thấy link mời chưa dùng');
select throws_ok($$ update public.invite_links set revoked_at = now() $$, '42501', null,
  'Owner cũng không sửa thẳng được bảng, chỉ qua máy chủ CRM');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*)::int from public.invite_links), 0, 'sale admin không có settings.users thì không thấy link mời');
select throws_ok($$ insert into public.invite_links (showroom_id, role_id, token_hash, expires_at, created_by)
  values ('4a000000-0000-4000-8000-000000000004', '4a000000-0000-4000-8000-000000000004', repeat('cd', 32), now(),
          '11111111-1111-4111-8111-000000000002') $$,
  '42501', null, 'không tự tạo được link mời');

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.invite_links), 0, 'telesale không thấy link mời');

select * from finish();
rollback;
