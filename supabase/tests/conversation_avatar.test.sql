-- Ảnh đại diện khách trên hội thoại (supabase/migrations/20261012000100_conversation_avatar.sql): chỉ nhận link https.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.conversations (showroom_id, channel, page_id, external_user_id, display_name)
values ('4a000000-0000-4000-8000-000000000004', 'messenger', 'p-thu', '9988776655', 'Khách thử ảnh');

select lives_ok(
  $$update public.conversations set avatar_url = 'https://platform-lookaside.fbsbx.com/p.jpg', avatar_checked_at = now()
    where external_user_id = '9988776655'$$,
  'link https thì lưu được');
select throws_ok(
  $$update public.conversations set avatar_url = 'http://x.test/p.jpg' where external_user_id = '9988776655'$$,
  '23514', null, 'link không phải https bị từ chối');
select throws_ok(
  $$update public.conversations set avatar_url = 'javascript:alert(1)' where external_user_id = '9988776655'$$,
  '23514', null, 'link lạ bị từ chối');

select * from finish();
rollback;
