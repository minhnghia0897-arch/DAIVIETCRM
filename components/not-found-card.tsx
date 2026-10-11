import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";

// Không nói rõ bản ghi không tồn tại hay người dùng không được xem, để không lộ dữ liệu ngoài quyền.
export function NotFoundCard() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-20">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-3 py-5">
          <h1 className="text-page-title font-bold">Không tìm thấy</h1>
          <p>Trang này không có hoặc anh chị chưa được cấp quyền xem. Liên hệ quản lý showroom nếu cần.</p>
          <Link className="font-semibold text-brand" href="/home">
            Về trang chủ
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
