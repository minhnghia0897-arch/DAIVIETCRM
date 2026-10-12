# Sổ vận hành

Các việc vận hành thường gặp trên bản thật (Vercel `daiviet_crm_q4`, Supabase NGHIA). Mục nào chưa có ở đây thì xem
migration và `docs/integrations/` tương ứng.

## Giữ máy chủ không ngủ trong giờ làm

- **Vì sao:** Vercel tắt máy chủ vẽ trang sau một lúc không có ai dùng; lần mở kế tiếp phải chờ máy chủ khởi động
  lại. Owner chốt 12/10/2026 giữ máy chủ thức trong giờ làm để mở CRM lần đầu trong ngày không phải chờ.
- **Cách chạy:** lịch `keep-app-warm` trong Supabase (migration `20261012000500_keep_warm.sql`) gọi trang `/warm`
  5 phút một lần, từ 7:00 tới 21:59 giờ VN. Trang `/warm` (`app/warm/page.tsx`) rất nhẹ, không đọc database, không
  cần đăng nhập. Địa chỉ CRM lấy từ Vault (`app_base_url`); chưa đặt thì lịch không gọi gì.
- **Chi phí:** khoảng 180 lượt gọi mỗi ngày, nằm trong hạn mức miễn phí của Vercel và Supabase.
- **Xem lịch đã chạy:**

  ```sql
  select d.start_time, d.status, d.return_message
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
  where j.jobname = 'keep-app-warm'
  order by d.start_time desc limit 20;
  ```

- **Tạm tắt / bật lại:** `update cron.job set active = false where jobname = 'keep-app-warm';` (đổi `false` thành
  `true` để bật lại). Đổi giờ chạy: `select cron.alter_job((select jobid from cron.job where jobname = 'keep-app-warm'), schedule := '*/5 0-14 * * *');`
  (giờ trong lịch là UTC, giờ VN trừ 7).
