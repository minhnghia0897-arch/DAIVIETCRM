import type { Metadata } from "next";

import { AiSettingsLive, type AiRunRow } from "@/components/crm/views/ai-settings";
import { loadAiData } from "@/lib/ai/context";
import { aiModel } from "@/lib/ai/models";
import { HANDOFF_LABEL } from "@/lib/ai/labels";
import { buildData } from "@/lib/ai/prompt";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";

import { deleteKnowledge, previewAi, saveKnowledge, setAutoReplyChannels } from "./actions";

export const metadata: Metadata = { title: "Trợ lý AI · Đại Việt CRM" };

// Cài đặt, Trợ lý AI (Owner chốt 12/10/2026): bật tắt tự trả lời theo kênh, chi phí tháng, kiến thức cho AI, dữ liệu AI
// đang dùng, nhật ký lượt AI gần đây. Chỉ người có settings.integrations.

const STATUS_LABEL: Record<string, string> = {
  running: "Đang soạn",
  replied: "Đã trả lời",
  handed_off: "Chuyển người",
  skipped: "Không cần trả lời",
  failed: "Lỗi",
};

function monthStartVn(now: Date): string {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * 3_600_000).toISOString();
}

export default async function Page() {
  const user = await requirePermission("settings.integrations");
  const supabase = await createClient();
  const now = new Date();
  const [{ data: ints }, { data: knowledge }, { data: month }, { data: recent }, data] = await Promise.all([
    supabase.from("integrations").select("key, status, enabled, config, reply_mode"),
    supabase
      .from("ai_knowledge")
      .select("id, title, body, is_active, sort")
      .order("sort")
      .order("created_at"),
    supabase.from("ai_runs").select("status, cost_vnd").gte("started_at", monthStartVn(now)).limit(20_000),
    supabase
      .from("ai_runs")
      .select(
        "id, status, handoff_reason, summary, cost_vnd, error, started_at, conversation_id, conversations(display_name, channel)",
      )
      .order("started_at", { ascending: false })
      .limit(30),
    loadAiData(createAdminClient(), user.showroomId, now),
  ]);

  const ai = ints?.find((i) => i.key === "ai_llm");
  const cfg = (ai?.config ?? {}) as { model?: string; autoReply?: string[]; monthlyBudget?: string };
  const channelOk = (key: string) => {
    const r = ints?.find((i) => i.key === key);
    return r?.status === "connected" && (r.reply_mode ?? "crm") === "crm";
  };
  const runs: AiRunRow[] = (recent ?? []).map((r) => ({
    id: r.id,
    at: r.started_at,
    customer: r.conversations?.display_name ?? "Khách",
    channel: r.conversations?.channel === "zalo" ? "Zalo" : "Messenger",
    conversationId: r.conversation_id,
    status: STATUS_LABEL[r.status] ?? r.status,
    reason: r.handoff_reason ? (HANDOFF_LABEL[r.handoff_reason] ?? null) : null,
    summary: r.summary,
    error: r.error,
    costVnd: r.cost_vnd,
  }));
  const count = (s: string) => (month ?? []).filter((r) => r.status === s).length;

  return (
    <AiSettingsLive
      status={{
        connected: ai?.status === "connected" && ai.enabled,
        integrationStatus: ai?.status ?? "not_connected",
        model: aiModel(cfg.model).label,
        channels: cfg.autoReply ?? [],
        channelReady: { messenger: channelOk("meta_messenger"), zalo: channelOk("zalo_oa") },
        budget: Number(cfg.monthlyBudget ?? 0) || 0,
        spent: (month ?? []).reduce((a, r) => a + (r.cost_vnd ?? 0), 0),
        replied: count("replied"),
        handedOff: count("handed_off"),
        failed: count("failed"),
      }}
      knowledge={(knowledge ?? []).map((k) => ({
        id: k.id,
        title: k.title,
        body: k.body,
        isActive: k.is_active,
        sort: k.sort,
      }))}
      dataPreview={buildData(data.knowledge, data.catalog)}
      productCount={data.catalog.products.length}
      offerCount={data.catalog.offers.length}
      runs={runs}
      readOnly={Boolean(user.viewAs)}
      actions={{ setAutoReplyChannels, saveKnowledge, deleteKnowledge, previewAi }}
    />
  );
}
