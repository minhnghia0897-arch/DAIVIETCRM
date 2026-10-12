"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { maskPhone, maskPhonesInText, normalizePhone } from "@/lib/phone";

import type { ActionResult } from "../settings/types";

// Cột phải màn Hội thoại: sửa tên khách, lưu số, địa chỉ khách nhắn, ghi chú ghim. Mọi lệnh ghi đi qua hàm
// database (migration 20261011000200_inbox_side.sql) để kiểm quyền sửa khách, chặn "Xem như", ghi nhật ký.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

function friendly(code: string | undefined, message?: string): string {
  if (message === "phone_taken")
    return "Số này đang thuộc một khách khác. Sale admin gộp hai hồ sơ nếu là cùng một người.";
  switch (code) {
    case "42501":
      return "Anh chị chỉ sửa được khách mình đang phụ trách.";
    case "P0002":
      return "Không còn khách hoặc ghi chú này, hoặc anh chị không còn phụ trách khách này.";
    case "22023":
      return "Dữ liệu chưa đúng, kiểm lại rồi lưu.";
    default:
      return "Chưa lưu được, thử lại sau ít phút.";
  }
}

function done(message: string): ActionResult {
  revalidatePath("/inbox");
  return { ok: true, message };
}

const renameSchema = z.object({ contactId: z.uuid(), name: z.string().trim().min(1).max(120) });

export async function renameContact(input: z.infer<typeof renameSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = renameSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Nhập tên khách (tối đa 120 ký tự)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_contact", {
    p_contact_id: p.data.contactId,
    p_name: p.data.name,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done("Đã đổi tên khách");
}

const phoneSchema = z.object({
  contactId: z.uuid(),
  raw: z.string().trim().min(6).max(40),
  country: z.string().regex(/^([A-Z]{2}|unknown)$/),
});

/** Số khách nhắn trong hội thoại: chuẩn hóa theo thị trường của khách (VN mặc định), lưu vào định danh của khách. */
export async function saveContactPhone(input: z.infer<typeof phoneSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = phoneSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Số điện thoại chưa đúng." };
  const n = normalizePhone(p.data.raw, p.data.country === "KR" ? "KR" : "VN");
  if (!n.valid || !n.e164)
    return { ok: false, message: "Số này chưa đúng dạng số điện thoại, kiểm lại với khách." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_contact_phone", {
    p_contact_id: p.data.contactId,
    p_e164: n.e164,
    p_raw: p.data.raw,
    p_masked: maskPhone(n.e164),
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(data === "exists" ? "Số này đã có trong hồ sơ khách" : "Đã lưu số vào hồ sơ khách");
}

const addressSchema = z.object({
  contactId: z.uuid(),
  id: z.uuid().optional(),
  receiver: z.string().trim().max(120).optional(),
  street: z.string().trim().max(200).optional(),
  ward: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  province: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export async function saveContactAddress(
  input: z.infer<typeof addressSchema>,
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = addressSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Địa chỉ cần ít nhất tỉnh, thành phố." };
  const a = p.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_contact_address", {
    p: {
      id: a.id,
      contact_id: a.contactId,
      // Không lưu số điện thoại đầy đủ trong địa chỉ (số lưu ở định danh của khách).
      receiver: a.receiver ? maskPhonesInText(a.receiver) : undefined,
      street: a.street ? maskPhonesInText(a.street) : undefined,
      ward: a.ward,
      district: a.district,
      province: a.province,
      note: a.note ? maskPhonesInText(a.note) : undefined,
      is_default: a.isDefault,
    },
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return { ...done("Đã lưu địa chỉ giao"), id: id ?? undefined };
}

const idSchema = z.object({ id: z.uuid() });

export async function deleteContactAddress(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const { id } = idSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_contact_address", { p_id: id });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done("Đã xóa địa chỉ");
}

const noteSchema = z.object({
  contactId: z.uuid(),
  text: z.string().trim().min(1).max(2000),
  pinned: z.boolean(),
});

export async function addContactNote(input: z.infer<typeof noteSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = noteSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Nhập nội dung ghi chú (tối đa 2000 ký tự)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_contact_note", {
    p_contact_id: p.data.contactId,
    // Không lưu số điện thoại đầy đủ trong ghi chú (CLAUDE.md mục 4, events).
    p_text: maskPhonesInText(p.data.text),
    p_pinned: p.data.pinned,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(p.data.pinned ? "Đã ghim ghi chú lên đầu hội thoại" : "Đã lưu ghi chú");
}

const pinSchema = z.object({ id: z.uuid(), pinned: z.boolean() });

export async function pinContactNote(input: z.infer<typeof pinSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = pinSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_contact_note_pinned", { p_id: p.id, p_pinned: p.pinned });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(p.pinned ? "Đã ghim" : "Đã bỏ ghim");
}

export async function deleteContactNote(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const { id } = idSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_contact_note", { p_id: id });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done("Đã xóa ghi chú");
}

// Thẻ khách và trạng thái hội thoại (migration 20261011000300_inbox_tags_status.sql).

const tagSchema = z.object({ contactId: z.uuid(), tagId: z.uuid() });

export async function toggleContactTag(input: z.infer<typeof tagSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = tagSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_contact_tag", {
    p_contact_id: p.contactId,
    p_tag_id: p.tagId,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(data ? "Đã gắn thẻ" : "Đã gỡ thẻ");
}

const newTagSchema = z.object({ contactId: z.uuid(), label: z.string().trim().min(1).max(30) });

export async function createContactTag(input: z.infer<typeof newTagSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = newTagSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Tên thẻ từ 1 đến 30 ký tự." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_contact_tag", {
    p_contact_id: p.data.contactId,
    p_label: p.data.label,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(`Đã gắn thẻ ${p.data.label}`);
}

const doneSchema = z.object({ conversationId: z.uuid(), done: z.boolean() });

export async function setConversationDone(input: z.infer<typeof doneSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = doneSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_conversation_done", {
    p_conversation_id: p.conversationId,
    p_done: p.done,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(p.done ? "Đã đánh dấu xong, khách nhắn lại sẽ tự mở" : "Đã mở lại hội thoại");
}

const convAssignSchema = z.object({ conversationId: z.uuid(), assigneeId: z.uuid().nullable() });

/**
 * Giao, chuyển khách đang hỏi (hội thoại chưa có lead) cho nhân viên. Hội thoại đã có lead thì giao lead (assignLeads).
 * Cần lead.assign, kiểm ở database (assign_conversation, migration 20261012000200_inquiries.sql).
 */
export async function assignConversation(input: z.infer<typeof convAssignSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = convAssignSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Chọn lại nhân viên." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_conversation", {
    p_conversation: p.data.conversationId,
    p_assignee: p.data.assigneeId as string,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Anh chị chưa được cấp quyền giao khách."
          : error.code === "22023"
            ? "Người này không nhận khách được, hoặc khách đã thành lead (giao lead thay vì giao hội thoại)."
            : friendly(error.code, error.message),
    };
  return done(p.data.assigneeId ? "Đã giao khách" : "Đã bỏ người phụ trách");
}

const qualifySchema = z.object({ conversationId: z.uuid() });

/**
 * Chuyển khách đang hỏi thành lead (Sale admin, Owner: lead.assign). Lead giao cho người đang phụ trách hội thoại,
 * không có ai thì chia vòng như lead mới (qualify_conversation, migration 20261012000200_inquiries.sql).
 */
export async function qualifyConversation(
  input: z.infer<typeof qualifySchema>,
): Promise<ActionResult & { leadId?: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = qualifySchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Không tìm thấy hội thoại." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("qualify_conversation", {
    p_conversation: p.data.conversationId,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Chỉ Sale admin, Owner chuyển khách thành lead."
          : error.code === "22023"
            ? "Hội thoại chưa gắn hồ sơ khách, chưa chuyển thành lead được."
            : friendly(error.code, error.message),
    };
  revalidatePath("/inbox");
  revalidatePath("/leads");
  return { ok: true, message: "Đã chuyển thành lead", leadId: data ?? undefined };
}
