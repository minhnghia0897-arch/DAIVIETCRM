-- Giữ máy chủ Vercel không ngủ trong giờ làm (Owner chốt 12/10/2026: mở CRM lần đầu trong ngày nhanh hơn).
--
-- Vercel tắt máy chủ sau một lúc không có người dùng; lần mở kế tiếp phải chờ khởi động lại. Lịch này gọi trang
-- /warm (app/warm/page.tsx: trang rất nhẹ, không đọc database, cùng cấu hình với các trang thường) 5 phút một lần từ
-- 7:00 tới 21:59 giờ VN (0:00 tới 14:59 UTC). Địa chỉ CRM lấy từ Vault (app_base_url, cùng chỗ với lịch đọc lại tin
-- Messenger); môi trường chưa đặt địa chỉ (máy dev, CI) thì không gọi gì. Không có hàm mới, không đụng dữ liệu khách.

select cron.schedule(
  'keep-app-warm',
  '*/5 0-14 * * *',
  $cmd$
    select net.http_get(url := rtrim(s.decrypted_secret, '/') || '/warm', timeout_milliseconds := 10000)
    from vault.decrypted_secrets s
    where s.name = 'app_base_url'
  $cmd$
);

-- HẾT FILE
