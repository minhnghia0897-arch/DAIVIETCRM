# Schema giai đoạn 1, tuần 1: bản để duyệt

Tài liệu này mô tả bằng lời những gì 5 migration trong `supabase/migrations/` tạo ra. Mọi bảng đều có `showroom_id` và bật RLS. Hiện schema mới chạy trên Supabase local với dữ liệu giả. **Chưa đưa lên Supabase thật cho tới khi anh duyệt.**

## 1. Các nhóm bảng

| Nhóm | Bảng | Dùng để |
|---|---|---|
| Nền tảng | `showrooms`, `markets` | Showroom Q4; thị trường VN, Hàn Quốc với múi giờ, khung gọi tốt, kênh được phép. Thêm thị trường không sửa code |
| Người dùng, quyền | `profiles`, `roles`, `permissions`, `role_permissions`, `user_permission_overrides` | Vai trò Owner, Sale admin, Telesale; 64 quyền; quyền riêng từng người (cấp riêng, thu riêng) |
| Kiểm toán | `audit_logs` | Mọi thay đổi quyền, khóa người dùng, xem số, xem như. Chỉ thêm, không sửa, không xóa |
| CDP: khách | `contacts`, `contact_identities`, `households`, `consents`, `important_dates`, `customer_lifecycle` | Một khách nhiều số, nhiều kênh; hộ gia đình; đồng ý theo mục đích và kênh; ngày quan trọng; giai đoạn vòng đời |
| CDP: sự kiện | `events` (và view `activities`) | Dòng thời gian thống nhất của khách. Chỉ thêm |
| CRM: lead | `leads` + 5 danh mục (`lead_sources`, `occasions`, `call_outcomes`, `lost_reasons`, `budget_ranges`) | Lead với người đặt, người nhận, giữ bất ngờ, giai đoạn, SLA, chờ khung gọi |
| Việc | `tasks`, `task_rules`, `approvals`, `notifications` | Việc cần làm, luật sinh việc, hàng chờ duyệt dùng chung, chuông thông báo |
| Đấu nối | `integrations`, `webhook_events`, `jobs` | Trạng thái từng đấu nối, hộp nhận webhook thô, hàng đợi việc nền |
| Xem như | `view_as_sessions` | Phiên Owner xem như người khác, 30 phút |

Bảng bán hàng (sản phẩm, kho, đơn, thanh toán) làm ở tuần 5–6, bảng nhân sự và chỉ số ở tuần 7. Hiện các màn hình đó chạy bằng dữ liệu mô phỏng trong `lib/demo/`.

## 2. Luật được chặn ở database (không lách được qua API)

1. **Quyền hiệu lực** = quyền vai trò + cấp riêng − thu riêng. Người bị khóa không có quyền nào.
2. **Quyền chỉ Owner** (bật tắt quyền, mời và khóa người dùng, bàn giao nghỉ việc) không cấp được cho vai trò khác, cũng không cấp riêng được.
3. **Owner luôn toàn quyền**: không xóa được quyền khỏi vai trò Owner, trừ "Được phân lead tự động".
4. **Telesale chỉ thấy lead giao cho mình**, và chỉ thấy khách là người đặt hoặc người nhận của các lead đó.
5. **Số điện thoại đầy đủ** chỉ người có quyền "Xem đầy đủ số" đọc được. Telesale lấy số qua một hàm riêng, chỉ cho lead đang giao cho mình, mỗi lần đều ghi kiểm toán. **Giữ bất ngờ** thì không lấy được số người nhận.
6. **Giai đoạn lead** từ Báo giá trở đi không kéo tay được; chỉ báo giá và đơn hàng đặt.
7. **Giao lead, giao việc** cho người khác cần quyền "Giao, chuyển lead".
8. **Khóa người dùng**: lead đang mở về hàng "Chưa phân", việc về hàng chung, sale admin được báo, có kiểm toán.
9. **Duyệt**: người đề xuất không tự duyệt được đề xuất của mình (trừ Owner, có ghi nhận riêng).
10. **Xem như**: Owner thấy đúng dữ liệu người được xem; mọi thao tác ghi bị chặn.

## 3. Kiểm thử

44 kiểm thử chạy trên database (`supabase/tests/`), cùng 17 bài e2e chạy trên trình duyệt (laptop và điện thoại). Cả hai chạy lại tự động trên GitHub mỗi lần push.

## 4. Anh cần quyết

- [ ] Đồng ý schema trên để đưa lên Supabase thật khi có project.
- [ ] Các đề xuất còn treo trong `docs/open-questions.md` (phạm vi xem của sale admin, quyền cho mục Cài đặt Bán hàng, giữ hàng tạm khi xác nhận đơn…).
