-- Kiểm thử thẻ khách và trạng thái hội thoại (supabase/migrations/20261011000300_inbox_tags_status.sql).
-- Dữ liệu giả: Thảo …0003 giữ lead …0001 của khách Thu …0001; An …0004 giữ lead của Lan …0003; sale admin …0002.
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

create temp table t (k text primary key, v text);
grant all on t to authenticated;

insert into public.conversations (id, showroom_id, channel, page_id, external_user_id, contact_id, lead_id)
values ('55555555-5555-4555-8555-000000000001', '4a000000-0000-4000-8000-000000000004', 'messenger', 'p1', 'psid-1',
        '22222222-2222-4222-8222-000000000001', '33333333-3333-4333-8333-000000000001');

select pg_temp.login('11111111-1111-4111-8111-000000000003');
select ok((select count(*) from public.tags) >= 7, 'thấy bộ thẻ gợi ý');
insert into t select 'tag', id::text from public.tags where label = 'Hỏi giá';

-- Gắn, gỡ thẻ.
select is(public.toggle_contact_tag('22222222-2222-4222-8222-000000000001', (select v::uuid from t where k = 'tag')),
  true, 'gắn thẻ cho khách của lead mình giữ');
select is((select count(*)::int from public.contact_tags where contact_id = '22222222-2222-4222-8222-000000000001'), 1,
  'thẻ đã gắn');
select is(public.toggle_contact_tag('22222222-2222-4222-8222-000000000001', (select v::uuid from t where k = 'tag')),
  false, 'bấm lần nữa thì gỡ');
select throws_ok(format($$ select public.toggle_contact_tag('22222222-2222-4222-8222-000000000003', %L) $$,
  (select v from t where k = 'tag')), 'P0002', null, 'không gắn thẻ cho khách của người khác');
select throws_ok($$ insert into public.contact_tags (contact_id, tag_id, showroom_id)
                    select '22222222-2222-4222-8222-000000000001', id, showroom_id from public.tags limit 1 $$,
  '42501', null, 'không ghi thẳng vào bảng thẻ khách');

-- Tạo thẻ mới, dùng lại thẻ cùng tên.
insert into t select 'new', public.create_contact_tag('22222222-2222-4222-8222-000000000001', 'Cần gọi tối')::text;
select ok(exists (select 1 from public.contact_tags where tag_id = (select v::uuid from t where k = 'new')),
  'thẻ mới được tạo và gắn');
select is(public.create_contact_tag('22222222-2222-4222-8222-000000000001', '  cần GỌI tối '),
  (select v::uuid from t where k = 'new'), 'cùng tên (khác hoa thường, khoảng trắng) thì dùng lại thẻ cũ');
select throws_ok($$ select public.create_contact_tag('22222222-2222-4222-8222-000000000001', '   ') $$, '22023', null,
  'tên thẻ trống bị từ chối');
select throws_ok(format($$ select public.delete_tag(%L) $$, (select v from t where k = 'new')), '42501', null,
  'telesale không xóa thẻ khỏi danh mục');

-- Trạng thái hội thoại.
select lives_ok($$ select public.set_conversation_done('55555555-5555-4555-8555-000000000001', true) $$,
  'người giữ lead đánh dấu xong');
select is((select status from public.conversations where id = '55555555-5555-4555-8555-000000000001'), 'done',
  'hội thoại đã xong');

select pg_temp.login('11111111-1111-4111-8111-000000000004');
select throws_ok($$ select public.set_conversation_done('55555555-5555-4555-8555-000000000001', false) $$, 'P0002',
  null, 'An không đổi được hội thoại của Thảo');
select is((select count(*)::int from public.contact_tags where contact_id = '22222222-2222-4222-8222-000000000001'), 0,
  'An không thấy thẻ khách của Thảo');

-- Khách nhắn lại thì hội thoại tự mở.
select set_config('role', 'postgres', true);
insert into public.messages (showroom_id, conversation_id, direction, external_message_id, text)
values ('4a000000-0000-4000-8000-000000000004', '55555555-5555-4555-8555-000000000001', 'in', 'mid-t1', 'alo');
select is((select status from public.conversations where id = '55555555-5555-4555-8555-000000000001'), 'open',
  'tin đến mở lại hội thoại');

-- Sale admin xóa thẻ khỏi danh mục.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select lives_ok(format($$ select public.delete_tag(%L) $$, (select v from t where k = 'new')),
  'sale admin (quản lý danh mục) xóa thẻ');

select * from finish();
rollback;
