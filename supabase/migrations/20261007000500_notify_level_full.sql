-- Thêm mức tin "Đầy đủ": tin Telegram kèm tóm tắt hồ sơ (nguồn, ngân sách, dịp, tỉnh người nhận, khung gọi,
-- số lần đã liên hệ, thông tin còn thiếu) để nhân viên nắm tình huống ngay trên điện thoại.
-- Vẫn không có số điện thoại đầy đủ, địa chỉ chi tiết hay nội dung tin của khách (CLAUDE.md mục 5, 12).

alter table public.notification_prefs drop constraint notification_prefs_level_check;
alter table public.notification_prefs
  add constraint notification_prefs_level_check check (level in ('short', 'detail', 'full'));
