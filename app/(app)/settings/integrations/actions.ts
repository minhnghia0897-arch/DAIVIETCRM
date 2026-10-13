"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { aiErrorMessage } from "@/lib/ai/errors";
import { aiModel, aiProvider, modelName } from "@/lib/ai/models";
import { checkModel } from "@/lib/ai/provider";
import { configErrors } from "@/lib/integrations/connection";
import {
  GraphError,
  graphErrorMessage,
  pageConversations,
  pageOfToken,
  subscribeErrorMessage,
  subscribePage,
} from "@/lib/integrations/meta_messenger/api";
import { MESSENGER_KEY, messengerConfigForShowroom } from "@/lib/integrations/meta_messenger/config";
import { oaOfToken, zaloErrorMessage } from "@/lib/integrations/zalo_oa/api";
import { ZALO_KEY, zaloConfigForShowroom } from "@/lib/integrations/zalo_oa/config";
import { ensureZaloToken } from "@/lib/integrations/zalo_oa/token";
import { linkBase, telegramApi, TelegramError, type TelegramApi } from "@/lib/integrations/telegram_bot/api";
import { BOT_COMMANDS } from "@/lib/integrations/telegram_bot/commands";
import { TELEGRAM_KEY, telegramConfig } from "@/lib/integrations/telegram_bot/config";
import { integrations, type IntegrationDefinition } from "@/lib/integrations/registry";

import type { ActionResult } from "../types";

// Lưu khóa và cấu hình đấu nối thật (CLAUDE.md 10.1, 10.2). Giá trị khóa đi thẳng vào Supabase Vault qua hàm
// set_integration_secret (kiểm settings.integrations, chặn khi "Xem như", ghi nhật ký); không bao giờ trả về trình duyệt.
// Không ghi giá trị khóa vào log ứng dụng.

const SECRET_FIELD: Record<string, "appSecret" | "pageToken" | "verifyToken"> = {
  messenger_app_secret: "appSecret",
  messenger_page_access_token: "pageToken",
  messenger_verify_token: "verifyToken",
};

const def = (key: string): IntegrationDefinition | undefined => integrations.find((d) => d.key === key);

const secretsSchema = z.object({
  key: z.string(),
  secrets: z.record(z.string(), z.string().max(8192)),
});

export async function saveIntegrationSecrets(input: z.infer<typeof secretsSchema>): Promise<ActionResult> {
  await requireWritable("settings.integrations");
  const { key, secrets } = secretsSchema.parse(input);
  const d = def(key);
  if (!d) return { ok: false, message: "Không có đấu nối này trong sổ đăng ký." };
  const entries = Object.entries(secrets).filter(([, v]) => v.trim());
  const unknown = entries.filter(([name]) => !d.secrets.includes(name));
  if (unknown.length) return { ok: false, message: "Có khóa không thuộc đấu nối này." };
  if (!entries.length) return { ok: false, message: "Chưa dán khóa nào." };

  const supabase = await createClient();
  for (const [name, value] of entries) {
    const { error } = await supabase.rpc("set_integration_secret", {
      p_key: key,
      p_name: name,
      p_value: value,
    });
    if (error)
      return {
        ok: false,
        message:
          error.code === "42501"
            ? "Anh chị chưa có quyền lưu khóa, hoặc đang xem như người khác."
            : "Không lưu được khóa vào kho bí mật. Thử lại sau ít phút.",
      };
  }
  revalidatePath("/settings/integrations");
  return {
    ok: true,
    message: `Đã lưu ${entries.length} khóa của ${d.name} vào kho bí mật`,
  };
}

const removeSchema = z.object({ key: z.string(), name: z.string() });

export async function removeIntegrationSecret(input: z.infer<typeof removeSchema>): Promise<ActionResult> {
  await requireWritable("settings.integrations");
  const { key, name } = removeSchema.parse(input);
  const d = def(key);
  if (!d || !d.secrets.includes(name)) return { ok: false, message: "Không có khóa này." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_integration_secret", { p_key: key, p_name: name });
  if (error) return { ok: false, message: "Không xóa được khóa." };
  revalidatePath("/settings/integrations");
  return { ok: true, message: "Đã xóa khóa" };
}

const settingsSchema = z.object({
  key: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
  prerequisitesDone: z.array(z.string()).optional(),
  replyMode: z.enum(["crm", "external", "off"]).optional(),
  /** Chỉ cho tạm dừng, chạy lại, ngắt; "Đã kết nối" chỉ do bộ nối thật xác nhận sau khi kiểm tra. */
  status: z.enum(["paused", "not_connected"]).optional(),
});

export async function saveIntegrationSettings(input: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  const user = await requireWritable("settings.integrations");
  const p = settingsSchema.parse(input);
  const d = def(p.key);
  if (!d) return { ok: false, message: "Không có đấu nối này trong sổ đăng ký." };
  if (p.config) {
    const errs = configErrors(d, p.config);
    if (errs.length) return { ok: false, message: errs.join("; ") };
  }
  if (p.prerequisitesDone?.some((k) => !d.prerequisites.some((x) => x.key === k)))
    return { ok: false, message: "Điều kiện tiên quyết không thuộc đấu nối này." };
  if (p.replyMode && !d.supportsReplyMode)
    return { ok: false, message: "Đấu nối này không có chế độ trả lời." };

  const supabase = await createClient();
  const status = p.status;
  const { error } = await supabase.from("integrations").upsert(
    {
      showroom_id: user.showroomId,
      key: p.key,
      ...(p.config ? { config: p.config as never } : {}),
      ...(p.prerequisitesDone
        ? { prerequisites_done: Object.fromEntries(p.prerequisitesDone.map((k) => [k, true])) }
        : {}),
      ...(p.replyMode ? { reply_mode: p.replyMode } : {}),
      ...(status ? { status, enabled: status !== "paused" && status !== "not_connected" } : {}),
    },
    { onConflict: "showroom_id,key" },
  );
  if (error) return { ok: false, message: "Không lưu được cấu hình đấu nối." };
  revalidatePath("/settings/integrations");
  return { ok: true, message: `Đã lưu cấu hình ${d.name}` };
}

/**
 * Kiểm tra kết nối thật bằng bộ nối của nhà cung cấp; chỉ đường này mới chuyển đấu nối sang "Đã kết nối".
 * Messenger: token phải thuộc đúng Page đã khai, rồi đăng ký Page gửi tin về webhook của CRM.
 */
export async function checkIntegration(input: { key: string }): Promise<ActionResult> {
  const user = await requireWritable("settings.integrations");
  const { key } = z.object({ key: z.string() }).parse(input);
  const d = def(key);
  if (!d) return { ok: false, message: "Không có đấu nối này trong sổ đăng ký." };
  const probe = PROBES[key];
  if (!probe)
    return { ok: false, message: `Bộ nối ${d.name} chưa được viết, chưa kiểm tra được kết nối thật.` };

  const r = await probe(d, user.showroomId, user.id);
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("integrations")
    .update(
      "error" in r
        ? { status: "error", enabled: false, last_error: r.error, last_error_at: now }
        : {
            status: "connected",
            enabled: true,
            connected_by: user.id,
            connected_at: now,
            last_success_at: now,
            last_error: null,
            reply_mode: d.supportsReplyMode ? (r.replyMode ?? "crm") : null,
          },
    )
    .eq("showroom_id", user.showroomId)
    .eq("key", key);
  revalidatePath("/settings/integrations");
  return "error" in r
    ? { ok: false, message: r.error }
    : { ok: true, message: `${d.name} đã kết nối: ${r.done}` };
}

type Probe = (
  d: IntegrationDefinition,
  showroomId: string,
  userId: string,
) => Promise<{ error: string } | { done: string; replyMode: string | null }>;

/** Lỗi Telegram viết bằng lời Owner hiểu được, kèm cách xử lý. Không bao giờ có token trong câu. */
function telegramErrorMessage(e: unknown): string {
  if (e instanceof TelegramError) {
    if (e.code === 401 || e.code === 404)
      return "Token không đúng hoặc đã bị thu hồi. Mở @BotFather, chọn bot, lấy token mới rồi dán lại.";
    if (e.code === 400 && /https|webhook/i.test(e.message))
      return "Telegram không nhận địa chỉ CRM này làm webhook. Mở CRM bằng tên miền https rồi kết nối lại.";
    if (e.code === 429) return "Telegram đang giới hạn số lần gọi, đợi một phút rồi kết nối lại.";
    return "Telegram từ chối yêu cầu. Kiểm tra lại token và thử lại sau ít phút.";
  }
  return "Không gọi được Telegram, thử lại sau ít phút.";
}

const short = (d: IntegrationDefinition, n: string) => (d.secretLabels?.[n] ?? n).replace(/\s*\(.*\)$/, "");
const missingMessage = (items: string[]) => ({ error: `Chưa đủ để kết nối: ${items.join(", ")}.` });

const PROBES: Record<string, Probe> = {
  // Token đúng (getMe), nối webhook về CRM kèm mã bí mật, đăng ký menu lệnh, rồi gửi tin thử tới người bấm nếu họ đã
  // liên kết Telegram. Mã bí mật webhook Owner để trống thì CRM tự tạo và cất vào kho bí mật.
  [TELEGRAM_KEY]: async (d, showroomId, userId) => {
    const admin = createAdminClient();
    const cfg = await telegramConfig(admin);
    if (!cfg?.token) return missingMessage([short(d, "telegram_bot_token")]);
    let api: TelegramApi;
    try {
      api = telegramApi(cfg.token);
    } catch {
      return { error: "Token không đúng dạng. Token lấy ở @BotFather có dạng 123456789:ABC…" };
    }
    let me: { username?: string };
    try {
      me = await api.call<{ username?: string }>("getMe");
    } catch (e) {
      return { error: telegramErrorMessage(e) };
    }

    let secret = cfg.webhookSecret;
    if (!secret) {
      secret = randomBytes(24).toString("hex");
      const { error } = await (
        await createClient()
      ).rpc("set_integration_secret", {
        p_key: TELEGRAM_KEY,
        p_name: "telegram_webhook_secret",
        p_value: secret,
      });
      if (error) return { error: "Không lưu được mã bí mật webhook vào kho bí mật. Thử lại sau ít phút." };
    }

    // Địa chỉ CRM Owner đang mở (Vercel gửi kèm tên miền thật qua x-forwarded-host). Telegram chỉ nhận https.
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const base = linkBase(host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : null);
    if (!base)
      return {
        error:
          "Telegram chỉ gửi tin về địa chỉ https. Mở CRM bằng tên miền https (ví dụ daivietcrmq4.vercel.app) rồi kết nối lại.",
      };
    try {
      await api.call("setWebhook", {
        url: `${base}/api/webhooks/telegram`,
        secret_token: secret,
        allowed_updates: ["message", "callback_query", "my_chat_member"],
        drop_pending_updates: true,
      });
      await api.call("setMyCommands", { commands: BOT_COMMANDS });
    } catch (e) {
      return { error: telegramErrorMessage(e) };
    }

    // Tên bot thật dùng để dựng link liên kết https://t.me/<bot>?start=<mã>.
    if (me.username) {
      const { data: row } = await admin
        .from("integrations")
        .select("config")
        .eq("showroom_id", showroomId)
        .eq("key", TELEGRAM_KEY)
        .maybeSingle();
      await admin
        .from("integrations")
        .update({ config: { ...((row?.config ?? {}) as Record<string, unknown>), botUsername: me.username } })
        .eq("showroom_id", showroomId)
        .eq("key", TELEGRAM_KEY);
    }

    const { data: link } = await admin
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    let test = "anh chị liên kết Telegram ở Cài đặt, Thông báo Telegram để nhận tin";
    if (link) {
      try {
        await api.call("sendMessage", {
          chat_id: link.chat_id,
          text: "Bot đã nối với CRM. Gõ /viec, /lead, /giaohang, /cskh để xem nhanh việc, lead, đơn giao, khách cần chăm sóc.",
        });
        test = "đã gửi tin thử tới Telegram của anh chị";
      } catch {
        test = "chưa gửi được tin thử, kiểm tra anh chị chưa chặn bot";
      }
    }
    return {
      done: `bot @${me.username ?? "?"} gửi tin về CRM, menu đã có lệnh /viec, /lead, /giaohang, /cskh; ${test}`,
      replyMode: null,
    };
  },
  // Khóa API của nhà cung cấp ứng với mô hình đã chọn (Claude hoặc ChatGPT) dùng được mô hình đó (hỏi thông tin mô
  // hình, không tốn token).
  ai_llm: async (d, showroomId) => {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("integrations")
      .select("config")
      .eq("showroom_id", showroomId)
      .eq("key", "ai_llm")
      .maybeSingle();
    const cfg = (row?.config ?? {}) as { model?: string; autoReply?: string[] };
    const model = aiModel(cfg.model);
    const provider = aiProvider(model.id);
    const { data: key } = await admin.rpc("get_integration_secret", {
      p_showroom: showroomId,
      p_key: "ai_llm",
      p_name: provider.secret,
    });
    if (!key) return missingMessage([short(d, provider.secret)]);
    try {
      await checkModel(key, model.id);
    } catch (e) {
      return { error: aiErrorMessage(e) };
    }
    const on = (cfg.autoReply ?? []).map((c) => (c === "zalo" ? "Zalo OA" : "Messenger"));
    return {
      done: `API key ${provider.vendor} dùng được ${modelName(model.id)}; ${
        on.length
          ? `AI đang tự trả lời trên ${on.join(", ")}`
          : "chưa bật tự trả lời kênh nào (bật ở Cài đặt, Trợ lý AI)"
      }`,
      replyMode: null,
    };
  },
  // Token phải thuộc đúng Page đã khai, rồi đăng ký Page gửi tin về webhook của CRM.
  [MESSENGER_KEY]: async (d, showroomId) => {
    const cfg = await messengerConfigForShowroom(createAdminClient(), showroomId);
    const missing = d.secrets.filter((n) => !cfg?.[SECRET_FIELD[n]]);
    if (!cfg?.pageId || missing.length)
      return missingMessage([
        ...(cfg?.pageId ? [] : ["ID Page Facebook"]),
        ...missing.map((n) => short(d, n)),
      ]);
    try {
      const page = await pageOfToken(cfg.pageToken!);
      if (page.id !== cfg.pageId)
        return {
          error: `Token này thuộc Page khác (${page.name ?? "không rõ tên"}), không phải Page có ID đã khai. Lấy token của đúng Page rồi kết nối lại.`,
        };
    } catch (e) {
      // Đọc thông tin Page cần thêm quyền pages_read_engagement, nhắn tin thì không. Thiếu quyền đó (mã 100) thì bỏ qua
      // bước này: đăng ký Page ở dưới vẫn chỉ thành công khi token đúng là của Page có ID đã khai.
      if (!(e instanceof GraphError && e.code === 100)) {
        const detail =
          e instanceof GraphError && e.code !== 190 && e.detail ? ` Meta báo: "${e.detail}"` : "";
        return { error: graphErrorMessage(e) + detail };
      }
    }
    try {
      await subscribePage(cfg.pageId, cfg.pageToken!);
    } catch (e) {
      return { error: subscribeErrorMessage(e) };
    }
    // Đọc lại tin bị lỡ (mỗi 2 phút) cần thêm pages_read_engagement. Thiếu thì vẫn kết nối, chỉ báo để Owner lấy token
    // mới có quyền đó.
    let reread = "CRM đọc lại được tin bị lỡ";
    try {
      await pageConversations(cfg.pageId, cfg.pageToken!);
    } catch (e) {
      reread =
        e instanceof GraphError && e.code === -1
          ? "chưa kiểm được việc đọc lại tin bị lỡ vì không gọi được Meta"
          : "chưa đọc lại được tin bị lỡ vì token thiếu quyền pages_read_engagement";
    }
    return { done: `token đúng Page, Page đã đăng ký gửi tin về CRM; ${reread}`, replyMode: cfg.replyMode };
  },
  // Làm mới token ngay (kiểm App Secret và refresh token), rồi kiểm token thuộc đúng OA đã khai.
  [ZALO_KEY]: async (d, showroomId) => {
    const admin = createAdminClient();
    const cfg = await zaloConfigForShowroom(admin, showroomId);
    const has: Record<string, string | null | undefined> = {
      zalo_app_secret: cfg?.appSecret,
      zalo_oa_secret_key: cfg?.oaSecretKey,
      zalo_refresh_token: cfg?.refreshToken,
    };
    const missing = [
      ...(cfg?.appId ? [] : ["App ID ứng dụng Zalo"]),
      ...(cfg?.oaId ? [] : ["ID Zalo OA"]),
      ...d.secrets.filter((n) => !has[n]).map((n) => short(d, n)),
    ];
    if (!cfg || missing.length) return missingMessage(missing);
    const t = await ensureZaloToken(admin, cfg, { force: true });
    if (!t.ok) return { error: t.message };
    try {
      const oa = await oaOfToken(t.accessToken);
      if (oa.oaId !== cfg.oaId)
        return {
          error: `Token này thuộc OA khác (${oa.name ?? "không rõ tên"}), không phải OA có ID đã khai. Lấy refresh token của đúng OA rồi kết nối lại.`,
        };
    } catch (e) {
      return { error: zaloErrorMessage(e) };
    }
    return {
      done: "token làm mới được và thuộc đúng OA; CRM tự làm mới token từ nay",
      replyMode: cfg.replyMode,
    };
  },
};
