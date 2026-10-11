import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chính sách quyền riêng tư · Đại Việt CRM" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Chính sách quyền riêng tư</h1>
      <p className="c-legal-meta">
        Áp dụng cho hệ thống chăm sóc khách hàng (CRM) của showroom Đại Việt Quận 4. Cập nhật 11/10/2026.
      </p>

      <h2>Chúng tôi thu thập gì</h2>
      <ul>
        <li>
          Tên, số điện thoại, tỉnh thành và nhu cầu sản phẩm anh chị để lại qua form quảng cáo, tin nhắn hoặc
          tại showroom.
        </li>
        <li>
          Tin nhắn anh chị gửi tới Fanpage Facebook hoặc Zalo OA của showroom, kèm mã định danh người dùng mà
          Facebook, Zalo cấp cho trang của chúng tôi.
        </li>
        <li>Thông tin người nhận quà (khi anh chị đặt mua tặng người thân) do chính anh chị cung cấp.</li>
        <li>Lịch sử báo giá, đơn hàng, thanh toán, giao lắp và bảo hành.</li>
      </ul>

      <h2>Chúng tôi dùng để làm gì</h2>
      <ul>
        <li>Trả lời câu hỏi, tư vấn, báo giá, giao lắp và bảo hành sản phẩm anh chị đã mua.</li>
        <li>Nhắc lịch thay lõi lọc, bảo hành và các dịp chăm sóc liên quan đơn hàng.</li>
        <li>Gửi thông tin khuyến mãi chỉ khi anh chị đã đồng ý; anh chị có thể rút đồng ý bất cứ lúc nào.</li>
      </ul>

      <h2>Ai được xem</h2>
      <p>
        Chỉ nhân viên showroom được giao chăm sóc anh chị mới xem được thông tin, theo phân quyền trong hệ
        thống. Mọi lần xem số điện thoại đầy đủ, xuất dữ liệu đều được ghi nhật ký. Khi showroom chưa cho
        phép, chúng tôi không liên hệ người nhận quà để giữ bất ngờ.
      </p>

      <h2>Chia sẻ với bên thứ ba</h2>
      <p>
        Chúng tôi không bán dữ liệu. Dữ liệu chỉ đi qua các dịch vụ cần để vận hành: Facebook (Meta) và Zalo
        để nhận, gửi tin nhắn; nhà cung cấp máy chủ và cơ sở dữ liệu (Vercel, Supabase) để lưu trữ có mã hóa
        đường truyền. Khi gửi dữ liệu đo lường quảng cáo (nếu có), số điện thoại được mã hóa một chiều và chỉ
        gửi khi anh chị đã đồng ý.
      </p>

      <h2>Lưu trữ</h2>
      <p>
        Dữ liệu được giữ trong thời gian anh chị còn là khách hàng của showroom và thời hạn bảo hành sản phẩm.
        Bản ghi tin nhắn thô từ Facebook, Zalo được tự động xóa sau 30 ngày (90 ngày với bản lỗi) sau khi đã
        xử lý.
      </p>

      <h2>Quyền của anh chị</h2>
      <p>
        Theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, anh chị có quyền xem, sửa, rút đồng ý, yêu cầu
        trích xuất hoặc xóa dữ liệu của mình. Cách gửi yêu cầu xem tại trang{" "}
        <a href="/data-deletion">Yêu cầu xóa dữ liệu</a>.
      </p>
    </>
  );
}
