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
      return "Anh chị chỉ sửa được khách của lead mình đang giữ.";
    case "P0002":
      return "Không còn khách hoặc ghi chú này, hoặc anh chị không còn giữ lead.";
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

export async function saveContactAddress(input: z.infer<typeof addressSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = addressSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Địa chỉ cần ít nhất tỉnh, thành phố." };
  const a = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_contact_address", {
    p: {
      id: a.id,
      contact_id: a.contactId,
      receiver: a.receiver,
      street: a.street,
      ward: a.ward,
      district: a.district,
      province: a.province,
      note: a.note ? maskPhonesInText(a.note) : undefined,
      is_default: a.isDefault,
    },
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done("Đã lưu địa chỉ giao");
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
