"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, requireWritable } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { graphErrorMessage, sendText } from "@/lib/integrations/meta_messenger/api";
import { messengerConfigForShowroom } from "@/lib/integrations/meta_messenger/config";
import { sendCsText, zaloErrorMessage } from "@/lib/integrations/zalo_oa/api";
import { zaloConfigForShowroom } from "@/lib/integrations/zalo_oa/config";
import { ensureZaloToken } from "@/lib/integrations/zalo_oa/token";

import type { ActionResult } from "../settings/types";

// Trả lời khách trên Messenger. Mọi luật (quyền, khung 24 giờ, Human Agent, chế độ trả lời, đồng ý, giữ bất ngờ)
// kiểm ở database trong queue_messenger_reply(); ở đây chỉ gọi Send API và báo kết quả lại database.
// Không ghi nội dung tin, PSID ra log.

const REASON: Record<string, string> = {
  window_closed:
    "Đã quá 7 ngày sau tin cuối của khách, Messenger không cho nhắn nữa. Mời khách nhắn lại hoặc gọi điện.",
  human_agent_only:
    "Đã quá 24 giờ sau tin cuối của khách: chỉ gửi được khi nhân viên tự trả lời đúng việc khách hỏi (đánh dấu Trả lời tay).",
  reply_mode_external: "Kênh này đang được trả lời ở công cụ khác, CRM chỉ đọc.",
  channel_off: "Kênh này đang tắt trong Cài đặt, Tích hợp.",
  channel_paused: "Kênh này đang tạm dừng trong Cài đặt, Tích hợp.",
  not_connected: "Kênh này chưa kết nối. Owner kết nối ở Cài đặt, Tích hợp.",
  consent_blocked: "Khách đã từ chối hoặc rút đồng ý liên hệ qua kênh này.",
  keep_surprise: "Khách là người nhận của một đơn đang giữ bất ngờ, chưa được liên hệ.",
  paid_confirm_required:
    "Đã quá 48 giờ sau tin cuối của khách: tin Zalo này tính phí theo hạn mức gói OA, đánh dấu xác nhận rồi gửi.",
  empty_text: "Chưa nhập nội dung.",
  too_long: "Tin dài quá 2.000 ký tự, chia thành nhiều tin.",
};

const sendSchema = z.object({
  conversationId: z.uuid(),
  text: z.string().max(2000, "Tin dài quá 2.000 ký tự, chia thành nhiều tin."),
  /** Messenger: trả lời tay bằng thẻ Human Agent ngoài 24 giờ. Zalo: xác nhận tin tính phí ngoài 48 giờ. */
  confirm: z.boolean().default(false),
});

function rpcFailure(error: { message?: string; code?: string } | null, channel: string): ActionResult {
  const reason = error?.message && REASON[error.message];
  return {
    ok: false,
    message:
      reason ??
      (error?.code === "42501"
        ? `Anh chị chưa được cấp quyền gửi tin ${channel}.`
        : error?.code === "P0002"
          ? "Không tìm thấy hội thoại, hoặc anh chị không còn giữ lead này."
          : "Chưa gửi được tin. Thử lại sau ít phút."),
  };
}

/** Trả lời khách trên kênh của hội thoại (Messenger, Zalo). */
export async function sendReply(input: z.input<typeof sendSchema>): Promise<ActionResult> {
  await requireUser();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu chưa đúng." };
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("channel")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, message: "Không tìm thấy hội thoại, hoặc anh chị không còn giữ lead này." };
  return conv.channel === "zalo"
    ? sendZaloReply(parsed.data)
    : sendMessengerReply({ ...parsed.data, humanAgent: parsed.data.confirm });
}

async function sendZaloReply(input: z.output<typeof sendSchema>): Promise<ActionResult> {
  const user = await requireWritable("message.zalo_send");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_zalo_reply", {
    p_conversation: input.conversationId,
    p_text: input.text,
    p_confirm_paid: input.confirm,
  });
  if (error || !data) return rpcFailure(error, "Zalo");
  const q = data as { message_id: string; user_id: string };

  const admin = createAdminClient();
  const cfg = await zaloConfigForShowroom(admin, user.showroomId);
  let mid = "";
  let fail: string | null = null;
  const token = cfg
    ? await ensureZaloToken(admin, cfg)
    : { ok: false as const, message: "Zalo OA chưa kết nối." };
  if (!token.ok) fail = token.message;
  else {
    try {
      ({ messageId: mid } = await sendCsText({
        accessToken: token.accessToken,
        userId: q.user_id,
        text: input.text.trim(),
      }));
    } catch (e) {
      fail = zaloErrorMessage(e);
    }
  }
  await admin.rpc("finish_channel_reply", {
    p_message: q.message_id,
    p_mid: mid,
    p_error: fail ?? undefined,
  });
  revalidatePath("/inbox");
  return fail ? { ok: false, message: fail } : { ok: true, message: "Đã gửi" };
}

async function sendMessengerReply(input: {
  conversationId: string;
  text: string;
  humanAgent: boolean;
}): Promise<ActionResult> {
  const user = await requireWritable("message.messenger_send");
  const { conversationId, text, humanAgent } = input;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_messenger_reply", {
    p_conversation: conversationId,
    p_text: text,
    p_human_agent: humanAgent,
  });
  if (error || !data) return rpcFailure(error, "Messenger");
  const q = data as {
    message_id: string;
    psid: string;
    messaging_type: "RESPONSE" | "MESSAGE_TAG";
    tag: string | null;
  };

  const admin = createAdminClient();
  const cfg = await messengerConfigForShowroom(admin, user.showroomId);
  let mid = "";
  let fail: string | null = null;
  if (!cfg?.pageToken) fail = "Chưa có Page access token. Owner kết nối lại ở Cài đặt, Tích hợp.";
  else {
    try {
      ({ mid } = await sendText({
        pageToken: cfg.pageToken,
        psid: q.psid,
        text: text.trim(),
        messagingType: q.messaging_type,
        tag: q.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : null,
        metadata: `crm:${q.message_id}`,
      }));
    } catch (e) {
      fail = graphErrorMessage(e);
    }
  }
  await admin.rpc("finish_channel_reply", {
    p_message: q.message_id,
    p_mid: mid,
    p_error: fail ?? undefined,
  });
  revalidatePath("/inbox");
  return fail ? { ok: false, message: fail } : { ok: true, message: "Đã gửi" };
}

export async function markConversationRead(input: { conversationId: string }): Promise<void> {
  const user = await requireUser();
  if (user.viewAs) return;
  const { conversationId } = z.object({ conversationId: z.uuid() }).parse(input);
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
}
