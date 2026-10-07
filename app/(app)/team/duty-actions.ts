"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "../settings/types";

// Ca trực, công tắc Trực, ngày nghỉ (CLAUDE.md mục 7, 9.2; migration 20261007000900_duty_shifts.sql). Mọi kiểm tra
// quyền thật nằm ở RLS và hàm database; ở đây kiểm tra đầu vào và đổi lỗi sang câu dễ hiểu.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

function refresh() {
  revalidatePath("/", "layout");
}

/** Bật, tắt Trực của chính mình. Bật xong, lead đang chờ người trực được chia ngay. */
export async function setMyDuty(on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("lead.receive"))
    return { ok: false, message: "Anh chị không ở danh sách nhận lead nên không cần bật Trực." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_my_duty", { p_on: z.boolean().parse(on) });
  if (error)
    return {
      ok: false,
      message: error.message.includes("absent")
        ? "Hôm nay anh chị có lịch nghỉ nên không bật Trực được."
        : "Chưa đổi được trạng thái trực, thử lại sau ít phút.",
    };
  refresh();
  const routed = Number((data as { routed?: number } | null)?.routed ?? 0);
  return {
    ok: true,
    message: on
      ? routed
        ? `Đã bật trực, nhận ngay ${routed} lead đang chờ`
        : "Đã bật trực, bắt đầu nhận lead"
      : "Đã tắt trực, không nhận lead mới",
  };
}

/** Quản lý tắt Trực hộ người quên tắt. */
export async function endDutyFor(userId: string): Promise<ActionResult> {
  await requireWritable("staff.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_duty_for", { p_user: z.uuid().parse(userId) });
  if (error) return { ok: false, message: "Chưa tắt được trực, thử lại sau ít phút." };
  refresh();
  return data
    ? { ok: true, message: "Đã tắt trực hộ" }
    : { ok: false, message: "Người này đang không trực." };
}

// ---------------------------------------------------------------------------
// Lịch ca (Cài đặt, Ca trực)
// ---------------------------------------------------------------------------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const shiftSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(60),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    start: time,
    end: time,
    isActive: z.boolean(),
  })
  .refine((s) => s.end > s.start, { message: "end" });

export async function saveShift(input: z.infer<typeof shiftSchema>): Promise<ActionResult> {
  const user = await requireWritable("settings.assignment");
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: "Ca cần tên, ít nhất một ngày, và giờ kết thúc sau giờ bắt đầu (ca không qua nửa đêm).",
    };
  const s = parsed.data;
  const row = {
    name: s.name,
    days: [...new Set(s.days)].sort(),
    start_time: s.start,
    end_time: s.end,
    is_active: s.isActive,
  };
  const supabase = await createClient();
  const { error } = s.id
    ? await supabase.from("shifts").update(row).eq("id", s.id)
    : await supabase.from("shifts").insert({ ...row, showroom_id: user.showroomId, created_by: user.id });
  if (error) return { ok: false, message: "Chưa lưu được ca, thử lại sau ít phút." };
  revalidatePath("/settings/shifts");
  return { ok: true, message: s.id ? `Đã lưu ${s.name}` : `Đã thêm ${s.name}` };
}

export async function setShiftMember(input: {
  shiftId: string;
  userId: string;
  on: boolean;
}): Promise<ActionResult> {
  const user = await requireWritable("settings.assignment");
  const { shiftId, userId, on } = z
    .object({ shiftId: z.uuid(), userId: z.uuid(), on: z.boolean() })
    .parse(input);
  const supabase = await createClient();
  const { error } = on
    ? await supabase
        .from("shift_members")
        .insert({ shift_id: shiftId, user_id: userId, showroom_id: user.showroomId, created_by: user.id })
    : await supabase.from("shift_members").delete().eq("shift_id", shiftId).eq("user_id", userId);
  if (error && error.code !== "23505") return { ok: false, message: "Chưa đổi được người trong ca." };
  revalidatePath("/settings/shifts");
  return { ok: true, message: on ? "Đã thêm vào ca" : "Đã bỏ khỏi ca" };
}

// ---------------------------------------------------------------------------
// Ngày nghỉ (Đội ngũ, Nghỉ và trực)
// ---------------------------------------------------------------------------

const absenceSchema = z
  .object({
    userId: z.uuid(),
    kind: z.enum(["annual", "sick", "business", "other"]),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    note: z.string().trim().max(500),
  })
  .refine((a) => a.endsOn >= a.startsOn);

export async function addAbsence(input: z.infer<typeof absenceSchema>): Promise<ActionResult> {
  const user = await requireWritable("staff.manage");
  const parsed = absenceSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Chọn người, loại nghỉ, và ngày kết thúc từ ngày bắt đầu trở đi." };
  const a = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("absences").insert({
    showroom_id: user.showroomId,
    user_id: a.userId,
    kind: a.kind,
    starts_on: a.startsOn,
    ends_on: a.endsOn,
    note: a.note || null,
    approved_by: user.id,
    created_by: user.id,
  });
  if (error) return { ok: false, message: "Chưa ghi được ngày nghỉ, thử lại sau ít phút." };
  revalidatePath("/team/absences");
  return { ok: true, message: "Đã ghi ngày nghỉ" };
}

export async function cancelAbsence(id: string): Promise<ActionResult> {
  await requireWritable("staff.manage");
  const supabase = await createClient();
  const { error } = await supabase
    .from("absences")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", z.uuid().parse(id));
  if (error) return { ok: false, message: "Chưa hủy được ngày nghỉ." };
  revalidatePath("/team/absences");
  return { ok: true, message: "Đã hủy ngày nghỉ" };
}
