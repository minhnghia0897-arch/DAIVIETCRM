"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { SettingsFrame } from "@/components/views/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <DemoPage>{(user) => <SettingsFrame user={user}>{children}</SettingsFrame>}</DemoPage>;
}
