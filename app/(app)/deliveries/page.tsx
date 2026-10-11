import { redirect } from "next/navigation";

// "Đơn & giao lắp" đã gộp vào Đơn hàng: bước giao lắp nằm trên hồ sơ đơn (CLAUDE.md 8.7). Giữ đường dẫn cũ.
export default function Page() {
  redirect("/orders");
}
