# Zalo OA — `zalo_oa`

Hướng dẫn cho Owner nối Zalo OA của showroom vào CRM để tin nhắn Zalo hiện chung với Messenger ở màn **Hội thoại**.
Bộ nối viết ngày 09/10/2026 (migration `20261009000100_zalo_oa.sql`, webhook `/api/webhooks/zalo`).

**Nguồn đã đọc.** Trang `developers.zalo.me`, `oauth.zaloapp.com`, `openapi.zalo.me` bị chặn từ môi trường làm việc,
nên các điểm dưới đây đối chiếu từ mã nguồn thư viện mở `@warriorteam/redai-zalo-sdk` 1.39.2 (bên thứ ba, đọc từ gói
npm) và trí nhớ; điều kiện gói OA lấy từ `CLAUDE.md` mục 10.3 (hiện trạng 10/2026). **Phải mở tài liệu gốc kiểm lại
trước khi chạy thật** (mục 10.1 điều 1), nhất là các điểm ghi "chưa kiểm".

## Đã đối chiếu (thư viện bên thứ ba)

- **Làm mới token:** `POST https://oauth.zaloapp.com/v4/oa/access_token`, thân dạng form
  `refresh_token`, `app_id`, `grant_type=refresh_token`, header `secret_key: <App Secret>`. Trả `access_token`,
  `refresh_token` (mới), `expires_in` (giây).
- **Gửi tin tư vấn:** `POST https://openapi.zalo.me/v3.0/oa/message/cs`, header `access_token`, thân
  `{ recipient: { user_id }, message: { text } }`, chữ tối đa 2.000 ký tự. Trả `{ error: 0, data: { message_id } }`;
  lỗi trả `error` khác 0 trong thân.
- **Thông tin OA:** `GET https://openapi.zalo.me/v2.0/oa/getoa` (dùng kiểm token thuộc đúng OA).
- **Tên khách:** `GET https://openapi.zalo.me/v3.0/oa/user/detail?data={"user_id":"…"}` → `data.display_name`.
- **Sự kiện webhook:** mọi sự kiện có `app_id`, `event_name`, `timestamp`; tin khách gửi là `user_send_text`,
  `user_send_image`, `user_send_file`… (`sender.id` là mã người dùng, `recipient.id` là OA, `message.msg_id`,
  `message.text`, `message.attachments`); tin OA gửi là `oa_send_*` (người gửi là OA); khách gửi form thông tin là
  `user_submit_info` (`info.name`, `info.phone`, `info.address`…); ngoài ra `follow`, `unfollow`,
  `user_seen_message`, `user_received_message`.

## Chưa kiểm (theo trí nhớ, cần đọc tài liệu gốc)

- **Chữ ký webhook:** header `X-ZEvent-Signature`, giá trị `mac = sha256(appId + data + timeStamp + OAsecretKey)`
  (data là thân yêu cầu nguyên văn, timeStamp là trường `timestamp`); CRM nhận cả dạng có tiền tố `mac=`. **OA Secret
  Key** khác App Secret, nằm ở mục Webhook của ứng dụng Zalo.
- **Thời hạn token:** access token khoảng 25 giờ, refresh token khoảng 3 tháng và **chỉ dùng được một lần**.
- **Khung tin tư vấn:** miễn phí 48 giờ sau tương tác cuối của khách, ngoài đó tính phí theo hạn mức gói (CLAUDE.md
  10.3); chưa rõ Zalo có chặn hẳn sau 7 ngày không.
- **Mã lỗi:** `-216`, `-124`, `-14014` token hỏng hoặc hết hạn; `-213`, `-230` khách chưa quan tâm hoặc quá lâu không
  tương tác; `-224`, `-32` hết hạn mức hoặc gửi quá nhanh; `-201` dữ liệu không hợp lệ.
- **Xác minh tên miền** cho webhook (thẻ meta hoặc tệp xác minh trên tên miền CRM).

## Phần A. Owner chuẩn bị

1. OA đã **xác thực** và ở **gói Tăng trưởng trở lên** (từ 01/06/2026 gói Cơ bản, Tiêu chuẩn không mở API). Gói
   Tăng trưởng giới hạn 100 yêu cầu mỗi phút và 3 ứng dụng được ủy quyền.
2. Tạo **ứng dụng Zalo** ở Zalo for Developers bằng tài khoản quản trị OA, liên kết OA với ứng dụng, bật quyền đọc và
   gửi tin nhắn, đọc thông tin người quan tâm.
3. Ghi lại: **App ID**, **App Secret**, **OA ID**, **OA Secret Key** (mục Webhook).
4. Lấy **refresh token** của OA bằng công cụ lấy token của Zalo for Developers (đăng nhập bằng tài khoản quản trị OA,
   chọn OA, cấp quyền).
5. **Mỗi kênh một nơi trả lời:** nếu OA đang được trả lời ở Pancake hay công cụ khác, chọn chuyển sang CRM hoặc để CRM
   chỉ đọc.

Không gửi khóa, token qua chat hay email; anh tự dán vào CRM ở phần B.

## Phần B. Kết nối trên CRM

Điều kiện: CRM chạy trên tên miền HTTPS thật (câu hỏi mở 1).

1. Cài đặt › Tích hợp › Zalo OA › **Kết nối**: dán App Secret, OA Secret Key, refresh token, điền App ID, OA ID, đánh
   dấu đã chuẩn bị xong, bấm **Lưu khóa và cấu hình**. CRM làm mới token ngay (kiểm App Secret và refresh token), kiểm
   token thuộc đúng OA đã khai rồi mới chuyển sang **Đã kết nối**. Refresh token mới được lưu thay cho cái anh dán.
2. Trong ứng dụng Zalo › Webhook: địa chỉ `https://<tên miền CRM>/api/webhooks/zalo`, bật các sự kiện
   `user_send_text`, `user_send_image`, `user_send_file`, `user_send_sticker`, `user_submit_info`, `oa_send_text`.
3. Nhắn thử vào OA: tin hiện ở **Hội thoại** (lọc kênh Zalo) trong khoảng 10 giây, kèm lead nguồn "Zalo OA" được phân
   cho người đang trực.
4. Đặt `CRON_SECRET` trên Vercel: lịch `vercel.json` gọi `/api/cron/zalo-token` mỗi ngày lúc 03:00 giờ VN để làm mới
   token khi còn dưới 12 giờ.

## CRM làm gì

- **Nhận tin:** kiểm chữ ký, lưu thô vào `webhook_events` (chống trùng theo mã tin), trả `200`, xử lý ngay sau đó; job
  mỗi phút (`zalo-backlog`) xử lý tin còn sót. Sự kiện đã xem, theo dõi không lưu.
- **Khách và lead:** tin đầu từ người lạ tạo khách với định danh `zalo_user_id`, căn cứ chăm sóc trên kênh Zalo OA (khách
  tự nhắn), lead nguồn "Zalo OA" rồi phân như mọi lead; khách có lead mở thì nối vào lead đó. Phần nhận tin dùng chung
  với Messenger (`ingest_channel_message`).
- **Khách chia sẻ số qua form:** số được chuẩn hóa, thêm vào định danh của khách, thị trường suy theo đầu số khi chưa
  rõ; tên tạm đổi thành tên khách gửi. Số đang thuộc khách khác thì **không gộp tự động**, tạo việc "kiểm tra gộp hồ
  sơ" cho người có quyền gộp.
- **Trả lời:** cần quyền `message.zalo_send`. Trong 48 giờ là tin miễn phí; ngoài 48 giờ vẫn gửi được nhưng phải tick
  "Gửi tin tính phí", màn Hội thoại hiện số tin tính phí đã gửi trong tháng. Database kiểm thêm chế độ trả lời, đồng ý,
  giữ bất ngờ; tin đi đầu tiên dừng đồng hồ SLA.
- **Trả lời thẳng trên ứng dụng OA:** Zalo gửi bản sao (`oa_send_*`), CRM ghi lại là tin đi "Trên OA". Bản sao tin
  của CRM được nhận ra theo mã tin hoặc nội dung, không nhân đôi.
- **Token:** làm mới khi còn dưới 1 giờ lúc gửi tin, nhận tin, và mỗi ngày qua lịch chạy; hai tiến trình không cùng làm
  mới (khóa ở database). Làm mới thất bại thì đấu nối chuyển sang **Lỗi** và Owner được báo trên chuông.
- **Không lộ dữ liệu:** nội dung tin chỉ ở bảng `messages` và hộp nhận thô; sự kiện, thông báo, nhật ký không chứa nội
  dung tin hay số điện thoại.
- **Chạy thử trên máy:** đặt `ZALO_OAUTH_URL=http://127.0.0.1:4011/v4/oa/access_token`,
  `ZALO_API_BASE=http://127.0.0.1:4011` cho server; `tests/e2e/zalo.spec.ts` dựng sẵn máy chủ Zalo giả (chạy với
  `E2E_ZALO_MOCK=1`).

## Còn thiếu

- Nút đăng nhập Zalo (OAuth có PKCE, `oauth.zaloapp.com/v4/oa/permission`) thay cho dán refresh token: cần địa chỉ
  HTTPS để Zalo chuyển về.
- Tệp, ảnh khách gửi mới hiện số tệp; gửi ảnh, tệp từ CRM.
- Lời mời quan tâm OA khi khách chỉ bấm theo dõi mà chưa nhắn (sự kiện `follow` hiện chưa dùng).
- Ánh xạ tài khoản nhân viên OA với người dùng CRM (CLAUDE.md 10.4) cho tin trả lời thẳng trên ứng dụng OA.
