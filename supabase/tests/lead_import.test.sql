-- Kiểm thử nhập file lead cũ (supabase/migrations/20261007000800_lead_import.sql): cần lead.import, xem trước số đã
-- có trong CRM không lộ tên, lead nhập để ở hàng Chưa phân, "Cập nhật ô còn trống" không ghi đè. Chạy: pnpm test:rls
-- Dữ liệu giả (supabase/seed.sql): sale admin …0002 (có lead.import), telesale Thảo …0003 (không có).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

create function pg_temp.row(name text, phone text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('full_name', name, 'country', 'VN', 'source', 'import', 'source_key', 'import',
    'route', false,
    'phone', jsonb_build_object('raw', phone, 'e164', phone, 'masked', '090•••000', 'valid', true)) || extra;
$$;

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;

-- Telesale không có lead.import: không nhập được, không xem trước được.
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select throws_ok($$ select public.ingest_lead(pg_temp.row('Cũ A', '+84901230001')) $$,
  '42501', null, 'không có quyền nhập file thì không nhập được lead nguồn import');
select throws_ok($$ select * from public.import_check_phones(array['+84901230001']) $$,
  '42501', null, 'không có quyền nhập file thì không xem trước được');

-- Sale admin nhập: lead để ở hàng Chưa phân, không ai bị giao kèm SLA.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
insert into r select 'a', public.ingest_lead(pg_temp.row('Cũ A', '+84901230001',
  '{"recipient_province": "Nghệ An"}'));
select is((select v ->> 'route' from r where k = 'a'), 'held', 'lead nhập từ file để ở hàng Chưa phân');
select pg_temp.logout();
select ok((select assigned_to is null and sla_due_at is null from public.leads
           where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')), 'không giao, không chạy SLA');

-- Xem trước: số vừa nhập đã có, đang có lead mở; số lạ không trả về.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*) from public.import_check_phones(array['+84901230001', '+84909999999'])), 1::bigint,
  'chỉ trả số đã có trong CRM');
select ok((select has_open_lead from public.import_check_phones(array['+84901230001'])),
  'cho biết số đó đang có lead mở');

-- Nhập lại cùng số, chọn cập nhật ô còn trống: không ghi đè tỉnh đã có, điền sản phẩm còn trống.
insert into r select 'a2', public.ingest_lead(pg_temp.row('Cũ A', '+84901230001',
  '{"fill_empty": true, "recipient_province": "Hà Tĩnh", "source_detail": {"product_interest": "Ghế DV-X9"}}'));
select is((select v ->> 'action' from r where k = 'a2'), 'attached', 'cùng số thì nối vào lead đang mở');
select pg_temp.logout();
select is((select recipient_province from public.leads where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  'Nghệ An', 'ô đã có không bị ghi đè');
select is((select source_detail ->> 'product_interest' from public.leads
           where id = (select (v ->> 'lead_id')::uuid from r where k = 'a')),
  'Ghế DV-X9', 'ô còn trống được điền');

select * from finish();
rollback;
