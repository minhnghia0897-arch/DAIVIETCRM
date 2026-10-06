# Thông báo Telegram cho nhân viên (`telegram_bot`)

Trạng thái: **bản demo đã dựng** (06/10/2026), bản thật chờ duyệt (`docs/open-questions.md` mục 29).

## Mục đích

Nhân viên không ngồi máy tính vẫn biết ngay việc của mình trên điện thoại: lead mới được giao, tới giờ hẹn gọi lại,
lead quá hạn, việc chờ duyệt, kết quả duyệt, đơn đổi trạng thái, có người nhắc trong nhóm nội bộ, đấu nối lỗi.
Bấm nút dưới tin để mở **Mini App** (CRM gọn cho điện thoại) hoặc làm nhanh (Xong, Hẹn lại 1 giờ).

Đây là kênh **nội bộ cho nhân viên**, không nhắn khách. Không thay Zalo OA.

**Đã chốt (06/10/2026):** Telegram là nơi đội làm việc **thay nhóm Zalo nội bộ**. Khách vẫn liên lạc qua Zalo OA và
điện thoại. CRM là nơi lưu chính: mọi thứ gắn với một khách hay một đơn phải về hồ sơ trong CRM, Telegram chỉ là nơi
báo việc, làm nhanh và trao đổi.

## Hai chiều

| Chiều | Việc | Kết quả trong CRM |
|---|---|---|
| CRM → Telegram | Báo việc theo sự kiện (lead mới, hẹn gọi lại, quá hạn, chờ duyệt, kết quả duyệt, đơn đổi trạng thái, nhắc tên trong nhóm, đấu nối lỗi) | Không đổi dữ liệu |
| Telegram → CRM | Bấm nút Xong, Hẹn lại 1 giờ dưới tin | Việc trong `tasks` đổi trạng thái, ghi `task_done` |
| Telegram → CRM | Trả lời (reply) vào tin báo về lead hoặc đơn | Ghi chú trên hồ sơ lead ("Qua Telegram: …"), số điện thoại gõ vào bị che |
| Telegram → CRM | Gửi ảnh chuyển khoản kèm số tiền vào tin của một đơn | Khoản thanh toán `recorded` kèm ảnh chứng từ, vào hàng chờ xác nhận; người ghi không tự xác nhận |
| Telegram → CRM | Lệnh `/viec` | Bot trả danh sách việc đang mở của chính người đó |
| Mini App | Việc, lead (gọi, ghi kết quả), đơn, duyệt, tìm | Như thao tác trên CRM |

Tin không gắn với khách hay đơn (trò chuyện chung) **không** lưu vào hồ sơ. Mọi thao tác từ Telegram đi qua đúng hàm
nghiệp vụ của màn CRM (`components/crm/telegram-in.ts` ở bản demo; `lib/tasks`, `lib/sales` ở bản thật), nên quyền,
đồng ý, giữ bất ngờ, nhật ký kiểm toán áp như nhau, kèm nguồn `telegram`.

## Nguyên tắc dữ liệu (CLAUDE.md mục 5, 12)

- Tin **không bao giờ** chứa số điện thoại hay nội dung tin nhắn của khách, ở cả hai mức.
- Mỗi người tự chọn mức: **Rút gọn** (chỉ báo có việc) hoặc **Chi tiết** (thêm tên gọi ngắn của khách, ví dụ "Thu (Hàn)",
  sản phẩm, giờ hẹn, mã đơn). Không gửi họ tên đầy đủ.
- Muốn xem đầy đủ thì mở Mini App: đăng nhập và kiểm quyền như mọi màn khác (RLS, `has_perm`), xem số vẫn ghi nhật ký.
- Sự kiện chỉ hiện trong cài đặt khi người đó có quyền liên quan (`lib/notify/events.ts`, `eventsFor`).
- Giờ im lặng: tin vẫn tới nhưng không chuông.
- Khóa người dùng hoặc gỡ liên kết: dừng gửi ngay.

## Thành phần trong code

| Phần | Nơi |
|---|---|
| Danh mục sự kiện, mặc định, cách viết tin hai mức, giờ im lặng | `lib/notify/events.ts` |
| Sinh tin từ thay đổi dữ liệu (demo) | `components/crm/store.tsx`, `notifyDiff` |
| Cài đặt của từng người | `/settings/notifications` (`components/crm/views/notify-settings.tsx`) |
| Mini App | `/m` (`components/crm/views/mini-app.tsx`) |
| Ghi ngược từ Telegram (trả lời, ảnh, lệnh) | `components/crm/telegram-in.ts`, thao tác `tgReply` |
| Sổ đăng ký | `lib/integrations/registry.ts`, mục `telegram_bot` (Sắp có) |

## Điểm cần kiểm theo tài liệu chính thức trước khi viết bộ nối thật

Môi trường làm việc hiện chặn `core.telegram.org`, nên các điểm dưới **chưa kiểm chứng**; không được viết bộ nối thật
dựa vào trí nhớ (mục 10.1). Mở quyền truy cập tên miền này rồi ghi lại endpoint, tham số, giới hạn đã đọc được:

1. Bot API `sendMessage` với `reply_markup.inline_keyboard`; nút `web_app` mở Mini App; nút `callback_data` cho thao tác nhanh
   (giới hạn độ dài `callback_data`).
2. `setWebhook` với `secret_token`, Telegram gửi lại trong header để server kiểm (mục 10.1 điều 4).
3. Liên kết tài khoản bằng deep link `https://t.me/<bot>?start=<mã>`: mã một lần, hết hạn ngắn, gắn với người dùng CRM.
4. Mini App: kiểm `initData` bằng HMAC với bot token ở server, đổi sang phiên CRM của đúng người đã liên kết.
5. `disable_notification` cho giờ im lặng.
6. Giới hạn tốc độ gửi tin của bot (theo giây, theo nhóm), cách xử lý lỗi 429 và người dùng đã chặn bot.
7. Trả lời `answerCallbackQuery` sau thao tác nhanh.

## Điều kiện tiên quyết (Owner chuẩn bị)

- Tạo bot qua BotFather, đặt tên hiển thị, lưu token vào Vault (`telegram_bot_token`) qua màn Tích hợp.
- Tên miền thật có HTTPS cho webhook `/api/webhooks/telegram` và Mini App (câu hỏi mở 1 ở `CLAUDE.md`).
- Đăng ký Mini App cho bot, trỏ về địa chỉ `/m` của CRM.
