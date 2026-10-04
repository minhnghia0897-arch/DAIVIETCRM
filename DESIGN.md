# DESIGN.md — Giao diện Đại Việt CRM/CDP

Tài liệu thiết kế cho Claude Code. Đọc cùng `CLAUDE.md`. Bố cục tham khảo bản demo `docs/reference/daiviet-crm-q4.html`: lấy tinh thần bố cục kiểu CRM doanh nghiệp (header toàn cục, thanh tab ứng dụng, trang hồ sơ có highlights, path, dòng hoạt động), nhưng đây là sản phẩm mang thương hiệu Đại Việt. **Không dùng logo, tên, biểu tượng, linh vật hay bộ icon của Salesforce hoặc bất kỳ hãng nào khác.**

---

## 1. Người dùng và việc chính của màn hình

| Người dùng | Bối cảnh | Việc chính | Điều họ cần từ giao diện |
|---|---|---|---|
| Telesale | Ngồi máy tính hoặc cầm điện thoại, gọi liên tục, nhiều ca tối theo giờ Hàn | Gọi đúng người, đúng lúc, ghi kết quả nhanh | Biết ngay gọi ai tiếp theo, bấm một lần là gọi, ghi kết quả dưới 30 giây |
| Sale admin | Máy tính, giám sát cả đội | Không để lead nào nguội, phân lại khi quá tải | Thấy ngay lead chưa phân, quá hạn, ai đang ôm nhiều |
| Owner | Máy tính hoặc điện thoại, xem nhanh | Kiểm soát quyền và dữ liệu, xem hiệu quả | Bật tắt quyền dễ, kiểm tra được người khác đang thấy gì |

---

## 2. Nguyên tắc thiết kế

1. **Hồ sơ là bàn làm việc.** Telesale không phải rời trang hồ sơ để gọi, nhắn Zalo, ghi kết quả hay hẹn gọi lại.
2. **Hai quốc gia luôn hiện diện.** Mọi chỗ có người hoặc thời gian đều cho biết người đó ở Việt Nam hay Hàn Quốc và giờ địa phương của họ. Đây là đặc điểm riêng của sản phẩm, là chỗ duy nhất được dùng màu nhấn mạnh tay.
3. **Người đặt và người nhận là hai người.** Hiển thị thành cặp có hướng: người đặt → người nhận.
4. **Chỉ hiện cái người dùng được phép.** Không có quyền thì không hiện nút, không hiện dữ liệu. Không dùng nút xám chờ người dùng đoán vì sao.
5. **Mật độ vừa phải cho người làm việc cả ngày.** Ưu tiên bảng và danh sách dày thông tin, chữ đủ lớn để đọc lâu không mỏi. Không chia nội dung thành hàng loạt thẻ giống hệt nhau.
6. **Trạng thái nói bằng chữ, màu chỉ hỗ trợ.** Mọi pill có chữ; không có chỗ nào chỉ dựa vào màu.

---

## 3. Token

Khai báo token dạng CSS variables trong `app/globals.css`, ánh xạ sang Tailwind theme. Không viết mã màu trực tiếp trong component.

### Màu nền và chữ

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--page` | `#EEF1F6` | Nền trang |
| `--band` | `#C9D8EE` | Dải màu phía trên nền trang, mờ dần xuống `--page` (cao 220px) |
| `--surface` | `#FFFFFF` | Card, bảng, header |
| `--surface-2` | `#F6F8FB` | Đầu bảng, hàng hover, nền phụ |
| `--line` | `#DDDBDA` | Viền card, ô nhập |
| `--line-2` | `#E5E5E5` | Đường kẻ bên trong card |
| `--text` | `#181818` | Chữ chính |
| `--text-weak` | `#5C5C5C` | Nhãn, chữ phụ |

### Màu ý nghĩa

| Token | Giá trị | Nền nhạt | Dùng cho |
|---|---|---|---|
| `--brand` | `#0176D3` | `#E5F1FC` | Hành động chính, liên kết, tab đang chọn |
| `--brand-strong` | `#014486` | | Hover nút chính, giai đoạn hiện tại trên path |
| `--ok` | `#2E844A` | `#E6F4EA` | Thành công, đã liên hệ, đúng hạn |
| `--warn` | `#A96404` | `#FEF1DE` | Sắp quá hạn, cần chú ý, chờ duyệt |
| `--err` | `#BA0517` | `#FDE7E9` | Quá hạn, lỗi, thất bại |
| `--ai` | `#7526E3` | `#F2EAFE` | Dành cho tính năng AI từ tháng 3. Tháng 1 không dùng |
| `--obj-lead` | `#E07A2E` | | Icon đối tượng Lead |
| `--obj-contact` | `#6E4FD6` | | Icon đối tượng Khách, Hộ |
| `--obj-call` | `#3BA755` | | Icon cuộc gọi |
| `--obj-zalo` | `#0068FF` | | Icon tin Zalo |

### Màu quốc gia (điểm nhấn riêng của sản phẩm)

| Token | Chữ | Nền |
|---|---|---|
| `--loc-kr` | `#1F3FA8` | `#E8EEFF` |
| `--loc-vn` | `#B42318` | `#FDECEA` |

Chỉ dùng cho tag quốc gia và đồng hồ đôi. Không dùng cho mục đích khác.

Tháng 1 chỉ làm giao diện sáng. Đặt token theo cách thêm giao diện tối sau này chỉ cần định nghĩa lại biến.

### Chữ

- **Font:** Be Vietnam Pro (thiết kế cho tiếng Việt, dấu rõ ở cỡ nhỏ), nạp bằng `next/font/google`, các độ đậm 400, 500, 600, 700. Dự phòng: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Số:** mọi bảng, chỉ số, đồng hồ, tiền dùng `font-variant-numeric: tabular-nums`.

| Cấp | Cỡ / dòng | Độ đậm | Dùng cho |
|---|---|---|---|
| Tiêu đề trang | 20 / 28 | 700 | Tên hồ sơ, tên màn hình trong page header |
| Tiêu đề card | 15 / 22 | 700 | Đầu card, đầu bảng con |
| Chỉ số lớn | 24 / 30 | 300 | Ô KPI |
| Thân | 14 / 21 | 400 | Nội dung chính, ô bảng |
| Nhãn | 12.5 / 18 | 400, màu `--text-weak` | Nhãn trường, chú thích |
| Pill | 12 / 16 | 600 | Trạng thái |

Không viết hoa toàn bộ chữ ở bất kỳ đâu. Không dùng font monospace cho nhãn dữ liệu.

### Khoảng cách, bo góc, đổ bóng

- Lưới 4px. Khoảng cách thường dùng: 4, 8, 12, 16, 24.
- Khoảng giữa các card: 12px. Đệm trong card: 14px ngang, 12px dọc.
- Bo góc: ô nhập, nút 4px; card 8px; pill 12px (dạng viên thuốc). Không bo cùng một mức cho mọi thứ.
- Đổ bóng: card `0 2px 2px rgba(0,0,0,.05)`; menu, drawer, popup `0 4px 16px rgba(0,0,0,.16)`.
- Chuyển động: 150–250ms, chỉ khi phản hồi thao tác (mở drawer, toast, hàng mới vào danh sách sáng lên rồi nhạt dần). Tôn trọng `prefers-reduced-motion`.

---

## 4. Khung ứng dụng

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [Logo Đại Việt]   [ Tìm khách, SĐT VN hoặc +82…        ]  09:12 VN 11:12 Hàn │
│                                                   [Trực ●] [Chuông] [Avatar]│
├────────────────────────────────────────────────────────────────────────────┤
│ ⋮⋮⋮ Showroom Quận 4 │ Trang chủ │ Lead │ Hộp thư │ Sản phẩm │ Báo cáo │ Cài đặt│
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  (nội dung màn hình)                                                       │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ Hẹn gọi lại hôm nay (4) │ Lead quá hạn (1) │                    Bản tháng 1 │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Header toàn cục:** logo chữ Đại Việt kèm biểu tượng đơn giản tự thiết kế; ô tìm kiếm theo tên, số VN, số +82; **đồng hồ đôi** giờ VN và giờ Hàn (luôn hiện, trừ màn hình dưới 900px thì chỉ hiện trong menu avatar); công tắc **Trực** cho người nhận lead; chuông thông báo; avatar.
- **Thanh tab ứng dụng:** tên showroom bên trái; các tab chỉ hiện nếu người dùng có quyền xem. Tab đang chọn có gạch dưới 3px màu `--brand-strong`, chữ đậm.
- **Utility bar dưới đáy:** cố định, cao 44px, chứa lối tắt theo vai trò. Telesale: hẹn gọi lại hôm nay, lead quá hạn của tôi. Sale admin: lead chưa phân, quá hạn toàn đội.
- **Chỗ cho panel trợ lý AI:** dành sẵn cột phải 360px, tháng 1 không hiển thị.
- **Banner "Xem như":** khi Owner bật chế độ xem như người dùng khác, một dải màu `--warn` nền nhạt chạy ngang dưới thanh tab: "Đang xem như Thảo (Telesale). Chỉ đọc. [Thoát]".

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
  ✓ Người nhận: Bố mẹ
  ○ Tỉnh người nhận          [chọn tỉnh ▾]
  ○ Dịp tặng                 [Tết | 20/10 | Sinh nhật | Mừng thọ | Khác]
  ○ Ngân sách                [<30tr | 30–50tr | 50–80tr | >80tr]
```

Chọn trực tiếp tại chỗ, lưu ngay, không mở form riêng. Đủ bốn thông tin thì card tự thu gọn thành một dòng.

### 5.4 Cặp người đặt → người nhận

```
┌ Người đặt ─────────────────┐   ┌ Người nhận ────────────────┐
│ Nguyễn Thị Thu  [Hàn Quốc] │ → │ Bố mẹ        [Việt Nam]    │
│ Daegu, 21:10 giờ Hàn       │   │ Diễn Châu, Nghệ An         │
│ +82 10••••2290  [Gọi]      │   │ Chưa có số  [Thêm]         │
└────────────────────────────┘   └────────────────────────────┘
```

Thẻ người đặt có vạch trái 3px màu `--brand`. Luôn hiện giờ địa phương của người ở Hàn.

### 5.5 Số điện thoại và nút gọi

- Không có quyền xem số: hiện số đã che `+82 10••••2290`, cạnh đó nút **Gọi**. Không có nút hiện số.
- Có quyền: hiện số đã che, cạnh đó nút **Hiện số** (mỗi lần bấm ghi audit log) và **Gọi**.
- Bấm Gọi: nút chuyển sang "Đang gọi…" kèm bộ đếm thời gian, rồi khi cuộc gọi kết thúc **tự mở bảng ghi kết quả** (5.7).
- Có thêm lựa chọn nhỏ "Đã gọi qua Zalo" cho trường hợp gọi ngoài hệ thống.
- **Chế độ gọi ngoài hệ thống (tháng 1, chưa có tổng đài):** bấm Gọi trên điện thoại thì mở trình gọi của máy với số đầy đủ; trên máy tính thì hiện số đầy đủ trong một ô nổi kèm nút sao chép và dòng nhắc "Lượt xem số được ghi lại". Khi người dùng quay lại tab CRM, bảng ghi kết quả (5.7) tự mở. Chỉ áp dụng cho lead đang được giao cho chính người đó.

### 5.6 Tag quốc gia và đồng hồ đôi

- Tag: chữ "Hàn Quốc" hoặc "Việt Nam", 11px đậm 600, bo 4px, màu theo `--loc-*`. Không dùng cờ hay emoji.
- Đồng hồ đôi ở header: `09:12 VN  11:12 Hàn`, giờ đậm, chữ VN và Hàn nhạt.
- Trong danh sách lead của khách ở Hàn: cột "Giờ khách" hiện giờ Hàn hiện tại; tô `--ok` khi đang trong khung gọi tốt (mặc định 19:00–22:30 giờ Hàn), `--text-weak` khi ngoài khung.

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
[Mới] [Quá hạn] [Hẹn hôm nay] [Khách ở Hàn] [Nguồn ▾] [Giai đoạn ▾]
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
| Hẹn theo giờ Hàn | `Gọi lúc 19:00 giờ Hàn`, nền `--loc-kr` nhạt |
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
```

Thẻ "Gọi tiếp theo" là điểm nhấn của trang: một khách, đủ bối cảnh, một nút gọi. Phím `N` chuyển sang khách kế tiếp.

### 6.2 Trang chủ sale admin

```
┌ Đội hôm nay: Lead 23 │ Chưa phân 2 │ Quá hạn 1 │ Gọi trong 5 phút 87% ┐
┌ Lead chưa phân ─────────────────┐ ┌ Tải việc từng người ─────────────┐
│ ... [Giao cho ▾] mỗi dòng        │ │ Thảo  Trực ●  Chưa gọi 3  Hẹn 4  │
├ Quá hạn SLA ────────────────────┤ │ An    Nghỉ ○  Chưa gọi 0  Hẹn 1  │
│ ... ai giữ, quá bao lâu [Giao lại]│ └──────────────────────────────────┘
└─────────────────────────────────┘ ┌ Tích hợp ── Meta ● Zalo ● Tổng đài ●┐
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
- Quyền nhạy cảm (`contact.phone_reveal`, `lead.export`, `call.recording_all`, `lead.delete`) có nhãn nhỏ "Nhạy cảm" màu `--warn`; bật lên phải xác nhận một lần.
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
- Không dùng gradient trang trí (trừ dải `--band` ở đầu trang), không đổ bóng nặng, không hiệu ứng kính mờ.
- Không dùng emoji trên giao diện. Icon dùng một bộ nét mảnh thống nhất (lucide-react) cho icon hành động; icon đối tượng là glyph trắng trên ô màu.
- Không viết hoa toàn bộ chữ, không gắn nhãn phụ phía trên mọi tiêu đề, không nối thông tin bằng dấu chấm giữa.
- Không chia trang thành hàng loạt thẻ giống hệt nhau cùng bóng cùng bo góc.
- Không để chữ tiếng Anh, mã lỗi kỹ thuật hay tên bảng dữ liệu lọt ra giao diện người dùng.
