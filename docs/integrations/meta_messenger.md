# Tin nhắn Facebook (Messenger) — `meta_messenger`

Hướng dẫn cho Owner kết nối Facebook Page của showroom với CRM để nhận và trả lời tin nhắn Messenger ngay trên CRM.
Theo `CLAUDE.md` mục 10.3, đấu nối này thuộc **tháng 2**; bộ nối đã viết từ 08/10/2026 (migration
`20261008000200_messenger.sql`, webhook `/api/webhooks/meta`, màn Hội thoại). Phần A làm được ngay, phần B làm khi CRM
chạy trên tên miền HTTPS thật.

Các điểm dưới đây kiểm lại ngày 08/10/2026 từ tài liệu Messenger Platform của Meta (xem Nguồn). Trang
developers.facebook.com bị chặn từ môi trường làm việc nên chưa đọc trực tiếp được; **phải mở lại tài liệu gốc khi
viết bộ nối** (mục 10.1 điều 1). Điểm nào chưa kiểm được ghi rõ "chưa kiểm".

## Đã kiểm

- **Quyền ứng dụng cần xin** (qua Facebook Login for Business): `pages_show_list`, `pages_manage_metadata`,
  `pages_messaging`, `pages_read_engagement`, `business_management`. `business_management` là quyền phụ thuộc của
  `pages_messaging`.
- **Người bấm kết nối** phải có việc **Nhắn tin (MESSAGING)** và **Kiểm duyệt (MODERATE)** trên Page.
- **Duyệt ứng dụng (App Review):** ứng dụng chỉ dùng để nhắn tin cho **chính Page của mình** thì không phải gửi duyệt.
  Chưa duyệt thì quyền ở mức Standard Access, chỉ áp cho người có vai trò trên ứng dụng hoặc trên Page đã nhận ứng
  dụng. Showroom tự sở hữu Page (mục 16) nên đi đường này trước; nếu sau này cần Advanced Access thì mới gửi duyệt.
- **Webhook:** khai địa chỉ nhận (callback URL) và mã xác minh (verify token); Meta gửi yêu cầu GET kèm
  `hub.challenge` để xác nhận. Đăng ký Page vào ứng dụng, chọn tối thiểu trường `messages` và `messaging_postbacks`.
  Kiểm chữ ký `X-Hub-Signature-256` bằng app secret. Trả `200` thật nhanh; webhook lỗi kéo dài thì Meta tự hủy đăng
  ký, phải đăng ký lại.
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

## CRM làm gì (đã viết)

- **Nhận tin:** webhook kiểm `X-Hub-Signature-256` bằng App Secret trên đúng chuỗi byte nhận được; sai chữ ký thì chỉ
  ghi dấu vết (không lưu nội dung) và trả `401`. Đúng thì ghi từng tin vào `webhook_events` (chống trùng theo mã tin),
  trả `200`, xử lý ngay sau khi trả lời; job mỗi phút (`messenger-backlog`) xử lý lại tin còn sót.
- **Khách và lead:** tin đầu từ người lạ tạo khách với định danh `fb_psid`, căn cứ đồng ý chăm sóc trên kênh Messenger
  (khách tự nhắn), và lead nguồn "Tin nhắn Facebook" rồi phân như mọi lead. Khách đã có lead mở (hoặc thất bại chưa quá
  30 ngày) thì nối vào lead đó. Tên khách lấy từ Graph API nếu Meta cho; không được thì để "Khách Messenger" kèm 4 số cuối.
- **Ai xem:** người có `message.view_all` thấy mọi hội thoại; người khác chỉ thấy hội thoại của lead mình đang giữ.
  Chuyển lead đi thì mất quyền xem ngay.
- **Trả lời:** cần quyền `message.messenger_send` (mặc định Owner, Sale admin, Telesale). Database kiểm: khung 24 giờ
  (gửi dạng trả lời), từ 24 giờ tới 7 ngày chỉ khi nhân viên đánh dấu tự trả lời đúng việc khách hỏi (thẻ
  `HUMAN_AGENT`), quá 7 ngày không gửi; chế độ trả lời (chỉ đọc khi trả lời ở công cụ khác); đồng ý chưa bị rút; khách
  không phải người nhận của lead đang giữ bất ngờ. Tin đi đầu tiên dừng đồng hồ SLA và đưa lead sang "Đã liên hệ".
- **Trả lời thẳng trên Page** (hộp thư Meta Business Suite): Meta gửi bản sao (echo), CRM ghi lại là tin đi "Trên Page".
- **Không lộ dữ liệu:** nội dung tin chỉ nằm ở bảng `messages` (và hộp nhận thô); sự kiện, thông báo, nhật ký kiểm toán
  không chứa nội dung tin hay PSID. Token không bao giờ nằm trong log hay thông báo lỗi.
- **Chạy thử trên máy:** đặt `META_GRAPH_BASE=http://127.0.0.1:4010/v25.0` cho server để gọi máy chủ Meta giả;
  `tests/e2e/messenger.spec.ts` dựng sẵn máy chủ giả (chạy với `E2E_GRAPH_MOCK=1`).

## Còn thiếu

- Tệp đính kèm (ảnh, video) mới hiện số tệp, chưa tải về kho riêng; xem trên Messenger.
- Job đối soát lấy lại hội thoại gần đây (Conversations API) phòng webhook bị lỡ; cảnh báo Owner khi token hết hạn.
- Gửi ảnh, mẫu tin nhanh từ CRM.

## Nguồn

- [Messenger Platform, Quick start](https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start)
- [Overview for the Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)
- [Send a Message (khung 24 giờ, thẻ tin nhắn)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)
- [Messenger Platform FAQ](https://developers.secure.facebook.com/docs/messenger-platform/faq)
