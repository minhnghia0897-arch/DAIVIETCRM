# Thông báo Telegram cho nhân viên (`telegram_bot`)

Trạng thái: **bản demo đã dựng** (06/10/2026); **bản thật nối được** (13/10/2026): Owner dán token là CRM tự đăng ký
webhook, menu lệnh và mã bí mật; đẩy tin chạy qua CRM trên Vercel như Messenger, Zalo.

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
| Telegram → CRM | Lệnh `/viec`, `/lead`, `/giaohang`, `/cskh` (mục *Lệnh xem nhanh*) | Không đổi dữ liệu; bot trả danh sách theo quyền vào tin riêng, nút mở thẳng màn CRM |
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
| Lệnh xem nhanh | `lib/integrations/telegram_bot/commands.ts` (`BOT_COMMANDS`, `runBotCommand`) |
| Nhận tin (bản thật) | `app/api/webhooks/telegram/route.ts` |
| Đẩy tin (bản thật) | `app/api/cron/telegram-outbound/route.ts`, `pg_cron` gọi mỗi phút (migration `20261013000200`). Bản Edge Function `supabase/functions/telegram-outbound/` giữ cho môi trường chạy hẳn trên Supabase, dùng chung `runTelegramOutbound` |
| Kết nối tự động | `app/(app)/settings/integrations/actions.ts`, `PROBES.telegram_bot`: chạy sau khi Owner bấm Lưu khóa |
| Database | `supabase/migrations/20261007000100_telegram.sql`: `telegram_links`, `telegram_link_codes`, `telegram_groups`, `telegram_messages`, `notification_prefs`, hàm `telegram_*`, bucket `telegram-attachments`. `20261007000200_telegram_live.sql`: cột `quiet_on`, bảng `telegram_outbound_state`, hàm `dispatch_telegram_outbound`, lịch cron |
| Chạy thử | `node scripts/telegram-bot.mts run \| run-inbound \| link <email> \| demo-lead <email> \| demo-flow <email> \| setup \| webhook-set <url> \| webhook-off`. `demo-flow` dựng một lượt đủ các loại tin đang chạy để kiểm tra một lần cài đặt mới có thông suốt không (có đặt đấu nối sang trạng thái lỗi, nhớ kết nối lại sau khi thử) |
| Sổ đăng ký | `lib/integrations/registry.ts`, mục `telegram_bot` |

## Nối vào CRM thật

Ba đường, dùng chung một bộ xử lý nghiệp vụ nên đổi một chỗ là cả ba đổi theo.

### CRM báo những tin gì

| Tin | Khi nào | Gửi cho ai |
|---|---|---|
| Lead mới giao cho tôi | sự kiện `assignment` | người được giao |
| Đến giờ hẹn gọi lại | việc `callback` tới hạn | người giữ việc, kèm nút Xong và Hẹn lại 1 giờ |
| Lead quá hạn gọi | quá `sla_due_at` mà chưa có `first_contact_at` | người giữ lead và người có `lead.view_all` (mục 7); mỗi lead một lần cho mỗi người, nhận ra qua `telegram_messages` |
| Có việc chờ tôi duyệt | `approvals` mới | người có quyền duyệt loại đó, trừ người đề xuất |
| Đề xuất của tôi được duyệt hay từ chối | `approvals.decided_at` | người đề xuất (bỏ qua khi đề xuất do agent AI tạo) |
| Đấu nối bị lỗi | `integrations.status = 'error'` | người có `settings.integrations` |
| Có lead mới | sự kiện `lead_created` | nhóm giữ công dụng *Kênh thông báo chung*, tin rút gọn |

Mỗi người tự chọn mức chi tiết, bật tắt từng loại, đặt giờ im lặng ở `/settings/notifications`. Ba mức:

- **Rút gọn** — chỉ báo có việc: *"Anh chị có 1 lead mới, gọi trước 09:17."*
- **Chi tiết** — thêm tên gọi ngắn và sản phẩm: *"Lead mới: Thu (Hàn). Gọi trước 09:17."*
- **Đầy đủ** — thêm tóm tắt hồ sơ để nắm tình huống mà không phải mở CRM: nguồn, ngân sách, dịp và ngày, tỉnh
  người nhận, cờ Giữ bất ngờ, khung gọi tốt theo thị trường của khách, số lần đã liên hệ, và bốn thông tin bắt
  buộc còn thiếu (mục 6). Tóm tắt chỉ nạp khi người nhận chọn mức này, nên hai mức kia không trả giá truy vấn.

Mức **Đầy đủ vẫn không có số điện thoại, địa chỉ chi tiết hay nội dung tin của khách** (mục 5, 12): Telegram là
máy chủ bên thứ ba và tin nằm lại trên điện thoại cá nhân nhân viên kể cả sau khi họ nghỉ. Muốn gọi thì bấm mở
CRM, nơi quyền được kiểm và mỗi lượt xem số có trong nhật ký. `shortCustomer()` bỏ mọi từ có chữ số trong tên
khách, vì nhân viên hay gõ cả số vào ô tên ("Chị Thu 0912345678").
Loại tin bản thật chưa sinh được thì khai `notYetLive` trong `lib/notify/events.ts`: trang Cài đặt hiện công tắc
mờ kèm lý do thay vì để người ta bật rồi chờ vô ích. Hiện có ba loại như vậy: *đơn đổi trạng thái* (chờ phần Đơn
hàng), *nhắc tôi trong nhóm* và *mọi tin nhóm* (đội trao đổi trên Telegram, CRM không đọc nhóm).
`tests/unit/telegram-bot.test.ts` bắt buộc danh mục và bộ gửi khớp nhau.

**1. Nhân viên tự liên kết ở Cài đặt → Thông báo Telegram.** Bấm **Tạo link liên kết**: database sinh mã ngẫu nhiên
(hàm `create_telegram_link_code`, chỉ giữ bản băm, một lần, 10 phút), trang dựng link `https://t.me/<bot>?start=<mã>`.
Bấm Start trong Telegram là xong. Ai mở bot rồi gõ `/start` hay gõ lệnh khi chưa liên kết thì bot chỉ các bước này
kèm nút mở thẳng trang liên kết (`LINK_HOW` trong `inbound.ts`). Mức chi tiết, sự kiện muốn nhận, giờ im lặng lưu vào `notification_prefs` (RLS: mỗi
người chỉ sửa được của mình). Người có `settings.integrations` thấy thêm danh sách nhóm Telegram của đội.
Tên bot đọc từ `integrations.config.botUsername`; chưa khai thì trang chỉ chỗ cho Owner điền ở Tích hợp.

**2. Nhận tin bằng webhook.** Owner chỉ dán **token** ở Cài đặt → Tích hợp → Thông báo Telegram rồi bấm **Lưu khóa**
(token vào Supabase Vault). CRM tự làm phần còn lại, theo thứ tự, dừng ở bước đầu tiên lỗi và báo bằng câu tiếng Việt:

1. `getMe` kiểm token, lấy tên bot, lưu vào `integrations.config.botUsername` (trang liên kết dùng tên này).
2. Chưa có mã bí mật webhook thì sinh ngẫu nhiên 48 ký tự hex và lưu Vault (`telegram_webhook_secret`); Owner không
   phải tự nghĩ mã. Ô này vẫn sửa được ở drawer nếu muốn đặt tay.
3. `setWebhook` về `https://<địa chỉ CRM đang mở>/api/webhooks/telegram` kèm `secret_token`, `allowed_updates`
   (`message`, `callback_query`, `my_chat_member`), `drop_pending_updates`. Địa chỉ phải là HTTPS (Telegram không
   nhận http), nên phải bấm Lưu khóa trên bản đã triển khai, không phải máy chạy thử.
4. `setMyCommands` đăng ký menu bốn lệnh (`BOT_COMMANDS`).
5. Người bấm đã liên kết Telegram thì bot gửi một tin thử cho chính người đó.

Route webhook kiểm `X-Telegram-Bot-Api-Secret-Token` bằng so sánh thời gian không đổi; sai mã trả 401 và không đọc
nội dung. Lưu ý: `proxy.ts` phải cho `/api/webhooks/` đi qua, vì Telegram gọi vào không có phiên đăng nhập. Máy chạy
thử chưa có HTTPS thì vẫn dùng `getUpdates` bằng `node scripts/telegram-bot.mts run`.

**3. Nhóm của đội ở màn Nhóm nội bộ.** `/chat` liệt kê đúng các nhóm Telegram bot đang ở (`telegram_groups`):
tên nhóm, công dụng, trạng thái (Chờ gán, Đang dùng, Ngưng, Bot đã rời nhóm), ai gán và lúc nào, cùng những tin
CRM đã đăng vào nhóm. Người có `settings.integrations` đổi được công dụng ngay trên CRM qua `set_telegram_group`,
cùng quy tắc với lệnh `/gan` trong nhóm: mỗi công dụng chỉ một nhóm đang dùng, nhóm cũ chuyển Ngưng.
Nhóm `status = 'lost'` phải thêm bot vào nhóm lại trên Telegram mới gán được.

**CRM không đọc trò chuyện của nhóm.** Bot giữ chế độ riêng tư và không làm quản trị nhóm, nên chỉ nhận lệnh gửi
bot và tin trả lời tin của bot. Màn Nhóm nội bộ vì vậy là màn kiểm soát, không phải bản sao hộp chat; màn có nói rõ
điều này cho người dùng.

**4. Đẩy tin bằng việc nền.** `pg_cron` gọi `public.dispatch_telegram_outbound()` mỗi phút. Từ migration
`20261013000200` hàm này chỉ chạy khi bot đã kết nối (`integrations.status = 'connected'`, đang bật), rồi gọi route
`/api/cron/telegram-outbound` của CRM bằng đúng cách Messenger, Zalo, Trợ lý AI đang dùng: địa chỉ CRM trong Vault
(`app_base_url`) và mã tự sinh `cron_invoke_token`, route kiểm lại qua `cron_token_ok` (thiếu mã thì 401). Thiếu khóa
Vault thì hàm im lặng. Con trỏ quét nằm ở `telegram_outbound_state` nên lần chạy sau tiếp đúng chỗ lần trước dừng.
Khi lịch này đã chạy, script chạy thử phải dùng `run-inbound` để không gửi trùng tin. Nút "Mở" dưới tin trỏ về địa
chỉ CRM (`linkBase`): Telegram từ chối nút có link http, nên ở máy chạy thử tin không có nút mở.

Màn Nhóm nội bộ cho mọi người trong showroom đọc danh sách nhóm (migration `20261007000300`); trước đó chỉ
`settings.integrations` đọc được nên màn trống với telesale. Tin bot gửi riêng cho một người thì chỉ người đó đọc.

Thứ tự cài một môi trường mới: Vault đã có `app_base_url` và `cron_invoke_token` (chung với Messenger, Zalo) → Owner
tạo bot ở BotFather, dán token ở Tích hợp, bấm Lưu khóa → nhân viên tự liên kết ở Cài đặt → Thông báo Telegram.

### Lệnh xem nhanh (Owner chốt 13/10/2026)

Gõ trong tin riêng với bot, hoặc chọn ở nút Menu. Gõ trong nhóm (`/lead@<bot>`) thì bot vẫn trả vào **tin riêng** của
người hỏi và chỉ báo trong nhóm "Đã gửi vào tin riêng…", để danh sách khách không lộ ra cả nhóm. Người chưa liên
kết hoặc tài khoản CRM đã khóa thì bot chỉ nhắc liên kết.

| Lệnh | Nội dung | Phạm vi theo quyền | Nút dưới tin |
|---|---|---|---|
| `/viec` | Việc đang mở hạn tới hết hôm nay (giờ VN), việc quá hạn đánh dấu "(quá hạn)", số việc đã xong hôm nay | Việc giao cho chính người hỏi | Xong, Dời 1 giờ cho 5 việc đầu; Mở Việc cần làm |
| `/lead` | Lead nhận hoặc được giao trong 3 ngày gần nhất: giai đoạn, nguồn, cờ quá hạn gọi; cả showroom thì thêm người giữ | `lead.view_all` cả showroom, `lead.view_own` của mình | Mở từng lead |
| `/giaohang` | Đơn giao trong 7 ngày: đã giao, lắp trong 7 ngày qua; hẹn giao từ nay tới 7 ngày tới (trễ hẹn đánh dấu); sẵn sàng giao hoặc đang giao mà chưa hẹn ngày | `order.view_all` mọi đơn, `order.view_own` đơn mình bán | Mở từng đơn |
| `/cskh` | Khách nhắn trong 3 ngày gần nhất mà tin cuối là của khách (chưa ai trả lời, hội thoại chưa xong); việc chăm sóc (gọi hỏi thăm sau giao, nhắc thay lõi, theo dõi bảo hành, nhắc dịp tặng, làm nóng lại) hạn trong 3 ngày qua tới hết hôm nay | Hội thoại: `message.view_all` hoặc hội thoại mình giữ; việc: của mình, `lead.view_all` thì cả showroom | **Hội thoại**: mở thẳng hội thoại trong màn Hội thoại để đọc và trả lời khách; khách không có hội thoại thì mở Hồ sơ khách |

Mỗi danh sách tối đa 15 mục, kèm tổng số; tin dài thì dừng trước giới hạn 4096 ký tự của Telegram và ghi "còn N nữa".
Nội dung theo mức người hỏi chọn ở Cài đặt → Thông báo Telegram (Owner 14/10/2026: muốn báo cáo qua Telegram chi tiết
hơn):

- **Rút gọn**: một dòng mỗi mục, không tên khách (loại việc, giai đoạn, mã đơn).
- **Chi tiết**: thêm tên gọi ngắn (`shortCustomer`), dòng đếm đầu tin (lead theo giai đoạn, số quá hạn gọi; đơn giao
  hôm nay, trễ hẹn, chưa hẹn ngày, tổng còn phải thu) và một dòng phụ quan trọng nhất mỗi mục.
- **Đầy đủ**: mọi dòng phụ.

| Lệnh | Dòng phụ (thứ tự ưu tiên; mức Chi tiết lấy dòng đầu) |
|---|---|
| `/viec` | Lead và giai đoạn, nguồn; hoặc đơn, trạng thái, còn thu · tiêu đề việc (đã che số) · nhu cầu, liên hệ, còn thiếu của lead |
| `/lead` | Nhu cầu (ngân sách, dịp và ngày, tỉnh người nhận, giữ bất ngờ) · đã liên hệ mấy lần, lần cuối, hẹn gọi lại · bốn thông tin còn thiếu · khung gọi tốt theo thị trường (khách nước ngoài) · báo giá gần nhất và trạng thái · giờ vào CRM |
| `/giaohang` | Các món (quà tặng ghi "tặng") · tổng, đã thu, còn thu · đơn quà tặng, giữ bất ngờ, người bán (khi xem cả showroom) |
| `/cskh` | Còn bao lâu được nhắn (Messenger 24 giờ, Zalo miễn phí 48 giờ) · lead và người giữ, hoặc khách đang hỏi và người trả lời · vòng đời, số đơn, đã trả · sản phẩm đang dùng và hạn bảo hành |

Không mức nào có số điện thoại, địa chỉ chi tiết (chỉ tỉnh) hay nội dung tin của khách; tiêu đề việc đi qua
`maskPhonesInText`. Tóm tắt đọc gộp một lần cho cả danh sách, không đọc từng mục. Bấm nút mở CRM vẫn phải đăng nhập và
kiểm quyền như mọi màn khác.

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
- Địa chỉ CRM có HTTPS cho webhook `/api/webhooks/telegram` và Mini App. Tạm dùng địa chỉ Vercel; đổi sang tên miền
  riêng (câu hỏi mở 1 ở `CLAUDE.md`) thì bấm Lưu khóa lại ở Tích hợp để đăng ký lại webhook.
- Đăng ký Mini App cho bot, trỏ về địa chỉ `/m` của CRM.
