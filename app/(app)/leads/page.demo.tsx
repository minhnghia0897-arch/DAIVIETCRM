"use client";

import { CrmOpportunities } from "@/components/crm/views/opportunities";
import { DemoPage } from "@/components/demo/demo-user";

// Bản demo tĩnh chưa có danh sách lead riêng: dùng màn Cơ hội (tạo lead, nhập file, bảng theo giai đoạn).
export default function Page() {
  return <DemoPage anyOf={["lead.view_own", "lead.view_all"]}>{() => <CrmOpportunities />}</DemoPage>;
}
