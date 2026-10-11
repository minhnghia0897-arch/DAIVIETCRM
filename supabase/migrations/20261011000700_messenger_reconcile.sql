-- Đọc lại tin Messenger bị lỡ (CLAUDE.md 10.1 điều 8, docs/integrations/meta_messenger.md).
--
-- Webhook có thể lỡ: Meta chỉ gửi lại trong thời gian ngắn, nhân viên trả lời thẳng trên hộp thư Page mà bản sao tin
-- không về. pg_cron mỗi 2 phút gọi route /api/cron/messenger-reconcile của CRM (qua pg_net); route đọc các hội thoại
-- vừa cập nhật bằng Graph API và đưa tin CRM chưa có vào đúng đường của webhook (webhook_events rồi
-- process_messenger_event).
--
-- Không cần ai chép khóa: migration tự sinh mã gọi (Vault: cron_invoke_token); route hỏi lại database qua
-- cron_token_ok. Địa chỉ CRM của từng môi trường đặt trong Vault với tên app_base_url (chưa đặt thì việc này im lặng
-- không chạy).

-- ---------------------------------------------------------------------------
-- Con trỏ đối soát của từng đấu nối
-- ---------------------------------------------------------------------------

create table public.integration_sync_state (
  showroom_id uuid not null references public.showrooms (id),
  key text not null,
  -- Mốc bắt đầu, đặt ở lượt đầu và giữ nguyên (kết nối lại không đổi): không nhận dữ liệu trước mốc này, để không kéo
  -- lịch sử trước khi có CRM vào hội thoại.
  start_at timestamptz,
  -- Lượt đọc lại tốt gần nhất đã xét hết dữ liệu tới thời điểm này.
  cursor_at timestamptz,
  last_run_at timestamptz,
  -- Chỉ số đếm và câu lỗi ngắn, không có nội dung tin hay PSID.
  last_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (showroom_id, key)
);

create trigger integration_sync_state_updated_at before update on public.integration_sync_state
  for each row execute function public.set_updated_at();

-- Chỉ việc nền (service_role) đụng tới bảng này; không có policy nào cho người dùng.
alter table public.integration_sync_state enable row level security;
revoke all on public.integration_sync_state from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Mã pg_cron dùng khi gọi /api/cron/* của CRM
-- ---------------------------------------------------------------------------

do $do$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_invoke_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'cron_invoke_token',
      'Mã pg_cron gửi kèm khi gọi /api/cron/* của CRM; route hỏi lại bằng public.cron_token_ok');
  end if;
end
$do$;

create or replace function public.cron_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(length(p_token) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'cron_invoke_token' and decrypted_secret = p_token
  ), false);
$fn$;

revoke all on function public.cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.cron_token_ok(text) to service_role;

-- ---------------------------------------------------------------------------
-- Lịch chạy
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_messenger_reconcile()
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
    select 1 from public.integrations where key = 'meta_messenger' and status = 'connected' and enabled
  ) then
    return;
  end if;
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'cron_invoke_token';
  if v_base is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/api/cron/messenger-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$fn$;

revoke all on function public.dispatch_messenger_reconcile() from public, anon, authenticated;

select cron.schedule('messenger-reconcile', '*/2 * * * *', 'select public.dispatch_messenger_reconcile()');

-- HẾT FILE
