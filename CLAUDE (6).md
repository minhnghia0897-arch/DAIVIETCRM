# CLAUDE.md — Đại Việt CRM/CDP, showroom Quận 4

File này là chỉ dẫn gốc cho Claude Code khi làm việc trong repo. Đọc hết trước khi viết code. Thiết kế giao diện nằm ở `DESIGN.md`; khi hai file mâu thuẫn về giao diện thì `DESIGN.md` thắng, về nghiệp vụ, dữ liệu, bảo mật thì file này thắng.

Bản demo tham chiếu (HTML tĩnh, dữ liệu mô phỏng) đặt tại `docs/reference/daiviet-crm-q4.html`. Dùng nó để hiểu bố cục và luồng, **không** sao chép code của nó vào sản phẩm.

---

## 1. Bối cảnh sản phẩm

- **Doanh nghiệp:** showroom Đại Việt Quận 4, TP.HCM, bán online và offline. Showroom Q4 là mô hình chuẩn để nhân ra các showroom khác, nên mọi bảng dữ liệu đều phải có `showroom_id` ngay từ đầu.
- **Trọng tâm bán hàng hiện tại:** ghế massage. Khách chính là **người Việt đang sống ở Hàn Quốc đặt mua làm quà, giao cho bố mẹ, người thân ở Việt Nam**. Ngoài ra có khách trong nước và khách đến showroom.
- **Hệ quả nghiệp vụ quan trọng nhất:** một giao dịch thường có **hai người khác nhau ở hai quốc gia**: người đặt và trả tiền (số +82, ở Hàn) và người nhận, người dùng (số VN hoặc chưa có số, ở tỉnh). Mô hình dữ liệu phải tách hai vai trò này ngay từ tháng 1.
- **Mô hình bán:** chạy quảng cáo thu lead → telesale gọi chốt; lead cũ được làm nóng lại rồi telesale gọi lại.
- **Hiện trạng:** trước đây showroom làm thủ công hoàn toàn. Đây là bản thí điểm chuẩn hóa công nghệ đầu tiên, nên danh mục, quy trình và ca làm việc đều đang được định nghĩa cùng lúc với phần mềm. Mọi thứ có thể thay đổi phải nằm trong Cài đặt, không viết cứng trong code.
- **Tên miền:** `daivietshowroomq4` (đuôi tên miền chưa chốt, xem mục 16).
- **Người dùng hệ thống trong tháng 1:**
  - **Chủ hệ thống (Owner):** quản lý showroom, toàn quyền, là người duy nhất bật tắt quyền của người khác.
  - **Sale admin:** điều phối lead, giám sát telesale, quản lý danh mục.
  - **Telesale:** gọi và chăm sóc lead được giao.
  - Các vai trò khác (tiếp khách showroom, marketing, editor, KOC và sàn, admin kênh) sẽ thêm sau. Hệ thống phân quyền phải cho phép tạo vai trò mới mà không sửa code.
- **Ngôn ngữ giao diện:** tiếng Việt toàn bộ. Tên biến, bảng, hàm trong code dùng tiếng Anh.

---

## 2. Phạm vi tháng 1

> Từ bản này, **"tháng 1" được hiểu là giai đoạn 1, kéo dài 7 tuần**: 4 tuần đầu cho lead, cuộc gọi, Zalo, phân quyền như cũ; tuần 5 và 6 cho phần bán hàng ở mục 8; tuần 7 cho nhân sự và hiệu suất ở mục 9. Đại Việt không có API nên showroom cần quản lý hàng và đơn ngay trong CRM.

**Mục tiêu tháng 1:** telesale làm việc hoàn toàn trên CRM, bỏ hẳn bảng tính. Lead từ quảng cáo, Zalo và tổng đài tự chảy vào, được phân trong 5 phút, mọi cuộc gọi và tin nhắn nằm trên hồ sơ khách.

### Trong phạm vi

1. Đăng nhập, mời người dùng, phân quyền bật tắt theo vai trò và theo từng người (mục 5).
2. Thu lead từ: Form quảng cáo Facebook, Zalo OA, nhập tay nhanh (khách đến showroom, bình luận live, giới thiệu), nhập file CSV lead cũ.
3. Chuẩn hóa số điện thoại VN và Hàn, chống trùng theo số.
4. Phân lead tự động theo luật (vòng tròn, khung giờ Hàn), đồng hồ SLA 5 phút, cảnh báo quá hạn.
5. Hồ sơ lead: thông tin người đặt, người nhận, dịp tặng, ngân sách, sản phẩm quan tâm; giai đoạn; dòng hoạt động; ghi kết quả cuộc gọi; hẹn gọi lại.
6. Ghi nhận cuộc gọi ở **chế độ gọi ngoài hệ thống** (chưa có tổng đài, mục 10): telesale gọi bằng điện thoại hoặc Zalo, ghi kết quả trên CRM. Dựng sẵn lớp adapter tổng đài và adapter giả lập để khi có số tổng đài chỉ cần cắm vào.
7. Hộp thư Zalo OA: nhận và trả lời tin ngay trên hồ sơ.
8. Danh mục tra cứu: lý do thất bại, nguồn, dịp tặng, kết quả cuộc gọi, ngân sách, với bộ mặc định ở mục 6.
13. **Bán hàng (mục 8):** sản phẩm, SKU, bảng giá; tồn kho nhiều kho với phiếu kho, giữ hàng, serial, kiểm kê; combo; chính sách khuyến mãi, giao lắp, đặt cọc, thanh toán, bảo hành, đổi trả, giới hạn giảm giá; báo giá có link gửi khách; đơn hàng quà tặng hai người; ghi nhận và xác nhận thanh toán; phiếu bảo hành; báo cáo bán hàng cơ bản. Nhập, xuất CSV vì Đại Việt không có API.
14. **Nhân sự và hiệu suất (mục 9):** hồ sơ nhân sự, ca trực và chấm công nhẹ, nghỉ, chỉ tiêu, bộ chỉ số theo vai trò, menu Đội ngũ riêng, kèm cặp, trình bàn giao khi nghỉ việc.
11. Nhập dữ liệu cũ đang làm thủ công (bảng tính, danh bạ) qua file CSV mẫu, có bước xem trước, báo dòng lỗi và dòng trùng.
12. Lịch ca trực cấu hình được (mục 7).
9. Báo cáo cơ bản: lead theo nguồn, tỷ lệ gọi trong 5 phút, tỷ lệ liên hệ được, phễu giai đoạn, hiệu suất từng telesale.
10. Nhật ký kiểm toán (audit log) cho mọi thao tác nhạy cảm.

### Ngoài phạm vi tháng 1 (không tự ý làm)

Các đấu nối ngoài tháng 1 trong mục 10.3 (chỉ khai báo trong sổ đăng ký và hiện "Sắp có" ở Cài đặt, không viết adapter), AI agent và tóm tắt cuộc gọi bằng AI, app giao lắp cho kỹ thuật viên và video bàn giao (giai đoạn 1 cập nhật bước giao tay trên đơn), trả góp, gộp hộ tự động, Kanban cơ hội, báo cáo nâng cao. Chừa sẵn chỗ trong mô hình dữ liệu nhưng không dựng màn hình.

---

## 3. Công nghệ

| Lớp | Lựa chọn |
|---|---|
| Web | Next.js (App Router), TypeScript `strict` |
| UI | Tailwind CSS + shadcn/ui, tùy biến theo token trong `DESIGN.md` |
| Dữ liệu, xác thực, lưu trữ | Supabase: Postgres, Auth, Row Level Security, Storage, Edge Functions, Vault cho secret |
| Hàng đợi, việc nền | Bảng `jobs` trong Postgres + Supabase Cron (pg_cron) gọi Edge Function; không thêm hạ tầng mới trong tháng 1 |
| Triển khai | Vercel (web), Supabase (DB và function) |
| Kiểm tra dữ liệu vào | zod ở mọi biên: form, route handler, webhook |
| Số điện thoại | `libphonenumber-js` |
| Thời gian | `date-fns` + `date-fns-tz`; lưu UTC, hiển thị `Asia/Ho_Chi_Minh`, giờ Hàn `Asia/Seoul` |
| Kiểm thử | Vitest (đơn vị), Playwright (đầu cuối theo vai trò), kiểm thử RLS bằng SQL |

Không thêm thư viện lớn ngoài danh sách khi chưa hỏi.

---

## 4. Mô hình dữ liệu tháng 1

Tất cả bảng nghiệp vụ có: `id uuid pk default gen_random_uuid()`, `showroom_id uuid not null`, `created_at`, `updated_at`, `created_by`. Xóa mềm bằng `deleted_at` cho bảng chứa dữ liệu khách. Tiền lưu `bigint` đơn vị đồng, không dùng số thực.

### Bảng chính

- `showrooms` — id, name, code (`Q4`), timezone.
- `profiles` — gắn với `auth.users`: full_name, role_id, is_active, is_on_duty (đang trực nhận lead), call_extension (máy nhánh tổng đài).
- `households` — hộ gia đình: display_name, province, district, note. Tháng 1 chỉ tạo và gắn tay.
- `contacts` — một con người:
  - full_name, phone_e164 (unique theo showroom, có thể null), phone_raw, country_of_residence (`VN` | `KR` | khác), city
  - zalo_user_id, fb_psid
  - household_id, relation_in_household (con trai, con gái, bố, mẹ…)
  - consent_marketing (bool), consent_at, consent_source
- `leads` — một lần khách có nhu cầu:
  - contact_id (người đặt), recipient_contact_id (người nhận, có thể null)
  - source (enum, mục 6), source_detail jsonb (campaign_id, adset_id, ad_id, form_id, leadgen_id, page_id, zalo_event…)
  - product_interest_id, occasion_id, occasion_date, budget_range, recipient_province
  - stage (enum: `new`, `contacted`, `demo`, `quoted`, `deposit`, `won`, `lost`), lost_reason_id
  - assigned_to, assigned_at, first_contact_at, sla_due_at, next_callback_at
  - score (int, tháng 1 tính bằng luật đơn giản)
- `activities` — dòng thời gian thống nhất: lead_id, contact_id, type (`call`, `zalo_in`, `zalo_out`, `note`, `stage_change`, `assignment`, `callback_set`, `lead_created`, `merge`), payload jsonb, actor_id (null nếu hệ thống).
- `calls` — provider, provider_call_id (unique), direction, from_e164, to_e164, agent_id, started_at, duration_sec, status (`answered`, `missed`, `busy`, `failed`), recording_path (Storage), outcome_id.
- `conversations`, `messages` — channel (`zalo` tháng 1), external_user_id, contact_id, last_inbound_at; messages: direction, external_message_id (unique), text, attachments jsonb, sent_by.
- Danh mục: `lead_sources`, `lost_reasons`, `occasions`, `call_outcomes` (đều có `showroom_id`, `label`, `sort`, `is_active`).
- `assignment_rules` — mode (`round_robin`), kr_call_window (mặc định 19:00–22:30 giờ Hàn), working_hours, sla_minutes (mặc định 5).
- `webhook_events` — hộp nhận thô: provider, external_id, signature_valid, payload jsonb, status (`received`, `processed`, `failed`), error, unique (provider, external_id).
- `integrations` — một dòng cho mỗi đấu nối trong sổ đăng ký; cấu trúc chi tiết ở mục 10.2.
- `jobs` — type, payload, run_at, attempts, status, last_error.
- `audit_logs` — actor_id, action, entity, entity_id, metadata jsonb, ip, at. Không cho sửa, không cho xóa.

### Bảng phân quyền

- `roles` — key, name, is_system.
- `permissions` — key, group, description (seed từ code, mục 5).
- `role_permissions` — role_id, permission_key.
- `user_permission_overrides` — user_id, permission_key, effect (`grant` | `revoke`), set_by, set_at.

Bảng bán hàng (sản phẩm, giá, kho, combo, chính sách, báo giá, đơn, thanh toán, bảo hành) mô tả ở mục 8. Bảng nhân sự và chỉ số (hồ sơ nhân sự, phiên trực, nghỉ, chỉ tiêu, chỉ số theo ngày, kèm cặp) mô tả ở mục 9.

Chừa sẵn (tạo bảng khi cần, không dựng màn hình tháng 1): `opportunities`.

---

## 5. Phân quyền bật tắt

Đây là yêu cầu cốt lõi của chủ hệ thống. Làm đúng nguyên tắc sau.

### Nguyên tắc

1. **Quyền hiệu lực = quyền của vai trò, cộng các quyền được cấp riêng, trừ các quyền bị thu riêng.** Thu riêng luôn thắng cấp riêng.
2. **Chỉ Owner** được thay đổi quyền, vai trò, mời và khóa người dùng. Quyền `settings.permissions` không cấp được cho vai trò khác.
3. **Thực thi ở cơ sở dữ liệu**, không chỉ ở giao diện. Mọi bảng có RLS. Giao diện ẩn nút chỉ để dễ dùng; dữ liệu không có quyền thì server không được gửi xuống trình duyệt.
4. Bật tắt quyền có hiệu lực ở **lần tải trang hoặc lần gọi tiếp theo**, không cần triển khai lại.
5. Mọi thay đổi quyền ghi vào `audit_logs` kèm trạng thái trước và sau.
6. Quyền mới thêm vào code mặc định **tắt** với mọi vai trò trừ Owner.

### Hàm kiểm tra

- SQL: `public.has_perm(perm text) returns boolean`, `security definer`, đọc vai trò và override của `auth.uid()`. Dùng trong mọi policy RLS.
- TypeScript: `can(user, perm)` dùng cho giao diện, lấy danh sách quyền hiệu lực một lần mỗi request (server component) rồi truyền xuống.
- Không viết điều kiện kiểu `if (role === 'telesale')` trong code. Luôn kiểm tra theo quyền.

### Danh sách quyền tháng 1

| Nhóm | Quyền | Ý nghĩa |
|---|---|---|
| Lead | `lead.view_own` | Xem lead được giao cho mình |
| | `lead.view_all` | Xem mọi lead của showroom |
| | `lead.create` | Tạo lead tay |
| | `lead.edit_own` / `lead.edit_all` | Sửa lead của mình / mọi lead |
| | `lead.assign` | Giao, chuyển lead cho người khác |
| | `lead.import` | Nhập lead từ file |
| | `lead.export` | Xuất danh sách khách ra file |
| | `lead.delete` | Xóa mềm lead |
| | `lead.mark_lost` | Đánh dấu thất bại |
| Khách | `contact.phone_reveal` | Xem đầy đủ số điện thoại của mọi khách |
| | `contact.phone_reveal_assigned` | Xem số đầy đủ của khách thuộc lead đang được giao cho mình, để gọi khi chưa có tổng đài |
| | `contact.merge` | Gộp hai hồ sơ trùng |
| | `household.manage` | Tạo hộ, gắn thành viên vào hộ |
| Cuộc gọi | `call.make` | Gọi từ CRM |
| | `call.recording_own` / `call.recording_all` | Nghe ghi âm của mình / của mọi người |
| Tin nhắn | `message.zalo_send` | Gửi tin Zalo OA |
| | `message.view_all` | Xem mọi hội thoại, kể cả không gắn lead của mình |
| Danh mục | `catalog.view` / `catalog.manage` | Xem / sửa danh mục tra cứu (nguồn, dịp tặng, lý do thất bại…) |
| Sản phẩm | `product.view` | Xem sản phẩm, giá bán, tồn khả dụng |
| | `product.manage` | Thêm, sửa sản phẩm, SKU, danh mục sản phẩm |
| | `product.view_cost` | Xem giá vốn, biên lợi nhuận |
| | `price.manage` | Sửa bảng giá |
| Tồn kho | `inventory.view` | Xem tồn kho, sổ kho |
| | `inventory.document` | Lập phiếu nhập, xuất, chuyển kho, kiểm kê |
| | `inventory.post` | Ghi sổ phiếu kho |
| | `inventory.count_approve` | Duyệt chênh lệch kiểm kê |
| Combo | `combo.manage` | Tạo, sửa combo |
| Chính sách | `policy.view` | Xem chính sách đang áp |
| | `policy.manage` | Tạo, sửa, bật tắt chính sách |
| Báo giá, đơn | `quote.create` | Tạo, gửi báo giá |
| | `order.view_own` / `order.view_all` | Xem đơn của mình / mọi đơn |
| | `order.create` | Tạo đơn |
| | `order.edit_own` / `order.edit_all` | Sửa đơn của mình / mọi đơn |
| | `order.discount_approve` | Duyệt đơn có mức giảm vượt giới hạn |
| | `order.cancel` | Hủy đơn |
| | `order.allow_backorder` | Cho đặt trước khi chưa đủ hàng |
| | `order.export` | Xuất danh sách đơn ra file |
| Thanh toán | `payment.record` | Ghi nhận khoản khách trả, kèm chứng từ |
| | `payment.confirm` | Xác nhận tiền đã về |
| | `payment.refund` | Ghi hoàn tiền |
| Đội ngũ | `staff.view` | Xem danh sách và hồ sơ làm việc của nhân sự |
| | `staff.manage` | Sửa hồ sơ nhân sự, xếp ca, duyệt nghỉ |
| | `staff.offboard` | Chạy trình bàn giao khi nghỉ việc |
| | `target.manage` | Đặt chỉ tiêu |
| | `kpi.own` | Xem chỉ số của mình |
| | `kpi.team` | Xem chỉ số của từng người trong đội |
| | `kpi.leaderboard` | Xem bảng xếp hạng có tên người khác |
| | `attendance.view_team` | Xem giờ trực, nghỉ của đội |
| | `coaching.manage` | Viết, đọc ghi chú kèm cặp |
| Giao, bảo hành | `delivery.update` | Cập nhật bước giao lắp |
| | `warranty.manage` | Tạo, sửa phiếu bảo hành |
| Báo cáo | `report.own` / `report.team` | Báo cáo của mình / cả đội |
| Cài đặt | `settings.assignment` | Sửa luật phân lead |
| | `settings.integrations` | Kết nối Meta, Zalo, tổng đài |
| | `settings.users` | Mời, khóa người dùng (chỉ Owner) |
| | `settings.permissions` | Bật tắt quyền (chỉ Owner, không cấp được) |
| Kiểm toán | `audit.view` | Xem nhật ký kiểm toán |

### Mặc định theo vai trò

| Quyền | Owner | Sale admin | Telesale |
|---|---|---|---|
| lead.view_own | ✓ | ✓ | ✓ |
| lead.view_all | ✓ | ✓ | |
| lead.create | ✓ | ✓ | ✓ |
| lead.edit_own | ✓ | ✓ | ✓ |
| lead.edit_all | ✓ | ✓ | |
| lead.assign | ✓ | ✓ | |
| lead.import | ✓ | ✓ | |
| lead.export | ✓ | | |
| lead.delete | ✓ | | |
| lead.mark_lost | ✓ | ✓ | ✓ |
| contact.phone_reveal | ✓ | ✓ | |
| contact.phone_reveal_assigned | ✓ | ✓ | ✓ khi chưa có tổng đài |
| contact.merge | ✓ | ✓ | |
| household.manage | ✓ | ✓ | ✓ |
| call.make | ✓ | ✓ | ✓ |
| call.recording_own | ✓ | ✓ | ✓ |
| call.recording_all | ✓ | ✓ | |
| message.zalo_send | ✓ | ✓ | ✓ |
| message.view_all | ✓ | ✓ | |
| catalog.view | ✓ | ✓ | ✓ |
| catalog.manage | ✓ | ✓ | |
| product.view | ✓ | ✓ | ✓ |
| product.manage | ✓ | ✓ | |
| product.view_cost | ✓ | | |
| price.manage | ✓ | | |
| inventory.view | ✓ | ✓ | ✓ |
| inventory.document | ✓ | ✓ | |
| inventory.post | ✓ | ✓ | |
| inventory.count_approve | ✓ | | |
| combo.manage | ✓ | | |
| policy.view | ✓ | ✓ | ✓ |
| policy.manage | ✓ | | |
| quote.create | ✓ | ✓ | ✓ |
| order.view_own | ✓ | ✓ | ✓ |
| order.view_all | ✓ | ✓ | |
| order.create | ✓ | ✓ | ✓ |
| order.edit_own | ✓ | ✓ | ✓ |
| order.edit_all | ✓ | ✓ | |
| order.discount_approve | ✓ | | |
| order.cancel | ✓ | ✓ | |
| order.allow_backorder | ✓ | ✓ | |
| order.export | ✓ | | |
| payment.record | ✓ | ✓ | ✓ |
| payment.confirm | ✓ | ✓ | |
| payment.refund | ✓ | | |
| staff.view | ✓ | ✓ | |
| staff.manage | ✓ | | |
| staff.offboard | ✓ | | |
| target.manage | ✓ | | |
| kpi.own | ✓ | ✓ | ✓ |
| kpi.team | ✓ | ✓ | |
| kpi.leaderboard | ✓ | ✓ | |
| attendance.view_team | ✓ | ✓ | |
| coaching.manage | ✓ | ✓ | |
| delivery.update | ✓ | ✓ | |
| warranty.manage | ✓ | ✓ | |
| report.own | ✓ | ✓ | ✓ |
| report.team | ✓ | ✓ | |
| settings.assignment | ✓ | ✓ | |
| settings.integrations | ✓ | | |
| settings.users | ✓ | | |
| settings.permissions | ✓ | | |
| audit.view | ✓ | | |

### Bảo vệ dữ liệu khách khỏi bị mang đi

- Người không có `contact.phone_reveal` chỉ thấy số dạng che (`+82 10••••4471`, `090•••215`). Số đầy đủ **không được gửi xuống trình duyệt** cho đến khi người dùng bấm hành động được phép.
- **Chế độ gọi** là một cài đặt của showroom:
  - `external` (mặc định tháng 1, chưa có tổng đài): telesale có `contact.phone_reveal_assigned` bấm **Gọi** thì server trả số đầy đủ của đúng lead đang được giao cho họ, mở `tel:` trên điện thoại hoặc hiện số để bấm, và **ghi audit log mỗi lần**. Lead đã chuyển cho người khác thì mất quyền xem số ngay.
  - `provider` (khi có tổng đài): nút Gọi gọi API server, server lấy số và gọi qua tổng đài; telesale không cần thấy số. Khi chuyển sang chế độ này, Owner tắt `contact.phone_reveal_assigned` của vai trò Telesale.
- Báo cáo cho Owner: số lần xem số theo từng người mỗi ngày, cảnh báo khi một người xem số bất thường so với số cuộc gọi họ ghi nhận.
- Mỗi lần bấm "Hiện số" hoặc xuất file đều ghi `audit_logs`.
- Xuất file chỉ người có `lead.export`, giới hạn số dòng mỗi lần, ghi log đầy đủ.
- Không ghi số điện thoại, nội dung tin nhắn vào log ứng dụng hay công cụ theo dõi lỗi.
- Giá vốn không được gửi xuống trình duyệt cho người không có `product.view_cost`, kể cả trong dữ liệu ẩn của combo hay báo cáo.
- Sale admin có `kpi.team` và `coaching.manage` chỉ xem được người do mình quản lý trực tiếp (`staff_profiles.manager_id`) cộng các telesale; không xem được chỉ số, ghi chú của Owner hay sale admin khác.
- Người ghi nhận một khoản thanh toán không được tự xác nhận chính khoản đó, kể cả khi có `payment.confirm` (trừ Owner).

---

## 6. Thu lead: nguồn và dữ liệu cần thu

### Trường bắt buộc với mọi lead

- Ít nhất một định danh liên lạc: `phone_e164` hoặc `zalo_user_id` hoặc `fb_psid`.
- `source` và `source_detail`.
- `country_of_residence` của người đặt (VN, KR hoặc khác). Nếu nguồn không cho biết, suy từ đầu số; vẫn không rõ thì để `unknown` và telesale bắt buộc chọn ở cuộc gọi đầu.
- `consent_marketing` và nguồn của sự đồng ý.

### Bốn thông tin telesale phải hỏi ở cuộc gọi đầu

Người nhận là ai và quan hệ gì; người nhận ở tỉnh nào; dịp tặng (và ngày nếu có); ngân sách. Thêm sản phẩm quan tâm. Màn hình hồ sơ hiển thị ô thiếu thông tin rõ ràng; không cho chuyển lead sang `demo` khi chưa đủ bốn thông tin này.

### Theo từng nguồn

| Nguồn (`source`) | Cách vào | Dữ liệu thu | Ghi chú |
|---|---|---|---|
| `meta_lead_ads` | Webhook trường `leadgen` của Page, sau đó gọi Graph API lấy `field_data` theo `leadgen_id` | Họ tên, SĐT, quốc gia đang sống, tỉnh người nhận, sản phẩm quan tâm, dịp tặng; `ad_id`, `adset_id`, `campaign_id`, `form_id`, `page_id`, `created_time` | Đề xuất câu hỏi form theo đúng các trường này. Giữ ID quảng cáo để tháng 2 đẩy chuyển đổi ngược về Meta |
| `zalo_oa` | Webhook sự kiện OA (theo dõi OA, gửi tin, gửi thông tin) | `zalo_user_id`, tên hiển thị, nội dung tin đầu, SĐT nếu khách chia sẻ | Tin đầu tiên từ người lạ tạo lead mới; khách đã có thì nối vào hội thoại |
| `hotline` | Webhook cuộc gọi đến của tổng đài (khi có `call_provider`; tháng 1 nhập tay) | Số gọi đến, thời điểm, máy nhánh nhận, trạng thái, ghi âm | Cuộc gọi nhỡ từ số lạ tự tạo lead, ưu tiên gọi lại |
| `walk_in` | Sale admin hoặc telesale nhập nhanh | Họ tên, SĐT, sản phẩm đã xem, ghi chú | Tháng 2 thay bằng QR check-in |
| `tiktok_live` | Nhập nhanh từ bình luận | Tên tài khoản, SĐT hoặc Zalo khách để lại, nội dung bình luận | Chưa có API chính thức ổn định cho bình luận live; không tự cào dữ liệu |
| `referral` | Nhập tay | Như trên, kèm `referrer_contact_id` | |
| `import` | File CSV có mẫu tải về | Theo cột mẫu; báo cáo dòng lỗi, dòng trùng | Chỉ người có `lead.import`. Đây là đường đưa dữ liệu thủ công trước đây vào hệ thống: cột mẫu gồm họ tên, SĐT, quốc gia, tỉnh người nhận, sản phẩm, ngày liên hệ gần nhất, ghi chú, người phụ trách cũ. Có bước xem trước và cho chọn cách xử lý trùng (bỏ qua, cập nhật, tạo hoạt động) |

### Danh mục mặc định (seed, sửa được trong Cài đặt)

Showroom chưa có danh mục chuẩn. Seed bộ sau, đội dùng thử 2 tuần rồi điều chỉnh:

- **Nguồn lead:** Facebook Ads nhắm người Việt tại Hàn; Facebook Ads trong nước; Tin nhắn Facebook; Zalo OA; Live TikTok; KOC, KOL; TikTok Shop; Khách đến showroom; Hotline; Giới thiệu từ khách cũ; Dữ liệu cũ nhập lại.
- **Dịp tặng:** Tết; 20/10; 8/3; Sinh nhật; Mừng thọ; Vu Lan; Tân gia; Không có dịp, dùng cho gia đình.
- **Kết quả cuộc gọi:** Nghe máy, quan tâm; Nghe máy, chưa quan tâm; Hẹn gọi lại; Không nghe máy; Thuê bao, sai số; Đã gọi qua Zalo, quan tâm; Đã gọi qua Zalo, không trả lời.
- **Lý do thất bại:** Giá cao; Đã mua nơi khác; Chưa tin mua từ xa; Người nhận không muốn nhận; Không giao được tới khu vực; Hết nhu cầu, chỉ hỏi giá; Không liên lạc được sau 5 lần; Sai số, số ảo; Trùng lead.
- **Ngân sách:** Dưới 30tr; 30–50tr; 50–80tr; Trên 80tr; Chưa rõ.

### Chuẩn hóa số điện thoại

- Lưu cả `phone_raw` và `phone_e164`.
- Mặc định vùng phân tích theo `country_of_residence`: VN thì `0912…` thành `+84912…`; KR thì `010-1234-5678` thành `+821012345678`.
- Số không hợp lệ: vẫn tạo lead, gắn cờ `phone_invalid`, đưa vào hàng chờ sale admin kiểm tra.
- Viết unit test cho các dạng số thật hay gặp: có dấu cách, dấu chấm, gạch ngang, có hoặc không có `+`, đầu `84`, đầu `82`, số Hàn bỏ số 0 đầu.

### Chống trùng

1. Tìm `contacts` theo `phone_e164`, rồi `zalo_user_id`, rồi `fb_psid`.
2. Có contact và có lead đang mở (stage khác `won`, `lost`): **không tạo lead mới**. Thêm activity `lead_created` với nguồn mới vào lead cũ, báo cho người đang giữ lead.
3. Có contact, lead cũ đã `lost` hơn 30 ngày hoặc đã `won`: tạo lead mới, gắn cùng contact.
4. Mọi quyết định gộp ghi activity `merge` kèm lý do.

---

## 7. Phân lead và SLA

- Chỉ phân cho telesale `is_active` và `is_on_duty`.
- **Ca làm việc chưa được sắp xếp**, nên lịch ca là bảng cấu hình (`shifts`: tên ca, ngày trong tuần, giờ bắt đầu, giờ kết thúc theo giờ VN; `shift_members`). Seed gợi ý để đội thử:
  - Ca ngày: 08:30–17:30 giờ VN, thứ Hai đến thứ Bảy, cho khách trong nước và lead mới.
  - Ca tối: 16:30–21:00 giờ VN, phủ khung 19:00–22:30 giờ Hàn (tương đương 17:00–20:30 giờ VN), khung chốt chính với khách ở Hàn.
  - Ca Chủ nhật: 09:00–17:00 giờ VN, vì Chủ nhật là ngày nghỉ phổ biến của người lao động Việt tại Hàn.
- Ngoài mọi ca: lead vẫn được nhận và chống trùng, nhưng SLA tính từ đầu ca kế tiếp; sale admin thấy danh sách lead đến ngoài giờ.
- Chế độ tháng 1: vòng tròn, bỏ qua người đang có quá N lead chưa liên hệ (N cấu hình được).
- Lead có người đặt ở Hàn: vẫn giao ngay, nhưng `sla_due_at` tính theo khung gọi Hàn. Nếu đang ngoài khung, đặt `next_callback_at` vào đầu khung gần nhất và hiển thị rõ "Gọi lúc 19:00 giờ Hàn".
- SLA mặc định 5 phút trong giờ làm việc, tính đến `first_contact_at` (cuộc gọi đi đầu tiên, có kết nối hay không đều tính, hoặc tin Zalo đi đầu tiên).
- Quá SLA: thông báo trong ứng dụng cho sale admin, lead hiện ở mục "Quá hạn" trên trang chủ của sale admin.
- Không có telesale trực: lead vào hàng "Chưa phân", báo sale admin.
- Mọi lần giao, chuyển ghi activity `assignment`.

---

## 8. Bán hàng: sản phẩm, tồn kho, combo, chính sách, đơn hàng

Showroom không có API từ Đại Việt, nên CRM là nơi duy nhất quản lý hàng hóa và đơn của showroom. Phần này phải đúng về tiền và tồn kho trước khi đẹp.

### 8.1 Nguyên tắc

1. **Tiền và tồn kho chỉ tính ở server.** Một hàm định giá duy nhất (8.5) dùng cho báo giá, đơn hàng và màn hình thử chính sách. Không tin tổng tiền gửi từ trình duyệt.
2. **Tồn kho chỉ thay đổi qua phiếu kho.** Không sửa số tồn trực tiếp. Mọi thay đổi là một dòng trong sổ kho bất biến (`stock_movements`); số tồn được cập nhật trong cùng giao dịch bằng trigger.
3. **Đơn lưu ảnh chụp tại thời điểm chốt.** Giá, chính sách đã áp, tên sản phẩm được sao vào đơn. Sửa bảng giá hay chính sách sau đó không làm đổi đơn cũ.
4. **Tách người bán và người xác nhận tiền.** Telesale ghi nhận thanh toán; chỉ người có `payment.confirm` xác nhận tiền đã về.
5. Tiền lưu `bigint` đơn vị đồng. Số lượng là số nguyên.
6. Đơn quà tặng luôn có hai người: **người đặt** (thường ở Hàn) và **người nhận** (địa chỉ giao ở Việt Nam), dùng lại `contacts` và `households`.

### 8.2 Sản phẩm và giá

- `product_categories` — cây danh mục: Ghế massage, Máy lọc nước, Lõi lọc và vật tư, Quà tặng kèm, Phụ kiện.
- `products` — sản phẩm gốc: name, category_id, brand, description, images, `warranty_months`, `requires_installation`, `installation_crew_size` (ghế cần 2 người), `weight_kg`, `dimensions`, `delivery_class` (`parcel` hàng nhỏ gửi vận chuyển | `bulky` hàng cồng kềnh cần xe và đội lắp), `track_serial` (ghế, máy lọc: có; lõi lọc, quà: không), `is_sellable`, `is_gift_only` (chỉ dùng làm quà tặng), status.
- `product_variants` — SKU bán thật: sku (unique theo showroom), product_id, tên phiên bản (màu, phiên bản), barcode, `cost_price` (giá vốn, chỉ người có `product.view_cost` thấy), is_active.
- `consumable_links` — sản phẩm chính và vật tư thay định kỳ: máy lọc nước → lõi lọc, `replacement_cycle_months`. Khi đơn hoàn tất, sinh lịch nhắc thay lõi cho hộ gia đình.
- `price_lists` — bảng giá: name (Giá niêm yết, Giá online…), channel áp dụng, valid_from, valid_to, is_default.
- `price_list_items` — variant_id, price. Lịch sử giá giữ nguyên, không ghi đè.
- Nhập, xuất CSV cho sản phẩm, SKU, bảng giá (Đại Việt gửi file, admin nhập).

### 8.3 Tồn kho

- `warehouses` — kho: Kho showroom Q4, Kho Đại Việt (kho ảo, admin cập nhật tay theo số Đại Việt báo), Hàng trưng bày. Có thể thêm kho khi mở showroom mới.
- `stock_levels` — variant_id, warehouse_id, `on_hand`, `reserved`; `available = on_hand − reserved` (cột sinh hoặc view).
- `stock_movements` — sổ kho bất biến: type (`receipt` nhập từ Đại Việt, `sale_out` xuất bán, `transfer_out`, `transfer_in`, `return_in` khách trả, `adjust_plus`, `adjust_minus` kiểm kê, `demo_in`, `demo_out`), variant_id, warehouse_id, qty, ref (phiếu, đơn), reason, actor_id, at. Không cho sửa, không cho xóa; sai thì lập phiếu điều chỉnh.
- `stock_documents` — phiếu kho gom nhiều dòng: phiếu nhập, phiếu xuất, phiếu chuyển kho, phiếu kiểm kê; trạng thái nháp → đã ghi sổ. Chỉ phiếu đã ghi sổ mới sinh `stock_movements`.
- `serial_units` — với sản phẩm `track_serial`: serial, variant_id, warehouse_id, status (`in_stock` | `reserved` | `sold` | `demo` | `returned` | `defective`), order_item_id. Gán serial lúc xuất kho giao hàng; serial là căn cứ bảo hành.
- **Giữ hàng:** đơn chuyển sang đã cọc thì tạo giữ hàng (`stock_reservations`: order_item_id, warehouse_id, qty, expires_at). Hết hạn giữ theo chính sách đặt cọc mà chưa thanh toán đủ thì job nhả hàng và báo người phụ trách đơn.
- **Không bán âm:** không xác nhận đơn khi `available` không đủ, trừ khi bật cờ "Đặt trước, chờ hàng về" cho đơn đó (cần `order.allow_backorder`) và ghi ngày dự kiến có hàng.
- Cảnh báo tồn thấp theo ngưỡng từng SKU; đề xuất số cần đặt thêm từ Đại Việt dựa trên đơn đang giữ và tốc độ bán 30 ngày.
- Kiểm kê: phiếu kiểm kê theo kho, nhập số đếm thực tế, hệ thống sinh chênh lệch, người có `inventory.count_approve` duyệt mới ghi sổ.

### 8.4 Combo

- `combos` — name, code, mô tả, ảnh, `pricing_mode` (`fixed_price` giá trọn gói | `sum_minus` tổng giá lẻ trừ một khoản), price hoặc discount, valid_from, valid_to, channels, status.
- `combo_items` — variant_id, qty, `is_gift` (món tặng kèm giá 0).
- Ví dụ: "Ghế DV-X9 + gối massage cổ (tặng)", "Gói quà mừng thọ: máy lọc nước + thiệp video", "Combo 2 ghế cho 2 nhà".
- Tồn của combo = số combo lắp được từ tồn khả dụng của các thành phần trong kho chọn; hiển thị, không lưu.
- Khi bán, combo được tách thành các dòng thành phần trong đơn (giữ `combo_id` để báo cáo), mỗi dòng giữ hàng và gán serial riêng. Giá combo phân bổ về từng dòng theo tỷ lệ giá lẻ để báo cáo doanh thu theo SKU đúng.
- Owner thấy biên lợi nhuận combo (cần `product.view_cost`).

### 8.5 Chính sách

`policies` — mỗi chính sách: type, name, status (`draft` | `active` | `paused` | `expired`), valid_from, valid_to, channels, `priority`, `stackable`, `version`, `rules` jsonb kiểm tra bằng schema zod riêng theo `type`. Sửa chính sách đang chạy tạo phiên bản mới; đơn cũ giữ phiên bản đã áp.

| Loại (`type`) | Nội dung quy tắc | Ví dụ |
|---|---|---|
| `promotion` | Điều kiện (SKU, danh mục, combo, giá trị đơn tối thiểu, kênh, nhóm khách: khách cũ, khách được giới thiệu, người đặt ở Hàn) và lợi ích (giảm %, giảm tiền, tặng SKU, miễn phí lắp, miễn phí giao) | Quà 20/10: đặt trước 13/10 tặng gối cổ và miễn phí lắp |
| `delivery` | Vùng giao (nội thành TP.HCM, tỉnh, theo tỉnh), phí giao, phí lắp theo `delivery_class`, thời gian giao dự kiến, ngày chốt đơn để kịp dịp lễ | Miền Trung trước Tết: chốt đơn trước 15/01 |
| `deposit` | Mức cọc tối thiểu (tiền hoặc %), số ngày giữ hàng, điều kiện hoàn cọc | Cọc tối thiểu 10 triệu, giữ hàng 14 ngày |
| `payment` | Phương thức được nhận (chuyển khoản tài khoản công ty, tiền mặt tại showroom, thu khi giao), ghi chú cho khách ở Hàn | Khách ở Hàn chỉ chuyển khoản qua ngân hàng, kiều hối hợp pháp |
| `warranty` | Thời hạn theo danh mục hoặc SKU, điều kiện, quy trình | Ghế 5 năm khung, 2 năm motor |
| `return` | Số ngày đổi trả, điều kiện, phí | Đổi trong 7 ngày nếu lỗi kỹ thuật |
| `discount_limit` | Mức giảm tối đa người bán tự áp theo vai trò; vượt mức thì đơn vào hàng chờ duyệt | Telesale 5%, Sale admin 5%, vượt mức Owner duyệt |

**Hàm định giá** `lib/sales/pricing.ts`:

```ts
priceQuote(input: {
  lines: { variantId?: string; comboId?: string; qty: number; manualDiscount?: Discount }[];
  context: { showroomId: string; channel: string; buyerCountry: 'VN' | 'KR' | 'other';
             customerTags: string[]; recipientProvince?: string; date: Date; sellerId: string };
}): {
  lines: PricedLine[];            // giá lẻ, giảm, thành tiền từng dòng (combo đã tách)
  appliedPolicies: AppliedPolicy[];
  fees: { delivery: number; installation: number };
  totals: { subtotal: number; discount: number; fees: number; total: number };
  deposit: { minimum: number; holdDays: number };
  approvalsNeeded: { reason: string; policyId?: string }[];
  warnings: string[];             // thiếu hàng, quá ngày chốt dịp lễ…
}
```

- Hàm thuần, không đọc ngẫu nhiên, không phụ thuộc giờ máy (nhận `date` từ ngoài); dữ liệu chính sách và giá được nạp trước rồi truyền vào.
- Thứ tự áp: chọn chính sách `promotion` thỏa điều kiện theo `priority`; chính sách không `stackable` loại các chính sách thấp hơn cùng phạm vi; giảm tay của người bán áp sau cùng và kiểm tra `discount_limit`.
- Unit test bao phủ: cộng dồn và không cộng dồn, combo có quà, giảm vượt mức cần duyệt, phí giao theo tỉnh, hết hạn chính sách đúng ngày, làm tròn tiền.
- Màn hình **Thử chính sách**: chọn SKU, kênh, tỉnh, ngày, xem hàm định giá trả gì trước khi bật chính sách.

### 8.6 Báo giá

- `quotes`, `quote_items` — tạo từ hồ sơ lead; gồm người đặt, người nhận, các dòng, kết quả hàm định giá, `valid_until`, trạng thái (`draft` | `sent` | `viewed` | `accepted` | `expired` | `rejected`).
- Gửi khách bằng **link báo giá công khai có mã khó đoán** (`/q/<token>`, hết hạn theo `valid_until`): trang di động, tiếng Việt, ảnh sản phẩm, chính sách giao lắp, bảo hành, hướng dẫn chuyển khoản. Không hiện số điện thoại đầy đủ hay thông tin nội bộ. Ghi nhận lượt xem.
- Khách đồng ý (nhân viên bấm "Khách đã đồng ý" hoặc khách bấm trên trang) thì sinh đơn hàng từ báo giá, chạy lại hàm định giá để kiểm tra không có gì thay đổi; có thay đổi thì báo người bán.

### 8.7 Đơn hàng

- `orders` — mã đơn theo showroom (`Q4-2610-0001`: mã showroom, năm tháng, số thứ tự), lead_id (giữ nguồn quảng cáo để gửi chuyển đổi sau này), quote_id, `buyer_contact_id`, `recipient_contact_id`, địa chỉ giao (tỉnh, huyện, xã, chi tiết), `is_gift`, `gift_message`, `keep_surprise` (không liên hệ người nhận khi người đặt chưa cho phép), channel, seller_id, ảnh chụp định giá, totals, `paid_amount`, `balance_due`, yêu cầu xuất hóa đơn (cá nhân hoặc công ty, mã số thuế), status.
- `order_items` — variant_id, combo_id, qty, giá, giảm, thành tiền, `is_gift`, serial_unit_id (khi xuất kho).
- `order_policy_applications` — ảnh chụp chính sách đã áp (id, version, lợi ích).
- `payments` — order_id, type (`deposit` | `balance` | `refund`), method, amount, reference (mã giao dịch, nội dung chuyển khoản), ảnh chứng từ (Storage riêng tư), status (`recorded` | `confirmed` | `rejected`), recorded_by, confirmed_by. Tháng sau, `bank_webhook` tự tạo dòng `confirmed` khi khớp.
- **Trạng thái đơn:**

```
draft → pending_approval (nếu cần duyệt) → confirmed → deposit_paid (giữ hàng)
      → ready_to_ship (đã thanh toán đủ hoặc được phép thu khi giao)
      → delivering → installed → completed
Nhánh: cancelled (nhả giữ hàng, ghi hoàn tiền nếu có) · return_requested → returned
```

- Mỗi lần chuyển trạng thái kiểm tra điều kiện: `confirmed` cần đủ người nhận và địa chỉ; `ready_to_ship` cần đủ tiền theo chính sách thanh toán hoặc được duyệt thu khi giao; `delivering` cần phiếu xuất kho đã ghi sổ và serial đã gán; `completed` sinh bảo hành và lịch thay vật tư.
- Đồng bộ với lead: đơn `deposit_paid` đưa lead sang `deposit`; `completed` đưa lead sang `won`; `cancelled` không tự đổi lead, hỏi người bán.
- Các bước giao lắp chi tiết (xác nhận người nhận, xuất kho, giao và lắp, video bàn giao, đánh giá) lưu ở `deliveries`; giai đoạn này cập nhật tay trên đơn, app cho kỹ thuật viên làm sau.
- `warranties` — tạo khi đơn hoàn tất: serial, ngày bắt đầu, ngày hết hạn theo chính sách, chủ sở hữu (người nhận, người dùng trong hộ), link phiếu bảo hành điện tử.
- Đơn trên sàn (TikTok Shop) về sau đi vào cùng bảng `orders` với `channel` tương ứng qua đấu nối.

### 8.8 Báo cáo bán hàng (cơ bản)

Doanh thu theo ngày, tuần, tháng và tiến độ mục tiêu; doanh thu theo SKU, combo, kênh, người bán, thị trường người đặt (VN, Hàn); đơn theo trạng thái; tiền cọc đang giữ; công nợ còn phải thu; tồn kho và giá trị tồn (giá vốn chỉ cho người có `product.view_cost`); hàng sắp hết; giữ hàng sắp hết hạn.

---

## 9. Nhân sự và hiệu suất

Phạm vi là **quản lý đội bán hàng trong CRM**: hồ sơ làm việc, ca trực, nghỉ, chỉ tiêu, chỉ số hiệu suất, kèm cặp, bàn giao khi nghỉ việc. **Không phải phần mềm nhân sự, tiền lương.** Không lưu CCCD, tài khoản ngân hàng, mức lương, hợp đồng lao động trong CRM.

Chỉ số nhân sự có **menu riêng "Đội ngũ"**, tách khỏi menu "Báo cáo" (báo cáo kinh doanh).

### 9.1 Hồ sơ nhân sự

- `staff_profiles` (một dòng cho mỗi `profiles`): mã nhân viên, chức danh hiển thị (Telesale, Sale admin, Tiếp khách showroom…), vai trò hệ thống (`role_id`, quyết định quyền), người quản lý trực tiếp, ngày vào làm, trạng thái làm việc (`probation` thử việc | `active` chính thức | `on_leave` nghỉ dài | `offboarded` đã nghỉ), số nội bộ, máy nhánh tổng đài, kỹ năng (ví dụ: nói tiếng Hàn, chuyên ghế massage, chuyên máy lọc nước), khu vực hoặc nhóm khách phụ trách.
- `staff_status_history` — mọi lần đổi trạng thái, vai trò, quản lý: trước, sau, người đổi, thời điểm.
- Kỹ năng dùng được trong luật phân lead về sau (ví dụ ưu tiên lead nói tiếng Hàn cho người có kỹ năng tương ứng).

### 9.2 Ca trực, chấm công nhẹ, nghỉ

- Dùng lại `shifts`, `shift_members` ở mục 7.
- `duty_sessions` — mỗi lần bật, tắt công tắc **Trực**: user_id, started_at, ended_at, nguồn (người dùng tự bật, hệ thống tự tắt khi hết ca, quản lý tắt hộ). Đây là chấm công nhẹ để biết giờ trực thực tế, không dùng tính lương.
- So khớp với ca đã xếp: vào trực trễ, tắt trực sớm, giờ trực thực tế so với giờ ca.
- Tự tắt trực khi hết ca cộng 30 phút hoặc không có thao tác 60 phút trong ca, có cảnh báo trước.
- `absences` — nghỉ phép, nghỉ ốm, công tác: ngày, loại, người duyệt. Ngày nghỉ thì không phân lead, và chỉ tiêu được tính theo tỷ lệ ngày làm thực tế.

### 9.3 Chỉ tiêu

- `targets` — user_id, kỳ (`week` | `month`), period_start, metric_key, target_value, set_by, set_at.
- `target_templates` — chỉ tiêu mẫu theo vai trò, Owner áp hàng loạt cho cả nhóm rồi chỉnh riêng từng người.
- Chỉ tiêu tính theo tỷ lệ cho người vào làm hoặc nghỉ giữa kỳ.
- Gợi ý chỉ tiêu mặc định cho telesale (sửa được): doanh thu đơn đã cọc theo tháng, số đơn đã cọc, số cuộc gọi đã ghi mỗi ngày làm việc, tỷ lệ gọi trong SLA, tỷ lệ đủ thông tin bắt buộc sau cuộc gọi đầu.

### 9.4 Định nghĩa chỉ số

Mọi chỉ số khai báo một chỗ trong `lib/kpi/definitions.ts` (key, tên tiếng Việt, công thức bằng lời, nguồn dữ liệu, đơn vị, chiều tốt: cao hơn tốt hay thấp hơn tốt, vai trò áp dụng). Màn hình Đội ngũ, chỉ tiêu và cảnh báo đều đọc từ đây, nên một chỉ số chỉ có một cách tính.

**Hai cách đo, luôn ghi rõ đang dùng cách nào:**

- **Theo kỳ:** việc xảy ra trong kỳ (số cuộc gọi tuần này, doanh thu tháng này).
- **Theo lô lead:** lấy lead nhận trong kỳ, theo dõi kết quả về sau (lead nhận tháng 10 chốt được bao nhiêu, kể cả chốt sang tháng 11). Tỷ lệ chuyển đổi chỉ tính theo cách này để công bằng.

**Telesale**

| Nhóm | Chỉ số |
|---|---|
| Hoạt động | Lead được giao; lead đã liên hệ; cuộc gọi đã ghi; cuộc gọi có người nghe; tin Zalo đã gửi; thời lượng gọi (khi có tổng đài) |
| Tốc độ | Tỷ lệ liên hệ trong SLA; thời gian liên hệ đầu tiên (trung vị); số lead quá hạn SLA; tỷ lệ hẹn gọi lại thực hiện đúng giờ (trong ±15 phút); lead chưa chạm quá 24 giờ |
| Chất lượng | Tỷ lệ đủ 4 thông tin bắt buộc sau cuộc gọi đầu; tỷ lệ liên hệ được; tỷ lệ lead → demo, video call; demo → báo giá; báo giá → đặt cọc; tỷ lệ chốt lead → đặt cọc (theo lô lead); phân bố lý do thất bại |
| Kết quả | Doanh thu đơn đã cọc; doanh thu đơn hoàn tất; số đơn; giá trị đơn trung bình; mức giảm trung bình; tỷ lệ đơn phải xin duyệt giảm; tỷ lệ hủy đơn; số đơn bán chéo trong hộ |
| Tuân thủ | Số lần xem số điện thoại trên số cuộc gọi đã ghi; số lần xuất file; lead bị đánh thất bại khi chưa đủ 3 lần liên hệ |

**Sale admin**

| Nhóm | Chỉ số |
|---|---|
| Điều phối | Thời gian lead nằm ở hàng chưa phân (trung vị); số lead phải phân lại; số lead quá hạn của đội chưa được xử lý quá 30 phút |
| Tiền | Thời gian từ lúc ghi nhận đến lúc xác nhận thanh toán (trung vị); số khoản chờ xác nhận quá 4 giờ làm việc; số khoản bị từ chối |
| Kho, đơn | Thời gian ghi sổ phiếu kho; chênh lệch kiểm kê; tỷ lệ đơn giao đúng ngày hẹn; giữ hàng hết hạn mà chưa xử lý |
| Kênh | Tin Zalo OA được trả lời trong 10 phút (khi admin phụ trách kênh) |

Vai trò mới thêm sau (tiếp khách showroom, marketing, editor) được gán bộ chỉ số bằng cấu hình, không sửa code.

**Quy tắc công bằng và chống làm đẹp số:**

1. Doanh thu ghi cho **người bán trên đơn** (`seller_id`). Lead chuyển người giữa chừng thì ghi cho người tạo đơn; mọi lần chuyển đều nằm trong lịch sử để Owner xem lại khi có tranh chấp.
2. Tỷ lệ chốt luôn hiện kèm **cơ cấu nguồn lead** của người đó và so với trung bình đội trên cùng nguồn, vì lead từ khách giới thiệu dễ chốt hơn lead quảng cáo.
3. Đánh thất bại sớm (chưa đủ 3 lần liên hệ, hoặc lý do "Không liên lạc được" mà chưa gọi đủ các khung giờ) được đếm riêng và cảnh báo.
4. Cuộc gọi ghi tay ở chế độ gọi ngoài hệ thống được đánh dấu khác cuộc gọi có tổng đài xác nhận.
5. Chỉ số của người có ngày nghỉ được tính theo ngày làm thực tế.

### 9.5 Tính toán

- Chỉ số trong ngày tính trực tiếp từ dữ liệu; các ngày trước gom vào `kpi_daily` (user_id, date theo giờ VN, metric_key, value) bằng job chạy mỗi đêm. Có lệnh chạy lại cho một khoảng ngày khi sửa công thức.
- Chỉ số theo lô lead tính lại hằng đêm cho các lô còn mở (lead nhận trong 90 ngày gần nhất).
- Mọi số trên màn hình bấm vào được để mở danh sách bản ghi tạo nên số đó (ví dụ "Quá hạn SLA: 4" mở 4 lead tương ứng).

### 9.6 Kèm cặp

- `coaching_notes` — ghi chú của quản lý về một nhân viên: ngày, nội dung, mục tiêu cải thiện, hạn xem lại. Chỉ người viết, Owner và người có `coaching.manage` đọc được; **nhân viên được nhắc không đọc được** trừ khi người viết bật "Chia sẻ với nhân viên".
- Khi có tổng đài và ghi âm: phiếu chấm cuộc gọi theo tiêu chí (chào hỏi, hỏi đủ 4 thông tin, xử lý lo ngại, chốt bước tiếp). Làm sau giai đoạn 1.

### 9.7 Nghỉ việc và bàn giao

Trình bàn giao gồm 4 bước, chỉ Owner thực hiện:

1. Khóa tài khoản và thu hồi mọi phiên đăng nhập ngay.
2. Liệt kê toàn bộ lead đang mở, hẹn gọi lại, báo giá, đơn chưa hoàn tất, hội thoại đang giữ.
3. Chọn người nhận (một người hoặc chia vòng tròn cho nhóm), chuyển hàng loạt, ghi activity `assignment` với lý do "Bàn giao do nghỉ việc".
4. Xuất biên bản bàn giao. Lịch sử và chỉ số của người đã nghỉ vẫn giữ để báo cáo.

### 9.8 Thưởng doanh số (sau giai đoạn 1)

Chừa chỗ, chưa làm: `commission_rules` (tỷ lệ theo doanh thu đơn hoàn tất, theo SKU hoặc combo, theo bậc đạt chỉ tiêu) và bảng ước tính thưởng. Chỉ Owner và chính nhân viên đó xem được phần của họ. Kết quả là số ước tính để đối chiếu, không thay sổ lương.

---

## 10. Đấu nối

### 10.1 Quy tắc chung cho mọi đấu nối

1. Trước khi viết code cho một đấu nối, đọc tài liệu chính thức hiện hành của nhà cung cấp và ghi những điểm đã kiểm chứng (endpoint, cách ký, thời hạn token, giới hạn gửi tin, điều kiện gói) vào `docs/integrations/<key>.md`. Không dựa vào trí nhớ. Các điều kiện ghi trong mục 10.3 là hiện trạng tại 10/2026, phải kiểm tra lại khi làm.
2. Chỉ dùng đường kết nối **chính thức** của nhà cung cấp. Danh sách cấm ở mục 10.6.
3. Webhook nhận vào `webhook_events` trước, trả `200` nhanh, xử lý bằng job. Chống xử lý trùng bằng `(provider, external_id)`.
4. Kiểm tra chữ ký mọi webhook. Chữ ký sai thì lưu với `signature_valid = false` và không xử lý.
5. Secret để trong Supabase Vault hoặc biến môi trường server, không bao giờ ở client hay trong repo.
6. Viết theo lớp adapter để đổi nhà cung cấp không ảnh hưởng nghiệp vụ.
7. **Mỗi kênh nhắn tin chỉ có một nơi trả lời.** Nếu kênh đang được trả lời ở công cụ khác (ví dụ Pancake), CRM chỉ đọc kênh đó.
8. Có job đối soát định kỳ cho đấu nối nào nhà cung cấp cho phép lấy lại dữ liệu, phòng webhook bị lỡ.
9. Chỉ Owner (`settings.integrations`) được kết nối, ngắt, đổi cấu hình. Mọi thao tác ghi `audit_logs`.

### 10.2 Khung kỹ thuật: sổ đăng ký đấu nối

Mọi đấu nối, kể cả chưa làm, được khai báo trong `lib/integrations/registry.ts`. Màn hình Cài đặt, Tích hợp (mục 11.2) đọc từ sổ này, nên thêm đấu nối mới chỉ cần thêm một mục và một adapter.

```ts
type IntegrationGroup = 'channels' | 'calls' | 'ads_measurement' | 'finance' | 'operations' | 'ai';
type Capability =
  | 'inbound_leads' | 'inbound_messages' | 'outbound_messages'
  | 'inbound_calls' | 'outbound_calls' | 'inbound_orders'
  | 'inbound_payments' | 'outbound_events' | 'outbound_invoices'
  | 'file_storage' | 'email' | 'ai_processing';

interface IntegrationDefinition {
  key: string;                       // 'meta_lead_ads', 'zalo_oa'…
  name: string;                      // tên hiển thị tiếng Việt
  description: string;               // một câu, lời người dùng hiểu
  group: IntegrationGroup;
  phase: 'month_1' | 'month_2' | 'month_3' | 'when_available' | 'optional';
  implemented: boolean;              // false thì hiện "Sắp có"
  capabilities: Capability[];
  prerequisites: { key: string; label: string; helpUrl?: string }[]; // checklist Owner tự đánh dấu
  configSchema: ZodSchema;           // cấu hình không bí mật
  secrets: string[];                 // tên secret lưu trong Vault
  supportsReplyMode?: boolean;       // kênh nhắn tin
  connect?(ctx): Promise<ConnectResult>;      // OAuth hoặc nhập khóa
  healthCheck?(ctx): Promise<HealthResult>;
  sendTest?(ctx): Promise<TestResult>;        // "Gửi dữ liệu thử"
  disconnect?(ctx): Promise<void>;
}
```

Bảng `integrations` (mỗi showroom một dòng cho mỗi `key`):

- `key`, `status` (`not_available` | `not_connected` | `connecting` | `connected` | `error` | `paused`), `enabled`
- `reply_mode` cho kênh nhắn tin: `crm` (trả lời trên CRM) | `external` (trả lời ở công cụ khác, CRM chỉ đọc) | `off`
- `config` jsonb (theo `configSchema`), `secret_ref`
- `prerequisites_done` jsonb (Owner đánh dấu từng điều kiện)
- `connected_by`, `connected_at`, `last_event_at`, `last_success_at`, `last_error`, `last_error_at`
- `token_expires_at` cho đấu nối OAuth, có job cảnh báo trước 3 ngày

### 10.3 Danh mục đấu nối

| Key | Tên hiển thị | Nhóm | Giai đoạn | Đường kết nối chính thức | Dữ liệu | Điều kiện tiên quyết và rào cản |
|---|---|---|---|---|---|---|
| `meta_lead_ads` | Form quảng cáo Facebook | Kênh | **Tháng 1** | Webhook trường `leadgen` của Page + Graph API | Vào: lead | Ứng dụng Meta đứng tên showroom; quyền đọc lead và quản lý Page; duyệt ứng dụng và xác minh doanh nghiệp; nếu Business Manager bật quản lý quyền truy cập lead thì phải cấp quyền cho ứng dụng CRM, không thì webhook tới nhưng không đọc được lead |
| `zalo_oa` | Zalo OA | Kênh | **Tháng 1** | OA OpenAPI, OAuth, webhook | Vào: tin nhắn, người theo dõi, thông tin khách chia sẻ. Ra: tin tư vấn | OA đã xác thực; **gói Tăng trưởng trở lên** (từ 01/06/2026 gói Cơ bản và Tiêu chuẩn không mở API); gói Tăng trưởng giới hạn 100 request/phút và 3 ứng dụng ủy quyền; tin tư vấn miễn phí trong 48 giờ sau tương tác của khách, ngoài 48 giờ tính phí theo hạn mức gói; OA nhận diện khách bằng mã người dùng, không có số điện thoại trừ khi khách chia sẻ |
| `email_smtp` | Email gửi lời mời | Vận hành | **Tháng 1** | SMTP riêng cho Supabase Auth | Ra: lời mời, đặt lại mật khẩu | Tên miền `daivietshowroomq4` có bản ghi SPF, DKIM; không dùng SMTP mặc định của Supabase khi chạy thật |
| `call_provider` | Tổng đài | Gọi điện | Khi có số | API và webhook của nhà cung cấp, qua `CallProvider` | Vào: cuộc gọi, ghi âm. Ra: lệnh gọi | Chưa có số. Tháng 1 dùng adapter `external`. Tiêu chí chọn ở mục 10.4 |
| `pancake` | Pancake | Kênh | Tùy chọn, tạm thời | API, webhook do Pancake cung cấp | Vào: hội thoại, khách, đơn (tùy phạm vi gói) | Chỉ nhận dữ liệu, `reply_mode = external` cho kênh Pancake đang trả lời; kiểm tra phạm vi API của gói showroom đang dùng trước khi làm |
| `meta_messenger` | Tin nhắn Facebook | Kênh | Tháng 2 | Messenger Platform, webhook | Vào, ra: tin nhắn | Duyệt ứng dụng cho quyền nhắn tin; chỉ trả lời trong 24 giờ sau tin cuối của khách, ngoài khung cần thẻ nhân viên do Meta cấp; nếu Pancake đang nối Page thì chọn một nơi trả lời |
| `tiktok_lead_forms` | Form quảng cáo TikTok | Kênh | Tháng 2 | TikTok API for Business, lấy lead Instant Form | Vào: lead | Tài khoản quảng cáo và ứng dụng được ủy quyền |
| `tiktok_messaging` | Tin nhắn TikTok | Kênh | Khi được cấp quyền | TikTok Business Messaging API | Vào, ra: tin nhắn | Đang mở dạng thử nghiệm theo khu vực, phải có tài khoản TikTok Business và xin quyền; khách phải nhắn trước; cần xác nhận Việt Nam đã được mở |
| `tiktok_shop` | TikTok Shop | Kênh | Tháng 2–3 | TikTok Shop Open API (Partner Center) | Vào: đơn hàng | Đăng ký ứng dụng trên Partner Center, ủy quyền shop |
| `zalo_zns` | Tin ZNS | Kênh | Tháng 2–3 | ZNS qua Zalo Cloud Account | Ra: tin mẫu xác nhận đơn, lịch giao | Chỉ gửi tới số điện thoại Việt Nam; mẫu tin phải được duyệt; tính phí theo tin. Không dùng được cho người đặt ở Hàn dùng số +82 |
| `meta_capi` | Gửi chuyển đổi về Facebook | Đo lường | Tháng 2 | Conversions API | Ra: sự kiện đặt cọc, giao xong, gắn với lead gốc | Số điện thoại và email băm SHA-256 trước khi gửi; chỉ gửi khách đã đồng ý |
| `tiktok_events` | Gửi chuyển đổi về TikTok | Đo lường | Tháng 2 | TikTok Events API | Ra: sự kiện chuyển đổi | Như trên |
| `bank_webhook` | Báo tiền về tài khoản | Tài chính | Tháng 2 | Dịch vụ báo biến động số dư (ví dụ SePay, Casso) | Vào: giao dịch, tự khớp đơn theo nội dung chuyển khoản | Tài khoản đứng tên pháp nhân; tiền từ Hàn chỉ nhận qua ngân hàng hoặc kênh kiều hối hợp pháp |
| `einvoice` | Hóa đơn điện tử | Tài chính | Tháng 2–3 | API nhà cung cấp hóa đơn (MISA, Viettel, VNPT…) | Ra: hóa đơn khi đơn hoàn tất | Chọn nhà cung cấp theo pháp nhân xuất hóa đơn |
| `file_storage` | Lưu video bàn giao | Vận hành | Tháng 2 | Supabase Storage (mặc định) hoặc Google Drive | Lưu video, ảnh lắp đặt | Bucket riêng tư, link ký ngắn hạn |
| `ai_speech` | Chuyển ghi âm thành văn bản | AI | Tháng 3 | API chuyển giọng nói tiếng Việt | Vào: ghi âm. Ra: bản chép | Cần tổng đài có ghi âm; bật tắt được |
| `ai_llm` | Trợ lý AI | AI | Tháng 3 | API mô hình ngôn ngữ | Tóm tắt, chấm lead, soạn tin, gộp hộ | Không gửi số điện thoại đầy đủ hay giấy tờ tùy thân sang mô hình; mọi kết quả AI là đề xuất có người xác nhận; bật tắt từng chức năng |

### 10.4 Chi tiết các đấu nối tháng 1

#### Form quảng cáo Facebook (`meta_lead_ads`)

- Showroom tự sở hữu Facebook Page và Zalo OA, nên ứng dụng Meta và OA đứng tên showroom; Owner tự kết nối ở màn hình Tích hợp. Viết hướng dẫn từng bước cho Owner trong `docs/integrations/meta_lead_ads.md`.
- Xác thực webhook: phản hồi `hub.challenge`; kiểm tra `X-Hub-Signature-256` bằng app secret.
- Nhận `leadgen_id` → gọi Graph API lấy chi tiết bằng Page access token.
- Cấu hình trong Cài đặt: chọn Page, chọn các form cần nhận, **ánh xạ câu hỏi của form sang trường lead** (họ tên, SĐT, quốc gia đang sống, tỉnh người nhận, sản phẩm, dịp tặng). Form mới chưa ánh xạ thì lead vẫn vào, phần chưa ánh xạ lưu trong `source_detail` và hiện cảnh báo cho Owner.
- Job đối soát lấy lead theo form trong 24 giờ gần nhất.

#### Zalo OA (`zalo_oa`)

- OAuth cho OA; access token ngắn hạn, job làm mới token trước khi hết hạn, cảnh báo khi làm mới thất bại.
- Webhook nhận tin và sự kiện; kiểm tra chữ ký theo tài liệu Zalo.
- Giao diện hiện còn bao lâu được nhắn miễn phí và trạng thái tính phí ngoài khung; không khóa cứng ô soạn, nhưng hiện rõ khi tin sẽ tính phí và đếm số tin ngoài khung đã dùng trong tháng so với hạn mức gói.
- Ánh xạ tài khoản nhân viên OA với người dùng CRM để biết ai trả lời.
- Ghi nhớ: khách ở Hàn dùng số +82 vẫn nhắn OA bình thường vì OA nhắn theo mã người dùng. Kịch bản tele phải mời khách quan tâm OA ngay cuộc gọi đầu.

#### Tổng đài (`call_provider`)

- **Showroom chưa có số tổng đài.** Tháng 1 chạy chế độ `external` (mục 5). Interface để cắm nhà cung cấp sau:

```ts
interface CallProvider {
  makeCall(input: { agentExtension: string; toE164: string; leadId: string }): Promise<{ providerCallId: string }>;
  parseWebhook(req: Request): Promise<NormalizedCallEvent | null>;
  getRecording(providerCallId: string): Promise<ReadableStream | null>;
}
```

- Adapter `external` (không gọi gì, chỉ ghi nhận thủ công) và adapter `mock` để kiểm thử. Adapter thật làm khi anh chốt nhà cung cấp.
- Chế độ `external`: ghi kết quả bắt buộc chọn kênh đã gọi (điện thoại, Zalo) và kết quả; SLA tính theo lần ghi đầu tiên; không có ghi âm.
- Tiêu chí chọn tổng đài (ghi vào `docs/integrations/call_provider.md`): có API gọi ra và webhook sự kiện cuộc gọi; trả file ghi âm qua API; có app trên điện thoại cho telesale; cước gọi đi Hàn Quốc; thủ tục đầu số hotline.
- Ghi âm tải về Storage riêng tư, phát qua URL ký ngắn hạn, kiểm quyền `call.recording_own` hoặc `call.recording_all`.

#### Email (`email_smtp`)

- Cấu hình SMTP cho Supabase Auth; mẫu email lời mời và đặt lại mật khẩu bằng tiếng Việt, gửi từ tên miền showroom.

#### Danh mục sản phẩm

- **Đại Việt không có API.** Sản phẩm, giá, tồn kho do sale admin cập nhật bằng màn hình hoặc nhập CSV; có xuất CSV gửi ngược cho Đại Việt. Không dựng đồng bộ tự động, không cào dữ liệu từ hệ thống của Đại Việt.

### 10.5 Ghi chú cho các đấu nối sau tháng 1

- **Messenger:** chỉ là cửa vào, không dùng để nuôi lead vì giới hạn 24 giờ. Mục tiêu của telesale là xin số hoặc chuyển khách sang Zalo OA trong 24 giờ đầu.
- **Pancake:** nếu dùng, chọn phương án lai: Form Facebook và Zalo OA nối thẳng CRM; Pancake giữ hộp thư kênh nào đội đang quen dùng, đẩy hội thoại về CRM, `reply_mode = external` cho kênh đó. Khi Messenger nối thẳng được thì chuyển kênh đó về `crm` và tắt chiều đọc từ Pancake để không trùng tin.
- **Chuyển đổi về Facebook và TikTok:** cần `source_detail` của lead giữ nguyên ID quảng cáo từ tháng 1, nên tháng 1 không được bỏ các trường này.
- **ZNS:** chỉ dùng cho người nhận hoặc khách trong nước có số Việt Nam; người đặt ở Hàn dùng Zalo OA.
- **Ngân hàng:** nội dung chuyển khoản theo mã đơn để tự khớp; giao dịch không khớp vào hàng chờ sale admin.
- **AI:** bật từng chức năng riêng trong Cài đặt; mặc định tắt; có nhật ký chi phí.

### 10.6 Không tích hợp (cấm)

Không viết code, không cài thư viện, không dùng dịch vụ bên thứ ba cho các đường sau, kể cả khi được yêu cầu nhanh:

| Đường | Lý do | Thay thế |
|---|---|---|
| Tự động hóa **Zalo cá nhân** (thư viện không chính thức, đăng nhập bằng QR, giả lập) | Zalo không có API cho tài khoản cá nhân; tự động hóa vi phạm điều khoản và có thể bị khóa tài khoản; dữ liệu khách nằm trong điện thoại nhân viên | Tài khoản nhân viên của Zalo OA; trong giai đoạn chuyển đổi, telesale ghi tay "Đã nhắn qua Zalo" trên CRM và mời khách quan tâm OA |
| Tin nhắn TikTok qua đăng nhập QR hoặc dịch vụ không chính thức | Không chính thức, rủi ro khóa tài khoản | Chờ quyền Business Messaging API |
| Cào bình luận live TikTok | Không có API công khai | Ghim form hoặc link Zalo OA trong live; admin tạo lead tay |
| Cào dữ liệu từ hệ thống của Đại Việt | Không có API, không được phép | Nhập, xuất CSV |

Nếu sau này nhà cung cấp mở đường chính thức, cập nhật mục này và sổ đăng ký trước khi làm.

---

## 11. Màn hình tháng 1

### 11.1 Danh sách màn hình

Chi tiết bố cục ở `DESIGN.md`.

| Màn hình | Ai thấy (theo quyền) |
|---|---|
| Đăng nhập, nhận lời mời | Tất cả |
| Trang chủ telesale: hàng chờ gọi của tôi, SLA, hẹn gọi lại hôm nay, chỉ số của tôi | `lead.view_own` |
| Trang chủ sale admin: lead chưa phân, quá hạn SLA, tải việc từng telesale, chỉ số đội | `lead.view_all` |
| Danh sách lead, bộ lọc, giao hàng loạt | `lead.view_own` (giao: `lead.assign`) |
| Hồ sơ lead và khách | Theo quyền xem lead |
| Hộp thư Zalo | `message.zalo_send` hoặc `message.view_all` |
| Sản phẩm, SKU, bảng giá | `product.view` (sửa: `product.manage`, `price.manage`) |
| Tồn kho: tổng quan, sổ kho, phiếu kho, serial, kiểm kê | `inventory.view` |
| Combo | `product.view` (sửa: `combo.manage`) |
| Chính sách và Thử chính sách | `policy.view` (sửa: `policy.manage`) |
| Báo giá | `quote.create` |
| Đơn hàng: danh sách, hồ sơ đơn | `order.view_own` / `order.view_all` |
| Thanh toán chờ xác nhận | `payment.confirm` |
| Duyệt giảm giá | `order.discount_approve` |
| Bảo hành | `warranty.manage` hoặc theo quyền xem đơn |
| Trang báo giá công khai cho khách `/q/<token>` | Không cần đăng nhập, chỉ hiện dữ liệu báo giá |
| Danh mục tra cứu | `catalog.view` / `catalog.manage` |
| **Đội ngũ** (menu riêng): Tổng quan đội, Hiệu suất cá nhân, Chỉ tiêu, Ca trực và chấm công, Hồ sơ nhân sự, Kèm cặp, Bàn giao | Tổng quan và người khác: `kpi.team`; của mình: `kpi.own`; các trang con theo quyền `staff.*`, `target.manage`, `coaching.manage` |
| Báo cáo | `report.own` / `report.team` |
| Cài đặt (mục 11.2) | Theo từng quyền `settings.*` |
| Nhật ký kiểm toán | `audit.view` |

Owner có thêm chế độ **"Xem như người dùng"** (chỉ đọc) để kiểm tra một người cụ thể đang thấy gì sau khi bật tắt quyền. Chế độ này ghi audit log và không cho thao tác ghi.

### 11.2 Khu Cài đặt

Cột menu trái, mỗi mục chỉ hiện khi có quyền:

| Mục | Nội dung | Quyền |
|---|---|---|
| Người dùng | Mời, khóa, đổi vai trò, quyền riêng từng người, "Xem như" | `settings.users` |
| Phân quyền | Ma trận vai trò × quyền, tạo vai trò mới | `settings.permissions` |
| Ca trực | Lịch ca tuần, người trong ca, khung giờ Hàn tương ứng | `settings.assignment` |
| Phân lead | Vòng tròn, giới hạn lead chưa gọi mỗi người, SLA phút, khung gọi giờ Hàn | `settings.assignment` |
| Chế độ gọi | Gọi ngoài hệ thống hoặc Qua tổng đài; nhắc rà quyền xem số khi đổi | `settings.integrations` |
| Danh mục | Nguồn, dịp tặng, kết quả cuộc gọi, lý do thất bại, ngân sách | `catalog.manage` |
| Kho | Danh sách kho, ngưỡng tồn thấp từng SKU | `product.manage` |
| Chỉ số và chỉ tiêu | Bật tắt chỉ số, ngưỡng cảnh báo, chỉ tiêu mẫu theo vai trò, bật bảng xếp hạng cho cả đội | Owner |
| Bán hàng | Mẫu mã đơn, thời hạn báo giá mặc định, thông tin chuyển khoản hiển thị cho khách, mẫu phiếu bảo hành | `settings.integrations` (Owner) |
| **Tích hợp** | Mọi đấu nối trong sổ đăng ký (mục 10.3) | `settings.integrations` |
| Dữ liệu và quyền riêng tư | Xử lý yêu cầu xóa, trích xuất dữ liệu một khách; nhật ký xem số | Owner |
| Nhật ký kiểm toán | Lọc theo người, hành động, thời gian | `audit.view` |

**Trang Tích hợp:**

- Nhóm theo `group`: Kênh khách hàng, Gọi điện, Đo lường quảng cáo, Tài chính, Vận hành, AI.
- Mỗi đấu nối là một hàng: tên, một câu mô tả, nhãn giai đoạn (Tháng 1, Tháng 2…), chip trạng thái (Chưa kết nối, Đang kết nối, Đã kết nối, Lỗi, Tạm dừng, Sắp có), lần nhận dữ liệu gần nhất, các nút theo trạng thái: **Kết nối**, **Kết nối lại**, **Gửi dữ liệu thử**, **Tạm dừng**, **Ngắt kết nối**.
- Đấu nối `implemented = false` vẫn hiện với nhãn **Sắp có** và danh sách điều kiện tiên quyết để Owner chuẩn bị trước (ví dụ: "Đã nâng Zalo OA lên gói Tăng trưởng", "Đã xác minh doanh nghiệp trên Meta", "Đã chọn nhà cung cấp tổng đài"). Owner đánh dấu từng điều kiện; dữ liệu lưu ở `prerequisites_done`.
- Bấm vào hàng mở drawer chi tiết gồm các tab:
  - **Điều kiện:** checklist tiên quyết kèm link tài liệu trong `docs/integrations/`.
  - **Cấu hình:** form sinh từ `configSchema`; với Form Facebook là bảng ánh xạ câu hỏi sang trường lead; với kênh nhắn tin là **chế độ trả lời** (Trả lời trên CRM / Trả lời ở công cụ khác, CRM chỉ đọc / Tắt).
  - **Nhật ký:** 50 sự kiện gần nhất từ `webhook_events` chỉ gồm loại sự kiện, thời điểm, trạng thái xử lý, lỗi; không hiện nội dung tin nhắn hay số điện thoại.
  - **Bí mật:** chỉ hiện đã có hay chưa và ngày cập nhật, nút thay khóa; không bao giờ hiện lại giá trị.
- Lỗi viết bằng câu dễ hiểu kèm cách xử lý, ví dụ: "Không lấy được chi tiết lead vì ứng dụng chưa được cấp quyền trong phần quản lý quyền truy cập lead của Business Manager."
- Khi một kênh có `reply_mode = external`, ô soạn của kênh đó trên hồ sơ lead chuyển sang chỉ đọc với dòng "Kênh này đang được trả lời trên <tên công cụ>".
- Token sắp hết hạn hoặc đấu nối lỗi quá 30 phút: thông báo cho Owner trên chuông và trên trang chủ sale admin.

---

## 12. Bảo mật và dữ liệu cá nhân

- RLS bật cho mọi bảng trong schema `public`; không có bảng nào "tạm tắt RLS".
- Khóa `service_role` chỉ dùng trong Edge Function và route handler phía server.
- Lưu căn cứ đồng ý (thời điểm, nguồn) theo Luật Bảo vệ dữ liệu cá nhân. Có chức năng cho Owner xử lý yêu cầu xóa hoặc trích xuất dữ liệu của một khách.
- Không gửi dữ liệu khách sang dịch vụ bên thứ ba ngoài các đấu nối đã liệt kê.
- Phiên đăng nhập có thời hạn; khóa người dùng thì phiên bị thu hồi ngay.
- Sao lưu theo cơ chế của Supabase; ghi cách khôi phục vào `docs/runbook.md`.

---

## 13. Cấu trúc repo

```
app/
  (auth)/login, (auth)/invite
  (app)/home, leads, leads/[id], inbox, products, inventory, combos, policies, quotes, orders, orders/[id], payments, warranties, team/{overview, people/[id], targets, shifts, staff, coaching, offboarding}, catalog, reports, settings/*, audit
  q/[token]        # trang báo giá công khai
  api/webhooks/meta, api/webhooks/zalo, api/webhooks/call/[provider]
  api/calls/make
components/        # theo DESIGN.md: shell, record, timeline, list-view, permission-matrix…
lib/
  auth/            # getSessionUser, can(), danh sách quyền
  phone/           # chuẩn hóa, che số
  leads/           # ingest, dedupe, assign, sla
  sales/           # pricing.ts (hàm định giá), inventory.ts, orders.ts, quotes.ts, warranty.ts
  kpi/             # definitions.ts (định nghĩa chỉ số), compute.ts, rollup.ts
  integrations/registry.ts, meta_lead_ads/, zalo_oa/, call_provider/{provider.ts, external.ts, mock.ts}, email_smtp/
  db/              # client, types sinh từ Supabase
supabase/
  migrations/      # mọi thay đổi schema
  functions/       # process-webhooks, refresh-zalo-token, sla-check, meta-reconcile
  seed.sql         # vai trò, quyền, danh mục mẫu, dữ liệu giả cho dev
docs/
  reference/daiviet-crm-q4.html
  integrations/*.md
  runbook.md
tests/
  unit/, e2e/ (theo vai trò), rls/
```

---

## 14. Cách làm việc

- Làm theo cột mốc ở mục 15. Đầu mỗi cột mốc, viết kế hoạch ngắn và chờ anh duyệt nếu có thay đổi schema hoặc quyền.
- Mỗi thay đổi schema là một migration mới; không sửa migration đã chạy. Hỏi trước mọi migration xóa cột, xóa bảng hoặc đổi kiểu dữ liệu có dữ liệu thật.
- Sau mỗi thay đổi schema, sinh lại type TypeScript từ Supabase.
- Trước khi báo xong một việc: chạy `lint`, `typecheck`, `test`, và e2e của phần liên quan. Báo rõ cái gì đã kiểm, cái gì chưa.
- Không commit secret, file `.env`, dữ liệu khách thật. Seed chỉ dùng dữ liệu giả.
- Chữ trên giao diện viết theo `DESIGN.md` mục giọng văn. Không để chữ tiếng Anh lọt ra màn hình người dùng.
- Khi không chắc về nghiệp vụ, hỏi anh thay vì đoán. Ghi các câu hỏi mở vào `docs/open-questions.md`.

### Lệnh

```
pnpm dev            # chạy web
pnpm lint
pnpm typecheck
pnpm test           # vitest
pnpm test:e2e       # playwright
pnpm test:rls       # kiểm thử chính sách RLS
pnpm db:migrate     # supabase migration up
pnpm db:types       # sinh type
```

---

## 15. Cột mốc giai đoạn 1 (7 tuần) và tiêu chí nghiệm thu

### Tuần 1: nền tảng và phân quyền
- Schema, RLS, seed vai trò và quyền, đăng nhập, mời người dùng.
- Màn hình phân quyền bật tắt và "Xem như người dùng".
- **Nghiệm thu:** telesale đăng nhập không đọc được lead của người khác kể cả khi gọi API trực tiếp (có test RLS); Owner tắt `lead.create` của một telesale thì nút tạo lead biến mất và API từ chối ở lần tải tiếp theo; mọi thay đổi quyền có trong audit log.

### Tuần 2: thu lead, chống trùng, phân lead
- Webhook Meta Lead Ads, nhập tay nhanh, nhập CSV, chuẩn hóa số, chống trùng, phân vòng tròn, SLA, khung giờ Hàn.
- **Nghiệm thu:** lead thử từ công cụ test lead của Meta vào CRM và được giao trong dưới 30 giây; gửi cùng một số hai lần không sinh hai lead mở; lead số +82 lúc 10:00 sáng giờ VN hiển thị hẹn gọi theo khung giờ Hàn; quá 5 phút chưa liên hệ thì sale admin thấy cảnh báo.

### Tuần 3: hồ sơ lead, cuộc gọi, Zalo
- Hồ sơ lead đầy đủ, dòng hoạt động, ghi kết quả, hẹn gọi lại, bốn thông tin bắt buộc.
- Chế độ gọi `external`: nút Gọi mở số cho đúng lead được giao, ghi audit log, tự mở bảng ghi kết quả. Adapter tổng đài và `mock` dựng sẵn.
- Nhập CSV dữ liệu thủ công cũ, lịch ca trực.
- Webhook Zalo OA, hộp thư, trả lời từ hồ sơ, làm mới token.
- **Nghiệm thu:** telesale chỉ xem được số của lead đang giao cho mình, lead chuyển đi thì mất quyền ngay, mọi lượt xem số có trong audit log; ghi kết quả một cuộc gọi dưới 30 giây; tin Zalo đến xuất hiện trên hồ sơ dưới 10 giây; không chuyển được sang `demo` khi thiếu thông tin bắt buộc; nhập thử một file dữ liệu cũ có dòng trùng và dòng lỗi được báo đúng.

### Tuần 4: danh mục, báo cáo, hoàn thiện
- Sản phẩm, danh mục, báo cáo cơ bản, trang chủ theo vai trò, nhật ký kiểm toán.
- Khu Cài đặt đầy đủ (mục 11.2), trang Tích hợp hiện toàn bộ sổ đăng ký; đấu nối chưa làm hiện "Sắp có" kèm điều kiện tiên quyết.
- Kiểm thử e2e cho ba vai trò, kiểm tra trên laptop 1366px và điện thoại.
- `docs/runbook.md`: cách thêm người dùng, xoay secret, xử lý webhook lỗi, khôi phục dữ liệu.
- **Nghiệm thu:** một ngày làm việc thật của telesale chạy hết trên CRM mà không cần bảng tính; sale admin xem được tỷ lệ gọi trong 5 phút theo từng người; Owner thấy đủ mọi đấu nối trong trang Tích hợp, đánh dấu được điều kiện tiên quyết, và kênh đặt chế độ "Trả lời ở công cụ khác" thì ô soạn trên hồ sơ chuyển sang chỉ đọc.

---

### Tuần 5: sản phẩm, tồn kho, combo, chính sách
- Sản phẩm, SKU, bảng giá, nhập CSV; kho, phiếu kho, giữ hàng, serial, kiểm kê; combo; chính sách sáu loại kèm giới hạn giảm giá; hàm định giá và màn hình Thử chính sách.
- **Nghiệm thu:** không có cách nào đổi số tồn ngoài phiếu kho đã ghi sổ (có test); tồn combo tính đúng từ thành phần; hàm định giá qua toàn bộ unit test ở mục 8.5; người không có quyền giá vốn không nhận được giá vốn qua bất kỳ API nào; sửa chính sách đang chạy tạo phiên bản mới.

### Tuần 6: báo giá, đơn hàng, thanh toán, bảo hành
- Báo giá từ hồ sơ lead, link công khai cho khách; đơn quà tặng hai người; luồng trạng thái đơn; ghi nhận và xác nhận thanh toán; duyệt giảm vượt mức; phiếu bảo hành, lịch thay vật tư; báo cáo bán hàng cơ bản.
- **Nghiệm thu:** một đơn đi trọn từ báo giá đến hoàn tất trên dữ liệu thử: cọc thì giữ hàng, hết hạn giữ thì nhả hàng, xuất kho bắt buộc gán serial, hoàn tất sinh bảo hành và cập nhật lead sang `won`; telesale áp giảm 7% thì đơn vào hàng chờ Owner duyệt; người ghi nhận thanh toán không tự xác nhận được; hủy đơn nhả giữ hàng đúng số lượng.

---

### Tuần 7: nhân sự và hiệu suất
- Hồ sơ nhân sự, lịch sử trạng thái, phiên trực, nghỉ, chỉ tiêu và chỉ tiêu mẫu, định nghĩa chỉ số, job gom số hằng đêm, menu Đội ngũ, kèm cặp, trình bàn giao.
- **Nghiệm thu:** mọi chỉ số trên màn hình khớp với danh sách bản ghi mở ra khi bấm vào; telesale chỉ thấy chỉ số của mình và trung vị đội, không thấy tên người khác khi bảng xếp hạng đang tắt; ghi chú kèm cặp không hiện cho người được nhắc trừ khi được chia sẻ; chạy trình bàn giao chuyển hết lead, hẹn gọi lại, báo giá, đơn đang mở sang người nhận và người nghỉ không đăng nhập được nữa; sửa công thức một chỉ số rồi chạy lại cho 30 ngày cho ra số mới nhất quán.

---

## 16. Quyết định đã chốt và câu hỏi còn mở

### Đã chốt (10/2026)

| Chủ đề | Quyết định | Ảnh hưởng tới code |
|---|---|---|
| Tổng đài | Chưa có số | Chế độ gọi `external` trong tháng 1, adapter sẵn sàng cho tổng đài |
| Zalo OA, Facebook Page | Showroom có kênh riêng, tự đấu nối | Owner tự kết nối ở màn hình Tích hợp, cần tài liệu hướng dẫn |
| Hệ thống Đại Việt | Không có API | Sản phẩm, giá, tồn kho nhập tay hoặc CSV |
| Ca làm việc | Chưa sắp xếp | Lịch ca cấu hình được, seed gợi ý ở mục 7 |
| Tên miền | `daivietshowroomq4` | Cấu hình trên Vercel khi chốt đuôi |
| Danh mục, quy trình | Trước đây làm thủ công, đây là bản thí điểm | Seed danh mục mặc định ở mục 6, có nhập CSV dữ liệu cũ |
| Zalo cá nhân | Không tích hợp tự động | Mục 10.6; chuyển dần sang tài khoản nhân viên Zalo OA |
| Danh mục đấu nối | Gom vào sổ đăng ký, quản lý ở Cài đặt, Tích hợp | Mục 10.2, 10.3, 11.2 |
| Bán hàng | Sản phẩm, tồn kho, combo, chính sách, đơn hàng quản lý ngay trong CRM | Mục 8 |
| Nhân sự | Quản lý đội bán hàng và chỉ số hiệu suất ở menu Đội ngũ riêng; không làm lương, không lưu giấy tờ cá nhân | Mục 9; giai đoạn 1 kéo dài thành 7 tuần |

### Còn mở

1. Đuôi tên miền (`.vn`, `.com.vn` hay `.com`) và tên miền phụ cho CRM, ví dụ `crm.daivietshowroomq4.vn`.
2. Địa chỉ email gửi lời mời và đặt lại mật khẩu (cần cấu hình SMTP riêng cho Supabase Auth, không dùng SMTP mặc định khi chạy thật).
3. Dữ liệu thủ công trước đây đang nằm ở đâu (Google Sheets, Excel, danh bạ Zalo cá nhân) để làm file mẫu nhập cho khớp.
4. Thời điểm dự kiến có số tổng đài, để xếp adapter thật vào tháng 2 hay tháng 3.
5. Showroom đang dùng Pancake cho những kênh nào, để đặt chế độ trả lời từng kênh.
6. Facebook Page, Zalo OA, TikTok Business đứng tên pháp nhân nào; thủ tục xác minh doanh nghiệp phụ thuộc vào câu trả lời này.
7. Danh sách SKU, giá, tồn hiện tại và chính sách đang áp dụng (bảo hành, đặt cọc, giao lắp theo vùng, khuyến mãi) để làm dữ liệu khởi tạo tuần 5.
8. Hàng nhập về showroom theo quy trình nào (Đại Việt giao kèm phiếu gì, ai ký nhận), và showroom có tự giữ kho hay chỉ trưng bày, giao thẳng từ kho Đại Việt.
9. Có công bố bảng xếp hạng có tên cho cả đội telesale không (mặc định tắt, chỉ quản lý thấy).
10. Chỉ tiêu tháng đầu của từng telesale, để nhập làm dữ liệu khởi tạo tuần 7.
