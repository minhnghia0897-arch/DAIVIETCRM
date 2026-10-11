import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";

export function ForbiddenCard() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-20">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-3 py-5">
          <h1 className="text-page-title font-bold">Chưa được cấp quyền</h1>
          <p>Anh chị chưa được cấp quyền xem mục này. Liên hệ quản lý showroom.</p>
          <Link className="font-semibold text-brand" href="/home">
            Về trang chủ
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
