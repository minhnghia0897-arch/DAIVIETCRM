import type { Metadata } from "next";

export const metadata: Metadata = { title: "Điều khoản sử dụng · Đại Việt CRM" };

export default function TermsPage() {
  return (
    <>
      <h1>Điều khoản sử dụng</h1>
      <p className="c-legal-meta">Cập nhật 11/10/2026.</p>
      <p>
        Đại Việt CRM là hệ thống nội bộ của showroom Đại Việt Quận 4 dùng để nhận và trả lời tin nhắn, quản lý
        khách hàng, báo giá, đơn hàng và bảo hành. Chỉ nhân viên được showroom mời mới đăng nhập được.
      </p>
      <h2>Với khách hàng</h2>
      <ul>
        <li>
          Khi nhắn tin cho Fanpage hoặc Zalo OA của showroom, tin nhắn được nhân viên đọc và trả lời trên hệ
          thống này. Cách chúng tôi xử lý dữ liệu nằm ở <a href="/privacy">Chính sách quyền riêng tư</a>.
        </li>
        <li>
          Giá, khuyến mãi, chính sách giao lắp và bảo hành có hiệu lực theo báo giá hoặc đơn hàng showroom gửi
          anh chị.
        </li>
      </ul>
      <h2>Với nhân viên</h2>
      <ul>
        <li>Chỉ dùng dữ liệu khách để chăm sóc khách của showroom, không sao chép hay mang ra ngoài.</li>
        <li>Mọi thao tác nhạy cảm được ghi nhật ký kiểm toán.</li>
      </ul>
    </>
  );
}
