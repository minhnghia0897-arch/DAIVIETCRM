-- Tối ưu chi phí (11/10/2026): màn Hội thoại và chuông thông báo nghe thay đổi qua Supabase Realtime thay cho hỏi lại
-- server định kỳ; hộp nhận thô webhook được dọn sau khi đã xử lý.
--
-- Realtime (postgres_changes) tuân theo RLS: mỗi người chỉ nhận thay đổi của hội thoại, tin nhắn, thông báo mình được
-- xem (conversations_select, messages_select, notifications_select).

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['conversations', 'messages', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Hộp nhận thô (webhook_events) chỉ cần để chống trùng và tra lỗi: tin đã xử lý nằm ở messages, leads, events.
-- Xóa bản thô đã xử lý hoặc bỏ qua sau 30 ngày, bản lỗi sau 90 ngày (còn thời gian tra cứu). Trả về số dòng đã xóa.
create or replace function public.purge_webhook_events()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  delete from public.webhook_events
  where (status in ('processed', 'ignored') and received_at < now() - interval '30 days')
     or (status = 'failed' and received_at < now() - interval '90 days');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.purge_webhook_events() from public, anon, authenticated;

-- 03:15 giờ VN mỗi ngày (20:15 UTC).
select cron.schedule('purge-webhook-events', '15 20 * * *', 'select public.purge_webhook_events()');
