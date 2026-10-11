-- Kiểm thử lịch nội dung (supabase/migrations/20261010000200_content_calendar.sql).
-- Dữ liệu giả: Marketing Lan …0005, sale admin …0002, telesale Thảo …0003; 5 bài mẫu ở 5 cột.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;

select pg_temp.login('11111111-1111-4111-8111-000000000005');
select is((select count(*)::int from public.content_items), 5, 'Marketing thấy lịch nội dung');
insert into t select 'c', public.save_content_item('{"title":"Video mới","channel":"tiktok","format":"short_video"}')::text;
select is((select status from public.content_items where id = (select v::uuid from t where k = 'c')), 'idea',
  'bài mới vào cột Ý tưởng');
select throws_ok($$ insert into public.content_items (showroom_id, title, channel, format)
                    values ('4a000000-0000-4000-8000-000000000004', 'x', 'tiktok', 'post') $$, '42501', null,
  'không ghi thẳng vào bảng');

-- Luật cột.
select throws_ok(format($$ select public.move_content_item(%L, 'scheduled') $$, (select v from t where k = 'c')),
  'P0001', 'publish_at_required', 'lên lịch phải có giờ đăng');
select lives_ok(format($$ select public.save_content_item('{"id":"%s","title":"Video mới","channel":"tiktok","format":"short_video","publish_at":"2026-10-20T12:00:00Z"}') $$,
  (select v from t where k = 'c')), 'thêm giờ đăng');
select throws_ok(format($$ select public.move_content_item(%L, 'scheduled') $$, (select v from t where k = 'c')),
  'P0001', 'review_checks_required', 'lên lịch phải tick hai mục kiểm nội dung');
select lives_ok(format($$ select public.save_content_item('{"id":"%s","title":"Video mới","channel":"tiktok","format":"short_video","publish_at":"2026-10-20T12:00:00Z","review_checks":{"no_health_claim":true,"customer_consent":true}}') $$,
  (select v from t where k = 'c')), 'tick kiểm nội dung');
select lives_ok(format($$ select public.move_content_item(%L, 'scheduled') $$, (select v from t where k = 'c')),
  'Marketing tự chuyển sang Đã lên lịch (phương án a)');
select throws_ok(format($$ select public.move_content_item(%L, 'published') $$, (select v from t where k = 'c')),
  'P0001', 'post_url_required', 'đã đăng phải có link bài');
select throws_ok(format($$ select public.move_content_item(%L, 'published', null, 'http://x') $$, (select v from t where k = 'c')),
  '23514', null, 'link bài phải là https');
select lives_ok(format($$ select public.move_content_item(%L, 'published', null, 'https://www.tiktok.com/@dv/video/1') $$,
  (select v from t where k = 'c')), 'chuyển sang Đã đăng với link');
select ok((select published_at is not null from public.content_items where id = (select v::uuid from t where k = 'c')),
  'ghi thời điểm đăng');
select set_config('role', 'postgres', true);
select ok(exists (select 1 from public.audit_logs where action = 'content.move' and entity_id = (select v from t where k = 'c')),
  'ghi nhật ký chuyển cột');
select pg_temp.login('11111111-1111-4111-8111-000000000005');

-- Thứ tự trong cột: đặt trước một thẻ khác.
select public.move_content_item((select v::uuid from t where k = 'c'), 'idea');
insert into t select 'c2', public.save_content_item('{"title":"Bài 2","channel":"facebook","format":"post"}')::text;
select public.move_content_item((select v::uuid from t where k = 'c2'), 'idea', (select v::uuid from t where k = 'c'));
select ok((select position from public.content_items where id = (select v::uuid from t where k = 'c2'))
          < (select position from public.content_items where id = (select v::uuid from t where k = 'c')),
  'kéo lên trước một thẻ');

select public.delete_content_item((select v::uuid from t where k = 'c2'));
select is((select count(*)::int from public.content_items where id = (select v::uuid from t where k = 'c2')), 0,
  'xóa thì không còn hiện');

-- Quyền.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select ok((select count(*) from public.content_items) > 0, 'sale admin xem được');
select throws_ok($$ select public.save_content_item('{"title":"x","channel":"tiktok","format":"post"}') $$, '42501', null,
  'sale admin không thêm được');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.content_items), 0, 'telesale không thấy lịch nội dung');

select * from finish();
rollback;
