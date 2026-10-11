-- Kiểm thử thu lead và phân lead (supabase/migrations/20261007000700_lead_intake.sql): khung gọi theo thị trường,
-- nhập lead, chống trùng, phân vòng tròn, chờ khung gọi, giới hạn N, giao và chuyển bằng tay. Chạy: pnpm test:rls
-- Dữ liệu giả (supabase/seed.sql): Hà Owner …0001, sale admin …0002, telesale Thảo …0003 và An …0004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.headers', '{}', true);
end;
$$;

create function pg_temp.lead(name text, phone text, country text default 'unknown', valid boolean default true)
returns jsonb language sql as $$
  select jsonb_build_object('full_name', name, 'country', country, 'source', 'walk_in', 'source_key', 'walk_in',
    'phone', jsonb_build_object('raw', phone, 'e164', case when valid then phone end, 'masked', '090•••000',
                                'valid', valid));
$$;

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;

-- ---------------------------------------------------------------------------
-- Khung gọi (KR: T2–T6 19:00–22:30, T7–CN 09:00–22:30 giờ Hàn)
-- ---------------------------------------------------------------------------
select is(public.market_wait_until('4a000000-0000-4000-8000-000000000004', 'KR', '2026-10-07 01:00+00'),
  '2026-10-07 10:00+00'::timestamptz, 'khách Hàn lúc 10:00 sáng thứ Tư giờ Hàn chờ tới 19:00 cùng ngày');
select is(public.market_wait_until('4a000000-0000-4000-8000-000000000004', 'KR', '2026-10-07 11:00+00'),
  null, 'trong khung gọi thì không chờ');
select is(public.market_wait_until('4a000000-0000-4000-8000-000000000004', 'KR', '2026-10-09 14:00+00'),
  '2026-10-10 00:00+00'::timestamptz, '23:00 tối thứ Sáu giờ Hàn chờ tới 09:00 sáng thứ Bảy');
select is(public.market_wait_until('4a000000-0000-4000-8000-000000000004', 'unknown', now()),
  null, 'chưa rõ thị trường thì không chờ');

-- Mọi người có lead.receive đang trống việc, để thứ tự vòng tròn không phụ thuộc dữ liệu giả.
update public.leads set first_contact_at = now() where first_contact_at is null;

-- ---------------------------------------------------------------------------
-- Nhập lead và chống trùng
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000003');
insert into r select 'a', public.ingest_lead(pg_temp.lead('Khách A', '+84901110001'));
select is((select v ->> 'action' from r where k = 'a'), 'created', 'telesale nhập lead mới cho khách mới');
select is((select v ->> 'route' from r where k = 'a'), 'assigned', 'lead được phân ngay');

select pg_temp.logout();
select ok((select assigned_to in ('11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000004')
           from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  'lead chỉ giao cho người có quyền nhận lead (Owner, sale admin không nhận)');
select ok((select sla_due_at between now() + interval '4 minutes' and now() + interval '6 minutes'
           from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  'đồng hồ SLA 5 phút bắt đầu khi giao');
select ok(exists (select 1 from public.events
                  where lead_id = (select (v ->> 'lead_id')::uuid from r where k = 'a')
                    and type = 'assignment' and payload ->> 'reason' = 'auto'),
  'lần phân tự động có trên dòng sự kiện');
select ok(exists (select 1 from public.contact_identities where value = '+84901110001' and is_primary),
  'số điện thoại lưu ở định danh của khách');

select pg_temp.login('11111111-1111-4111-8111-000000000004');
insert into r select 'b', public.ingest_lead(pg_temp.lead('Khách B', '+84901110002'));
select pg_temp.logout();
select isnt((select assigned_to from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'b')),
  (select assigned_to from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  'lead kế tiếp sang người kế tiếp trong vòng');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
insert into r select 'a2', public.ingest_lead(pg_temp.lead('Chị A (gọi lại)', '+84901110001'));
select is((select v ->> 'action' from r where k = 'a2'), 'attached', 'cùng số khi lead còn mở: không tạo lead mới');
select is((select v ->> 'lead_id' from r where k = 'a2'), (select v ->> 'lead_id' from r where k = 'a'),
  'nối vào lead đang mở');
select pg_temp.logout();
select is((select count(*) from public.leads l join public.contact_identities ci on ci.contact_id = l.contact_id
           where ci.value = '+84901110001'), 1::bigint, 'vẫn chỉ một lead');
select ok(exists (select 1 from public.events
                  where lead_id = (select (v ->> 'lead_id')::uuid from r where k = 'a')
                    and type = 'merge' and payload ->> 'reason' = 'open_lead'),
  'quyết định gộp có ghi lý do');
select ok(exists (select 1 from public.notifications
                  where type = 'lead_reentry'
                    and user_id = (select assigned_to from public.leads
                                   where id = (select (v ->> 'lead_id')::uuid from r where k = 'a'))),
  'người giữ lead được báo khách liên hệ lại');

-- Lead cũ đã chốt: tạo lead mới cho cùng khách.
update public.leads set stage = 'won' where id = (select (v ->> 'lead_id')::uuid from r where k = 'b');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
insert into r select 'b2', public.ingest_lead(pg_temp.lead('Khách B', '+84901110002'));
select is((select v ->> 'action' from r where k = 'b2'), 'new_lead_existing_contact',
  'khách cũ đã mua thì mở lead mới trên cùng hồ sơ khách');
select is((select v ->> 'contact_id' from r where k = 'b2'), (select v ->> 'contact_id' from r where k = 'b'),
  'không tạo khách mới');

-- Số sai vẫn nhận lead, gắn cờ và đưa vào hàng chờ kiểm tra.
insert into r select 'x', public.ingest_lead(pg_temp.lead('Khách số sai', '0123', 'unknown', false));
select pg_temp.logout();
select ok((select 'phone_invalid' = any (flags) from public.leads
           where id = (select (v ->> 'lead_id')::uuid from r where k = 'x')), 'số sai gắn cờ phone_invalid');
select ok(exists (select 1 from public.tasks where type = 'data_fix' and assigned_to is null
                  and lead_id = (select (v ->> 'lead_id')::uuid from r where k = 'x')),
  'số sai sinh việc sửa dữ liệu ở hàng chung');

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
insert into public.user_permission_overrides (user_id, permission_key, effect, set_by)
values ('11111111-1111-4111-8111-000000000004', 'lead.create', 'revoke', '11111111-1111-4111-8111-000000000001');
select pg_temp.login('11111111-1111-4111-8111-000000000004');
select throws_ok($$ select public.ingest_lead(pg_temp.lead('Khách C', '+84901110003')) $$,
  '42501', null, 'bị thu quyền tạo lead thì không nhập được');
select throws_ok($$ select public.assign_leads(array[(select (v ->> 'lead_id')::uuid from r where k = 'a')],
                                               '11111111-1111-4111-8111-000000000004') $$,
  '42501', null, 'telesale không tự giao lead');
select throws_ok($$ select * from public.lead_assignees() $$, '42501', null,
  'telesale không xem được danh sách người nhận');

-- ---------------------------------------------------------------------------
-- Giao, chuyển bằng tay
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is(public.assign_leads(array[(select (v ->> 'lead_id')::uuid from r where k = 'a')], null, 'Gom lại'),
  1, 'sale admin trả lead về hàng Chưa phân');
select is(public.assign_leads(array[(select (v ->> 'lead_id')::uuid from r where k = 'a')],
                              '11111111-1111-4111-8111-000000000004', 'Khách nói giọng Bắc'),
  1, 'sale admin giao lead cho An');
select is(public.assign_leads(array[(select (v ->> 'lead_id')::uuid from r where k = 'a')],
                              '11111111-1111-4111-8111-000000000004'),
  0, 'giao lại cho đúng người đang giữ thì không đổi gì');
select ok((select count(*) >= 2 from public.lead_assignees()), 'sale admin thấy danh sách người nhận');
select pg_temp.logout();
select ok(exists (select 1 from public.events
                  where lead_id = (select (v ->> 'lead_id')::uuid from r where k = 'a')
                    and type = 'assignment' and payload ->> 'reason' = 'Khách nói giọng Bắc'),
  'lần chuyển ghi lý do trên dòng sự kiện');

-- ---------------------------------------------------------------------------
-- Chờ khung gọi, rồi phân khi tới giờ
-- ---------------------------------------------------------------------------
-- KR chỉ còn khung ngày mai, nên lead của khách Hàn bây giờ chắc chắn phải chờ.
update public.markets
set call_windows = jsonb_build_array(jsonb_build_object(
  'days', jsonb_build_array(extract(isodow from (now() at time zone 'Asia/Seoul')::date + 1)::int),
  'start', '00:00', 'end', '23:59'))
where country_code = 'KR';
select pg_temp.login('11111111-1111-4111-8111-000000000003');
insert into r select 'k', public.ingest_lead(pg_temp.lead('Khách Hàn', '+821012345678', 'KR'));
select pg_temp.logout();
select is((select v ->> 'route' from r where k = 'k'), 'waiting', 'khách Hàn ngoài khung gọi: chưa giao, chờ khung');
-- Giả lập đã tới giờ: mốc chờ đã qua và thị trường đang trong khung (bỏ khung = gọi lúc nào cũng được).
update public.leads set window_wait_until = now() - interval '1 minute'
where id = (select (v ->> 'lead_id')::uuid from r where k = 'k');
update public.markets set call_windows = '[]'::jsonb where country_code = 'KR';
select ok(public.route_waiting_leads() >= 1, 'tới đầu khung thì job phân lead');
select ok((select assigned_to is not null and window_wait_until is null from public.leads
           where id = (select (v ->> 'lead_id')::uuid from r where k = 'k')), 'lead đã có người giữ');

-- ---------------------------------------------------------------------------
-- Giới hạn N lead chưa liên hệ
-- ---------------------------------------------------------------------------
update public.assignment_rules set max_uncontacted_per_person = 1;
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is(public.ingest_lead(pg_temp.lead('Khách D', '+84901110004')) ->> 'route', 'unassigned',
  'ai cũng đang giữ đủ N lead chưa gọi thì lead vào hàng Chưa phân');
select pg_temp.logout();

select * from finish();
rollback;
