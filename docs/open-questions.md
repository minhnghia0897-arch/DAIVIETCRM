# Câu hỏi mở và đề xuất chờ duyệt

Cập nhật 04/10/2026. Câu hỏi về thông tin cần anh cung cấp nằm ở `CLAUDE.md` mục 16, Còn mở. File này ghi các đề xuất từ buổi rà soát logic chưa được duyệt. Duyệt điểm nào thì chuyển điểm đó vào `CLAUDE.md` và xóa khỏi đây.

## Quyền

1. **Ba mục Cài đặt chưa có mã quyền.** "Dữ liệu và quyền riêng tư" và "Chỉ số và chỉ tiêu" đang ghi "Owner"; "Bán hàng" đang dùng `settings.integrations`. Đề xuất: `privacy.manage` (chỉ Owner), dùng `target.manage`, thêm `settings.sales`. Mục Cài đặt "Kho" đang dùng `product.manage`; đề xuất dùng `inventory.document`.
2. **Lộ chỉ số qua Báo cáo.** `kpi.team` giới hạn sale admin theo người mình quản lý, nhưng `report.team` (báo cáo có "hiệu suất từng telesale") không giới hạn. Đề xuất: số liệu theo từng người chỉ ở Đội ngũ; Báo cáo kinh doanh chỉ có số tổng.
3. **Phạm vi sale admin.** Mục 5 ghi "người do mình quản lý trực tiếp cộng các telesale": mọi telesale hay chỉ telesale trong nhóm mình?
4. **Lộ khách qua hộ gia đình.** Người có `household.manage` gắn khách bất kỳ vào hộ rồi xem các thành viên. Đề xuất: thành viên hộ hiện theo quyền xem lead, đơn của từng thành viên; không được xem thì hiện bản che.
5. **"Xem như" phải làm ở tầng dữ liệu.** RLS chạy theo `auth.uid()` của Owner. Đề xuất: phiên giả lập ký ở server, `has_perm` và RLS đọc người đang được xem như, database chặn mọi thao tác ghi trong phiên đó.
6. **Tự duyệt của Owner.** Owner tự bán thì tự duyệt giảm giá và tự xác nhận tiền. Đề xuất: cho phép nhưng đếm riêng trong báo cáo kiểm soát.
7. **`payment.record` của telesale** giới hạn trong đơn mình là người bán.

## Bán hàng

8. **Lead thất bại dưới 30 ngày rồi khách quay lại:** luật chống trùng chưa nói. Đề xuất: mở lại lead cũ, giữ người phụ trách.
9. **Đơn đã xác nhận chưa giữ hàng:** hai đơn cùng xác nhận chiếc cuối cùng đều lọt. Đề xuất: giữ hàng tạm khi xác nhận, hết giữ sau 24–48 giờ nếu chưa cọc.
10. **Khách bấm đồng ý trên trang báo giá công khai:** chỉ sinh đơn nháp, không giữ hàng, không gửi chuyển đổi, tạo việc cho người bán.
11. **Yêu cầu xóa dữ liệu** đụng chứng từ phải lưu theo luật kế toán (sổ kho, đơn, hóa đơn). Đề xuất: ẩn danh hóa khách, giữ chứng từ.
12. **Tuần 4 và tuần 5 cùng ghi "Sản phẩm".** Đề xuất: gom hết về tuần 5.
13. **Bảng `deliveries`:** giai đoạn 1 tạo bảng để cập nhật bước giao tay trên hồ sơ đơn, không dựng app cho kỹ thuật viên. Cần xác nhận.

## Nhỏ

14. `leads.recipient_province` trùng tỉnh của khách người nhận; đề xuất chỉ giữ một nơi lưu (giữ trên lead khi chưa có hồ sơ người nhận).
15. Giới hạn giảm giá theo vai trò: cho đặt thêm riêng từng người.
16. Thuật ngữ "QLSR" trong bản demo chưa có trong `DESIGN.md`; đề xuất dùng "Quản lý showroom" cho người hiển thị, quyền vẫn theo mã quyền.
