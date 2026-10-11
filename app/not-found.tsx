import type { Metadata } from "next";

import { NotFoundCard } from "@/components/not-found-card";

export const metadata: Metadata = { title: "Không tìm thấy · Đại Việt CRM" };

export default function NotFound() {
  return <NotFoundCard />;
}
