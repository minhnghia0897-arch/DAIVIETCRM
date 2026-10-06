-- Nối luồng Telegram vào CRM thật (CLAUDE.md mục 3 "Hàng đợi, việc nền", 10.3 telegram_bot):
--   * Giờ im lặng có công tắc riêng, để tắt rồi bật lại vẫn giữ nguyên khung giờ người dùng đã chọn.
--   * Việc đẩy tin chuyển từ vòng quét trong script sang Edge Function chạy theo lịch pg_cron, nên CRM tự gửi tin
--     kể cả khi không ai mở máy chạy script. Con trỏ quét lưu ở database thay vì trong bộ nhớ tiến trình.

-- ---------------------------------------------------------------------------
-- Giờ im lặng: tách công tắc khỏi khung giờ
-- ---------------------------------------------------------------------------

alter table public.notification_prefs add column quiet_on boolean not null default true;

-- Dữ liệu cũ: không có khung giờ nghĩa là đang tắt; giữ khung mặc định để bật lại là dùng được ngay.
update public.notification_prefs
set quiet_on = false, quiet_from = '22:00', quiet_to = '07:00'
where quiet_from is null or quiet_to is null;

alter table public.notification_prefs
  alter column quiet_from set default '22:00',
  alter column quiet_to set default '07:00';

-- ---------------------------------------------------------------------------
-- Con trỏ quét của việc đẩy tin nền
-- ---------------------------------------------------------------------------

create table public.telegram_outbound_state (
  showroom_id uuid primary key references public.showrooms (id),
  last_event_id bigint not null default 0,
  last_task_check timestamptz not null default now(),
  last_approval_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger telegram_outbound_state_updated_at before update on public.telegram_outbound_state
  for each row execute function public.set_updated_at();

-- Chỉ việc nền (service_role) đụng tới bảng này; không có policy nào cho người dùng.
alter table public.telegram_outbound_state enable row level security;
revoke all on public.telegram_outbound_state from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Lịch chạy việc đẩy tin
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Địa chỉ Edge Function và khóa gọi nằm trong Vault, khác nhau theo môi trường, nên không viết vào migration.
-- Chưa đặt hai khóa này thì hàm im lặng không làm gì, cron không báo lỗi mỗi phút.
create or replace function public.dispatch_telegram_outbound()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_key text;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'edge_functions_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_functions_service_key';
  if v_base is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/telegram-outbound',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.dispatch_telegram_outbound() from public, anon, authenticated;

select cron.schedule('telegram-outbound', '* * * * *', 'select public.dispatch_telegram_outbound()');
