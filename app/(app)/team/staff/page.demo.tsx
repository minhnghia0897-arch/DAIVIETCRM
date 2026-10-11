"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { StaffView } from "@/components/views/staff";

export default function Page() {
  return <DemoPage anyOf={["staff.view"]}>{(user) => <StaffView user={user} />}</DemoPage>;
}
