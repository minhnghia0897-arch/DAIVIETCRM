"use client";

import { useState } from "react";

import { ContentBoard } from "@/components/crm/views/content-board";
import { DemoPage } from "@/components/demo/demo-user";
import { DEMO_CAMPAIGNS, DEMO_CONTENT, DEMO_MARKETS } from "@/lib/marketing/demo";
import { CONTENT_STAGES, type ContentItem } from "@/lib/marketing/content";
import { MARKETING_VIEW } from "@/lib/nav";

// Bản demo: thẻ đổi cột ngay trên màn (không lưu); bản thật lưu vào database qua hàm có kiểm quyền, luật cột.
export default function Page() {
  return (
    <DemoPage anyOf={MARKETING_VIEW}>
      {(user) => <Board canManage={user.permissions.has("marketing.manage")} />}
    </DemoPage>
  );
}

function Board({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<ContentItem[]>(DEMO_CONTENT);
  return (
    <ContentBoard
      items={items}
      people={[{ value: "u-lan", label: "Lan Marketing" }]}
      markets={DEMO_MARKETS.map((m) => ({ value: m.code, label: m.name }))}
      campaigns={DEMO_CAMPAIGNS.map((c) => ({ value: c.id, label: c.name }))}
      canManage={canManage}
      now="2026-10-10T03:00:00Z"
      actions={{
        move: async ({ id, status }) => {
          setItems((cur) => cur.map((i) => (i.id === id ? { ...i, status } : i)));
          return {
            ok: true,
            message: `Đã chuyển sang ${CONTENT_STAGES.find((s) => s.key === status)?.label}`,
          };
        },
        save: async (input) => {
          const id = input.id ?? `ct-${Date.now()}`;
          setItems((cur) => {
            const base = cur.find((i) => i.id === id);
            const next: ContentItem = {
              ...(base ?? DEMO_CONTENT[0]),
              id,
              title: input.title,
              channel: input.channel,
              format: input.format,
              status: input.status ?? base?.status ?? "idea",
              publishAt: input.publishAt ? new Date(input.publishAt).toISOString() : null,
              postUrl: input.postUrl || null,
              checks: input.checks ?? { no_health_claim: false, customer_consent: false },
              position: base?.position ?? 99,
            };
            return base ? cur.map((i) => (i.id === id ? next : i)) : [...cur, next];
          });
          return { ok: true, message: input.id ? `Đã lưu ${input.title}` : `Đã thêm ${input.title}` };
        },
        remove: async ({ id }) => {
          setItems((cur) => cur.filter((i) => i.id !== id));
          return { ok: true, message: "Đã xóa bài khỏi lịch" };
        },
      }}
    />
  );
}
