# Landing page trên CRM (`landing_page`)

Trạng thái: **bản thật** (20/10/2026). Menu **Marketing → Landing page** (`/landing-pages`), quyền xem
`marketing.view`, quyền sửa `marketing.manage`.

## Mục đích

Owner chốt 20/10/2026: landing page chạy ngay trên CRM, không cần dịch vụ dựng trang bên ngoài. Người làm nội dung
(hoặc trợ lý AI ở đoạn chat khác) **chỉ làm file HTML**; CRM lo phần dữ liệu và nhận lead:

- Ghế, giá, quà, liên hệ hiện trên trang **lấy từ CRM** lúc khách mở trang. Đổi giá ở bảng giá, bật khuyến mãi ở
  Chính sách là trang đổi theo (chậm tối đa khoảng 1 phút do bộ nhớ đệm), không phải sửa HTML.
- Khách gửi form là thành **lead nguồn "Landing page"** đi qua đúng đường của mọi nguồn khác (`ingest_lead`): chống
  trùng theo số, chia người đang trực, đồng hồ SLA, thông báo Telegram (số che).

## Địa chỉ

| Đường | Việc |
|---|---|
| `/lp/<đường-dẫn>` | Trang cho khách, không cần đăng nhập. Trang đang tắt: khách thấy 404, người có `marketing.view` vẫn xem trước được |
| `/api/lp/<đường-dẫn>/lead` | Nhận form (POST JSON hoặc form-urlencoded, tối đa 20KB). CORS mở để trang gọi được |

Đường dẫn: chữ thường không dấu, số, gạch ngang, 2 đến 60 ký tự (ví dụ `khai-truong-q4`), không trùng trang khác.

## Màn Marketing → Landing page

- **Danh sách trang:** tên, link (Chép link, Mở trang), Đang chạy hoặc Đang tắt, số lead (tổng, 7 ngày, lần gần nhất).
- **Sửa thông tin:** tên, đường dẫn, hotline, Zalo (số hoặc link), địa chỉ, giờ mở cửa, KakaoTalk ID, link Google Maps,
  hạn ưu đãi (giờ VN, để trống là không đếm ngược), ảnh banner.
- **Tải HTML lên:** file `.html` tối đa 2MB. Chưa tải thì trang dùng **mẫu khai trương có sẵn**
  (`lib/landing/templates/khai-truong.html`). **Dùng mẫu có sẵn** để quay về mẫu.
- **Ghế hiện trên landing:** bật tắt từng ghế, ảnh, nhãn (ví dụ "BÁN CHẠY"), mô tả ngắn, quà kèm (chữ), thứ tự. Giá
  hiện ở đây là giá khách sẽ thấy.

## Giá trên trang

Giá do **hàm định giá CRM** (`priceQuote`, kênh `online`, khách trong nước) tính từ bảng giá mặc định và các chính sách
khuyến mãi đang chạy. Muốn trang hiện giá giảm thì tạo **chính sách khuyến mãi** ở Chính sách (kênh Online hoặc mọi
kênh), không tạo bảng giá riêng: bảng giá riêng không được hàm định giá đọc, nên giá trên landing, báo giá và đơn sẽ
lệch nhau. Quà khuyến mãi lấy từ danh mục Quà tặng (CLAUDE.md mục 16, 18/10).

## Hợp đồng cho người làm HTML

CRM chèn hai thẻ `<script>` ngay sau `<head>` trước khi trả trang cho khách. Mã của trang dùng được ngay.

### `window.CRM_LANDING`

```ts
{
  page: { slug: string; title: string };
  products: {
    sku: string;            // "DC302"
    name: string;
    shortDesc: string | null;
    imageUrl: string | null;
    badge: string | null;   // "BÁN CHẠY"
    giftText: string | null;
    listPrice: number;      // giá niêm yết, đồng
    price: number;          // giá sau khuyến mãi đang chạy; bằng listPrice khi không có
    promoGifts: string[];   // tên quà khuyến mãi tặng kèm
    promotions: string[];   // tên khuyến mãi đang áp
  }[];                      // chỉ ghế đang bật, theo thứ tự đã đặt
  gifts: { sku: string; name: string; value: number; imageUrl: string | null }[]; // danh mục Quà tặng
  contact: { hotline: string; zalo: string; address: string; openHours: string; kakao: string; mapUrl: string };
  bannerUrl: string;        // rỗng khi chưa có
  countdownEnd: string;     // ISO có múi giờ VN, ví dụ "2026-10-31T23:59:00+07:00"; rỗng là không đếm ngược
  leadUrl: string;          // "/api/lp/<đường-dẫn>/lead"
}
```

Ô liên hệ nào trống thì trang nên ẩn phần đó. Không có số điện thoại hay dữ liệu khách trong dữ liệu này.

### `window.CRMLanding`

- `CRMLanding.submit(form)` gửi form về CRM, trả `Promise<{ ok: boolean; message: string }>`; `message` là câu tiếng
  Việt hiện được cho khách.
- `CRMLanding.money(n)` định dạng tiền: `49000000` thành `49.000.000đ`.
- `CRMLanding.data` là `window.CRM_LANDING`.
- Cách gọn nhất: thêm thuộc tính `data-crm-lead` vào thẻ `<form>`, CRM tự gửi và hiện kết quả ở phần tử
  `[data-crm-result]` trong form (không có thì hiện hộp thông báo).

### Ô của form (thuộc tính `name`)

| `name` | Bắt buộc | Ghi chú |
|---|---|---|
| `name` | Có | Họ tên, tối đa 120 ký tự |
| `phone` | Có | Số điện thoại hoặc Zalo, 8 đến 15 chữ số; số VN và số Hàn đều nhận |
| `model` | | Mã ghế quan tâm (nên lấy từ `products[].sku`) |
| `where` | | Khách đang ở đâu: `VN`, `KR` hoặc mã thị trường khác trong Cài đặt, Thị trường; trống là chưa rõ, telesale xác nhận khi gọi |
| `whereLabel` | | Chữ hiển thị của `where`, ghi vào ghi chú lead |
| `note` | | Lời nhắn, tối đa 1000 ký tự; số điện thoại gõ trong lời nhắn bị che |
| `consent` | | Ô tích "đồng ý nhận tin ưu đãi". **Không tích sẵn**: chỉ khi khách tự tích mới ghi đồng ý marketing |
| `website` | | **Ô bẫy máy**: ẩn khỏi người thật (CSS), để trống. Có chữ là máy, CRM trả như thành công nhưng không tạo lead |

Bộ gửi tự thêm UTM (`utm_*`, `fbclid`, `gclid`, `ttclid`) từ địa chỉ trang và trang giới thiệu, lưu vào `source_detail`
của lead để sau này gửi chuyển đổi về Facebook, TikTok (CLAUDE.md mục 10.5).

### Giới hạn của trang

- Trang chạy trong **vùng cách ly** (header `Content-Security-Policy: sandbox …`): mã trong trang không đọc được phiên
  đăng nhập CRM. Được chạy script, gửi form, mở cửa sổ mới, mở link (Zalo, gọi điện, bản đồ) khi khách bấm, hiện hộp
  thông báo. Không dùng được cookie, `localStorage` của trang; mã đo của bên thứ ba (Facebook Pixel, Google Tag) có
  thể chạy nhưng không giữ được cookie, nên đo chuyển đổi dựa vào UTM ở trên.
- Ảnh, phông chữ, thư viện tải từ link ngoài vẫn dùng được. Ảnh ghế, banner nên tải lên ở màn Landing page (bucket
  công khai `product-images`, JPG, PNG, WEBP; ảnh lớn được trình duyệt tự thu nhỏ trước khi tải lên, cạnh dài tối đa
  1600px với ảnh ghế, 2000px với banner) rồi dùng `imageUrl`, `bannerUrl`.
- Nội dung cam kết với khách (trả góp, mức giảm, bảo hành, số suất còn lại) phải đúng chính sách đang chạy; Owner
  duyệt trước khi bật trang.

## Chống spam

- Ô bẫy `website` ở trên.
- Một địa chỉ IP gửi tối đa 5 lần cho một trang trong 10 phút (tính cả lượt bị chặn). CRM chỉ lưu IP đã băm trong
  `landing_lead_log`, bảng chỉ máy chủ đọc.
- Gửi lại cùng số điện thoại không sinh lead mới khi khách đang có lead mở: CRM nối vào lead cũ và báo người đang giữ.

## Dữ liệu và quyền

- `landing_pages`: mỗi trang một dòng (đường dẫn, tên, trạng thái, HTML, cài đặt). Đọc theo `marketing.view`; ghi chỉ
  qua hàm `save_landing_page` (`marketing.manage`), có nhật ký kiểm toán `landing.save`.
- Cột landing trên `products` (`show_on_landing`, `landing_sort`, `landing_badge`, `short_desc`, `gift_text`,
  `image_url`): ghi qua `save_landing_product` (`marketing.manage` hoặc `product.manage`), nhật ký `landing.product`.
- Migration `20261020000100_landing_pages.sql`. Migration này cũng ghi lại vào kho các thay đổi đoạn chat khác đã làm
  thẳng trên database (cột landing của sản phẩm, nguồn lead `landing_page`, bucket `product-images`) và siết quyền:
  bảng `landing_settings`, view `landing_products` không còn cho khách ẩn danh đọc, bucket `product-images` chỉ ghi bằng
  khóa máy chủ sau khi CRM kiểm quyền.
- Edge Function `landing-lead` (đoạn chat khác dựng) **không dùng nữa**: nó luôn ghi đồng ý marketing dù khách không
  tích. Owner xóa hàm này ở Supabase, Edge Functions.
