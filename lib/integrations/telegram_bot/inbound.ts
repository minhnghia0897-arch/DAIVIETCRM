import type { SupabaseClient } from "@supabase/supabase-js";

import { maskPhonesInText } from "../../phone/index.ts";
import type { Database } from "../../db/types.ts";
import { tgUpdate, type TelegramApi, type TgMessage, type TgUpdate } from "./api.ts";

// Telegram → CRM. Mỗi tin Telegram gửi về được lưu thô vào webhook_events trước (chống xử lý trùng theo update_id),
// rồi mới xử lý. Mọi việc làm thay nhân viên đi qua hàm database telegram_* (kiểm liên kết, kiểm quyền như trên CRM,
// ghi đúng người làm). Bot chỉ nhận trong nhóm: lệnh gửi bot, tin trả lời tin của bot, tin hệ thống (chế độ riêng tư
// mặc định của Telegram), nên không đọc trò chuyện thường của đội.

type Db = SupabaseClient<Database>;

export const PURPOSES: Record<string, "general" | "delivery" | "care" | "announce" | "unused"> = {
  chung: "general",
  giaohang: "delivery",
  cskh: "care",
  thongbao: "announce",
  khongdung: "unused",
};
const PURPOSE_LABEL: Record<string, string> = {
  general: "Nhóm chung",
  delivery: "Nhóm giao hàng",
  care: "Nhóm chăm sóc khách hàng",
  announce: "Kênh thông báo chung",
  unused: "Không dùng",
};

const HELP_PRIVATE =
  "Trả lời (reply) vào một tin báo về lead để lưu ghi chú vào hồ sơ; gửi ảnh kèm chú thích cũng được. Gõ /viec để xem việc đang mở.";
const ASSIGN_HINT =
  "Nhóm chưa được gán công dụng. Owner gõ: /gan chung | /gan giaohang | /gan cskh | /gan thongbao";

/** Tách lệnh "/lenh@bot thamso" (trong nhóm Telegram gửi kèm @tên_bot). */
export function parseCommand(text: string | undefined, botUsername: string) {
  const m = /^\/([a-z_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec((text ?? "").trim());
  if (!m) return null;
  if (m[2] && m[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  return { cmd: m[1].toLowerCase(), arg: (m[3] ?? "").trim() };
}

export const reasonVi = (code: string | undefined, message: string) =>
  code === "42501"
    ? message.includes("not linked")
      ? "Tài khoản Telegram này chưa liên kết với CRM, hoặc tài khoản CRM đã bị khóa."
      : "Anh chị không có quyền làm việc này trên CRM."
    : code === "P0002" || message.includes("not found")
      ? "Không tìm thấy hồ sơ này trong CRM."
      : "CRM chưa lưu được, anh chị thử lại sau.";

export async function handleUpdate(
  db: Db,
  api: TelegramApi,
  botUsername: string,
  raw: unknown,
): Promise<void> {
  const parsed = tgUpdate.safeParse(raw);
  const updateId = String((raw as { update_id?: unknown })?.update_id ?? "");
  const kind = parsed.success
    ? ((["message", "callback_query", "my_chat_member"] as const).find((k) => parsed.data[k]) ?? "other")
    : "invalid";

  // Hộp nhận thô; trùng update_id thì bỏ qua (đã xử lý).
  const { error: dup } = await db.from("webhook_events").insert({
    provider: "telegram",
    external_id: updateId,
    event_type: kind,
    signature_valid: true,
    payload: raw as never,
  });
  if (dup) return;

  let status: "processed" | "ignored" | "failed" = "processed";
  let err: string | null = null;
  try {
    if (!parsed.success) status = "ignored";
    else if (!(await route(db, api, botUsername, parsed.data))) status = "ignored";
  } catch (e) {
    status = "failed";
    err = e instanceof Error ? e.message.slice(0, 500) : "lỗi không rõ";
  }
  await db
    .from("webhook_events")
    .update({ status, error: err, processed_at: new Date().toISOString() })
    .eq("provider", "telegram")
    .eq("external_id", updateId);
}

async function route(db: Db, api: TelegramApi, bot: string, u: TgUpdate): Promise<boolean> {
  if (u.my_chat_member) return onMembership(db, api, u.my_chat_member);
  if (u.callback_query) return onButton(db, api, u.callback_query);
  if (u.message) return onMessage(db, api, bot, u.message);
  return false;
}

const reply = (api: TelegramApi, m: TgMessage, text: string) =>
  api.call("sendMessage", { chat_id: m.chat.id, text, reply_parameters: { message_id: m.message_id } });

async function onMembership(db: Db, api: TelegramApi, e: NonNullable<TgUpdate["my_chat_member"]>) {
  if (e.chat.type === "private") return false;
  const joined = ["member", "administrator"].includes(e.new_chat_member.status);
  const { data: existing } = await db
    .from("telegram_groups")
    .select("id")
    .eq("chat_id", e.chat.id)
    .maybeSingle();
  if (joined) {
    if (!existing) {
      const { data: showroom } = await db.from("showrooms").select("id").limit(1).single();
      await db
        .from("telegram_groups")
        .insert({ showroom_id: showroom!.id, chat_id: e.chat.id, title: e.chat.title ?? "" });
    } else {
      await db
        .from("telegram_groups")
        .update({ status: "pending", title: e.chat.title ?? "" })
        .eq("chat_id", e.chat.id);
    }
    await api.call("sendMessage", { chat_id: e.chat.id, text: ASSIGN_HINT });
  } else if (existing) {
    await db.from("telegram_groups").update({ status: "lost" }).eq("chat_id", e.chat.id);
  }
  return true;
}

async function onButton(db: Db, api: TelegramApi, q: NonNullable<TgUpdate["callback_query"]>) {
  const m = /^t:(done|snz):([0-9a-f-]{36})$/.exec(q.data ?? "");
  let answer = "Nút này không còn dùng được.";
  if (m) {
    const { data, error } = await db.rpc("telegram_task_action", {
      p_telegram_user_id: q.from.id,
      p_task_id: m[2],
      p_action: m[1] === "done" ? "done" : "snooze",
      p_minutes: 60,
    });
    answer = error
      ? reasonVi(error.code, error.message)
      : data === "done"
        ? "Đã đánh dấu xong trên CRM."
        : data === "snoozed"
          ? "Đã hẹn lại 1 giờ."
          : "Việc này đã xử lý rồi.";
  }
  // Telegram yêu cầu luôn trả lời nút bấm để tắt vòng chờ trên máy người dùng.
  await api.call("answerCallbackQuery", { callback_query_id: q.id, text: answer });
  return Boolean(m);
}

async function onMessage(db: Db, api: TelegramApi, bot: string, m: TgMessage) {
  if (m.migrate_to_chat_id) {
    await db.from("telegram_groups").update({ chat_id: m.migrate_to_chat_id }).eq("chat_id", m.chat.id);
    return true;
  }
  const from = m.from;
  if (!from || from.is_bot) return false;
  const cmd = parseCommand(m.text, bot);
  const isPrivate = m.chat.type === "private";

  if (cmd?.cmd === "start" && isPrivate) {
    if (!cmd.arg) {
      await reply(
        api,
        m,
        "Chào anh chị. Để nhận việc từ CRM, mở CRM → Cài đặt → Thông báo Telegram và bấm liên kết.",
      );
      return true;
    }
    const { data: userId } = await db.rpc("redeem_telegram_link_code", {
      p_code: cmd.arg,
      p_telegram_user_id: from.id,
      p_chat_id: m.chat.id,
      p_username: from.username,
    });
    if (!userId) {
      await reply(
        api,
        m,
        "Link liên kết không đúng hoặc đã hết hạn (10 phút, dùng một lần). Lấy link mới trong CRM.",
      );
      return true;
    }
    const { data: p } = await db.from("profiles").select("full_name").eq("id", userId).single();
    await reply(
      api,
      m,
      `Đã liên kết với ${p?.full_name ?? "tài khoản CRM"}. Việc của anh chị sẽ báo ở đây. ${HELP_PRIVATE}`,
    );
    return true;
  }

  if (cmd?.cmd === "gan" && !isPrivate) {
    const purpose = PURPOSES[cmd.arg.toLowerCase()];
    if (!purpose) {
      await reply(api, m, ASSIGN_HINT);
      return true;
    }
    const { error } = await db.rpc("telegram_assign_group", {
      p_telegram_user_id: from.id,
      p_chat_id: m.chat.id,
      p_title: m.chat.title ?? "",
      p_purpose: purpose,
    });
    await reply(
      api,
      m,
      error ? reasonVi(error.code, error.message) : `Đã gán nhóm này: ${PURPOSE_LABEL[purpose]}.`,
    );
    return true;
  }

  if (cmd?.cmd === "viec") {
    const { data: userId } = await db.rpc("telegram_user", { p_telegram_user_id: from.id });
    if (!userId) {
      await reply(api, m, reasonVi("42501", "not linked"));
      return true;
    }
    const { data: tasks } = await db
      .from("tasks")
      .select("title, due_at")
      .eq("assigned_to", userId)
      .eq("status", "open")
      .order("due_at")
      .limit(6);
    const list = (tasks ?? []).slice(0, 5).map((t) => `• ${t.title}`);
    await api.call("sendMessage", {
      chat_id: from.id,
      text: list.length
        ? `Việc đang mở:\n${list.join("\n")}${(tasks ?? []).length > 5 ? "\n…" : ""}`
        : "Anh chị không còn việc nào đang mở.",
    });
    return true;
  }

  // Trả lời vào tin của bot: ghi chú (kèm ảnh) vào hồ sơ lead mà tin đó báo.
  const replied = m.reply_to_message;
  if (replied?.from?.is_bot) {
    const { data: ref } = await db
      .from("telegram_messages")
      .select("lead_id, showroom_id")
      .eq("chat_id", m.chat.id)
      .eq("message_id", replied.message_id)
      .maybeSingle();
    if (!ref?.lead_id) {
      await reply(api, m, "Tin này không gắn với hồ sơ khách nào nên không lưu vào CRM.");
      return true;
    }
    let filePath: string | null = null;
    const photo = m.photo?.at(-1); // cỡ lớn nhất
    if (photo) {
      const file = await api.call<{ file_path?: string }>("getFile", { file_id: photo.file_id });
      if (file.file_path) {
        const bytes = await api.downloadFile(file.file_path);
        filePath = `${ref.showroom_id}/lead/${ref.lead_id}/${photo.file_unique_id}.jpg`;
        const up = await db.storage
          .from("telegram-attachments")
          .upload(filePath, bytes, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw new Error(`Không lưu được ảnh: ${up.error.message}`);
      }
    }
    const text = maskPhonesInText((m.text ?? m.caption ?? "").trim());
    const { error } = await db.rpc("telegram_add_note", {
      p_telegram_user_id: from.id,
      p_lead_id: ref.lead_id,
      p_text: text,
      p_file_path: filePath ?? undefined,
    });
    await reply(
      api,
      m,
      error
        ? reasonVi(error.code, error.message)
        : `Đã lưu ${filePath ? "ảnh và ghi chú" : "ghi chú"} vào hồ sơ khách trên CRM.`,
    );
    return true;
  }

  if (isPrivate) {
    await reply(api, m, HELP_PRIVATE);
    return true;
  }
  return false;
}
