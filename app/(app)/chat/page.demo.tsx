"use client";

import { useState } from "react";

import { TelegramGroups, type GroupPurpose, type LiveGroup } from "@/components/crm/views/telegram-groups";
import { DemoPage } from "@/components/demo/demo-user";
import { DEMO_TELEGRAM_GROUPS } from "@/lib/demo/telegram-groups";

// Bản demo tĩnh của màn Nhóm nội bộ: nhóm giả, đổi công dụng ngay trong trình duyệt, không lưu.
export default function Page() {
  return (
    <DemoPage>{(user) => <DemoGroups canManage={user.permissions.has("settings.integrations")} />}</DemoPage>
  );
}

function DemoGroups({ canManage }: { canManage: boolean }) {
  const [groups, setGroups] = useState<LiveGroup[]>(DEMO_TELEGRAM_GROUPS);

  // Cùng quy tắc với database: mỗi công dụng chỉ một nhóm đang dùng, nhóm cũ chuyển Ngưng.
  const setGroup = async ({
    chatId,
    purpose,
    active,
  }: {
    chatId: string;
    purpose: GroupPurpose;
    active: boolean;
  }) => {
    const status = purpose === "unused" || !active ? "inactive" : "active";
    setGroups((prev) =>
      prev.map((g) =>
        g.chatId === chatId
          ? { ...g, purpose, status, assignedBy: "Hà Owner", assignedAt: new Date().toISOString() }
          : status === "active" && g.purpose === purpose && g.status === "active"
            ? { ...g, status: "inactive" }
            : g,
      ),
    );
    return {
      ok: true,
      message: purpose === "unused" ? "Đã bỏ công dụng của nhóm" : "Đã lưu công dụng nhóm",
    };
  };

  return <TelegramGroups live={{ groups, canManage, botUsername: "DaiVietQ4Bot", setGroup }} />;
}
