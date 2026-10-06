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
| Bộ nối thật | `lib/integrations/telegram_bot/` (`api.ts`, `config.ts`, `inbound.ts`, `outbound.ts`) |
| Nhận tin (bản thật) | `app/api/webhooks/telegram/route.ts` |
| Đẩy tin (bản thật) | `supabase/functions/telegram-outbound/`, chạy theo lịch `pg_cron` |
| Database | `supabase/migrations/20261007000100_telegram.sql`: `telegram_links`, `telegram_link_codes`, `telegram_groups`, `telegram_messages`, `notification_prefs`, hàm `telegram_*`, bucket `telegram-attachments`. `20261007000200_telegram_live.sql`: cột `quiet_on`, bảng `telegram_outbound_state`, hàm `dispatch_telegram_outbound`, lịch cron |
| Chạy thử | `node scripts/telegram-bot.mts run \| run-inbound \| link <email> \| demo-lead <email> \| setup \| webhook-set <url> \| webhook-off` |
| Sổ đăng ký | `lib/integrations/registry.ts`, mục `telegram_bot` |

## Nối vào CRM thật

Ba đường, dùng chung một bộ xử lý nghiệp vụ nên đổi một chỗ là cả ba đổi theo.

**1. Nhân viên tự liên kết ở Cài đặt → Thông báo Telegram.** Bấm **Tạo link liên kết**: database sinh mã ngẫu nhiên
(hàm `create_telegram_link_code`, chỉ giữ bản băm, một lần, 10 phút), trang dựng link `https://t.me/<bot>?start=<mã>`.
Bấm Start trong Telegram là xong. Mức chi tiết, sự kiện muốn nhận, giờ im lặng lưu vào `notification_prefs` (RLS: mỗi
người chỉ sửa được của mình). Người có `settings.integrations` thấy thêm danh sách nhóm Telegram của đội.
Tên bot đọc từ `integrations.config.botUsername`; chưa khai thì trang chỉ chỗ cho Owner điền ở Tích hợp.

**2. Nhận tin bằng webhook.** Owner dán token và mã bí mật webhook ở Cài đặt → Tích hợp (vào Supabase Vault), rồi
`node scripts/telegram-bot.mts webhook-set https://<tên miền>`. Route kiểm `X-Telegram-Bot-Api-Secret-Token` bằng so
sánh thời gian không đổi; sai mã trả 401 và không đọc nội dung. Chưa có tên miền HTTPS thì vẫn chạy `getUpdates` bằng
lệnh `run`. Lưu ý: `proxy.ts` phải cho `/api/webhooks/` đi qua, vì Telegram gọi vào không có phiên đăng nhập.

**3. Đẩy tin bằng việc nền.** `pg_cron` gọi `public.dispatch_telegram_outbound()` mỗi phút; hàm này đọc hai khóa
trong Vault (`edge_functions_base_url`, `edge_functions_service_key`) rồi gọi Edge Function `telegram-outbound`.
Thiếu một trong hai khóa thì hàm im lặng, cron không báo lỗi. Con trỏ quét nằm ở `telegram_outbound_state` nên lần
chạy sau tiếp đúng chỗ lần trước dừng. Khi lịch này đã chạy, script chạy thử phải dùng `run-inbound` để không gửi
trùng tin.

Thứ tự cài một môi trường mới: đặt hai khóa Vault cho việc nền → Owner dán token, mã bí mật webhook và tên bot ở
Tích hợp → `webhook-set` → nhân viên tự liên kết ở Cài đặt → Thông báo Telegram.

## Đã kiểm theo tài liệu chính thức (07/10/2026)

Nguồn: `core.telegram.org/bots/api`, `core.telegram.org/bots/features`, `core.telegram.org/bots/faq`.

| Điểm | Theo tài liệu | Cách CRM dùng |
|---|---|---|
| Nhận tin | Hai cách loại trừ nhau: `getUpdates` (hỏi liên tục) hoặc webhook. Tin chờ trên máy chủ Telegram tối đa 24 giờ. `getUpdates`: `offset` = update_id lớn nhất + 1 để xác nhận; `timeout` giây cho hỏi dài; `allowed_updates` | Chạy thử: `getUpdates` (`scripts/telegram-bot.mts`). Bản thật: webhook, cùng bộ xử lý `inbound.ts` |
| Webhook | `setWebhook` với `secret_token`; Telegram gửi lại trong header `X-Telegram-Bot-Api-Secret-Token`; gửi lại khi phản hồi không phải 2XX | Bản thật kiểm header trước khi lưu `webhook_events` |
| Chống trùng | `update_id` tăng dần, dùng để bỏ tin lặp | `webhook_events` duy nhất theo (`telegram`, `update_id`) |
| Nút | `callback_data` 1–64 byte; sau khi người dùng bấm phải gọi `answerCallbackQuery` (kể cả không cần báo gì) | `t:done:<mã việc>`, `t:snz:<mã việc>` (42 byte); luôn trả lời nút |
| Tin im lặng | `disable_notification`: tin tới không có âm thanh | Giờ im lặng của từng người |
| Trả lời | `reply_to_message` là tin gốc (một tầng); `reply_parameters` để bot trả lời đúng tin | Tra `telegram_messages` theo (chat_id, message_id) để biết tin báo về lead nào |
| Ảnh | `photo` là mảng nhiều cỡ; `getFile` → tải `https://api.telegram.org/file/bot<token>/<file_path>`, tối đa 20MB, link còn hạn ít nhất 1 giờ; tên và loại tệp gốc có thể mất | Lấy cỡ lớn nhất, lưu bucket riêng tư `telegram-attachments` |
| Nhóm | `my_chat_member`: trạng thái của bot trong nhóm đổi (được thêm, bị xóa). `migrate_to_chat_id`: nhóm nâng lên siêu nhóm với mã mới (lưu bằng số nguyên 64 bit) | Nhóm mới vào "Chờ gán"; bị xóa thì "Mất kết nối"; đổi mã thì cập nhật |
| Chế độ riêng tư | Mặc định bật: trong nhóm, bot chỉ nhận lệnh gửi bot, tin trả lời tin của bot, tin hệ thống; tin riêng thì nhận hết. Bot làm quản trị nhóm sẽ nhận mọi tin | Giữ chế độ riêng tư; **không đặt bot làm quản trị nhóm**, để bot không đọc trò chuyện của đội |
| Liên kết | `t.me/<bot>?start=<tham số>`: ký tự A-Z a-z 0-9 _ -, tối đa 64 ký tự; bot nhận `/start <tham số>` | Mã ngẫu nhiên 32 ký tự hex, một lần, 10 phút |
| Giới hạn | Một chat: khoảng 1 tin/giây; một nhóm: tối đa 20 tin/phút; gửi hàng loạt khoảng 30 tin/giây, vượt thì lỗi 429 | Bản thật gửi qua hàng đợi `jobs`, giãn theo giới hạn |

## Điều kiện tiên quyết (Owner chuẩn bị)

- Tạo bot qua BotFather, đặt tên hiển thị, lưu token vào Vault (`telegram_bot_token`) qua màn Tích hợp.
- Tên miền thật có HTTPS cho webhook `/api/webhooks/telegram` và Mini App (câu hỏi mở 1 ở `CLAUDE.md`).
- Đăng ký Mini App cho bot, trỏ về địa chỉ `/m` của CRM.
