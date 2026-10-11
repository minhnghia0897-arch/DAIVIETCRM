import type { Metadata } from "next";

export const metadata: Metadata = { title: "Yêu cầu xóa dữ liệu · Đại Việt CRM" };

export default function DataDeletionPage() {
  return (
    <>
      <h1>Yêu cầu xóa dữ liệu</h1>
      <p className="c-legal-meta">Cập nhật 11/10/2026.</p>
      <p>
        Anh chị có thể yêu cầu showroom Đại Việt Quận 4 xóa hoặc trích xuất toàn bộ dữ liệu của mình bằng một
        trong các cách:
      </p>
      <ol>
        <li>
          Nhắn tin cho Fanpage Facebook hoặc Zalo OA của showroom với nội dung &quot;Yêu cầu xóa dữ
          liệu&quot;.
        </li>
        <li>Đến trực tiếp showroom Đại Việt Quận 4 và báo nhân viên.</li>
      </ol>
      <p>
        Quản lý showroom xác minh anh chị là chủ dữ liệu, rồi xử lý trong hệ thống trong vòng 7 ngày làm việc.
        Khi xóa, chúng tôi gỡ tên, số điện thoại, định danh Facebook, Zalo và nội dung tin nhắn khỏi hồ sơ;
        chỉ giữ lại phần pháp luật bắt buộc (hóa đơn, chứng từ thanh toán, phiếu bảo hành còn hiệu lực) và
        nhật ký đã ẩn thông tin cá nhân.
      </p>
      <p>
        Anh chị cũng có thể gỡ quyền của trang trong phần cài đặt Facebook hoặc chặn Fanpage để ngừng nhận
        tin; việc này không tự xóa dữ liệu đã có, nên vẫn cần gửi yêu cầu như trên.
      </p>
    </>
  );
}
