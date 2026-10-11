-- Kiểm thử phần đọc lại tin Messenger bị lỡ (supabase/migrations/20261011000700_messenger_reconcile.sql): mã gọi tự
-- sinh, ai được hỏi mã, ai được đụng con trỏ, lịch chạy và lời gọi pg_net.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role;
insert into t select 'token', decrypted_secret from vault.decrypted_secrets where name = 'cron_invoke_token';

select is((select length(v) from t where k = 'token'), 64, 'migration tự sinh mã gọi 64 ký tự trong Vault');

-- Quyền gọi hàm
select ok(not has_function_privilege('authenticated', 'public.cron_token_ok(text)', 'execute'),
  'người dùng đăng nhập không hỏi được mã gọi');
select ok(not has_function_privilege('anon', 'public.cron_token_ok(text)', 'execute'), 'khách vãng lai cũng không');
select ok(has_function_privilege('service_role', 'public.cron_token_ok(text)', 'execute'), 'route chạy service_role hỏi được');
select ok(not has_function_privilege('authenticated', 'public.dispatch_messenger_reconcile()', 'execute'),
  'người dùng không tự kích được việc nền');

-- Kiểm mã
set local role service_role;
select ok(public.cron_token_ok((select v from t where k = 'token')), 'đúng mã thì được');
select ok(not public.cron_token_ok(repeat('a', 64)), 'sai mã thì không');
select ok(not public.cron_token_ok(left((select v from t where k = 'token'), 20)), 'mã ngắn thì không');
select ok(not public.cron_token_ok(null), 'không có mã thì không');
reset role;

-- Bảng con trỏ chỉ việc nền dùng
select is((select relrowsecurity from pg_class where oid = 'public.integration_sync_state'::regclass), true,
  'bảng con trỏ bật RLS');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select throws_ok('select * from public.integration_sync_state', '42501', null, 'cả Owner cũng không đọc trực tiếp');
reset role;

-- Lịch chạy và lời gọi
select is((select schedule from cron.job where jobname = 'messenger-reconcile'), '*/2 * * * *', 'chạy mỗi 2 phút');

insert into public.integrations (showroom_id, key, status, enabled)
values ('4a000000-0000-4000-8000-000000000004', 'meta_messenger', 'connected', true)
on conflict (showroom_id, key) do update set status = 'connected', enabled = true;
delete from vault.secrets where name = 'app_base_url';
insert into t select 'before', count(*)::text from net.http_request_queue;
select public.dispatch_messenger_reconcile();
select is((select count(*)::text from net.http_request_queue), (select v from t where k = 'before'),
  'chưa đặt địa chỉ CRM thì không gọi gì');

select vault.create_secret('https://crm.example.test/', 'app_base_url');
select public.dispatch_messenger_reconcile();
select is(
  (select url || ' ' || (headers ->> 'Authorization') from net.http_request_queue order by id desc limit 1),
  'https://crm.example.test/api/cron/messenger-reconcile Bearer ' || (select v from t where k = 'token'),
  'có địa chỉ thì gọi đúng route, kèm mã gọi');

select * from finish();
rollback;
