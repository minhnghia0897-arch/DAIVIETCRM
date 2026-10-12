-- Ảnh đại diện khách theo kênh, hiện ở Hội thoại (docs/integrations/meta_messenger.md, Ảnh đại diện).
--
-- Messenger: profile_pic của User Profile API. Link do Meta cấp và hết hạn sau một thời gian, nên việc đọc lại tin
-- định kỳ (/api/cron/messenger-reconcile) làm mới các hội thoại chưa kiểm hoặc kiểm đã cũ (avatar_checked_at).
-- Chỉ nhận link https; không lưu bản sao ảnh.

alter table public.conversations
  add column avatar_url text check (avatar_url is null or avatar_url like 'https://%'),
  add column avatar_checked_at timestamptz;
