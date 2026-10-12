# Tin nhắn Facebook (Messenger) — `meta_messenger`

Hướng dẫn cho Owner kết nối Facebook Page của showroom với CRM để nhận và trả lời tin nhắn Messenger ngay trên CRM.
Theo `CLAUDE.md` mục 10.3, đấu nối này thuộc **tháng 2**; bộ nối đã viết từ 08/10/2026 (migration
`20261008000200_messenger.sql`, webhook `/api/webhooks/meta`, màn Hội thoại). Phần A làm được ngay, phần B làm khi CRM
chạy trên tên miền HTTPS thật.

Các điểm dưới đây kiểm lại ngày 08/10/2026 và đọc trực tiếp tài liệu gốc ngày 11/10/2026 (Graph API v26.0, xem Nguồn).
Điểm nào chưa kiểm được ghi rõ "chưa kiểm".

## Đã kiểm

- **Quyền ứng dụng cần xin** (qua Facebook Login for Business): `pages_show_list`, `pages_manage_metadata`,
  `pages_messaging`, `pages_read_engagement`, `business_management`. `business_management` là quyền phụ thuộc của
  `pages_messaging`.
- **Người bấm kết nối** phải có việc **Nhắn tin (MESSAGING)** và **Kiểm duyệt (MODERATE)** trên Page.
- **Mức quyền (đọc tài liệu gốc 11/10/2026, sửa ghi chú cũ):** ứng dụng doanh nghiệp tự có **Standard Access**, nhưng
  trang Webhooks for Messenger Platform ghi: Standard Access chỉ nhận thông báo từ **người có vai trò trên ứng dụng**
  (quản trị, nhà phát triển, người thử); muốn nhận tin của **khách** (người không có vai trò) phải có **Advanced
  Access**, cần App Review. Trang Access Levels: Advanced Access cần **xác minh doanh nghiệp** (Business Verification),
  có thể phải duyệt thêm từng quyền. Hệ quả: ứng dụng ở chế độ phát triển, chưa có Advanced Access cho
  `pages_messaging` thì tin khách thật không về CRM.
  **Thực tế trên NGHIA ngày 11/10/2026 khác tài liệu:** ứng dụng DAIVIETCRM mới có Standard Access cho
  `pages_messaging` (chưa gửi App Review) nhưng vẫn nhận tin của một tài khoản không có vai trò trên ứng dụng, không
  liên quan Page (Owner thử lúc 22:51). Giữ nguyên ứng dụng này; nếu Meta siết lại đúng như tài liệu thì xin Advanced
  Access: xác minh doanh nghiệp, biểu tượng 1024×1024, các trang `/privacy`, `/terms`, `/data-deletion` (đã có), quay
  màn hình theo yêu cầu của từng quyền (với `pages_messaging`: bước đăng nhập Facebook cấp quyền trên ứng dụng, rồi
  ứng dụng gửi tin và tin hiện trong Messenger của khách). CRM hiện kết nối bằng dán khóa, nên lúc đó cần thêm nút
  đăng nhập Facebook (Facebook Login for Business) để quay được bước cấp quyền.
- **Webhook:** khai địa chỉ nhận (callback URL) và mã xác minh (verify token); Meta gửi yêu cầu GET kèm
  `hub.challenge` để xác nhận. Đăng ký Page vào ứng dụng, chọn `messages`, `messaging_postbacks`, `message_echoes`.
- **Chữ ký:** HMAC-SHA256 bằng App Secret của **đúng ứng dụng** gửi webhook, trong `X-Hub-Signature-256`; tính trên
  bản thoát Unicode của thân (`äöå` thành `\u00e4\u00f6\u00e5`, hex chữ thường). Mỗi ứng dụng ký bằng App Secret
  riêng: nếu một ứng dụng khác (ví dụ AICHAT) cũng khai callback URL của CRM thì mọi webhook của nó đều "sai chữ ký".
- **Gửi lại khi lỗi:** Meta thử lại vài lần ngay; quá 15 phút vẫn lỗi thì báo về tài khoản nhà phát triển; lỗi kéo dài
  1 giờ thì gửi cảnh báo "Webhooks Disabled" và **hủy đăng ký ứng dụng khỏi Page**, phải đăng ký lại.
- **Bản sao tin của Page (`message_echoes`):** gửi khi Page gửi tin, kể cả gửi từ hộp thư Page; `app_id` là ứng dụng
  gửi, từ v12.0 tin gửi từ hộp thư Page có `app_id` của hộp thư Page (tài liệu ghi `26390203743090`).
- **Đọc lại tin (để đối soát):** `GET /{page-id}/conversations` (tham số `platform`, `user_id`, `folder`; trả `id`,
  `updated_time`, `participants`) cần Page access token của người có việc MESSAGING và các quyền
  `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`; không phân trang theo thời gian. Hội thoại trong
  thư mục Tin nhắn chờ không hoạt động quá 30 ngày thì không trả. `GET /{conversation-id}/messages` và
  `GET /{message-id}` cần `pages_messaging`, `pages_manage_metadata`; mỗi tin có `id`, `created_time`, `from` (người
  hoặc Page), `to`, `message`, `sticker`, `attachments.data[]` (`image_data`, `video_data`, `file_url`, `mime_type`,
  `name`). Chỉ đọc được chi tiết **20 tin gần nhất** của mỗi hội thoại; tin cũ hơn báo "đã bị xóa".
  Trên NGHIA, token CRM đang dùng (lấy ở Messenger, Cài đặt API) bị từ chối `GET /me` (mã 100, đòi
  `pages_read_engagement`) nhưng **đọc được hội thoại và tin**: lượt đọc lại đầu tiên (12/10/2026 00:58 UTC) đọc 4 hội
  thoại, thêm 3 tin bị lỡ (1 tin khách, 2 tin trả lời trên hộp thư Facebook, có ảnh), không tin nào trùng
  (`byContent = 0`, tức mã tin Graph trùng `mid` của webhook). `pages_read_engagement` ở Standard Access dùng được
  ngay cho Page của mình, không cần gửi xét duyệt.
- **Ảnh đại diện khách (User Profile API):** `GET /{psid}?fields=profile_pic`. Tài liệu ghi cần **Advanced Access
  cho tính năng Business Asset User Profile Access** (xin qua App Review); `profile_pic` là link **hết hạn** sau một
  thời gian; khách tạo tài khoản bằng số điện thoại thì báo mã 2018218 "No profile available"; không lấy được thì Meta
  trả object rỗng. Tên khách cũng nằm sau tính năng này, nhưng trên NGHIA tên vẫn lấy được ở Standard Access.
- **Khung 24 giờ:** được nhắn trong 24 giờ kể từ lần cuối khách tương tác (khách nhắn, bấm nút Bắt đầu, nhắn từ quảng
  cáo Click-to-Messenger…). Trong khung được gửi cả nội dung khuyến mãi.
- **Ngoài 24 giờ:** chỉ còn thẻ **Human Agent**: nhân viên trả lời tay trong **7 ngày**, chỉ để giải quyết đúng việc
  khách hỏi, cấm tin tự động và nội dung không liên quan. Các thẻ `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`,
  `POST_PURCHASE_UPDATE` đã ngừng từ 10/02/2026, không dùng.

## Chưa kiểm

- Mã lỗi Send API: `10/2018278` (ngoài khung), `551` (khách không nhận được tin), `190` (token hỏng), `4`, `32`, `613`
  (gửi quá nhanh) lấy theo trí nhớ và hướng dẫn bên thứ ba; kiểm lại trên tài liệu gốc trước khi chạy thật.
- Human Agent có cần xin quyền riêng (Advanced Access, mô tả cách dùng) hay không. Hướng dẫn của bên thứ ba ghi là
  có; chờ đọc tài liệu gốc.
- Messenger có yêu cầu xác minh doanh nghiệp (Business Verification) cho trường hợp Page của chính mình hay không.
- Thời hạn của Page access token khi lấy qua Facebook Login for Business.

## Phần A. Owner chuẩn bị ngay (không cần chờ CRM)

1. **Business Manager:** Page Facebook của showroom nằm trong Business Manager đứng tên pháp nhân của showroom (câu hỏi
   mở 6). Anh là quản trị viên của Business Manager và của Page.
2. **Tạo ứng dụng Meta** ở developers.facebook.com bằng tài khoản quản trị Business Manager: loại ứng dụng doanh
   nghiệp, gắn vào Business Manager của showroom, thêm sản phẩm **Messenger**. Có thể dùng chung ứng dụng với Form
   quảng cáo Facebook (`meta_lead_ads`).
3. **Vai trò:** thêm tài khoản Facebook của người sẽ bấm kết nối làm quản trị viên ứng dụng; trên Page, người này có
   quyền Nhắn tin và Kiểm duyệt.
4. **Chọn một nơi trả lời** (mục 10.1 điều 7): nếu Page đang trả lời bằng Pancake hay công cụ khác, chọn hoặc chuyển
   hẳn sang CRM, hoặc giữ công cụ cũ và để CRM chỉ đọc (`reply_mode = external`). Không trả lời song song hai nơi.
5. **Đánh dấu điều kiện** trên CRM: Cài đặt › Tích hợp › Tin nhắn Facebook › tab Điều kiện, tick "Ứng dụng Meta đã
   được duyệt quyền nhắn tin" (với Page của mình: đã thêm sản phẩm Messenger và đủ vai trò) và "Page này không còn được
   trả lời ở Pancake hoặc công cụ khác".
6. **Kịch bản cho telesale:** Messenger chỉ là cửa vào (mục 10.5): trong 24 giờ đầu xin số điện thoại hoặc mời khách
   quan tâm Zalo OA, vì sau 24 giờ không nhắn chủ động được nữa.

Không gửi app secret, token qua chat hay email; anh tự dán vào CRM ở phần B.

## Phần B. Kết nối trên CRM

Điều kiện: CRM đã chạy trên tên miền HTTPS thật (Vercel, câu hỏi mở 1). Chưa có ứng dụng đăng nhập Facebook đứng tên
showroom nên bản này kết nối bằng cách dán khóa; khi có Facebook Login for Business thì đổi sang nút đăng nhập.

1. **Lấy khóa trong ứng dụng Meta:**
   - App Secret: Cài đặt ứng dụng › Thông tin cơ bản › Khóa bí mật của ứng dụng.
   - Page access token: Messenger › Cài đặt API › Tạo token cho Page của showroom.
   - ID Page: trang Giới thiệu của Page, hoặc ở cùng chỗ tạo token.
   - Mã xác minh webhook: anh tự đặt một chuỗi khó đoán, dùng ở cả hai bước 2 và 3.
2. Cài đặt › Tích hợp › Tin nhắn Facebook › **Kết nối**: dán App Secret, Page access token, mã xác minh, ID Page, đánh
   dấu đã chuẩn bị xong, bấm **Lưu khóa và cấu hình**. CRM lưu khóa vào Supabase Vault (không hiện lại), rồi tự kiểm
   tra: token phải thuộc đúng Page đã khai, sau đó đăng ký Page gửi tin (`messages`, `messaging_postbacks`,
   `message_echoes`) về CRM. Đạt thì chuyển sang **Đã kết nối**; không đạt thì hiện lỗi kèm cách xử lý.
3. Trong ứng dụng Meta › Messenger › Webhooks: callback URL `https://<tên miền CRM>/api/webhooks/meta`, verify token là
   mã ở bước 1, bấm xác minh.
4. Nhắn thử vào Page bằng tài khoản có vai trò trên ứng dụng: tin phải hiện ở **Hội thoại** trong khoảng 10 giây, kèm
   một lead mới nguồn "Tin nhắn Facebook" được phân cho người đang trực.
5. Chọn **chế độ trả lời** ở tab Cấu hình: Trả lời trên CRM, hoặc Trả lời ở công cụ khác (CRM chỉ đọc), hoặc Tắt.
   Nút **Gửi dữ liệu thử** chạy lại bước kiểm tra token và đăng ký Page.

## Phần C. Bật đọc lại tin bị lỡ

1. **Một lần cho mỗi môi trường:** đặt địa chỉ CRM vào Vault để pg_cron gọi được route (chưa đặt thì việc này im lặng
   không chạy). Trên NGHIA đã đặt `https://daivietcrmq4.vercel.app`.

   ```sql
   select vault.create_secret('https://<tên miền CRM>', 'app_base_url', 'Địa chỉ CRM cho pg_cron gọi /api/cron/*');
   ```

2. **Chỉ khi trang Tích hợp báo thiếu `pages_read_engagement`**, lấy token có quyền đó: trong ứng dụng Meta, thêm
   quyền `pages_read_engagement` vào trường hợp sử dụng Messenger (Trường hợp sử dụng › Tùy chỉnh › Quyền), rồi tạo lại
   Page access token ở Messenger › Cài đặt API (bấm tạo token cho Page, đồng ý quyền mới). Cách khác: Graph API Explorer, chọn ứng dụng, lấy User access token có
   `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, rồi chọn Page để đổi sang
   Page access token (token này hết hạn theo User token; muốn dùng lâu phải gia hạn User token trước).
3. Dán token mới ở Cài đặt › Tích hợp › Tin nhắn Facebook, bấm **Lưu khóa và cấu hình**. Kết quả phải ghi "CRM đọc lại
   được tin bị lỡ"; còn ghi "token thiếu quyền pages_read_engagement" thì token chưa có quyền đó.
4. Thử: trả lời một khách trên hộp thư Facebook; trong vòng khoảng 2 phút tin hiện trong Hội thoại là tin đi "Trên
   Page" (nếu bản sao tin qua webhook về trước thì hiện ngay).

## CRM làm gì (đã viết)

- **Nhận tin:** webhook kiểm `X-Hub-Signature-256` bằng App Secret trên đúng chuỗi byte nhận được, và trên bản đã đổi
  mọi ký tự ngoài ASCII sang `\uXXXX` chữ thường: tài liệu "Validate Payloads" của Meta ghi chữ ký tính trên bản
  thoát Unicode ("äöå" thành "\u00e4\u00f6\u00e5"). Thiếu bước này thì tin có chữ tiếng Việt (hay gặp ở tin nhân viên
  trả lời trong hộp thư Facebook) có thể bị coi sai chữ ký. Ngày 11/10/2026 NGHIA ghi 93 lần sai chữ ký (hai sự kiện
  402 và 474 byte được Meta gửi lại liên tục); tin khách có chữ tiếng Việt cùng ngày vẫn qua, nên nguyên nhân hai sự
  kiện đó chưa chắc là thoát Unicode. Từ bản này, dấu vết sai chữ ký ghi thêm loại sự kiện, có phải bản sao tin của
  Page và mã ứng dụng gửi để tìm ra nguồn. Sai chữ ký thì chỉ ghi
  dấu vết (không lưu nội dung; có loại sự kiện, có phải bản sao tin của Page, mã ứng dụng gửi) và trả `401`.
- **Tin nhân viên trả lời ngoài CRM:** Meta gửi bản sao (`message_echoes`, `app_id` là hộp thư Page khi gửi từ Meta
  Business Suite hoặc ứng dụng Messenger); CRM ghi là tin đi "từ Page" vào đúng hội thoại. Đúng thì ghi từng tin vào `webhook_events` (chống trùng theo mã tin),
  trả `200`, xử lý ngay sau khi trả lời; job mỗi phút (`messenger-backlog`) xử lý lại tin còn sót.
- **Khách và lead (đổi 12/10/2026):** tin đầu từ người lạ tạo khách với định danh `fb_psid`, căn cứ đồng ý chăm sóc
  trên kênh Messenger (khách tự nhắn) và hội thoại, **chưa tạo lead** ("khách đang hỏi"). Hội thoại chia vòng cho
  telesale đang trực (`conversations.assigned_to`); Sale admin, Owner bấm **Chuyển thành lead** khi thấy tiềm năng,
  lead nguồn "Tin nhắn Facebook" giao cho người đang trả lời. Khách đã có lead mở (hoặc thất bại chưa quá 30 ngày) thì
  nối vào lead đó. Tên khách lấy từ Graph API nếu Meta cho; không được thì để "Khách Messenger" kèm 4 số cuối.
- **Ai xem:** người có `message.view_all` thấy mọi hội thoại; người khác thấy hội thoại của lead mình đang giữ, hoặc
  hội thoại khách đang hỏi được giao cho mình. Chuyển lead, chuyển hội thoại đi thì mất quyền xem ngay.
- **Trả lời:** cần quyền `message.messenger_send` (mặc định Owner, Sale admin, Telesale). Database kiểm: khung 24 giờ
  (gửi dạng trả lời), từ 24 giờ tới 7 ngày chỉ khi nhân viên đánh dấu tự trả lời đúng việc khách hỏi (thẻ
  `HUMAN_AGENT`), quá 7 ngày không gửi; chế độ trả lời (chỉ đọc khi trả lời ở công cụ khác); đồng ý chưa bị rút; khách
  không phải người nhận của lead đang giữ bất ngờ. Tin đi đầu tiên dừng đồng hồ SLA và đưa lead sang "Đã liên hệ".
- **Trả lời thẳng trên Page** (hộp thư Meta Business Suite): Meta gửi bản sao (echo), CRM ghi lại là tin đi "Trên Page".
- **Không lộ dữ liệu:** nội dung tin chỉ nằm ở bảng `messages` (và hộp nhận thô); sự kiện, thông báo, nhật ký kiểm toán
  không chứa nội dung tin hay PSID. Token không bao giờ nằm trong log hay thông báo lỗi.
- **Đọc lại tin bị lỡ** (`lib/integrations/meta_messenger/reconcile.ts`, route `/api/cron/messenger-reconcile`):
  pg_cron mỗi 2 phút gọi route qua pg_net (`public.dispatch_messenger_reconcile`, kèm mã tự sinh trong Vault
  `cron_invoke_token`; route hỏi lại bằng `public.cron_token_ok`, hoặc nhận `CRON_SECRET`). Mỗi lượt đọc các hội thoại
  cập nhật từ lượt trước (lùi thêm 5 phút; lượt đầu lùi tối đa 7 ngày), tối đa 4 trang × 25 hội thoại, lấy 20 tin cuối
  mỗi hội thoại; tin CRM chưa có (kể cả tin nhân viên trả lời trên hộp thư Facebook) đi vào `webhook_events` với
  `payload.via = "reconcile"` rồi qua `process_messenger_event` như webhook. Không nhận tin trước mốc bắt đầu
  (`integration_sync_state.start_at`: lúc Owner khai Messenger lần đầu, kết nối lại không dời). Con trỏ và chỉ số đếm ở `integration_sync_state`. Lỗi (thiếu quyền, token hỏng) hiện
  ở trang Tích hợp và tự xóa khi lượt sau chạy tốt. Lúc kết nối hoặc bấm Gửi dữ liệu thử, CRM báo luôn token đã đọc lại
  được tin hay còn thiếu `pages_read_engagement`.
- **Ảnh đại diện** (`lib/integrations/meta_messenger/avatars.ts`): sau mỗi lượt đọc lại tin, hỏi `profile_pic` cho tối
  đa 10 hội thoại chưa kiểm hoặc kiểm quá 2 ngày (mới nhắn trước), lưu `conversations.avatar_url` (chỉ link https) và
  `avatar_checked_at`. Meta từ chối thì giữ ảnh cũ, chỉ ghi giờ kiểm; mạng lỗi thì lượt sau hỏi lại. Kết quả đếm
  (`avatars.checked`, `found`, mã lỗi gần nhất) nằm trong câu trả lời của route. Màn Hội thoại hiện ảnh ở danh sách,
  đầu khung chat và cạnh tin khách; ảnh hết hạn hoặc không tải được thì về chữ cái đầu.
- **Chạy thử trên máy:** đặt `META_GRAPH_BASE=http://127.0.0.1:4010/v25.0` cho server để gọi máy chủ Meta giả;
  `tests/e2e/messenger.spec.ts` dựng sẵn máy chủ giả (chạy với `E2E_GRAPH_MOCK=1`).

## Còn thiếu

- Tệp đính kèm hiện bằng link của Meta (hết hạn sau một thời gian), chưa tải về kho riêng.
- Cảnh báo Owner khi token hết hạn (hiện chỉ thấy lỗi ở trang Tích hợp).
- Gửi ảnh, mẫu tin nhanh từ CRM.

## Nguồn

- Webhooks for Messenger Platform: https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
- message_echoes: https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-echoes
- Access Levels: https://developers.facebook.com/docs/graph-api/overview/access-levels
- Page Conversations: https://developers.facebook.com/docs/graph-api/reference/page/conversations
- Conversation Messages: https://developers.facebook.com/docs/graph-api/reference/conversation/messages
- Conversations API (hướng dẫn): https://developers.facebook.com/docs/messenger-platform/conversations
- App Review submission walkthrough: https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide
- Permissions reference (`pages_messaging`): https://developers.facebook.com/docs/permissions
- Message: https://developers.facebook.com/docs/graph-api/reference/message


- [Messenger Platform, Quick start](https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start)
- [Overview for the Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)
- [Send a Message (khung 24 giờ, thẻ tin nhắn)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)
- [Messenger Platform FAQ](https://developers.secure.facebook.com/docs/messenger-platform/faq)
