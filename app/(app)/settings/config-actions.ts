"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import {
  CATALOGS,
  assignmentSchema,
  catalogItemSchema,
  catalogKey,
  marketSchema,
  type CatalogTable,
} from "@/lib/settings/config";

import type { ActionResult } from "./types";

// Cài đặt Phân lead, Thị trường, Danh mục trên bản thật. Quyền thật nằm ở RLS (settings.assignment, catalog.manage);
// nhật ký kiểm toán ghi bằng trigger audit_config_change (migration 20261008000100).

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dữ liệu chưa đúng.";

export async function saveAssignmentRules(input: z.infer<typeof assignmentSchema>): Promise<ActionResult> {
  const user = await requireWritable("settings.assignment");
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Hạn gọi từ 1 đến 1440 phút, giới hạn từ 1 đến 500 lead chưa gọi." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignment_rules")
    .update({ sla_minutes: parsed.data.slaMinutes, max_uncontacted_per_person: parsed.data.maxUncontacted })
    .eq("showroom_id", user.showroomId)
    .select("id");
  if (error || !data?.length)
    return { ok: false, message: "Chưa lưu được luật phân lead, thử lại sau ít phút." };
  revalidatePath("/settings/assignment");
  return {
    ok: true,
    message: `Đã lưu: gọi trong ${parsed.data.slaMinutes} phút, tối đa ${parsed.data.maxUncontacted} lead chưa gọi`,
  };
}

export async function saveMarket(
  input: Omit<z.infer<typeof marketSchema>, "allowedChannels"> & { allowedChannels: string[] },
): Promise<ActionResult> {
  const user = await requireWritable("settings.assignment");
  const parsed = marketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const m = parsed.data;
  if (m.countryCode === "VN" && !m.isActive)
    return {
      ok: false,
      message: "Không tắt được thị trường Việt Nam: mọi số trong nước dùng thị trường này.",
    };
  const row = {
    name: m.name,
    timezone: m.timezone,
    call_windows: m.callWindows.map((w) => ({ ...w, days: [...new Set(w.days)].sort() })),
    allowed_channels: m.allowedChannels,
    is_active: m.isActive,
  };
  const supabase = await createClient();
  const { error } = m.id
    ? await supabase.from("markets").update(row).eq("id", m.id)
    : await supabase
        .from("markets")
        .insert({ ...row, country_code: m.countryCode, showroom_id: user.showroomId, created_by: user.id });
  if (error)
    return {
      ok: false,
      message: error.code === "23505" ? `Đã có thị trường mã ${m.countryCode}.` : "Chưa lưu được thị trường.",
    };
  revalidatePath("/settings/markets");
  return { ok: true, message: m.id ? `Đã lưu ${m.name}` : `Đã thêm thị trường ${m.name}` };
}

export async function saveCatalogItem(input: z.infer<typeof catalogItemSchema>): Promise<ActionResult> {
  const user = await requireWritable("catalog.manage");
  const parsed = catalogItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Nhãn cần từ 1 đến 80 ký tự." };
  const { table, id, label, isActive } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from(table).update({ label, is_active: isActive }).eq("id", id);
    if (error) return { ok: false, message: "Chưa lưu được mục này." };
  } else {
    const { data: rows } = await supabase.from(table).select("key, label, sort");
    if (rows?.some((r) => r.label.toLowerCase() === label.toLowerCase()))
      return { ok: false, message: `${CATALOGS[table]} đã có "${label}".` };
    const { error } = await supabase.from(table).insert({
      showroom_id: user.showroomId,
      key: catalogKey(label, new Set((rows ?? []).map((r) => r.key))),
      label,
      sort: Math.max(0, ...(rows ?? []).map((r) => r.sort)) + 1,
      created_by: user.id,
    });
    if (error) return { ok: false, message: "Chưa thêm được mục này." };
  }
  revalidatePath("/settings/catalog");
  return {
    ok: true,
    message: id
      ? isActive
        ? `Đã lưu ${label}`
        : `Đã ẩn ${label}`
      : `Đã thêm ${label} vào ${CATALOGS[table]}`,
  };
}

/** Đổi thứ tự: đổi chỗ với mục liền trên hoặc liền dưới. */
export async function moveCatalogItem(input: {
  table: CatalogTable;
  id: string;
  dir: "up" | "down";
}): Promise<ActionResult> {
  await requireWritable("catalog.manage");
  const { table, id, dir } = z
    .object({
      table: catalogItemSchema.shape.table,
      id: z.uuid(),
      dir: z.enum(["up", "down"]),
    })
    .parse(input);
  const supabase = await createClient();
  const { data: rows } = await supabase.from(table).select("id, sort").order("sort").order("label");
  const list = rows ?? [];
  const i = list.findIndex((r) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true, message: "Đã ở đầu hoặc cuối danh sách" };
  // Đánh lại số thứ tự liên tục rồi đổi chỗ hai mục, để thứ tự cũ bị trùng cũng sửa được.
  const order = list.map((r) => r.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [k, rid] of order.entries()) {
    const want = k + 1;
    if (list.find((r) => r.id === rid)?.sort !== want) {
      const { error } = await supabase.from(table).update({ sort: want }).eq("id", rid);
      if (error) return { ok: false, message: "Chưa đổi được thứ tự." };
    }
  }
  revalidatePath("/settings/catalog");
  return { ok: true, message: "Đã đổi thứ tự" };
}
