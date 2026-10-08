"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { configErrors } from "@/lib/integrations/connection";
import { graphErrorMessage, pageOfToken, subscribePage } from "@/lib/integrations/meta_messenger/api";
import { MESSENGER_KEY, messengerConfigForShowroom } from "@/lib/integrations/meta_messenger/config";
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
  if (key !== MESSENGER_KEY)
    return { ok: false, message: `Bộ nối ${d.name} chưa được viết, chưa kiểm tra được kết nối thật.` };

  const cfg = await messengerConfigForShowroom(createAdminClient(), user.showroomId);
  const missing = d.secrets.filter((n) => !cfg?.[SECRET_FIELD[n]]);
  if (!cfg?.pageId || missing.length)
    return {
      ok: false,
      message: `Chưa đủ để kết nối: ${[...(cfg?.pageId ? [] : ["ID Page Facebook"]), ...missing.map((n) => (d.secretLabels?.[n] ?? n).replace(/\s*\(.*\)$/, ""))].join(", ")}.`,
    };

  let error: string | null = null;
  try {
    const page = await pageOfToken(cfg.pageToken!);
    if (page.id !== cfg.pageId)
      error = `Token này thuộc Page khác (${page.name ?? "không rõ tên"}), không phải Page có ID đã khai. Lấy token của đúng Page rồi kết nối lại.`;
    else await subscribePage(cfg.pageId, cfg.pageToken!);
  } catch (e) {
    error = graphErrorMessage(e);
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("integrations")
    .update(
      error
        ? { status: "error", enabled: false, last_error: error, last_error_at: now }
        : {
            status: "connected",
            enabled: true,
            connected_by: user.id,
            connected_at: now,
            last_success_at: now,
            last_error: null,
            reply_mode: cfg.replyMode ?? "crm",
          },
    )
    .eq("showroom_id", user.showroomId)
    .eq("key", key);
  revalidatePath("/settings/integrations");
  return error
    ? { ok: false, message: error }
    : { ok: true, message: `${d.name} đã kết nối: token đúng Page, Page đã đăng ký gửi tin về CRM` };
}
