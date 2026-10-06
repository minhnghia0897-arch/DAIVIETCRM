# Câu hỏi mở và đề xuất chờ duyệt

Cập nhật 04/10/2026. Câu hỏi về thông tin cần anh cung cấp nằm ở `CLAUDE.md` mục 16, Còn mở. File này ghi các đề xuất từ buổi rà soát logic chưa được duyệt. Duyệt điểm nào thì chuyển điểm đó vào `CLAUDE.md` và xóa khỏi đây.

## Quyền

1. **Ba mục Cài đặt chưa có mã quyền.** "Dữ liệu và quyền riêng tư" và "Chỉ số và chỉ tiêu" đang ghi "Owner"; "Bán hàng" đang dùng `settings.integrations`. Đề xuất: `privacy.manage` (chỉ Owner), dùng `target.manage`, thêm `settings.sales`. Mục Cài đặt "Kho" đang dùng `product.manage`; đề xuất dùng `inventory.document`.
2. **Lộ chỉ số qua Báo cáo.** `kpi.team` giới hạn sale admin theo người mình quản lý, nhưng `report.team` (báo cáo có "hiệu suất từng telesale") không giới hạn. Đề xuất: số liệu theo từng người chỉ ở Đội ngũ; Báo cáo kinh doanh chỉ có số tổng.
3. **Phạm vi sale admin.** Mục 5 ghi "người do mình quản lý trực tiếp cộng các telesale": mọi telesale hay chỉ telesale trong nhóm mình?
4. **Lộ khách qua hộ gia đình.** Người có `household.manage` gắn khách bất kỳ vào hộ rồi xem các thành viên. Đề xuất: thành viên hộ hiện theo quyền xem lead, đơn của từng thành viên; không được xem thì hiện bản che.
5. **"Xem như" phải làm ở tầng dữ liệu.** RLS chạy theo `auth.uid()` của Owner. Đề xuất: phiên giả lập ký ở server, `has_perm` và RLS đọc người đang được xem như, database chặn mọi thao tác ghi trong phiên đó.
6. **Tự duyệt của Owner.** Owner tự bán thì tự duyệt giảm giá và tự xác nhận tiền. Đề xuất: cho phép nhưng đếm riêng trong báo cáo kiểm soát.
7. **`payment.record` của telesale** giới hạn trong đơn mình là người bán.

## Bán hàng

8. **Lead thất bại dưới 30 ngày rồi khách quay lại:** luật chống trùng chưa nói. Đề xuất: mở lại lead cũ, giữ người phụ trách. Bản demo hiện làm bước an toàn: không tạo lead mới, tạo việc "Làm nóng lại" cho người giữ cũ để họ quyết định mở lại (`lib/leads/dedupe.ts`, `attach_recent_lost`).
9. **Đơn đã xác nhận chưa giữ hàng:** hai đơn cùng xác nhận chiếc cuối cùng đều lọt. Đề xuất: giữ hàng tạm khi xác nhận, hết giữ sau 24–48 giờ nếu chưa cọc.
10. **Khách bấm đồng ý trên trang báo giá công khai:** chỉ sinh đơn nháp, không giữ hàng, không gửi chuyển đổi, tạo việc cho người bán.
11. **Yêu cầu xóa dữ liệu** đụng chứng từ phải lưu theo luật kế toán (sổ kho, đơn, hóa đơn). Đề xuất: ẩn danh hóa khách, giữ chứng từ.
12. **Tuần 4 và tuần 5 cùng ghi "Sản phẩm".** Đề xuất: gom hết về tuần 5.
13. **Bảng `deliveries`:** giai đoạn 1 tạo bảng để cập nhật bước giao tay trên hồ sơ đơn, không dựng app cho kỹ thuật viên. Cần xác nhận.

## Nhỏ

14. `leads.recipient_province` trùng tỉnh của khách người nhận; đề xuất chỉ giữ một nơi lưu (giữ trên lead khi chưa có hồ sơ người nhận).
15. Giới hạn giảm giá theo vai trò: cho đặt thêm riêng từng người.
16. Thuật ngữ "QLSR" trong bản demo chưa có trong `DESIGN.md`; đề xuất dùng "Quản lý showroom" cho người hiển thị, quyền vẫn theo mã quyền.

## Đấu nối

17. **Lưu khóa đấu nối thật:** phần (a) **đã duyệt 06/10/2026 và đã làm**: migration `20261006000100_integration_secrets_vault.sql` (khóa nằm trong Supabase Vault, bảng `integration_secrets` chỉ ghi tên và ngày cập nhật, hàm `set_integration_secret` / `delete_integration_secret` chỉ cho người có `settings.integrations`, chặn khi "Xem như", ghi nhật ký không kèm giá trị; chỉ `service_role` đọc được giá trị qua `get_integration_secret`; mọi đổi cấu hình, trạng thái đấu nối ghi nhật ký). Màn Tích hợp bản thật đã lưu khóa, cấu hình, điều kiện tiên quyết, chế độ trả lời vào database. Còn lại: (b) bộ nối từng nhà cung cấp, viết sau khi kiểm tài liệu chính thức vào `docs/integrations/<key>.md`; tới lúc đó đấu nối không tự chuyển "Đã kết nối"; (c) tên miền thật có HTTPS cho webhook và địa chỉ chuyển hướng OAuth.
18. **OAuth Meta và Zalo** cần ứng dụng đứng tên showroom và tên miền thật cho địa chỉ chuyển hướng (câu hỏi mở 1, 6 ở `CLAUDE.md`).

## Rà soát quyền theo vai trò (05/10/2026)

Đã sửa trong bản demo: mọi thao tác đi qua lớp kiểm quyền chung (`components/crm/access.ts`, đóng vai server action), chế độ "Xem như" chặn mọi thao tác ghi, phạm vi xem của hộp thư, trợ lý AI, ô tìm kiếm, chuông duyệt, trang chủ, báo cáo, chống trùng, Giữ bất ngờ trên hồ sơ khách, nhả hàng khi hết hạn giữ, nhả đúng số hàng đã giữ của đơn đặt trước, hoàn tiền, phiên bản chính sách, bàn giao đơn khi nghỉ việc. Các điểm dưới đây cần anh quyết hoặc thuộc phần nối dữ liệu thật:

19. **Owner tự bật `lead.receive` cho mình** (mục 5 cho phép) nhưng database đang chặn: policy của `role_permissions` không cho sửa vai trò Owner, màn Người dùng ẩn quyền riêng trên dòng Owner. Đề xuất migration nhỏ cho phép quyền riêng `lead.receive` trên người dùng Owner. Chờ duyệt vì đổi quyền.
20. **Bốn mục Cài đặt còn thiếu** (Kho, Chỉ số và chỉ tiêu, Bán hàng, Dữ liệu và quyền riêng tư) cần mã quyền riêng như đề xuất ở điểm 1. Chờ duyệt mã quyền rồi dựng màn.
21. **Dữ liệu mô phỏng nằm sẵn trong trình duyệt:** bản demo nạp cả ghi chú kèm cặp, số điện thoại, giá vốn xuống trình duyệt rồi mới lọc theo quyền. Khi nối bảng thật, mọi màn này đọc qua Supabase dưới RLS (giá vốn, số đầy đủ chỉ trả khi có quyền), không dùng kho trạng thái chung.
22. **Trình bàn giao chưa khóa tài khoản thật:** bước 1 mới khóa trong dữ liệu mô phỏng. Khi có bảng `staff_profiles` thật sẽ gọi cùng hàm khóa người dùng ở Cài đặt, Người dùng.
23. **Đơn sinh từ báo giá** đang lấy tỉnh làm địa chỉ và chuyển thẳng "Đã xác nhận". Mục 8.7 cần đủ huyện, xã, chi tiết và chạy lại hàm định giá khi khách đồng ý. Làm ở tuần 6 cùng màn đơn thật.
24. **Thị trường "chưa rõ"** của khách đang bị gộp vào VN trong dữ liệu mô phỏng; khi nối bảng thật dùng `unknown` và bắt chọn ở cuộc gọi đầu (mục 6).
25. **Màn ngoài phạm vi tháng 1 đang có trong menu:** "Cơ hội" (Kanban) và "Agent". Đề xuất giữ để duyệt luồng, ghi rõ "Bản xem trước" hoặc ẩn khi chạy thật. Chưa có màn "Danh sách lead" dạng bảng (mục 11.1).
26. **Tab "Chỉ tiêu" của Đội ngũ** đang mở cho `kpi.team` (chỉ xem) lẫn `target.manage` (sửa). Mục 11.1 chỉ ghi `target.manage`. Anh chọn giữ chỉ xem cho sale admin hay ẩn.
27. **Đề xuất của agent AI** (từ tháng 2) đang đi hàng chờ với quyền duyệt giảm giá; khi làm thật dùng loại `ai_proposal` với quyền riêng.
28. **Nhóm nội bộ kiểu Telegram (06/10/2026):** đã dựng màn `/chat` bằng dữ liệu mô phỏng: nhóm, chủ đề trong nhóm (ai trong nhóm cũng tạo được), kênh thông báo chỉ quản trị đăng, trả lời trích dẫn, ảnh, tệp, liên kết, thích, ghim tin, khung thông tin nhóm gom ảnh, tệp, liên kết; số điện thoại gõ vào bị che trước khi gửi. Để chạy thật cần anh duyệt: (a) bảng `team_chats` (showroom_id, tên, loại nhóm/kênh), `team_chat_members` (vai trò quản trị/thành viên), `team_chat_topics`, `team_messages` (người gửi, chủ đề, nội dung, trả lời, thời điểm, xóa mềm), `team_message_attachments` (Storage riêng tư, link ký ngắn hạn), `team_chat_reads` (đã đọc tới đâu) với RLS chỉ thành viên đọc, ghi; (b) hai quyền mới `team_chat.use` (mặc định mọi vai trò) và `team_chat.manage` (tạo nhóm, thêm người, xóa tin người khác; mặc định Owner, Sale admin); hiện menu mở cho mọi người dùng đang hoạt động; (c) tin nhắn nội bộ không gửi sang bên thứ ba, khóa người dùng thì rời mọi nhóm, trình bàn giao giữ lịch sử; (d) cập nhật tin mới theo thời gian thực bằng Supabase Realtime (không thêm hạ tầng).
29. **Thông báo Telegram cho nhân viên và Mini App (06/10/2026):** đã dựng bản demo: cài đặt `/settings/notifications` (liên kết, mức Rút gọn/Chi tiết tự chọn, sự kiện muốn nhận theo quyền, giờ im lặng, điện thoại xem trước với nút nhanh) và Mini App `/m` (Việc, Lead, Đơn, Duyệt, Tìm). Tin không bao giờ có số điện thoại hay nội dung tin của khách. Để chạy thật cần anh duyệt: (a) bảng `telegram_links` (user_id, telegram_user_id, chat_id, linked_at, revoked_at; mã liên kết một lần hết hạn 10 phút) và `notification_prefs` (user_id, level, events jsonb, quiet_from, quiet_to) với RLS chỉ chính người đó; (b) tin chờ gửi đi qua bảng `jobs` và Edge Function `send-telegram`, sinh từ `events`/`tasks`/`approvals` ở server, kiểm lại quyền người nhận lúc gửi; (c) webhook `/api/webhooks/telegram` kiểm `secret_token`, nút nhanh (Xong, Hẹn lại) gọi cùng hàm nghiệp vụ `lib/tasks` và ghi nhật ký; (d) Mini App đăng nhập bằng `initData` kiểm HMAC ở server rồi cấp phiên của đúng người đã liên kết; (e) bot token trong Vault, tên miền HTTPS thật, và mở quyền truy cập `core.telegram.org` cho môi trường làm việc để đọc tài liệu chính thức trước khi viết bộ nối (mục 10.1). Telegram là dịch vụ bên thứ ba mới: cần anh xác nhận thêm vào danh sách đấu nối (mục 12).
