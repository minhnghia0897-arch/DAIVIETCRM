-- Landing page (supabase/migrations/20261020000100_landing_pages.sql). Chạy: pnpm test:rls
-- Dữ liệu giả: Owner …0001, sale admin …0002 (xem marketing, không sửa), Thảo …0003 (telesale), Lan …0005 (marketing).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- Marketing tạo trang, bật trang, sửa ghế hiện trên landing.
select pg_temp.login('11111111-1111-4111-8111-000000000005');
insert into t select 'page', public.save_landing_page(jsonb_build_object(
  'slug', 'khai-truong-test', 'title', 'Khai trương thử', 'status', 'published',
  'settings', jsonb_build_object('hotline', '0909 111 222')))::text;
select is((select count(*)::int from public.landing_pages where slug = 'khai-truong-test'), 1, 'marketing tạo được trang');
select throws_ok($$ select public.save_landing_page(jsonb_build_object('slug', 'khai-truong-test', 'title', 'Trùng')) $$,
  'P0001', 'slug_taken', 'đường dẫn không trùng trang khác');
select throws_ok($$ select public.save_landing_page(jsonb_build_object('slug', 'Khai Truong', 'title', 'Sai')) $$,
  '22023', null, 'đường dẫn chỉ gồm chữ thường không dấu, số, gạch ngang');
select lives_ok(format($$ select public.save_landing_page(jsonb_build_object('id', %L, 'slug', 'khai-truong-test',
  'title', 'Khai trương thử', 'status', 'published', 'html', '<html><body>Trang riêng</body></html>')) $$,
  (select v from t where k = 'page')), 'tải HTML riêng');
select is((select html from public.landing_pages where slug = 'khai-truong-test'),
  '<html><body>Trang riêng</body></html>', 'HTML đã lưu');
select lives_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'),
  'show_on_landing', true, 'landing_sort', '1', 'landing_badge', 'BÁN CHẠY')) $$, 'marketing bật ghế trên landing');
select is((select p.show_on_landing from public.products p join public.product_variants v on v.product_id = p.id
           where v.sku = 'DC302'), true, 'ghế đã bật');
select throws_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'), 'image_url', 'javascript:alert(1)')) $$,
  '22023', null, 'ảnh phải là link http(s)');
-- Khung xem chi tiết: tối đa 4 ảnh chi tiết, link http(s); thông tin chi tiết riêng cho landing.
select lives_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'),
  'gallery', jsonb_build_array('https://x.test/1.webp', 'https://x.test/2.webp'),
  'landing_detail', 'Con lăn 4D')) $$, 'lưu ảnh chi tiết và thông tin chi tiết');
select is((select cardinality(p.gallery) from public.products p join public.product_variants v on v.product_id = p.id
           where v.sku = 'DC302'), 2, 'đã lưu 2 ảnh chi tiết');
select throws_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'),
  'gallery', jsonb_build_array('https://x.test/1', 'https://x.test/2', 'https://x.test/3', 'https://x.test/4',
                               'https://x.test/5'))) $$,
  '22023', null, 'không quá 4 ảnh chi tiết');
-- Giá công bố: số đồng, hiện gạch ngang trên landing; trống thì xóa; số âm, chữ bị từ chối.
select lives_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'), 'compare_price', '97500000')) $$,
  'lưu giá công bố');
select is((select p.compare_price from public.products p join public.product_variants v on v.product_id = p.id
           where v.sku = 'DC302'), 97500000::bigint, 'giá công bố đã lưu');
select throws_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'), 'compare_price', '-1')) $$,
  '22023', null, 'giá công bố không âm');
select lives_ok($$ select public.save_landing_product(jsonb_build_object(
  'variant_id', (select id from public.product_variants where sku = 'DC302'), 'compare_price', '')) $$,
  'để trống giá công bố');
select is((select p.compare_price from public.products p join public.product_variants v on v.product_id = p.id
           where v.sku = 'DC302'), null::bigint, 'để trống là xóa giá công bố');
select throws_ok($$ insert into public.landing_pages (showroom_id, slug, title)
  values ('4a000000-0000-4000-8000-000000000004', 'ghi-thang', 'Ghi thẳng') $$,
  '42501', null, 'không ghi thẳng vào bảng, chỉ qua hàm');

-- Sale admin xem được trang, không sửa được; telesale không thấy.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*)::int from public.landing_pages where slug = 'khai-truong-test'), 1, 'sale admin xem được trang');
select throws_ok($$ select public.save_landing_page(jsonb_build_object('slug', 'trang-khac', 'title', 'Khác')) $$,
  '42501', null, 'sale admin không tạo được trang');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.landing_pages), 0, 'telesale không thấy trang');
select throws_ok($$ select count(*) from public.landing_lead_log $$, '42501', null, 'nhật ký gửi form chỉ máy chủ đọc');

-- Form landing (máy chủ CRM): lead nguồn landing_page; khách quay lại tích đồng ý thì vẫn ghi đồng ý.
select pg_temp.logout();
insert into t select 'lead', public.ingest_lead(jsonb_build_object(
  'showroom_id', '4a000000-0000-4000-8000-000000000004', 'full_name', 'Khách landing', 'country', 'VN',
  'source', 'landing_page', 'source_key', 'landing_page', 'source_detail', jsonb_build_object('landing', 'khai-truong-test'),
  'note', 'Mẫu quan tâm: DC302',
  'phone', jsonb_build_object('raw', '0912 000 111', 'e164', '+84912000111', 'masked', '091•••111', 'valid', true)))
  ->> 'lead_id';
select is((select source from public.leads where id = (select v::uuid from t where k = 'lead')), 'landing_page',
  'lead nguồn landing_page');
select is((select actor_type from public.events where lead_id = (select v::uuid from t where k = 'lead')
           and type = 'note'), 'customer', 'ghi chú khách tự gõ ghi là của khách');
select public.ingest_lead(jsonb_build_object(
  'showroom_id', '4a000000-0000-4000-8000-000000000004', 'full_name', 'Khách landing', 'country', 'VN',
  'source', 'landing_page', 'source_key', 'landing_page', 'marketing_consent', true,
  'phone', jsonb_build_object('raw', '0912 000 111', 'e164', '+84912000111', 'masked', '091•••111', 'valid', true)));
select is((select count(*)::int from public.consents c join public.leads l on l.contact_id = c.contact_id
           where l.id = (select v::uuid from t where k = 'lead') and c.purpose = 'marketing' and c.granted), 1,
  'khách quay lại tích đồng ý: đồng ý được ghi dù gắn vào lead cũ');

select * from finish();
rollback;
