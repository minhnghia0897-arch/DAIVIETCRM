# DESIGN.md — Giao diện Đại Việt CRM/CDP

Tài liệu thiết kế cho Claude Code. Đọc cùng `CLAUDE.md`. Bố cục tham khảo bản demo `docs/reference/daiviet-crm-q4.html`: lấy tinh thần bố cục kiểu CRM doanh nghiệp (header toàn cục, thanh tab ứng dụng, trang hồ sơ có highlights, path, dòng hoạt động), nhưng đây là sản phẩm mang thương hiệu Đại Việt. **Không dùng logo, tên, biểu tượng, linh vật hay bộ icon của Salesforce hoặc bất kỳ hãng nào khác.**

---

## 1. Người dùng và việc chính của màn hình

| Người dùng | Bối cảnh | Việc chính | Điều họ cần từ giao diện |
|---|---|---|---|
| Telesale | Ngồi máy tính hoặc cầm điện thoại, gọi liên tục, có ca tối cho khách ở nước ngoài | Gọi đúng người, đúng lúc, ghi kết quả nhanh, chăm sóc khách đã mua | Biết ngay việc quan trọng nhất tiếp theo, bấm một lần là gọi, ghi kết quả dưới 30 giây |
| Sale admin | Máy tính, giám sát cả đội | Không để lead nào nguội, phân lại khi quá tải | Thấy ngay lead chưa phân, quá hạn, ai đang ôm nhiều |
| Owner | Máy tính hoặc điện thoại, xem nhanh | Kiểm soát quyền và dữ liệu, xem hiệu quả | Bật tắt quyền dễ, kiểm tra được người khác đang thấy gì |

---

## 2. Nguyên tắc thiết kế

1. **Hồ sơ là bàn làm việc.** Telesale không phải rời trang hồ sơ để gọi, nhắn Zalo, ghi kết quả hay hẹn gọi lại.
2. **Thị trường của khách luôn hiện diện.** Mọi chỗ có người hoặc thời gian đều cho biết khách đang sống ở thị trường nào và giờ địa phương của họ khi khác giờ VN. Thị trường là thuộc tính của khách đọc từ cấu hình, không thiết kế riêng cho Hàn Quốc. Đây là chỗ duy nhất được dùng màu nhấn mạnh tay.
3. **Người đặt và người nhận có thể là hai người.** Khi khác nhau, hiển thị thành cặp có hướng: người đặt → người nhận. Khi mua cho chính mình, gộp thành một thẻ.
7. **Mỗi màn hình trả lời "việc gì quan trọng nhất tiếp theo".** Trang chủ, hồ sơ lead, hồ sơ khách đều mở đầu bằng việc cần làm (từ `tasks`) chứ không bằng số liệu để xem.
4. **Chỉ hiện cái người dùng được phép.** Không có quyền thì không hiện nút, không hiện dữ liệu. Không dùng nút xám chờ người dùng đoán vì sao.
5. **Mật độ vừa phải cho người làm việc cả ngày.** Ưu tiên bảng và danh sách dày thông tin, chữ đủ lớn để đọc lâu không mỏi. Không chia nội dung thành hàng loạt thẻ giống hệt nhau.
6. **Trạng thái nói bằng chữ, màu chỉ hỗ trợ.** Mọi pill có chữ; không có chỗ nào chỉ dựa vào màu.

---

## 3. Token

Khai báo token dạng CSS variables trong `app/globals.css`, ánh xạ sang Tailwind theme. Không viết mã màu trực tiếp trong component.

### Màu nền và chữ

| Token | Giá trị | Dùng cho |
|---|---|---|
Phong cách kiểu Slack, giản lược cho dễ nhìn: nền nội dung trắng, card phẳng viền mảnh không đổ bóng, không dải màu chuyển. Sidebar và header dùng màu riêng (mục 4).

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--page` | `#FFFFFF` | Nền vùng nội dung |
| `--surface` | `#FFFFFF` | Card, bảng |
| `--surface-2` | `#F8F8F8` | Hàng hover, nền phụ, ô biểu tượng đầu trang |
| `--line` | `#DDDCDD` | Viền card, ô nhập |
| `--line-2` | `#EBEAEB` | Đường kẻ bên trong card |
| `--text` | `#1D1C1D` | Chữ chính |
| `--text-weak` | `#616061` | Nhãn, chữ phụ |

### Màu ý nghĩa

| Token | Giá trị | Nền nhạt | Dùng cho |
|---|---|---|---|
| `--brand` | `#1264A3` | `#E8F5FA` | Hành động chính, liên kết |
| `--brand-strong` | `#0B4C8C` | | Hover nút chính, giai đoạn hiện tại trên path |
| `--ok` | `#007A5A` | `#E3F4EF` | Thành công, đã liên hệ, đúng hạn |
| `--warn` | `#8A5300` | `#FDF3DD` | Sắp quá hạn, cần chú ý, chờ duyệt, dải thông báo bản demo |
| `--err` | `#C4184F` | `#FDE8EF` | Quá hạn, lỗi, thất bại |
| `--ai` | `#6B2BD9` | `#F1EBFD` | Tính năng AI |
| `--obj-lead` | `#E07A2E` | | Icon đối tượng Lead |
| `--obj-contact` | `#6E4FD6` | | Icon đối tượng Khách, Hộ |
| `--obj-call` | `#3BA755` | | Icon cuộc gọi |
| `--obj-zalo` | `#0068FF` | | Icon tin Zalo |

### Màu quốc gia (điểm nhấn riêng của sản phẩm)

| Token | Chữ | Nền |
|---|---|---|
| `--loc-kr` | `#1F3FA8` | `#E8EEFF` |
| `--loc-vn` | `#B42318` | `#FDECEA` |
| `--loc-other` | `#3E4A59` | `#ECEFF3` |

Thị trường mới thêm sau dùng `--loc-other` cho tới khi được gán màu riêng. Chỉ dùng cho tag quốc gia và đồng hồ đôi. Không dùng cho mục đích khác.

Tháng 1 chỉ làm giao diện sáng. Đặt token theo cách thêm giao diện tối sau này chỉ cần định nghĩa lại biến.

### Chữ

- **Font:** **Nunito Sans** (kiểu chữ gần Lato của Slack; Lato không có bộ chữ tiếng Việt nên không dùng), nạp bằng `next/font` với bộ `latin` và `vietnamese`: font được lưu cùng trang lúc build, trình duyệt không gọi Google khi chạy. Dự phòng: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Cỡ gốc 14px.
- **Số:** mọi bảng, chỉ số, đồng hồ, tiền dùng `font-variant-numeric: tabular-nums`.

| Cấp | Cỡ / dòng | Độ đậm | Dùng cho |
|---|---|---|---|
| Tiêu đề trang | 20 / 28 | 800 | Tên hồ sơ, tên màn hình trong page header |
| Tiêu đề card | 15 / 22 | 800 | Đầu card, đầu bảng con |
| Chỉ số lớn | 24 / 30 | 800 | Ô KPI |
| Thân | 14 / 21 | 400 | Nội dung chính, ô bảng |
| Nhãn | 12.5 / 18 | 400, màu `--text-weak` | Nhãn trường, chú thích |
| Nút | 13.5 / 20 | 700 | Nút: viền xám, chữ màu chữ chính; nút chính nền `--brand` chữ trắng |
| Pill | 12 / 16 | 700 | Trạng thái, bo góc 4px |

Giản lược để dễ nhìn:

- **Thanh tiến độ** (giai đoạn lead, bước đơn): vạch dưới 3px thay ô tô màu; bước đã qua có dấu tích xanh lá, bước hiện tại chữ xanh đậm, bước sau chữ xám.
- **Hàng nút:** tối đa 3–4 nút chính bên trái; hành động ít dùng (mở hồ sơ hộ, hỏi AI, đánh dấu thất bại) là nút phụ trầm (không viền, chữ xám) dồn sang phải để hàng nút không rớt dòng.
- **Trang theo kiểu kênh Slack:** đầu trang chỉ có tiêu đề là thanh phẳng (không khung, kẻ một đường dưới); biểu tượng đối tượng trong ô bo 8px nền nhạt cùng tông, tiêu đề đậm 800; dòng tóm tắt chữ xám bên dưới.
- **Tab lọc, tab con và tab trong trang** (lọc đơn, lọc khách, Sản phẩm/Kho/Chính sách, Đội ngũ, Hoạt động/Báo giá…) cùng một kiểu thanh tab kênh Slack: chữ xám đậm 600, tab đang chọn chữ đậm 800 có gạch chân 2px màu `--brand`, cả thanh kẻ một đường dưới, nhiều tab thì cuộn ngang, không rớt dòng. Không dùng nút viên thuốc cho bộ lọc.
- **Danh sách dạng bảng** nằm thẳng trên nền, không khung bao; đầu cột chữ nhỏ xám không nền; tên ở cột đầu chữ đậm màu chữ chính như danh bạ Slack (rê chuột gạch chân); hàng cao 44px, rê chuột nền xám nhạt.
- **Chút màu để dễ nhìn:** biểu tượng sidebar mỗi mục một tông sáng (mục đang chọn biểu tượng trắng); biểu tượng đầu trang trong ô bo 8px nền nhạt 14% cùng tông với màu loại màn hình; biểu tượng trong nút mang màu theo nghĩa (gọi xanh lá, AI tím, hộ gia đình tím xanh); nút **Gọi** nền xanh lá `--ok` như nút chính của Slack; hành động hủy, thất bại chữ đỏ.

Không viết hoa toàn bộ chữ ở bất kỳ đâu. Không dùng font monospace cho nhãn dữ liệu.

### Khoảng cách, bo góc, đổ bóng

- Lưới 4px. Khoảng cách thường dùng: 4, 8, 12, 16, 24.
- Khoảng giữa các card: 16px. Đệm trong card: 16px ngang, 14px dọc. Lề vùng nội dung 16px dọc, 20px ngang.
- Bo góc: ô nhập, nút 6px; card 8px; pill 4px. Card không đổ bóng; chỉ popover, menu có bóng nhẹ.
- Đổ bóng: card không có; menu, drawer, popup `0 4px 12px rgba(0,0,0,.12)`.
- Chuyển động: 150–250ms, chỉ khi phản hồi thao tác (mở drawer, toast, hàng mới vào danh sách sáng lên rồi nhạt dần). Tôn trọng `prefers-reduced-motion`.

---

## 4. Khung ứng dụng

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [☰] [Logo Đại Việt]  [ Tìm hộ gia đình, khách, mã đơn… ]  09:12 VN 11:12 Hàn │
│                                              [Trực ●] [AI] [Chuông] [Avatar]│
├──────────────┬─────────────────────────────────────────────────────────────┤
│ ⋮⋮⋮ Q4       │                                                             │
│ ▌Trang chủ   │                                                             │
│  Việc cần làm│   (nội dung màn hình)                    │ Trợ lý AI        │
│  Cơ hội      │                                          │ (từ 1600px)      │
│  …           │                                                             │
│  [« Thu gọn] │                                                             │
├──────────────┴─────────────────────────────────────────────────────────────┤
│ Chờ duyệt (3) │ Nhật ký agent │ Tạm dừng agent │ Quá SLA (1)  Dữ liệu mô phỏng │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Header toàn cục:** logo chữ Đại Việt kèm biểu tượng đơn giản tự thiết kế; ô tìm kiếm theo tên và mọi định danh (số VN, số quốc tế, Zalo); **đồng hồ đôi** giờ VN và giờ của thị trường nước ngoài được chọn trong Cài đặt (mặc định Hàn Quốc; luôn hiện, trừ màn hình dưới 900px thì chỉ hiện trong menu avatar); công tắc **Trực** cho người nhận lead; chuông thông báo; avatar.
- **Sidebar ứng dụng (cột dọc bên trái, kiểu Slack):** nền navy `#12233f`, header cùng tông `#0b1a33` với ô tìm kiếm nền trong mờ; chữ trắng 86%, tiêu đề nhóm trắng 64%. Đầu cột là ô logo Q4, tên showroom và trạng thái trực (chấm xanh khi đang trực). Mục chia nhóm có tiêu đề: Làm việc, Bán hàng, Theo dõi, Quản trị; mỗi mục có biểu tượng nét 2,25 và tên cỡ 15px, chỉ hiện nếu người dùng có quyền xem. Mục đang chọn nền xanh sáng `#1d6fd8` bo góc 6px, chữ trắng đậm; số đếm cần xử lý (việc của tôi, hội thoại cần người) là pill đỏ hồng `#e01e5a`. Màn hình rộng có nút "Thu gọn" còn biểu tượng (nhớ trong trình duyệt); màn hình hẹp (từ 900px trở xuống) sidebar ẩn, mở bằng nút menu ở đầu trang dạng ngăn kéo, đổi trang thì tự đóng. Thứ tự theo bản mẫu: Trang chủ, Việc cần làm (việc của tôi, của đội, hàng chung và hàng chờ duyệt), Cơ hội (bảng giai đoạn kèm hồ sơ lead: 4 thông tin bắt buộc, gọi và ghi kết quả, hẹn gọi lại trong khung gọi của khách, báo giá), Hộ gia đình, Đơn hàng (danh sách đơn; hồ sơ đơn gồm thanh toán và các bước giao lắp, không tách màn giao lắp riêng), Hội thoại, Kênh & nội dung, Báo cáo, Agent; sau đó Sản phẩm (một tab, tab con: Sản phẩm, Kho, Chính sách kèm Thử chính sách; tab con chỉ hiện khi có quyền), Đội ngũ, Khách (hồ sơ khách 360 và lọc theo vòng đời, mục 6.15). Bên phải vùng nội dung là khung **Trợ lý AI** (mở sẵn chỉ trên màn hình từ 1600px; laptop để toàn bộ chiều ngang cho nội dung, bấm nút AI trên header để mở; lớp phủ trên màn hình hẹp): dòng ngữ cảnh "Đang xem…", câu hỏi gợi ý theo màn hình, bản nháp tin có nút gửi cần người bấm. Thanh tiện ích dưới cùng có Chờ duyệt (kèm số), Nhật ký agent, Tạm dừng agent (chỉ người có `settings.integrations`). Telesale thấy mục Đội ngũ với tên "Hiệu suất của tôi"; Cài đặt nằm trong menu avatar.
- **Utility bar dưới đáy:** cố định, cao 44px, chứa lối tắt theo vai trò. Telesale: việc hôm nay, hẹn gọi lại hôm nay, lead quá hạn của tôi. Sale admin: lead chưa phân, quá hạn toàn đội, việc hậu bán quá hạn, hàng chờ duyệt.
- **Chỗ cho panel trợ lý AI:** dành sẵn cột phải 360px, tháng 1 không hiển thị.
- **Banner "Xem như":** khi Owner bật chế độ xem như người dùng khác, một dải màu `--warn` nền nhạt chạy ngang dưới header, trên sidebar và nội dung: "Đang xem như Thảo (Telesale). Chỉ đọc. [Thoát]".

---

## 5. Thành phần

### 5.1 Page header

```
┌──────────────────────────────────────────────────────────────────┐
│ [■] Lead                                   [Gọi] [Zalo] [Sửa] [⋯] │
│     Nguyễn Thị Thu  [Hàn Quốc]                                    │
├──────────────────────────────────────────────────────────────────┤
│ Nguồn            Giao cho     Tạo lúc        SLA          Điểm    │
│ Facebook Ads     Thảo         09:58 hôm nay  Còn 3:12     64      │
└──────────────────────────────────────────────────────────────────┘
```

Icon đối tượng là ô vuông bo 4px màu `--obj-*`, glyph trắng. Hàng highlights dưới tối đa 6 trường, nhãn nhỏ phía trên giá trị. Nút hành động nằm phải; quá 3 nút thì gom vào menu `⋯`.

### 5.2 Path giai đoạn

Dải mũi tên ngang: Mới → Đã liên hệ → Demo, video call → Báo giá → Đặt cọc → Thành công. Giai đoạn đã qua nền `--ok` nhạt; hiện tại nền `--brand-strong` chữ trắng; chưa tới nền `--surface-2`. Thất bại hiển thị riêng thành pill `--err` thay cho path. Bấm giai đoạn kế tiếp để chuyển; nếu thiếu điều kiện (ví dụ thiếu thông tin bắt buộc) thì hiện ngay dưới path lý do không chuyển được và trường còn thiếu.

### 5.3 Ô "Thông tin cần hỏi"

Card nhỏ ngay dưới path khi lead chưa đủ bốn thông tin bắt buộc:

```
Cần hỏi ở cuộc gọi này
  ✓ Mua cho: Bố mẹ           [Chính mình | Bố mẹ | Vợ, chồng | Người khác]
  ○ Tỉnh người nhận          [chọn tỉnh ▾]
  ○ Dịp mua                  [Tết | 20/10 | Sinh nhật | Mừng thọ | Dùng cho gia đình | Khác]
  ○ Ngân sách                [<30tr | 30–50tr | 50–80tr | >80tr]
```

Chọn trực tiếp tại chỗ, lưu ngay, không mở form riêng. Chọn "Chính mình" thì dòng tỉnh người nhận lấy theo khách. Ngày nghe được trong cuộc gọi (sinh nhật, mừng thọ) có ô "Ghi ngày quan trọng" ngay dưới. Đủ bốn thông tin thì card tự thu gọn thành một dòng. Thiếu thông tin thì nút **Tạo báo giá** khóa kèm lý do.

### 5.4 Cặp người đặt → người nhận

```
┌ Người đặt ─────────────────┐   ┌ Người nhận ────────────────┐
│ Nguyễn Thị Thu  [Hàn Quốc] │ → │ Bố mẹ        [Việt Nam]    │
│ Daegu, 21:10 giờ Hàn       │   │ Diễn Châu, Nghệ An         │
│ +82 10••••2290  [Gọi]      │   │ Chưa có số  [Thêm]         │
└────────────────────────────┘   └────────────────────────────┘
```

Thẻ người đặt có vạch trái 3px màu `--brand`. Luôn hiện giờ địa phương của người ở nước ngoài. Khi lead bật **Giữ bất ngờ**, thẻ người nhận có dải `--warn` nhạt "Không liên hệ người nhận khi người đặt chưa cho phép" và không có nút Gọi, Nhắn, Hiện số. Người dùng chung số hiện "Liên hệ qua số của <tên>".

### 5.5 Số điện thoại và nút gọi

- Không có quyền xem số: hiện số đã che `+82 10••••2290`, cạnh đó nút **Gọi**. Không có nút hiện số.
- Có quyền: hiện số đã che, cạnh đó nút **Hiện số** (mỗi lần bấm ghi audit log) và **Gọi**.
- Bấm Gọi: nút chuyển sang "Đang gọi…" kèm bộ đếm thời gian, rồi khi cuộc gọi kết thúc **tự mở bảng ghi kết quả** (5.7).
- Có thêm lựa chọn nhỏ "Đã gọi qua Zalo" cho trường hợp gọi ngoài hệ thống.
- **Chế độ gọi ngoài hệ thống (tháng 1, chưa có tổng đài):** bấm Gọi trên điện thoại thì mở trình gọi của máy với số đầy đủ; trên máy tính thì hiện số đầy đủ trong một ô nổi kèm nút sao chép và dòng nhắc "Lượt xem số được ghi lại". Khi người dùng quay lại tab CRM, bảng ghi kết quả (5.7) tự mở. Chỉ áp dụng cho lead đang được giao cho chính người đó.

### 5.6 Tag quốc gia và đồng hồ đôi

- Tag: tên thị trường ("Việt Nam", "Hàn Quốc", …), 11px đậm 600, bo 4px, màu theo `--loc-*`. Không dùng cờ hay emoji. Khách chưa rõ thị trường hiện tag "Chưa rõ nơi ở" nền `--surface-2`, telesale bấm vào để chọn.
- Đồng hồ đôi ở header: `09:12 VN  11:12 Hàn`, giờ đậm, chữ VN và tên thị trường nhạt.
- Trong danh sách lead: cột "Giờ khách" hiện giờ địa phương của khách ở nước ngoài; tô `--ok` khi đang trong khung gọi tốt của thị trường đó, `--text-weak` khi ngoài khung. Khách ở VN để trống cột này.

### 5.7 Bảng ghi kết quả cuộc gọi

Mở dạng sheet từ dưới lên (điện thoại) hoặc khung bên phải (máy tính). Mục tiêu dưới 30 giây.

```
Kết quả cuộc gọi với Nguyễn Thị Thu (2:41)
[Nghe máy, quan tâm] [Nghe máy, chưa quan tâm] [Không nghe] [Sai số] [Hẹn gọi lại]
Bước tiếp:  ( ) Hẹn video call   ( ) Gửi báo giá   ( ) Gọi lại lúc [ 21:00 giờ Hàn ▾ ]
Ghi chú ngắn (không bắt buộc) [                                         ]
                                                         [Lưu kết quả]
```

Chọn "Không nghe" thì tự gợi ý giờ gọi lại theo khung giờ của khách. Phím tắt 1 đến 5 cho các kết quả.

### 5.8 Dòng hoạt động

Danh sách dọc có đường nối, mỗi mục gồm icon tròn 24px màu theo loại, tiêu đề (đậm, màu `--brand` nếu bấm được), mô tả, thời gian bên phải. Nhóm theo "Sắp tới" (hẹn gọi lại) và "Đã qua". Cuộc gọi có nút phát ghi âm nếu có quyền. Tin Zalo hiện dạng bong bóng ngắn. Mục mới thêm sáng lên `--brand` nền nhạt rồi nhạt dần trong 1,2 giây.

### 5.9 Khung soạn trên hồ sơ

Tab: Ghi kết quả gọi | Tin Zalo | Ghi chú | Hẹn gọi lại. Tab Tin Zalo hiện còn bao lâu được nhắn miễn phí; ngoài khung thì hiện rõ tin sẽ tính phí và số tin ngoài khung đã dùng trong tháng. Nếu kênh đang đặt chế độ trả lời ở công cụ khác, ô soạn chuyển sang chỉ đọc kèm dòng giải thích.

### 5.10 Danh sách (list view)

```
[■] Lead   Lead của tôi ▾                     [Tìm trong danh sách] [Tạo lead]
23 lead, sắp xếp theo hạn SLA, cập nhật vài giây trước
[Mới] [Quá hạn] [Hẹn hôm nay] [Chờ khung gọi] [Thị trường ▾] [Nguồn ▾] [Giai đoạn ▾]
┌──────────────┬───────────┬──────────┬──────────┬───────────┬─────────┬──────┐
│ Tên          │ Ở         │ Giờ khách│ Nguồn    │ Giai đoạn │ SLA     │ Giao │
├──────────────┼───────────┼──────────┼──────────┼───────────┼─────────┼──────┤
│ Nguyễn T.Thu │ Hàn Quốc  │ 21:10    │ FB Ads   │ Mới       │ Còn 3:12│ Thảo │
```

- Đầu bảng dính khi cuộn; hàng cao 40px; hover nền `--surface-2`.
- Chọn nhiều hàng làm hiện thanh hành động hàng loạt phía trên bảng (Giao cho…, Đánh dấu thất bại) chỉ khi có quyền tương ứng.
- Bộ lọc nhanh dạng pill bật tắt; trạng thái lọc giữ trên URL để chia sẻ được.
- Màn hình hẹp: bảng chuyển thành danh sách thẻ hai dòng (tên + tag quốc gia, rồi giai đoạn + SLA).

### 5.11 Chip SLA

| Trạng thái | Hiển thị |
|---|---|
| Còn trên 2 phút | `Còn 3:12`, chữ `--text-weak` |
| Còn dưới 2 phút | `Còn 1:05`, nền `--warn` nhạt |
| Quá hạn | `Quá 4 phút`, nền `--err` nhạt |
| Chờ khung gọi của thị trường khách | `Gọi lúc 19:00 giờ Hàn`, nền `--loc-*` nhạt của thị trường đó |
| Đã liên hệ | `Đã gọi sau 2:40`, chữ `--ok` |

### 5.12 Pill trạng thái

Pill luôn có chữ. Bảng ý nghĩa: `--ok` thành công, đúng hạn; `--warn` cần chú ý; `--err` quá hạn, thất bại; `--surface-2` trung tính. Không tự đặt thêm màu pill.

### 5.13 Nút

- Chính: nền `--brand`, chữ trắng. Mỗi vùng tối đa một nút chính.
- Phụ: nền trắng, viền `--line`, chữ `--brand`.
- Nguy hiểm (xóa, khóa người dùng): chữ `--err`, luôn có hộp xác nhận ghi rõ hậu quả.
- Nhóm nút liền nhau cho các hành động cùng loại.
- Chữ trên nút là động từ cụ thể: "Lưu kết quả", "Giao cho Thảo", "Gửi tin Zalo". Không dùng "Xác nhận", "Submit", "OK" chung chung. Không thêm mũi tên vào chữ trên nút.

### 5.14 Toast, trạng thái rỗng, đang tải, lỗi

- Toast trên cùng giữa màn hình, 2,6 giây, nói đúng việc vừa xảy ra bằng cùng động từ với nút: bấm "Giao cho Thảo" thì toast "Đã giao cho Thảo".
- Trạng thái rỗng là lời mời hành động: "Chưa có lead nào chờ gọi. Lead mới sẽ hiện ở đây ngay khi được giao cho anh chị." Không dùng hình minh họa lớn.
- Đang tải: khung xương theo đúng bố cục cuối, không dùng vòng xoay giữa trang.
- Lỗi: nói chuyện gì xảy ra và cần làm gì. Ví dụ: "Không gửi được tin Zalo vì đã quá thời gian được nhắn cho khách này. Hãy gọi điện hoặc chờ khách nhắn lại." Không xin lỗi chung chung, không hiện mã lỗi kỹ thuật cho người dùng (mã lỗi để trong chi tiết có thể mở ra).

### 5.15 Việc tiếp theo

Danh sách việc từ `tasks`, dùng ở trang chủ, hồ sơ lead, hồ sơ khách, hồ sơ đơn.

```
Việc tiếp theo
  ● Gọi hỏi thăm sau giao, ghế DV-X9        Hạn hôm nay        [Gọi] [Xong]
  ● Nhắc thay lõi lọc máy ion kiềm          Còn 5 ngày          [Nhắn Zalo] [Xong]
  ○ Nhắc dịp mừng thọ bố (12/11)            Còn 39 ngày         [Hẹn lại]
```

- Mỗi dòng: chấm ưu tiên (đậm là ưu tiên cao), tên việc là câu hành động, hạn bằng chữ, nút hành động trực tiếp và nút **Xong**. Bấm Xong mở ô kết quả một dòng (không bắt buộc).
- Quá hạn: hạn chuyển `--err` nhạt. Việc sinh từ luật có nhãn nhỏ "Tự động"; từ tháng 3, việc AI đề xuất có nhãn `--ai` "AI đề xuất" và phải bấm nhận mới thành việc của mình.
- Sắp theo hạn rồi ưu tiên. Không quá 5 dòng mỗi khối; có liên kết "Xem tất cả".

---

## 6. Màn hình tháng 1

### 6.1 Trang chủ telesale

```
┌ Việc của tôi hôm nay ──────────────────────────────────────────────┐
│ Lead mới 3 │ Quá hạn 1 │ Hẹn gọi lại 4 │ Gọi trong 5 phút 92% │ Đã gọi 37 │
└────────────────────────────────────────────────────────────────────┘
┌ Gọi tiếp theo ────────────────────────────┐ ┌ Hẹn gọi lại hôm nay ─────┐
│ Nguyễn Thị Thu [Hàn Quốc]   Còn 3:12       │ │ 19:00 giờ Hàn  Lê H.Phúc │
│ Daegu 21:10, tặng bố mẹ ở Nghệ An, Tết     │ │ 20:30 giờ Hàn  Đặng M.Khoa│
│ Facebook Ads, DV-X9                         │ │ 15:00          Chị Hương │
│              [Mở hồ sơ]  [Gọi ngay]         │ └──────────────────────────┘
├────────────────────────────────────────────┤
│ Hàng chờ (danh sách sắp theo SLA và giờ khách) │
└────────────────────────────────────────────┘
┌ Chăm sóc khách đã mua (5.15) ──────────────┐
│ Gọi hỏi thăm sau giao, nhắc thay lõi, dịp tặng │
└────────────────────────────────────────────┘
```

Thẻ "Gọi tiếp theo" là điểm nhấn của trang: một khách, đủ bối cảnh, một nút gọi. Phím `N` chuyển sang khách kế tiếp. Thứ tự ưu tiên của thẻ: lead mới trong SLA, lead vừa tới khung gọi, hẹn gọi lại đến giờ, rồi việc hậu bán đến hạn.

### 6.2 Trang chủ sale admin

```
┌ Đội hôm nay: Lead 23 │ Chưa phân 2 │ Quá hạn 1 │ Gọi trong 5 phút 87% ┐
┌ Lead chưa phân ─────────────────┐ ┌ Tải việc từng người ─────────────┐
│ ... [Giao cho ▾] mỗi dòng        │ │ Thảo  Trực ●  Chưa gọi 3  Hẹn 4  │
├ Quá hạn SLA ────────────────────┤ │ An    Nghỉ ○  Chưa gọi 0  Hẹn 1  │
│ ... ai giữ, quá bao lâu [Giao lại]│ └──────────────────────────────────┘
└─────────────────────────────────┘ ┌ Tích hợp ── Meta ● Zalo ● Tổng đài ●┐
┌ Chờ khung gọi (theo thị trường) ┐ ┌ Hàng chờ duyệt ── Giảm giá 1 │ Thanh toán 2 ┐
┌ Việc hậu bán quá hạn ───────────┐
```

Ô tích hợp chỉ hiện chấm trạng thái và lần nhận dữ liệu gần nhất; bấm vào mở trang Cài đặt nếu có quyền.

### 6.3 Hồ sơ lead

```
Page header (5.1)
Path (5.2)
┌ Cột trái 2/3 ─────────────────────────────┐ ┌ Cột phải 1/3 ───────────┐
│ Cần hỏi ở cuộc gọi này (5.3)                │ │ Người đặt → Người nhận   │
│ [Ghi kết quả gọi | Tin Zalo | Ghi chú | Hẹn]│ │ (5.4)                    │
│ Dòng hoạt động (5.8)                        │ │ Hộ gia đình: Hộ Nguyễn   │
│                                             │ │ [Gắn vào hộ]             │
│                                             │ │ Các lead khác của khách  │
│                                             │ │ Sản phẩm quan tâm        │
└─────────────────────────────────────────────┘ └──────────────────────────┘
```

Dưới 900px: một cột, thứ tự Page header → Người đặt → Cần hỏi → Khung soạn → Dòng hoạt động; nút Gọi dính đáy màn hình.

### 6.4 Hộp thư Zalo

Ba cột: danh sách hội thoại (tên, tin cuối, thời gian, tag quốc gia, trạng thái chưa đọc) | nội dung hội thoại có ô trả lời và đồng hồ khung nhắn | tóm tắt khách và lead liên quan, nút mở hồ sơ. Hội thoại từ người chưa có hồ sơ có nút "Tạo lead từ hội thoại này".

### 6.5 Cài đặt, phân quyền

Đây là màn hình riêng của Owner, phải dễ dùng nhất trong phần cài đặt.

**Ma trận vai trò:**

```
Phân quyền                                         [Tạo vai trò]
Tìm quyền [            ]
┌────────────────────────────────┬────────┬───────────┬──────────┐
│ Quyền                          │ Owner  │ Sale admin│ Telesale │
├ Lead ──────────────────────────┼────────┼───────────┼──────────┤
│ Xem mọi lead của showroom      │  ●━    │   ●━      │   ━○     │
│ Giao, chuyển lead              │  ●━    │   ●━      │   ━○     │
│ Xuất danh sách khách ra file   │  ●━    │   ━○      │   ━○     │
├ Khách ─────────────────────────┤        │           │          │
│ Xem đầy đủ số điện thoại       │  ●━    │   ●━      │   ━○     │
└────────────────────────────────┴────────┴───────────┴──────────┘
```

- Mỗi ô là công tắc bật tắt, lưu ngay, toast "Đã bật Xuất danh sách khách cho Sale admin".
- Cột Owner khóa, không tắt được. Quyền "Bật tắt quyền" không có công tắc ở cột khác.
- Quyền nhạy cảm (`contact.phone_reveal`, `lead.export`, `call.recording_all`, `lead.delete`, `product.view_cost`, `payment.confirm`, `payment.refund`, `order.export`, `order.discount_approve`) có nhãn nhỏ "Nhạy cảm" màu `--warn`; bật lên phải xác nhận một lần.
- Tên quyền hiển thị bằng câu tiếng Việt dễ hiểu, mã quyền chỉ hiện khi rê chuột.

**Người dùng và quyền riêng:**

```
Người dùng                                            [Mời người dùng]
┌ Tên ────────┬ Vai trò ────┬ Trạng thái ┬ Quyền riêng ┬───────────────┐
│ Thảo        │ Telesale ▾  │ Đang hoạt động │ +1 −0    │ [Chỉnh] [Xem như]│
└─────────────┴─────────────┴────────────┴─────────────┴───────────────┘
```

Bấm "Chỉnh" mở drawer bên phải liệt kê mọi quyền với ba trạng thái: **Theo vai trò** (mặc định, hiện bật hay tắt theo vai trò), **Cấp riêng**, **Thu riêng**. Các quyền khác với vai trò được tô nền `--brand` nhạt và gom lên đầu danh sách để Owner thấy ngay người này khác người khác ở đâu. Có nút "Đưa về theo vai trò".

### 6.6 Cài đặt khác

- **Luật phân lead:** bật tắt từng telesale nhận lead, giới hạn số lead chưa gọi mỗi người, khung gọi giờ Hàn, SLA phút.
- **Ca làm việc:** bảng tuần 7 cột, mỗi ca là một dải màu, cột phụ hiện khung giờ Hàn tương ứng để người sắp ca thấy ca nào phủ khung 19:00–22:30 giờ Hàn. Kéo thả người vào ca.
- **Chế độ gọi:** Gọi ngoài hệ thống hoặc Qua tổng đài; đổi chế độ thì hiện nhắc Owner rà lại quyền xem số của Telesale.
- **Tích hợp:** mỗi đấu nối là một hàng: trạng thái, lần nhận dữ liệu gần nhất, lỗi gần nhất bằng câu dễ hiểu, nút Kết nối lại, nút Gửi dữ liệu thử.
- **Danh mục:** nguồn, lý do thất bại, dịp tặng, kết quả cuộc gọi; kéo thả để sắp xếp, tắt thay vì xóa.

### 6.7 Báo cáo cơ bản

Bốn khối: lead theo nguồn (cột ngang), tỷ lệ gọi trong 5 phút theo người (bảng), phễu giai đoạn, lý do thất bại. Bộ lọc thời gian: hôm nay, 7 ngày, 30 ngày, tùy chọn. Telesale chỉ thấy số của mình; sale admin thấy cả đội.

### 6.8 Sản phẩm

Danh sách dạng bảng: ảnh nhỏ, tên, danh mục, số SKU, giá bán đang áp, tồn khả dụng tổng, trạng thái. Lọc theo danh mục, còn hàng, đang bán.

Hồ sơ sản phẩm: page header (icon đối tượng sản phẩm), tab **Thông tin** (mô tả, ảnh, bảo hành, giao lắp: cồng kềnh hay hàng nhỏ, số người lắp, cân nặng), tab **SKU** (bảng SKU với giá theo từng bảng giá và tồn theo kho), tab **Lịch sử giá**, tab **Chính sách đang áp** (danh sách khuyến mãi và combo có chứa sản phẩm). Cột giá vốn và biên lợi nhuận chỉ xuất hiện khi có quyền; không có quyền thì cột không tồn tại, không phải để trống.

### 6.9 Kho

```
Tồn kho   [Kho showroom Q4 ▾]                    [Lập phiếu nhập] [Chuyển kho] [Kiểm kê]
┌ SKU ─────────────┬ Có ─┬ Đang giữ ┬ Khả dụng ┬ Ngưỡng ┬ Trạng thái ─────┐
│ Ghế DV-X9 nâu    │  6  │    4     │    2     │   3    │ Sắp hết         │
│ Ghế DV-S7 đen    │  9  │    2     │    7     │   3    │ Đủ hàng         │
└──────────────────┴─────┴──────────┴──────────┴────────┴─────────────────┘
```

- Cột **Khả dụng** đậm nhất vì đó là số người bán cần. Sắp hết nền `--warn` nhạt, hết hàng nền `--err` nhạt.
- Bấm một dòng mở drawer: tồn theo từng kho, các đơn đang giữ hàng (mã đơn, hạn giữ), danh sách serial, sổ kho của SKU.
- **Phiếu kho:** màn hình riêng giống chứng từ, có trạng thái Nháp → Đã ghi sổ. Nút "Ghi sổ" có hộp xác nhận ghi rõ số thay đổi từng SKU. Phiếu đã ghi sổ chỉ xem, sửa bằng phiếu điều chỉnh.
- **Kiểm kê:** nhập số đếm theo từng dòng (hỗ trợ quét mã vạch trên điện thoại), cột chênh lệch tô màu, nút gửi duyệt.

### 6.10 Combo và Chính sách

- **Combo:** trình dựng hai cột: trái chọn SKU và số lượng, đánh dấu món tặng; phải là thẻ tóm tắt cập nhật ngay: tổng giá lẻ, giá combo, khách tiết kiệm, tồn combo lắp được, biên lợi nhuận (nếu có quyền).
- **Chính sách:** danh sách nhóm theo loại (Khuyến mãi, Giao lắp, Đặt cọc, Thanh toán, Bảo hành, Đổi trả, Giới hạn giảm giá), mỗi dòng có trạng thái, thời gian hiệu lực, phiên bản. Trình sửa là form theo loại, viết điều kiện và lợi ích bằng câu đọc được: "Khi đơn có **Ghế DV-X9** và đặt **trước 13/10/2026** thì **tặng Gối massage cổ** và **miễn phí lắp đặt**."
- **Thử chính sách:** cột trái nhập giỏ hàng, kênh, tỉnh người nhận, ngày, quốc gia người đặt; cột phải hiển thị kết quả hàm định giá: từng dòng, chính sách đã áp và lý do, chính sách bị loại và lý do, phí, tổng, mức cọc, cảnh báo. Đây là cách Owner kiểm tra trước khi bật.

### 6.11 Báo giá

- Tạo từ hồ sơ lead bằng nút **Tạo báo giá**; người đặt và người nhận điền sẵn từ lead.
- Bố cục: thêm sản phẩm hoặc combo bằng ô tìm nhanh; mỗi dòng hiện tồn khả dụng; khối chính sách tự áp hiện ngay dưới giỏ; giảm tay vượt giới hạn hiện cảnh báo "Cần Owner duyệt" trước khi gửi.
- Nút **Gửi báo giá** mở lựa chọn: sao chép link, gửi qua Zalo OA (nếu khách đang trong hội thoại).
- **Trang báo giá cho khách** (`/q/<token>`): thiết kế riêng cho điện thoại, không có khung ứng dụng. Trên cùng là logo Đại Việt và dòng "Báo giá dành cho anh chị <tên>"; thẻ người đặt → người nhận; danh sách sản phẩm có ảnh; tổng tiền và mức cọc nổi bật; chính sách giao lắp, bảo hành viết thành câu ngắn; thông tin chuyển khoản tài khoản công ty kèm nội dung chuyển khoản theo mã báo giá; hạn hiệu lực. Không hiện thông tin nội bộ, không hiện số điện thoại đầy đủ.

### 6.12 Đơn hàng

Danh sách: mã đơn, người đặt (kèm tag quốc gia), người nhận và tỉnh, tổng tiền, đã trả, còn lại, trạng thái, người bán, ngày hẹn giao. Lọc nhanh: Chờ duyệt, Chờ cọc, Đang giữ hàng, Sắp hết hạn giữ, Chờ giao, Đang giao, Hoàn tất.

Hồ sơ đơn:

```
Page header: Đơn Q4-2610-0012   [Hàn Quốc]            [Ghi thanh toán] [Chuyển bước] [⋯]
Path: Xác nhận → Đã cọc → Sẵn sàng giao → Đang giao → Đã lắp → Hoàn tất
┌ Cột trái 2/3 ──────────────────────────────┐ ┌ Cột phải 1/3 ───────────────┐
│ Người đặt → Người nhận (5.4), lời nhắn quà,  │ │ Tiền                         │
│ cờ "Giữ bất ngờ"                             │ │ Tổng       79.900.000đ       │
│ Sản phẩm (dòng, serial khi đã xuất kho)      │ │ Đã xác nhận 20.000.000đ      │
│ Chính sách đã áp (ảnh chụp lúc chốt)         │ │ Chờ xác nhận 0đ              │
│ Giao lắp: các bước, ngày hẹn, ghi chú        │ │ Còn lại    59.900.000đ       │
│ Dòng hoạt động của đơn                       │ │ Các khoản thanh toán         │
└──────────────────────────────────────────────┘ │ Giữ hàng: còn 9 ngày         │
                                                  │ Bảo hành (khi hoàn tất)      │
                                                  └──────────────────────────────┘
```

- Cờ **Giữ bất ngờ** hiện thành dải `--warn` nhạt trên thẻ người nhận: "Không liên hệ người nhận khi người đặt chưa cho phép." Nút gọi người nhận bị ẩn khi cờ đang bật.
- **Ghi thanh toán:** form ngắn gồm loại (cọc, phần còn lại, hoàn tiền), số tiền, phương thức, mã giao dịch, ảnh chứng từ. Khoản mới có trạng thái "Chờ xác nhận" màu `--warn` cho đến khi người có quyền xác nhận.
- Chuyển bước không đủ điều kiện thì hiện ngay dưới path điều kiện còn thiếu (ví dụ: "Chưa gán serial cho Ghế DV-X9").

### 6.13 Hàng chờ duyệt và xác nhận

- **Duyệt giảm giá** (Owner): mỗi dòng là một báo giá hoặc đơn, người đề xuất, mức giảm, lý do, biên lợi nhuận sau giảm (nếu có quyền), nút Duyệt và Từ chối kèm ô lý do.
- **Thanh toán chờ xác nhận** (Sale admin, Owner): mỗi dòng hiện số tiền, mã giao dịch, ảnh chứng từ phóng to được, đơn liên quan; khoản do chính người đang xem ghi nhận thì không có nút Xác nhận.
- Cả hai hàng chờ có lối tắt trên utility bar kèm số lượng.

### 6.14 Đội ngũ

Menu riêng, tách khỏi Báo cáo kinh doanh. Tab con: Tổng quan đội, Chỉ tiêu, Ca trực và chấm công, Hồ sơ nhân sự, Kèm cặp, Bàn giao. Mỗi tab con chỉ hiện khi có quyền.

**Bộ chọn chung ở đầu mọi trang Đội ngũ:** kỳ (Hôm nay, Tuần này, Tháng này, Tùy chọn), cách đo (Theo kỳ hoặc Theo lô lead, có dòng giải thích ngắn khi rê chuột), nhóm vai trò.

**Tổng quan đội**

```
Tháng 10   Theo kỳ ▾   Telesale ▾
┌ Đội: Doanh thu đã cọc 1,21 tỷ / 1,5 tỷ (81%) │ Gọi trong SLA 87% │ Chốt (lô lead) 10,3% ┐
┌ Người ──┬ Trực ┬ Doanh thu đã cọc ────────┬ Đơn ┬ Cuộc gọi/ngày ┬ SLA ─┬ Đủ thông tin ┬ Chốt ┬ Cảnh báo ┐
│ Thảo    │  ●   │ ███████████░ 92% 460tr   │  8  │  41 / 40      │ 94%  │    88%       │ 12%  │          │
│ An      │  ○   │ ██████░░░░░░ 54% 270tr   │  5  │  28 / 40      │ 71%  │    62%       │  8%  │ 3 lead   │
│         │      │                          │     │               │      │              │      │ đánh thất│
│         │      │                          │     │               │      │              │      │ bại sớm  │
└─────────┴──────┴──────────────────────────┴─────┴───────────────┴──────┴──────────────┴──────┴──────────┘
```

- Cột chỉ số có chỉ tiêu hiện thanh tiến độ so với chỉ tiêu đã tính theo ngày làm thực tế, kèm "dự báo cuối kỳ" khi rê chuột.
- Tô màu theo **chỉ tiêu**, không theo thứ hạng: đạt hoặc vượt `--ok`, dưới 80% tiến độ thời gian `--warn`, dưới 50% `--err`. Không có cúp, huy chương hay màu vàng bạc đồng.
- Sắp xếp theo bất kỳ cột nào. Bảng xếp hạng có tên chỉ hiện với người có `kpi.leaderboard`, hoặc khi Owner bật cho cả đội.
- Cột Cảnh báo gom các tín hiệu cần quản lý chú ý: đánh thất bại sớm, xem số bất thường, nhiều lead quá hạn, trực trễ nhiều lần. Bấm vào mở danh sách bản ghi.
- Bấm tên người mở trang hiệu suất cá nhân.

**Hiệu suất cá nhân** (cũng là trang "Hiệu suất của tôi" của telesale)

```
[Ảnh] Thảo, Telesale, quản lý: Hà (Sale admin)     Tháng 10 ▾   Theo kỳ ▾
┌ Kết quả ─────────────────────────┐ ┌ Tốc độ ───────────────┐ ┌ Chất lượng ──────────┐
│ Doanh thu đã cọc  460tr / 500tr   │ │ Gọi trong SLA   94%    │ │ Đủ thông tin   88%   │
│ Đơn 8, giá trị TB 57,5tr          │ │ Liên hệ đầu (tv) 2:40  │ │ Lead → demo    31%   │
│ Giảm TB 2,1%, cần duyệt 1 đơn     │ │ Hẹn đúng giờ    90%    │ │ Báo giá → cọc  44%   │
└───────────────────────────────────┘ └────────────────────────┘ └──────────────────────┘
Phễu cá nhân so với đội, xu hướng theo ngày, cơ cấu nguồn lead và tỷ lệ chốt theo nguồn
Lý do thất bại, danh sách việc cần làm ngay (lead quá hạn, hẹn gọi lại bị lỡ)
```

- Mỗi khối là một nhóm chỉ số theo đúng nhóm trong `CLAUDE.md` mục 9.4: Hoạt động, Tốc độ, Chất lượng, Kết quả, Tuân thủ. Khối Tuân thủ chỉ hiện với quản lý.
- Mỗi chỉ số hiện ba thứ: giá trị, chỉ tiêu (nếu có), **trung vị đội** (không hiện tên người khác).
- Với telesale, trang mở đầu bằng khối "Việc cần làm ngay" thay vì khối Kết quả: số liệu phải dẫn tới hành động, không chỉ để xem.
- Mọi số bấm được, mở đúng danh sách bản ghi tạo nên số đó.
- Cuộc gọi ghi tay ở chế độ gọi ngoài hệ thống có ký hiệu nhỏ "ghi tay" bên cạnh số cuộc gọi.

**Chỉ tiêu:** bảng người × chỉ số theo kỳ, sửa trực tiếp trong ô; nút "Áp chỉ tiêu mẫu cho nhóm"; ô đã chỉnh khác mẫu được tô nền `--brand` nhạt.

**Ca trực và chấm công:** lịch tuần theo người; mỗi ca hiện dải xếp ca và dải giờ trực thực tế chồng lên nhau, phần lệch tô `--warn`; ngày nghỉ tô xám có nhãn loại nghỉ. Tổng giờ trực tuần ở cột cuối.

**Hồ sơ nhân sự:** danh sách người kèm chức danh, vai trò hệ thống, quản lý, trạng thái làm việc, ngày vào làm. Hồ sơ một người gồm thông tin làm việc, kỹ năng, lịch sử trạng thái. Không có trường giấy tờ tùy thân, tài khoản ngân hàng hay lương.

**Kèm cặp:** dòng thời gian ghi chú theo người, mỗi ghi chú có mục tiêu cải thiện và hạn xem lại; ghi chú chưa chia sẻ có nhãn "Chỉ quản lý thấy".

**Bàn giao:** trình 4 bước có thanh tiến trình: Khóa tài khoản → Xem việc đang giữ (đếm theo loại: lead, hẹn gọi lại, báo giá, đơn, hội thoại) → Chọn người nhận và cách chia → Xác nhận và xuất biên bản. Bước khóa tài khoản có hộp xác nhận ghi rõ người này sẽ bị đăng xuất ngay và lead, việc đang mở của họ về hàng "Chưa phân".

### 6.15 Khách: hồ sơ khách 360 và danh sách theo vòng đời

Đây là màn hình của lớp CDP: trả lời khách này là ai, đang ở đâu trong vòng đời, đã có gì, việc gì nên làm tiếp.

**Danh sách Khách:** bộ lọc nhanh theo giai đoạn vòng đời (Lead, Khách mới, Đang sử dụng, Khách thân, Ngủ đông, Có rủi ro), thị trường, tỉnh, sản phẩm đang dùng, dịp sắp tới trong 30 ngày. Mỗi hàng: tên kèm tag thị trường, giai đoạn, sản phẩm đang dùng, lần tương tác gần nhất, việc đang mở. Chỉ hiện khách mà người dùng được xem theo quyền lead, đơn.

**Hồ sơ khách:**

```
Page header: [■] Khách  Nguyễn Thị Thu  [Hàn Quốc]  Đang sử dụng           [Gọi] [Zalo] [Tạo lead] [⋯]
Highlights: Đã chi 79,9tr │ 1 đơn │ Hộ Nguyễn │ Tương tác gần nhất 3 ngày trước │ Đồng ý: Gọi, Zalo
┌ Cột trái 2/3 ─────────────────────────────┐ ┌ Cột phải 1/3 ────────────────────────┐
│ Việc tiếp theo (5.15)                       │ │ Định danh: số Hàn, số VN, Zalo (che)  │
│ Dòng sự kiện thống nhất: lead, gọi, tin,    │ │ Đồng ý theo mục đích và kênh          │
│ báo giá, đơn, thanh toán, giao lắp,         │ │ Hộ gia đình và thành viên             │
│ bảo hành (5.8, lọc theo loại)               │ │ Sản phẩm đang dùng, bảo hành, lõi lọc │
│                                             │ │ Ngày quan trọng sắp tới               │
│                                             │ │ Các lead và đơn                       │
└─────────────────────────────────────────────┘ └───────────────────────────────────────┘
```

- Giai đoạn vòng đời là pill có chữ, tính từ dữ liệu, không có nút sửa tay; rê chuột hiện lý do ("Đã giao lắp 15/09, chưa có đơn mới").
- Đồng ý hiện từng kênh có chữ "Được gọi", "Được nhắn Zalo", "Không nhận khuyến mãi"; kênh không được phép thì nút tương ứng khóa kèm lý do (đây là thiếu điều kiện nghiệp vụ, mục 7).
- Từ tháng 3, cột phải có khối "AI gợi ý" màu `--ai`: offer phù hợp và lý do, luôn qua hàm định giá, cần người bấm dùng.

---

## 7. Giao diện theo quyền

| Tình huống | Cách hiển thị |
|---|---|
| Không có quyền xem cả màn hình | Ẩn tab. Vào bằng URL thì trang báo "Anh chị chưa được cấp quyền xem mục này. Liên hệ quản lý showroom." |
| Không có quyền một hành động | Ẩn nút |
| Có quyền nhưng thiếu điều kiện nghiệp vụ (thiếu thông tin, hết khung nhắn Zalo) | Hiện nút ở trạng thái khóa kèm lý do ngay cạnh, vì thông tin này giúp người dùng biết cần làm gì |
| Không có quyền xem một trường | Server không trả trường đó; giao diện hiện bản che hoặc ẩn hẳn |
| Đang "Xem như" | Mọi nút ghi bị ẩn, banner luôn hiện |

Giao diện không bao giờ tự suy quyền từ tên vai trò; luôn dùng danh sách quyền hiệu lực server trả về.

---

## 8. Thao tác nhanh cho telesale

| Phím | Việc |
|---|---|
| `N` | Mở khách tiếp theo trong hàng chờ |
| `C` | Gọi khách đang mở |
| `1`–`5` | Chọn kết quả cuộc gọi khi bảng kết quả đang mở |
| `Z` | Chuyển sang tab Tin Zalo |
| `G` | Mở ô ghi chú |
| `/` | Đến ô tìm kiếm |
| `?` | Xem danh sách phím tắt |

Phím tắt không hoạt động khi con trỏ đang ở trong ô nhập.

---

## 9. Giọng văn và từ ngữ

- Xưng hô với người dùng: "anh chị" ở thông báo chung; không xưng "bạn".
- Viết câu ngắn, động từ rõ, chữ thường đầu câu như câu bình thường.
- Một việc giữ một tên trong toàn bộ luồng.

| Dùng | Không dùng |
|---|---|
| Lead | Khách tiềm năng, prospect |
| Khách | Contact, liên hệ |
| Người đặt, người nhận | Buyer, receiver |
| Hộ gia đình | Household |
| Giao cho | Assign |
| Hẹn gọi lại | Callback |
| Thất bại (kèm lý do) | Lost, hủy |
| Báo giá | Quote, bảng báo giá |
| Đơn hàng | Order, đơn đặt |
| Giữ hàng | Reserve, booking |
| Phiếu kho, ghi sổ | Chứng từ kho, post |
| Đội ngũ, nhân sự | Team, HR |
| Chỉ tiêu | Target, KPI target |
| Chỉ số | KPI, metric |
| Trung vị đội | Median |
| Bàn giao | Offboarding, handover |
| Chính sách | Policy, rule |
| Việc, việc tiếp theo | Task, to-do, next best action |
| Vòng đời, giai đoạn vòng đời | Lifecycle, stage |
| Thị trường | Market, region |
| Giữ bất ngờ | Surprise mode |
| Đồng ý | Consent, opt-in |
| Đang trực | Online, available |
| Giờ Hàn | KST, giờ Korea |

- Ngày `dd/MM/yyyy`, giờ 24h `HH:mm`. Giờ của khách ở Hàn luôn có chữ "giờ Hàn" đi kèm.
- Tiền: `79.900.000đ` trong chi tiết; `79,9tr` trong bảng và thẻ.
- Số: dấu chấm phân cách hàng nghìn, dấu phẩy thập phân theo tiếng Việt.

---

## 10. Hỗ trợ tiếp cận và kích thước màn hình

- Tương phản chữ tối thiểu 4.5:1; mọi phần tử bấm được có viền focus 2px màu `--brand`.
- Vùng bấm tối thiểu 36px trên máy tính, 44px trên điện thoại.
- Biểu tượng chỉ có icon phải có `aria-label` tiếng Việt.
- Mốc kích thước: dưới 560px (điện thoại), 560–900px (máy tính bảng), 900–1280px (laptop), trên 1280px. Kiểm tra bắt buộc ở 390px và 1366px.
- Telesale trên điện thoại: hồ sơ một cột, nút Gọi dính đáy, bảng kết quả mở dạng sheet từ dưới.

---

## 11. Không làm

- Không dùng logo, tên, bộ icon, linh vật của Salesforce hay hãng khác.
- Không dùng gradient trang trí, không đổ bóng nặng, không hiệu ứng kính mờ.
- Không dùng emoji trên giao diện. Icon dùng một bộ nét mảnh thống nhất (lucide-react) cho icon hành động; icon đối tượng là glyph trắng trên ô màu.
- Không viết hoa toàn bộ chữ, không gắn nhãn phụ phía trên mọi tiêu đề, không nối thông tin bằng dấu chấm giữa.
- Không chia trang thành hàng loạt thẻ giống hệt nhau cùng bóng cùng bo góc.
- Không để chữ tiếng Anh, mã lỗi kỹ thuật hay tên bảng dữ liệu lọt ra giao diện người dùng.
