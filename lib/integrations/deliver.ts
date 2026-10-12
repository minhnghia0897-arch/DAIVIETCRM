import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { graphErrorMessage, sendText } from "./meta_messenger/api.ts";
import { messengerConfigForShowroom } from "./meta_messenger/config.ts";
import { sendCsText, zaloErrorMessage } from "./zalo_oa/api.ts";
import { zaloConfigForShowroom } from "./zalo_oa/config.ts";
import { ensureZaloToken } from "./zalo_oa/token.ts";

// Gửi một tin đã ghi chờ gửi (queue_*_reply, queue_ai_reply) qua API của kênh, rồi báo kết quả cho database
// (finish_channel_reply). Dùng chung cho nhân viên trả lời và AI tự trả lời. Không ghi nội dung tin, PSID ra log.

type Db = SupabaseClient<Database>;

export interface QueuedReply {
  messageId: string;
  channel: "messenger" | "zalo";
  /** PSID (Messenger) hoặc mã người dùng Zalo. */
  userId: string;
  messagingType?: "RESPONSE" | "MESSAGE_TAG";
  tag?: "HUMAN_AGENT" | null;
}

/** Trả về câu lỗi dễ hiểu khi không gửi được; null là đã gửi. */
export async function deliverQueuedReply(
  admin: Db,
  showroomId: string,
  q: QueuedReply,
  text: string,
): Promise<string | null> {
  let mid = "";
  let fail: string | null = null;
  if (q.channel === "zalo") {
    const cfg = await zaloConfigForShowroom(admin, showroomId);
    const token = cfg
      ? await ensureZaloToken(admin, cfg)
      : { ok: false as const, message: "Zalo OA chưa kết nối." };
    if (!token.ok) fail = token.message;
    else {
      try {
        ({ messageId: mid } = await sendCsText({ accessToken: token.accessToken, userId: q.userId, text }));
      } catch (e) {
        fail = zaloErrorMessage(e);
      }
    }
  } else {
    const cfg = await messengerConfigForShowroom(admin, showroomId);
    if (!cfg?.pageToken) fail = "Chưa có Page access token. Owner kết nối lại ở Cài đặt, Tích hợp.";
    else {
      try {
        ({ mid } = await sendText({
          pageToken: cfg.pageToken,
          psid: q.userId,
          text,
          messagingType: q.messagingType ?? "RESPONSE",
          tag: q.tag ?? null,
          metadata: `crm:${q.messageId}`,
        }));
      } catch (e) {
        fail = graphErrorMessage(e);
      }
    }
  }
  await admin.rpc("finish_channel_reply", {
    p_message: q.messageId,
    p_mid: mid,
    p_error: fail ?? undefined,
  });
  return fail;
}
