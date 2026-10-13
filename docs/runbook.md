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

## Phân quyền chạy nhanh (RLS)

- **Vì sao:** Owner báo CRM tải chậm, nhất là Hội thoại (12/10/2026). Đo trên máy dev: mỗi lần gọi `has_perm`,
  `effective_uid`, `current_showroom_id` mất khoảng 1 ms, và chính sách RLS cũ gọi chúng cho từng dòng (đọc 85 hội
  thoại mất 160 ms). Migration `20261012000600_rls_fast.sql` viết lại mọi chính sách để phần "người này có quyền gì"
  tính một lần cho cả câu lệnh: còn 2,4 ms. Ai được xem gì không đổi (toàn bộ kiểm thử RLS chạy lại đạt).
- **Viết chính sách mới:** luôn bọc hàm kiểm quyền trong `(select ...)`, ví dụ
  `showroom_id = (select public.current_showroom_id()) and (select public.has_perm('lead.view_all'))`. Kiểm theo
  dòng (xem được lead, đơn, khách, hội thoại) dùng bản `private.*_ctx` và truyền sẵn quyền, như các chính sách trong
  migration trên. Kiểm thử `supabase/tests/rls_fast.test.sql` báo nếu có chính sách viết theo cách cũ.
- **Kiểm tra trên database thật:** chính sách nào còn gọi hàm kiểm quyền theo dòng:

  ```sql
  select tablename, policyname from pg_policies
  where schemaname = 'public'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          '\( SELECT (public\.)?(has_perm\(''[a-z_.]+''::text\)|current_showroom_id\(\)|effective_uid\(\)|auth\.uid\(\)) AS [a-z_]+\)', '', 'g')
        ~ '(has_perm\(''|current_showroom_id\(\)|effective_uid\(\)|auth\.uid\(\)|can_view_lead\(|can_view_order\(|can_view_contact\(|can_see_conversation\()';
  ```

  Kết quả rỗng là đúng.
