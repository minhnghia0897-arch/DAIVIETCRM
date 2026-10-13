-- Đẩy tin Telegram chạy qua CRM trên Vercel (Owner 13/10/2026: thử luồng Telegram thật trên điện thoại).
--
-- Trước đây pg_cron gọi Edge Function telegram-outbound bằng hai khóa Vault (edge_functions_base_url,
-- edge_functions_service_key) mà bản thật chưa có, nên lịch chạy mỗi phút nhưng không gửi gì. Từ nay gọi route
-- /api/cron/telegram-outbound của CRM bằng đúng cách Messenger, Zalo, Trợ lý AI đang dùng: địa chỉ CRM trong Vault
-- (app_base_url) và mã tự sinh cron_invoke_token (migration 20261011000700), route kiểm lại qua cron_token_ok.
-- Chỉ gọi khi bot đã kết nối (Owner bấm Lưu khóa ở Cài đặt, Tích hợp và CRM kiểm được bot), để không tốn lượt gọi.

create or replace function public.dispatch_telegram_outbound()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_base text;
  v_key text;
begin
  if not exists (
    select 1 from public.integrations where key = 'telegram_bot' and status = 'connected' and enabled
  ) then
    return;
  end if;
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'cron_invoke_token';
  if v_base is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/api/cron/telegram-outbound',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$fn$;

revoke all on function public.dispatch_telegram_outbound() from public, anon, authenticated;

-- HẾT FILE
