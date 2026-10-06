# Kế hoạch thông luồng: sale admin → telesale → giao hàng

Mục tiêu: một đơn đi trọn từ lúc lead rơi vào CRM đến lúc giao lắp xong, bảo hành sinh ra và khách bước vào chăm
sóc hậu bán — **không ai phải mở bảng tính, không khâu nào đứt giữa chừng**.

Viết ngày 06/10/2026, theo `CLAUDE.md` mục 15. Cần anh duyệt trước khi bắt tay, vì có thay đổi schema và thêm vai
trò mới.

---

## 1. Đang ở đâu

### Đã chạy thật (đọc ghi database)

| Phần | Trạng thái |
|---|---|
| Đăng nhập, mời người dùng, phân quyền bật tắt, "Xem như" | Xong |
| Nền CDP: khách, định danh, đồng ý, sự kiện, hộ gia đình | Bảng và RLS xong |
| Lead: bảng, RLS, trang chủ theo vai trò (SLA, quá hạn) | Xong |
| Việc và hàng chờ duyệt: bảng, RLS | Bảng xong, màn còn mô phỏng |
| Cài đặt: Người dùng, Phân quyền, Tích hợp, Nhật ký kiểm toán | Xong |
| Thông báo Telegram hai chiều | Xong, đã chạy thật |
| Nhóm Telegram của đội | Xong |

### Đã có nhưng chưa nối dây

- **Logic thuần có unit test:** `lib/sales/pricing.ts` (hàm định giá), `lib/sales/inventory.ts` (phiếu kho, giữ
  hàng, kiểm kê), `lib/sales/orders.ts` (điều kiện từng bước đơn), `lib/leads/*` (phân lead, khung gọi, chống
  trùng, nhập CSV). **Nghiệp vụ đã nghĩ xong, chỉ thiếu bảng và màn nối vào.**
- **Giao diện đã dựng và kiểm thử ở bản demo:** Sản phẩm, Kho, Chính sách, Đơn hàng, Giao lắp, Hồ sơ khách, Việc
  cần làm, Hộp thư, Báo cáo, Đội ngũ, Mini App. **Thiết kế đã duyệt, chỉ thiếu dữ liệu thật.**

### Chưa có gì

- Bảng: `products`, `product_variants`, `price_lists`, `warehouses`, `stock_*`, `serial_units`, `quotes`,
  `orders`, `order_items`, `payments`, `deliveries`, `warranties`, `policies`, `kpi_daily`.
- Thu lead tự động: webhook Meta Lead Ads, webhook Zalo OA.
- Vai trò **Kho & giao lắp** (hiện chỉ có Owner, Sale admin, Telesale).

### Chỗ đứt hôm nay, nói thẳng

Telesale **chưa làm việc được trên CRM**: Telegram đã đẩy việc về điện thoại họ, nhưng bấm vào thì rơi vào màn
chạy dữ liệu mô phỏng. Hồ sơ lead, ghi kết quả gọi, việc cần làm, hộp thư Zalo đều chưa thật. Đây là chỗ phải vá
trước mọi thứ khác.

---

## 2. Luồng đích và ai làm gì

```
Lead vào ──► Sale admin điều phối ──► Telesale gọi, chốt ──► Báo giá ──► Đơn
   │                                        │                              │
   │                                        └── 4 thông tin bắt buộc       ├─► Cọc
   │                                                                       │    └─► Sale admin xác nhận tiền
   └── tự phân theo luật, SLA 5 phút                                       │         └─► Giữ hàng
                                                                           │
                                            Kho xuất, gán serial ◄─────────┘
                                                    │
                                        Đội giao lắp ──► Giao ──► Lắp ──► Hoàn tất
                                                                              │
                                                    Bảo hành + việc hậu bán ◄─┘
```

| Vai trò | Việc chính | Nhận gì trên Telegram |
|---|---|---|
| **Sale admin** | Điều phối lead, xác nhận tiền, ghi sổ phiếu kho, theo đơn trễ | Lead chưa phân, lead quá hạn của đội, tiền chờ xác nhận, đơn trễ hẹn giao |
| **Telesale** | Gọi, hỏi đủ 4 thông tin, báo giá, tạo đơn, chăm sóc hậu bán | Lead mới, hẹn gọi lại, lead quá hạn của mình, kết quả duyệt giảm giá, đơn của mình đổi trạng thái |
| **Kho & giao lắp** | Xuất kho, gán serial, giao, lắp, xác nhận hoàn tất | Việc xuất kho, lịch giao hôm nay, nút xác nhận từng bước |

---

## 3. Cách làm: lát cắt dọc, không làm ngang

`CLAUDE.md` mục 15 xếp tuần 5 (sản phẩm, kho, combo, chính sách) rồi tuần 6 (báo giá, đơn, thanh toán). Làm ngang
như vậy thì đến cuối tuần 6 mới biết luồng có thông không.

**Đề xuất đổi sang lát cắt dọc:** mỗi lát làm vừa đủ mọi tầng để chạy trọn một đoạn luồng thật, rồi mới làm sâu.
Đổi lại là một số phần làm hai lần (ví dụ kho làm bản tối thiểu trước, kiểm kê và combo bổ sung sau).

**Luật chung cho mọi lát:** mỗi lát kết thúc bằng **một lần chạy thật trên Telegram và database thật**, không chỉ
chạy kiểm thử. Hôm nay cách này đã tìm ra ba lỗi mà toàn bộ kiểm thử không bắt được (webhook bị middleware chặn,
một nhóm hỏng làm chết cả vòng gửi tin, con trỏ sự kiện lùi làm mất tin im lặng).

---

## 4. Năm lát cắt

### Lát 0 — Telesale làm việc được trên CRM (3–4 ngày)

Vá chỗ đứt nặng nhất: Telegram đẩy việc về nhưng bấm vào là màn mô phỏng.

- Việc cần làm: đọc `tasks` thật, hoàn thành và hẹn lại đồng bộ hai chiều với nút trên Telegram.
- Hồ sơ lead và khách 360: đọc thật, dòng hoạt động từ `events`, ghi chú và ảnh từ Telegram hiện đúng chỗ.
- Ghi kết quả cuộc gọi ở chế độ `external`, nút Gọi trả số cho đúng lead được giao và ghi nhật ký mỗi lượt xem.
- Chặn chuyển `demo` và chặn tạo báo giá khi thiếu 4 thông tin bắt buộc.
- Hàng chờ duyệt đọc `approvals` thật.

**Nghiệm thu:** telesale nhận tin Telegram → bấm mở → hồ sơ thật → ghi kết quả gọi dưới 30 giây → việc đóng →
trang chủ và chỉ số đổi theo. Ghi chú gửi từ Telegram nằm đúng trên dòng hoạt động của khách đó.

### Lát 1 — Lead tự chảy vào và tự phân (3–4 ngày)

- Webhook Meta Lead Ads: xác thực chữ ký, lấy chi tiết lead, ánh xạ câu hỏi sang trường.
- Webhook Zalo OA và hộp thư: nhận tin, trả lời từ hồ sơ, làm mới token.
- Nhập tay nhanh, nhập CSV dữ liệu cũ.
- Phân lead vòng tròn, SLA 5 phút, khung gọi theo thị trường — `lib/leads/*` đã có, chỉ nối.

**Nghiệm thu:** lead thử từ công cụ test của Meta vào CRM dưới 30 giây và được phân cho người đang trực; lead
khách ở Hàn đến 10:00 sáng giờ VN chờ tới đầu khung gọi mới giao; gửi cùng một số hai lần không sinh hai lead mở;
quá 5 phút chưa liên hệ thì sale admin nhận cảnh báo trên Telegram.

**Chặn:** cần tên miền HTTPS thật (câu hỏi mở 1) và Meta app, Zalo OA đứng tên pháp nhân (câu hỏi mở 6).

### Lát 2 — Hàng hóa tối thiểu đủ để bán (3–4 ngày)

Chỉ làm phần cần để bán được. Combo, kiểm kê nâng cao, cảnh báo tồn thấp để sau.

- `product_categories`, `products`, `product_variants`, `price_lists`, `price_list_items`.
- `warehouses`, `stock_levels`, `stock_movements`, `stock_documents` (phiếu nhập, phiếu xuất), `serial_units`.
- Nhập, xuất CSV sản phẩm và bảng giá.

**Nghiệm thu:** nhập file SKU và giá của Đại Việt vào; **không có cách nào đổi số tồn ngoài phiếu đã ghi sổ** (có
test); người không có `product.view_cost` không nhận được giá vốn qua bất kỳ API nào.

**Chặn:** cần danh sách SKU, giá, tồn hiện tại (câu hỏi mở 7) và quy trình nhập hàng từ Đại Việt (câu hỏi mở 8).

### Lát 3 — Bán được: báo giá → đơn → tiền (5–6 ngày)

- `policies` bản tối thiểu: `discount_limit`, `deposit`, `delivery` (phí theo vùng). Bốn loại còn lại sau.
- `quotes`, `quote_items`, trang báo giá công khai `/q/<token>`.
- `orders`, `order_items`, `order_policy_applications`, `payments`.
- Luồng trạng thái đơn tới `deposit_paid`, giữ hàng và nhả khi hết hạn.
- Duyệt giảm vượt mức đi qua `approvals` — đã chạy, chỉ gắn vào.
- Hàm định giá `lib/sales/pricing.ts` đã có unit test, chỉ nối dữ liệu thật vào.

**Nghiệm thu:** telesale tạo báo giá từ hồ sơ lead → gửi link → khách bấm đồng ý → sinh đơn → ghi cọc → sale admin
xác nhận tiền (người ghi không tự xác nhận được) → giữ hàng đúng số lượng; telesale áp giảm 7% thì đơn vào hàng
chờ Owner duyệt và Owner nhận tin Telegram; lead tự sang `quoted` rồi `deposit`, không kéo tay được.

### Lát 4 — Giao được: kho xuất → giao lắp → hoàn tất (4–5 ngày)

- Vai trò mới **Kho & giao lắp** với quyền `inventory.document`, `inventory.post`, `delivery.update`.
- `deliveries`: các bước xác nhận người nhận, xuất kho, giao, lắp, bàn giao.
- Gán serial bắt buộc khi xuất kho; `warranties` sinh khi đơn hoàn tất.
- Luật sinh việc hậu bán: gọi hỏi thăm sau giao, nhắc thay lõi theo `consumable_links`.
- Telegram cho đội giao: nhóm giao hàng nhận lịch giao hôm nay; kỹ thuật viên bấm nút xác nhận từng bước ngay
  trên điện thoại, không cần mở CRM.

**Nghiệm thu:** đơn đủ tiền → xuất kho bắt buộc gán serial → nhóm giao hàng nhận tin → bấm **Đã giao**, **Đã lắp**
→ đơn `completed` → sinh bảo hành, sinh việc gọi hỏi thăm và nhắc thay lõi → khách sang "Đang sử dụng" → lead
sang `won`. Hủy đơn nhả đúng số hàng đang giữ.

### Lát 5 — Đo được (3 ngày)

- `lib/kpi/definitions.ts`, `kpi_daily`, job gom số hằng đêm.
- Menu Đội ngũ, chỉ tiêu, kèm cặp, trình bàn giao khi nghỉ việc.
- Báo cáo bán hàng cơ bản.

**Nghiệm thu:** mọi số trên màn bấm vào mở đúng danh sách bản ghi tạo nên số đó; telesale chỉ thấy chỉ số của mình
và trung vị đội khi bảng xếp hạng đang tắt.

---

## 5. Tầng Telegram gắn vào từng lát

| Lát | Tin thêm vào | Nút bấm ngay trên Telegram |
|---|---|---|
| 0 | (đã có đủ) | Xong, Hẹn lại 1 giờ |
| 1 | Lead chưa phân quá 5 phút (sale admin) | — |
| 3 | Tiền chờ xác nhận (sale admin), đơn của tôi đổi trạng thái (telesale) | Xác nhận đã nhận tiền |
| 4 | Việc xuất kho, lịch giao hôm nay (nhóm giao hàng) | Đã giao, Đã lắp, Báo vướng |
| 5 | Chỉ tiêu tuần, cảnh báo tụt chỉ số | — |

Giữ nguyên luật: tin không chứa số điện thoại đầy đủ, địa chỉ chi tiết hay nội dung tin của khách. Muốn xem đủ thì
bấm mở CRM, nơi kiểm quyền và ghi nhật ký từng lượt xem số.

---

## 6. Thời gian

| Lát | Ngày làm | Cộng dồn |
|---|---|---|
| 0 — Telesale làm việc được | 3–4 | tuần 1 |
| 1 — Lead tự chảy vào | 3–4 | tuần 2 |
| 2 — Hàng hóa tối thiểu | 3–4 | tuần 2–3 |
| 3 — Bán được | 5–6 | tuần 4 |
| 4 — Giao được | 4–5 | tuần 5 |
| 5 — Đo được | 3 | tuần 5–6 |

Khoảng **5–6 tuần làm việc**, chưa tính thời gian chờ anh quyết các câu hỏi dưới. Phần làm sâu để lại sau: combo,
kiểm kê nâng cao, bốn loại chính sách còn lại, đổi trả, hóa đơn điện tử, app cho kỹ thuật viên, thưởng doanh số.

---

## 7. Anh cần quyết trước khi bắt tay

Những câu này **chặn thật**, không phải thủ tục:

| Câu hỏi | Chặn lát nào | Vì sao chặn |
|---|---|---|
| Tên miền HTTPS cho CRM (câu hỏi mở 1) | Lát 1 | Không có thì Meta và Zalo không gọi webhook về được; hiện bot chạy bằng cách tự hỏi Telegram, không dùng được cho Meta |
| Meta app và Zalo OA đứng tên pháp nhân nào (câu hỏi mở 6) | Lát 1 | Quyết định thủ tục xác minh doanh nghiệp, mất vài ngày đến vài tuần |
| Danh sách SKU, giá, tồn hiện tại (câu hỏi mở 7) | Lát 2 | Không có thì dựng bảng xong cũng không bán thử được |
| Quy trình nhập hàng từ Đại Việt, showroom có tự giữ kho không (câu hỏi mở 8) | Lát 2, 4 | Quyết định có cần phiếu nhập và kho ảo hay giao thẳng |
| Chính sách đang áp: cọc tối thiểu, phí giao theo vùng, giới hạn giảm giá từng vai trò (câu hỏi mở 7) | Lát 3 | Hàm định giá cần số thật mới chạy đúng |
| Ai làm giao lắp: nhân viên showroom hay thuê ngoài | Lát 4 | Quyết định họ có tài khoản CRM hay chỉ nhận việc qua nhóm Telegram |
| Đổi thứ tự sang lát cắt dọc có được không | Cả kế hoạch | Khác với tuần 5, 6, 7 trong `CLAUDE.md` |

---

## 8. Rủi ro và cách chặn

| Rủi ro | Cách chặn |
|---|---|
| Đội vẫn quay về bảng tính vì CRM thiếu một khâu | Lát 0 làm trước để telesale dùng được ngay tuần đầu, không chờ đủ bộ |
| Sai tiền, sai tồn | Tiền và tồn chỉ tính ở server; tồn chỉ đổi qua phiếu đã ghi sổ; có test chặn mọi đường khác |
| Đứt khâu giữa telesale và giao hàng | Mỗi bước giao lắp là một việc trong `tasks` có người nhận và hạn, không phải tin nhắn trôi |
| Lỗi im lặng trong việc nền | Mỗi lát chạy thật một lần; cảnh báo đấu nối lỗi đã có; con trỏ quét tự hạ khi dãy id lùi |
| Dữ liệu khách bị mang đi | Giữ nguyên luật che số, nhật ký xem số, giới hạn xuất file |

---

## 9. Việc nhỏ còn nợ, gom vào lát gần nhất

- Ba loại tin Telegram chưa chạy: đơn đổi trạng thái (làm ở lát 3), nhắc trong nhóm và mọi tin nhóm (đã quyết
  không làm, sẽ gỡ khỏi danh mục).
- Edge Function `telegram-outbound` chưa chạy thử được trong hộp cát; phải nghiệm thu một lần trên Supabase thật.
- Thanh dưới cùng ghi "Dữ liệu mô phỏng": mỗi lát nối xong màn nào thì thêm màn đó vào `LIVE_SCREENS`.
