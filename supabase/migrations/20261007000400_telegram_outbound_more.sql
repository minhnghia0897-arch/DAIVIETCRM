-- Thêm mốc quét cho các loại tin mới của việc nền đẩy tin Telegram:
--   * kết quả duyệt (đề xuất của tôi được duyệt hay bị từ chối) — mốc theo approvals.decided_at
--   * đấu nối bị lỗi — mốc theo integrations.last_error_at
-- Lead quá hạn gọi không cần mốc: mỗi lead chỉ báo một lần cho mỗi người, nhận ra qua telegram_messages.

alter table public.telegram_outbound_state
  add column last_decision_at timestamptz not null default now(),
  add column last_integration_error_at timestamptz not null default now();
