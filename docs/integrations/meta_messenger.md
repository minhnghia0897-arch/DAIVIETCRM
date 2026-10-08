# Tin nhắn Facebook (Messenger) — `meta_messenger`

Hướng dẫn cho Owner kết nối Facebook Page của showroom với CRM để nhận và trả lời tin nhắn Messenger ngay trên hồ sơ
khách. Theo `CLAUDE.md` mục 10.3, đấu nối này thuộc **tháng 2**; bộ nối trong CRM chưa viết (màn Tích hợp đang hiện
"Sắp có"). Phần A làm được ngay, phần B làm khi CRM có bộ nối và tên miền HTTPS.

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

## Phần B. Khi CRM có bộ nối (tháng 2)

Điều kiện: CRM đã chạy trên tên miền HTTPS thật (Vercel, câu hỏi mở 1) và bộ nối `meta_messenger` đã viết.

1. Cài đặt › Tích hợp › Tin nhắn Facebook › **Kết nối**: đăng nhập Facebook, chọn Page showroom, đồng ý các quyền ở
   trên. CRM lưu Page access token và app secret vào Supabase Vault, không hiện lại.
2. Trong ứng dụng Meta › Messenger › Webhooks: callback URL là `https://<tên miền CRM>/api/webhooks/meta`, verify token
   lấy ở tab Cấu hình của CRM; bấm xác minh, rồi đăng ký Page với trường `messages`, `messaging_postbacks`.
3. Bấm **Gửi dữ liệu thử** trên CRM; nhắn thử vào Page bằng tài khoản có vai trò trên ứng dụng; tin phải hiện ở Hội
   thoại trong vài giây.
4. Chọn **chế độ trả lời**: Trả lời trên CRM, hoặc Trả lời ở công cụ khác (CRM chỉ đọc), hoặc Tắt.

## Việc CRM sẽ làm khi viết bộ nối

- Webhook vào `webhook_events` trước, kiểm chữ ký, trả `200` ngay, xử lý bằng job; chống trùng theo mã tin.
- Tin đầu từ người lạ tạo lead nguồn "Tin nhắn Facebook", chống trùng theo `fb_psid` trong `contact_identities`.
- Ô soạn trên hồ sơ hiện đồng hồ còn bao lâu trong khung 24 giờ; hết khung thì chỉ cho trả lời tay bằng Human Agent
  trong 7 ngày (nếu được cấp), không gửi tin tự động, tin khuyến mãi.
- Gửi tin kiểm `consents` theo mục đích và kênh ở server; không ghi nội dung tin vào nhật ký.
- Job đối soát lấy lại hội thoại gần đây phòng webhook bị lỡ; cảnh báo Owner khi token sắp hết hạn hoặc lỗi quá 30
  phút.

## Nguồn

- [Messenger Platform, Quick start](https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start)
- [Overview for the Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)
- [Send a Message (khung 24 giờ, thẻ tin nhắn)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)
- [Messenger Platform FAQ](https://developers.secure.facebook.com/docs/messenger-platform/faq)
