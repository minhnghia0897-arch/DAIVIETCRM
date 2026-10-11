-- Kiểm thử tối ưu chi phí (supabase/migrations/20261011000100_realtime_cleanup.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages'),
  'tin nhắn phát qua Realtime');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications'),
  'thông báo phát qua Realtime');

insert into public.webhook_events (provider, external_id, signature_valid, payload, status, received_at) values
  ('meta_messenger', 'old-processed', true, '{}', 'processed', now() - interval '31 days'),
  ('meta_messenger', 'new-processed', true, '{}', 'processed', now() - interval '2 days'),
  ('meta_messenger', 'old-failed', true, '{}', 'failed', now() - interval '45 days'),
  ('meta_messenger', 'old-received', true, '{}', 'received', now() - interval '60 days');
select is(public.purge_webhook_events(), 1, 'chỉ xóa bản thô đã xử lý quá 30 ngày');
select ok(exists (select 1 from public.webhook_events where external_id = 'old-failed'), 'bản lỗi giữ tới 90 ngày');
select ok(exists (select 1 from public.webhook_events where external_id = 'old-received'),
  'tin chưa xử lý không bao giờ bị xóa');

select * from finish();
rollback;
