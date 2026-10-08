-- Kiểm thử cảnh báo quá hạn và quyền sửa Cài đặt (supabase/migrations/20261008000100_sla_alerts_settings.sql).
-- Chạy: pnpm test:rls. Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003, An …0004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- Số dòng một lệnh sửa chạm tới (RLS chặn thì 0 dòng).
create function pg_temp.affected(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Chỉ một lead quá hạn: lead của Thảo (…0001 trong seed) hết hạn 10 phút trước, các lead khác đã liên hệ.
update public.leads set first_contact_at = now() where id <> '33333333-3333-4333-8333-000000000001';
update public.leads set sla_due_at = now() - interval '10 minutes', first_contact_at = null
where id = '33333333-3333-4333-8333-000000000001';

-- ---------------------------------------------------------------------------
-- Cảnh báo quá hạn
-- ---------------------------------------------------------------------------
select is(public.alert_sla_overdue(), 1, 'lead quá hạn chưa liên hệ được báo');
select ok(exists (select 1 from public.notifications where type = 'sla_overdue'
                  and user_id = '11111111-1111-4111-8111-000000000003'
                  and link = '/leads/33333333-3333-4333-8333-000000000001'), 'người giữ lead nhận thông báo');
select ok(exists (select 1 from public.notifications where type = 'sla_overdue'
                  and user_id = '11111111-1111-4111-8111-000000000002'), 'sale admin (lead.assign) nhận thông báo');
select ok(not exists (select 1 from public.notifications where type = 'sla_overdue'
                      and user_id = '11111111-1111-4111-8111-000000000004'), 'telesale khác không nhận');
select ok(not exists (select 1 from public.notifications where type = 'sla_overdue' and title ~ '\+?\d{9,}'),
  'thông báo không chứa số điện thoại');
select is((select (payload ->> 'late_minutes')::int from public.events
           where type = 'sla_breached' and lead_id = '33333333-3333-4333-8333-000000000001'), 10,
  'ghi sự kiện quá hạn kèm số phút trễ');
select is(public.alert_sla_overdue(), 0, 'mỗi hạn SLA chỉ báo một lần');

-- Giao lại (hạn mới) rồi lại quá hạn: báo lần nữa.
update public.leads set sla_due_at = now() - interval '1 minute' where id = '33333333-3333-4333-8333-000000000001';
select is(public.alert_sla_overdue(), 1, 'hạn SLA mới quá hạn thì báo lại');

-- Đã liên hệ thì không báo.
update public.leads set first_contact_at = now(), sla_due_at = now() - interval '2 minutes'
where id = '33333333-3333-4333-8333-000000000001';
select is(public.alert_sla_overdue(), 0, 'đã liên hệ thì không báo');

-- ---------------------------------------------------------------------------
-- Quyền sửa Cài đặt
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(pg_temp.affected('update public.assignment_rules set sla_minutes = 30'), 0,
  'telesale không sửa được luật phân lead');
select is(pg_temp.affected($q$update public.markets set name = 'X'$q$), 0,
  'telesale không sửa được thị trường');
select ok((select count(*) from public.lead_sources) > 0, 'telesale đọc được danh mục');
select is(pg_temp.affected($q$update public.occasions set label = 'X'$q$), 0,
  'telesale không sửa được danh mục');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
update public.assignment_rules set sla_minutes = 7;
select pg_temp.logout();
select ok(exists (select 1 from public.audit_logs where action = 'settings.assignment_rules.update'
                  and (metadata -> 'after' ->> 'sla_minutes')::int = 7
                  and (metadata -> 'before' ->> 'sla_minutes')::int = 5), 'sửa luật phân lead ghi nhật ký trước và sau');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
select throws_ok($$ delete from public.lost_reasons $$, '42501', null, 'không xóa được danh mục, chỉ tắt');
select throws_ok($$ delete from public.markets where country_code = 'KR' $$, '42501', null, 'không xóa được thị trường');
select pg_temp.logout();

select * from finish();
rollback;
