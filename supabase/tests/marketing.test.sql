-- Kiểm thử phòng Marketing (supabase/migrations/20261010000100_marketing.sql).
-- Chạy: pnpm test:rls. Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003, Marketing Lan …0005;
-- chiến dịch …0001 đang chạy (30 triệu), …0002 chờ Owner duyệt 15 triệu.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- ---------------------------------------------------------------------------
-- Marketing chỉ thấy số tổng hợp, không thấy khách
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-000000000005');
select is((select count(*)::int from public.leads), 0, 'Marketing không đọc được lead');
select is((select count(*)::int from public.contacts), 0, 'Marketing không đọc được khách');
select is((select count(*)::int from public.contact_identities), 0, 'Marketing không đọc được số điện thoại');
select is((select count(*)::int from public.campaigns), 2, 'Marketing thấy chiến dịch');
select ok((select count(*) from public.campaign_spend) > 0, 'Marketing thấy chi phí');
select is((select leads from public.marketing_overview(current_date - 30, current_date)
           where kind = 'campaign' and key = '66666666-6666-4666-8666-000000000001'), 2::bigint,
  'lead Form Facebook gắn vào chiến dịch theo mã chiến dịch');
select ok((select spend from public.marketing_overview(current_date - 30, current_date)
           where kind = 'campaign' and key = '66666666-6666-4666-8666-000000000001') > 0, 'tổng chi phí theo khoảng ngày');
select ok(exists (select 1 from public.marketing_overview(current_date - 30, current_date) where kind = 'source'),
  'số liệu theo nguồn');
select throws_ok($$ select * from public.marketing_overview(current_date, current_date - 1) $$, '22023', null,
  'khoảng ngày sai bị từ chối');
select throws_ok($$ insert into public.campaigns (showroom_id, name, platform)
                    values ('4a000000-0000-4000-8000-000000000004', 'x', 'facebook') $$, '42501', null,
  'không ghi thẳng vào bảng chiến dịch');

-- ---------------------------------------------------------------------------
-- Tạo chiến dịch, xin ngân sách, Owner duyệt
-- ---------------------------------------------------------------------------
insert into t select 'c', public.save_campaign('{"name":"Ghế massage 20/10","platform":"facebook","external_id":"120210000000009","market":"VN","budget":20000000}')::text;
select is((select status || '|' || budget || '|' || requested_budget from public.campaigns where id = (select v::uuid from t where k = 'c')),
  'pending_approval|0|20000000', 'chiến dịch mới chờ Owner duyệt ngân sách');
select is((select count(*)::int from public.approvals where type = 'campaign_budget' and entity_id = (select v::uuid from t where k = 'c') and status = 'pending'),
  1, 'đề xuất ngân sách vào hàng chờ duyệt');
select throws_ok(format($$ select public.save_campaign('{"id":"%s","name":"Ghế massage 20/10","platform":"facebook","status":"active"}') $$, (select v from t where k = 'c')),
  'P0001', 'budget_not_approved', 'chưa duyệt ngân sách thì chưa chạy được');
update public.approvals set status = 'approved' where entity_id = (select v::uuid from t where k = 'c');
select is((select budget from public.campaigns where id = (select v::uuid from t where k = 'c')), 0::bigint,
  'Marketing không tự duyệt ngân sách');
-- Xin mức mới: đề xuất cũ hết hạn, chỉ còn một đề xuất chờ.
select is(public.request_campaign_budget((select v::uuid from t where k = 'c'), 25000000, 'Tăng cho dịp 20/10'), 'pending',
  'xin mức mới');
select is((select count(*)::int from public.approvals where entity_id = (select v::uuid from t where k = 'c') and status = 'pending'), 1,
  'đề xuất cũ hết hạn, còn một đề xuất chờ');

select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*)::int from public.campaigns), 3, 'sale admin xem được chiến dịch');
select throws_ok($$ select public.save_campaign('{"name":"x","platform":"facebook"}') $$, '42501', null,
  'sale admin không tạo được chiến dịch');
select is((select count(*)::int from public.approvals where type = 'campaign_budget'), 0,
  'sale admin không thấy đề xuất ngân sách (không có quyền duyệt)');

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.campaigns), 0, 'telesale không thấy chiến dịch');
select throws_ok($$ select * from public.marketing_overview(current_date - 7, current_date) $$, '42501', null,
  'telesale không xem được số liệu marketing');

select pg_temp.login('11111111-1111-4111-8111-000000000001');
update public.approvals set status = 'approved'
where entity_id = (select v::uuid from t where k = 'c') and status = 'pending';
select is((select status || '|' || budget || '|' || coalesce(requested_budget::text, '-') from public.campaigns where id = (select v::uuid from t where k = 'c')),
  'active|25000000|-', 'Owner duyệt thì áp ngân sách và chạy chiến dịch');
select pg_temp.logout();
select ok(exists (select 1 from public.notifications where user_id = '11111111-1111-4111-8111-000000000005'
                  and type = 'approval_decided'), 'người xin được báo kết quả');
select pg_temp.login('11111111-1111-4111-8111-000000000001');
-- Owner tự tăng ngân sách: áp ngay, ghi nhật ký tự duyệt.
select is(public.request_campaign_budget('66666666-6666-4666-8666-000000000001', 40000000), 'applied',
  'Owner tăng ngân sách áp ngay');
select ok(exists (select 1 from public.audit_logs where action = 'campaign.budget_set'
                  and (metadata ->> 'self_approved')::boolean), 'ghi nhật ký tự duyệt');

-- Chi phí theo ngày: ghi đè ngày đã có.
select pg_temp.login('11111111-1111-4111-8111-000000000005');
select is(public.record_campaign_spend(format('[{"campaign_id":"%s","date":"%s","amount":500000},{"campaign_id":"%s","date":"%s","amount":700000}]',
  (select v from t where k = 'c'), current_date, (select v from t where k = 'c'), current_date)::jsonb, 'csv'), 2, 'ghi chi phí');
select is((select amount from public.campaign_spend where campaign_id = (select v::uuid from t where k = 'c') and spend_date = current_date),
  700000::bigint, 'cùng ngày thì ghi đè');

select * from finish();
rollback;
