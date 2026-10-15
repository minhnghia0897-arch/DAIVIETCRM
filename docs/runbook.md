# Sổ vận hành

Các việc vận hành thường gặp trên bản thật (Vercel `daiviet_crm_q4`, Supabase NGHIA). Mục nào chưa có ở đây thì xem
migration và `docs/integrations/` tương ứng.

## Thêm người dùng, đặt lại mật khẩu

Chỉ Owner (`settings.users`) làm được, ở **Cài đặt → Người dùng**. CRM không gửi email: chưa có SMTP riêng thì Supabase
chỉ gửi thư cho thành viên nhóm dự án Supabase, nên lời mời đi bằng link Owner tự gửi.

1. Ở "Mời người dùng", nhập họ tên, email đăng nhập và chọn vị trí (vai trò). Dòng gợi ý dưới ô cho biết vai trò đó làm
   gì. Bấm **Tạo link mời**.
2. CRM tạo tài khoản đúng vai trò và hiện một link. Bấm **Sao chép link** rồi gửi **riêng** cho người được mời qua Zalo
   hoặc Telegram. Không đăng vào nhóm chung: ai mở link trước sẽ vào được tài khoản đó.
3. Người được mời mở link, đặt mật khẩu (ít nhất 10 ký tự) và vào thẳng CRM. Lần sau đăng nhập bằng email và mật khẩu đó.
4. Link chỉ dùng một lần và hết hạn sau khoảng 1 giờ (thời hạn mã email của Supabase Auth). Hết hạn hoặc làm mất thì bấm
   **Tạo link vào CRM** ở dòng của người đó. Dòng ghi "Chưa vào CRM" khi người đó chưa đăng nhập lần nào.
5. Quên mật khẩu: cũng bấm **Tạo link vào CRM**. Người đã vào CRM rồi thì link mở ra màn đặt mật khẩu mới.
6. Sau khi người mới vào: telesale xếp vào ca ở **Cài đặt → Ca trực** (có ca và bật Trực mới được chia lead), đặt chỉ
   tiêu ở **Đội ngũ → Chỉ tiêu**; cần quyền khác vai trò thì bấm **Chỉnh** ở dòng của họ.

Mỗi lần mời, tạo link đều có trong Nhật ký kiểm toán; bản thân link không được lưu ở đâu. Khi đã cấu hình SMTP riêng
(câu hỏi mở số 2 trong `CLAUDE.md`), có thể làm thêm nút gửi lời mời qua email.

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
