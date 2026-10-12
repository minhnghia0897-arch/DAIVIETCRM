import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { deliverQueuedReply } from "@/lib/integrations/deliver";

import { AiError, aiErrorMessage, isFatalAiError } from "./errors";
import { loadAiData, loadTurns, type AiData } from "./context";
import { aiCost, aiModel, aiProvider, type AiUsage } from "./models";
import {
  buildData,
  buildTurnPrompt,
  DECISION_SCHEMA,
  INSTRUCTIONS,
  parseDecision,
  type AiDecision,
  type HandoffReason,
} from "./prompt";
import { askModel, type AiAnswer, type AiAsk } from "./provider";

// AI tự trả lời tin nhắn (Owner chốt 12/10/2026, docs/integrations/ai_llm.md). Mỗi lượt: database mở lượt và kiểm luật
// (start_ai_run), server nạp dữ liệu, hỏi mô hình, gửi tin trả lời qua kênh (queue_ai_reply + deliverQueuedReply), chuyển
// cho người khi cần (ai_handoff), ghi token và chi phí (finish_ai_run). Không ghi nội dung tin, số điện thoại ra log.

type Db = SupabaseClient<Database>;

/** Chờ khách nhắn xong (khách hay gửi nhiều tin liền nhau) rồi mới trả lời một lần. */
export const AI_DEBOUNCE_MS = Number(process.env.AI_DEBOUNCE_MS ?? 6_000);
/** Tỷ giá mặc định khi Owner chưa đặt (đồng cho 1 USD). */
export const DEFAULT_USD_RATE = 26_500;

interface StartedRun {
  run_id: string;
  conversation_id: string;
  showroom_id: string;
  channel: "messenger" | "zalo";
  model: string | null;
  usd_rate: string | null;
  trigger_message_id: string;
  lead_id: string | null;
  budget_exceeded: boolean;
  on_duty: boolean;
}

type Started = StartedRun | { skip: string };

/** Một lượt hỏi AI, giống nhau cho mọi nhà cung cấp (lib/ai/provider.ts). */
export function aiAsk(model: string, data: AiData, turnText: string, showroomId: string): AiAsk {
  return {
    model,
    instructions: INSTRUCTIONS,
    data: buildData(data.knowledge, data.catalog),
    turn: turnText,
    schema: DECISION_SCHEMA,
    cacheKey: `showroom-${showroomId}`,
  };
}

export function decisionOf(answer: AiAnswer, lastHasPhone: boolean): AiDecision | null {
  return answer.text === null ? null : parseDecision(answer.text, lastHasPhone);
}

export function rateOf(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_RATE;
}

function handoffText(onDuty: boolean) {
  return onDuty
    ? "Dạ em đã chuyển cho nhân viên, nhân viên sẽ liên hệ anh/chị ngay ạ."
    : "Dạ em đã ghi nhận và chuyển cho nhân viên, nhân viên sẽ liên hệ anh/chị khi vào ca ạ.";
}

/** Khóa API của nhà cung cấp ứng với mô hình đang chọn (Claude hoặc ChatGPT). */
async function apiKeyOf(db: Db, showroomId: string, model: string): Promise<string | null> {
  const { data } = await db.rpc("get_integration_secret", {
    p_showroom: showroomId,
    p_key: "ai_llm",
    p_name: aiProvider(model).secret,
  });
  return data ?? null;
}

/** Một hoặc hai lượt cho hội thoại (lượt hai khi khách nhắn thêm trong lúc AI đang soạn). Trả về kết quả từng lượt. */
export async function runAutoReply(
  db: Db,
  conversationId: string,
  opts: { fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<string[]> {
  const out: string[] = [];
  for (let round = 0; round < 2; round++) {
    const { data, error } = await db.rpc("start_ai_run", { p_conversation: conversationId });
    if (error || !data) {
      out.push("error:start");
      break;
    }
    const s = data as unknown as Started;
    if ("skip" in s) {
      out.push(`skip:${s.skip}`);
      break;
    }
    out.push(await handleRun(db, s, opts.fetchImpl ?? fetch, (opts.now ?? (() => new Date()))()));
  }
  return out;
}

async function handleRun(db: Db, s: StartedRun, fetchImpl: typeof fetch, now: Date): Promise<string> {
  const rate = rateOf(s.usd_rate);
  const model = aiModel(s.model).id;
  let usage: AiUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  const finish = async (
    status: "replied" | "handed_off" | "skipped" | "failed",
    extra: { action?: string; summary?: string; error?: string } = {},
  ) => {
    const cost = aiCost(model, usage, rate);
    await db.rpc("finish_ai_run", {
      p_run: s.run_id,
      p_status: status,
      p_action: extra.action,
      p_summary: extra.summary,
      p_error: extra.error,
      p_usage: { ...usage, cost_usd_micros: cost.usdMicros, cost_vnd: cost.vnd },
    });
  };
  const handoff = (reason: HandoffReason | "budget" | "error", summary?: string, createLead = false) =>
    db.rpc("ai_handoff", {
      p_run: s.run_id,
      p_reason: reason,
      p_summary: summary,
      p_create_lead: createLead,
    });

  if (s.budget_exceeded) {
    await handoff("budget");
    await finish("handed_off");
    return "handoff:budget";
  }
  const key = await apiKeyOf(db, s.showroom_id, model);
  if (!key) {
    await handoff("error");
    await finish("failed", { error: `Chưa có API key ${aiProvider(model).vendor} của Trợ lý AI` });
    return "error:no_key";
  }

  const [data, turns, conv] = await Promise.all([
    loadAiData(db, s.showroom_id, now),
    loadTurns(db, s.conversation_id),
    db.from("conversations").select("display_name").eq("id", s.conversation_id).maybeSingle(),
  ]);
  const turn = buildTurnPrompt(turns, {
    now,
    channel: s.channel,
    customerName: conv.data?.display_name,
    onDuty: s.on_duty,
    nextShift: data.nextShift,
  });

  let res: AiAnswer;
  try {
    res = await askModel(key, aiAsk(model, data, turn.text, s.showroom_id), fetchImpl);
  } catch (e) {
    const message = aiErrorMessage(e);
    // Khóa sai, hết tiền, không có quyền mô hình: dừng AI cả showroom và báo Owner (đấu nối sang Lỗi).
    if (isFatalAiError(e))
      await db.rpc("mark_integration_error", {
        p_showroom: s.showroom_id,
        p_key: "ai_llm",
        p_message: message,
      });
    await handoff("error");
    await finish("failed", { error: message });
    return `error:${e instanceof AiError ? e.status : "unknown"}`;
  }
  usage = res.usage;
  const d = decisionOf(res, turn.lastHasPhone);
  if (!d) {
    await handoff("error");
    await finish("failed", { error: "AI trả lời sai mẫu hoặc từ chối trả lời" });
    return "error:decision";
  }
  if (d.action === "none") {
    await finish("skipped", { action: "none", summary: d.summary });
    return "none";
  }

  const text = d.reply || (d.action === "handoff" ? handoffText(s.on_duty) : "");
  const { data: q, error } = await db.rpc("queue_ai_reply", { p_run: s.run_id, p_text: text });
  if (error || !q) {
    // Nhân viên vừa Tiếp quản (hoặc vừa tự trả lời) trong lúc AI soạn: thôi, không gửi.
    if (error?.message === "ai_paused" || error?.message === "run_closed") {
      await finish("skipped", { action: d.action, summary: d.summary, error: "Nhân viên đã tiếp quản" });
      return "skip:paused";
    }
    await finish("failed", { action: d.action, summary: d.summary, error: error?.message ?? "queue" });
    return `error:${error?.message ?? "queue"}`;
  }
  const sent = q as { message_id: string; user_id: string };
  const fail = await deliverQueuedReply(
    db,
    s.showroom_id,
    { messageId: sent.message_id, channel: s.channel, userId: sent.user_id },
    text,
  );
  if (fail) {
    // Không gửi được (kênh lỗi): nhân viên trả lời thay.
    await handoff(d.reason ?? "error", d.summary, d.createLead);
    await finish("failed", { action: d.action, summary: d.summary, error: fail });
    return "error:send";
  }
  if (d.action === "handoff") {
    await handoff(d.reason ?? "unknown", d.summary, d.createLead);
    await finish("handed_off", { action: "handoff", summary: d.summary });
    return `handoff:${d.reason}`;
  }
  await finish("replied", { action: "reply", summary: d.summary });
  return "replied";
}

/**
 * Sau khi webhook nhận tin của khách: chờ khách nhắn xong rồi trả lời. Tin mới hơn tới trong lúc chờ thì để lượt của
 * tin đó trả lời (không trả lời hai lần). Job quét mỗi phút (/api/cron/ai-replies) lo phần còn sót.
 */
export async function autoReplyAfterInbound(
  db: Db,
  showroomId: string,
  channel: "messenger" | "zalo",
  externalUserIds: string[],
  delayMs = AI_DEBOUNCE_MS,
): Promise<void> {
  const ids = [...new Set(externalUserIds.filter(Boolean))];
  if (!ids.length) return;
  const { data: channels } = await db.rpc("ai_reply_channels_for", { p_showroom: showroomId });
  if (!channels?.includes(channel)) return;
  const { data: convs } = await db
    .from("conversations")
    .select("id")
    .eq("showroom_id", showroomId)
    .eq("channel", channel)
    .in("external_user_id", ids);
  const lastInbound = async (conversationId: string) =>
    (
      await db
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("direction", "in")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.id ?? null;
  const marks = await Promise.all((convs ?? []).map(async (c) => [c.id, await lastInbound(c.id)] as const));
  await new Promise((r) => setTimeout(r, delayMs));
  for (const [id, mark] of marks) {
    if (!mark || (await lastInbound(id)) !== mark) continue;
    await runAutoReply(db, id);
  }
}

/** "Hỏi thử" ở Cài đặt, Trợ lý AI: xem AI sẽ trả lời một tin mẫu ra sao, không gửi cho ai. */
export async function previewAiReply(
  db: Db,
  showroomId: string,
  customerText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  { ok: true; decision: AiDecision; costVnd: number; model: string } | { ok: false; message: string }
> {
  const [{ data: cfg }, { count }] = await Promise.all([
    db.from("integrations").select("config").eq("showroom_id", showroomId).eq("key", "ai_llm").maybeSingle(),
    db
      .from("duty_sessions")
      .select("id", { count: "exact", head: true })
      .eq("showroom_id", showroomId)
      .is("ended_at", null),
  ]);
  const config = (cfg?.config ?? {}) as { model?: string; usdRate?: string };
  const model = aiModel(config.model).id;
  const key = await apiKeyOf(db, showroomId, model);
  if (!key)
    return {
      ok: false,
      message: `Chưa có API key ${aiProvider(model).vendor}. Owner dán key ở Cài đặt, Tích hợp, Trợ lý AI.`,
    };
  const now = new Date();
  const data = await loadAiData(db, showroomId, now);
  const turn = buildTurnPrompt([{ who: "customer", text: customerText, files: 0, at: now }], {
    now,
    channel: "messenger",
    onDuty: (count ?? 0) > 0,
    nextShift: data.nextShift,
  });
  try {
    const res = await askModel(key, aiAsk(model, data, turn.text, showroomId), fetchImpl);
    const d = decisionOf(res, turn.lastHasPhone);
    if (!d) return { ok: false, message: "AI trả lời sai mẫu hoặc từ chối trả lời. Thử lại." };
    return { ok: true, decision: d, costVnd: aiCost(model, res.usage, rateOf(config.usdRate)).vnd, model };
  } catch (e) {
    return { ok: false, message: aiErrorMessage(e) };
  }
}
