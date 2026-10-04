"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { siteUrl } from "@/lib/db/env";
import { createClient } from "@/lib/db/server";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const permLabel = (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? key;

// ---------------------------------------------------------------------------
// Ma trận vai trò × quyền (DESIGN.md 6.5). RLS và trigger ở database là lớp chặn thật.
// ---------------------------------------------------------------------------

const toggleSchema = z.object({ roleId: z.uuid(), permission: z.string(), on: z.boolean() });

export async function toggleRolePermission(input: z.infer<typeof toggleSchema>): Promise<ActionResult> {
  await requirePermission("settings.permissions");
  const { roleId, permission, on } = toggleSchema.parse(input);
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("name").eq("id", roleId).maybeSingle();

  const { error } = on
    ? await supabase.from("role_permissions").insert({ role_id: roleId, permission_key: permission })
    : await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", permission);
  if (error)
    return {
      ok: false,
      message: "Không đổi được quyền này. Quyền chỉ Owner không cấp được cho vai trò khác.",
    };

  revalidatePath("/settings/permissions");
  return {
    ok: true,
    message: `Đã ${on ? "bật" : "tắt"} ${permLabel(permission)} cho ${role?.name ?? "vai trò"}`,
  };
}

const roleSchema = z.object({ name: z.string().trim().min(2).max(60) });

export async function createRole(input: z.infer<typeof roleSchema>): Promise<ActionResult> {
  const user = await requirePermission("settings.permissions");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Tên vai trò cần từ 2 đến 60 ký tự." };
  const key =
    parsed.data.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "role";

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .insert({ showroom_id: user.showroomId, key, name: parsed.data.name, created_by: user.id });
  if (error) return { ok: false, message: "Không tạo được vai trò. Có thể tên này đã tồn tại." };
  revalidatePath("/settings/permissions");
  return {
    ok: true,
    message: `Đã tạo vai trò ${parsed.data.name}. Mọi quyền đang tắt, bật quyền cần thiết ở bảng dưới.`,
  };
}

// ---------------------------------------------------------------------------
// Người dùng (DESIGN.md 6.5)
// ---------------------------------------------------------------------------

const overrideSchema = z.object({
  userId: z.uuid(),
  permission: z.string(),
  state: z.enum(["role", "grant", "revoke"]),
});

export async function setPermissionOverride(input: z.infer<typeof overrideSchema>): Promise<ActionResult> {
  const user = await requirePermission("settings.permissions");
  const { userId, permission, state } = overrideSchema.parse(input);
  const supabase = await createClient();
  const { error } =
    state === "role"
      ? await supabase
          .from("user_permission_overrides")
          .delete()
          .eq("user_id", userId)
          .eq("permission_key", permission)
      : await supabase
          .from("user_permission_overrides")
          .upsert({ user_id: userId, permission_key: permission, effect: state, set_by: user.id });
  if (error) return { ok: false, message: "Không đổi được quyền riêng này." };
  revalidatePath("/settings/users");
  const verb =
    state === "role" ? "Đã đưa về theo vai trò" : state === "grant" ? "Đã cấp riêng" : "Đã thu riêng";
  return { ok: true, message: `${verb}: ${permLabel(permission)}` };
}

export async function resetOverrides(userId: string): Promise<ActionResult> {
  await requirePermission("settings.permissions");
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", z.uuid().parse(userId));
  if (error) return { ok: false, message: "Không đưa về theo vai trò được." };
  revalidatePath("/settings/users");
  return { ok: true, message: "Đã đưa về theo vai trò" };
}

export async function changeRole(userId: string, roleId: string): Promise<ActionResult> {
  await requirePermission("settings.permissions");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role_id: z.uuid().parse(roleId) })
    .eq("id", z.uuid().parse(userId))
    .select("full_name, roles(name)")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Không đổi được vai trò." };
  revalidatePath("/settings/users");
  return { ok: true, message: `Đã đổi ${data.full_name} sang ${data.roles?.name ?? "vai trò mới"}` };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  await requirePermission("settings.users");
  const id = z.uuid().parse(userId);
  const supabase = await createClient();
  // Trigger ở database trả lead, việc đang mở về hàng chưa phân và ghi kiểm toán trong cùng giao dịch.
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", id)
    .select("full_name")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Không đổi được trạng thái người dùng." };

  // Chặn đăng nhập lại và làm mới phiên. Truy cập dữ liệu đã bị chặn ngay bằng RLS (người bị khóa không có quyền nào).
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });

  revalidatePath("/settings/users");
  return {
    ok: true,
    message: active
      ? `Đã mở khóa ${data.full_name}`
      : `Đã khóa ${data.full_name}. Lead đang mở đã về hàng chưa phân.`,
  };
}

const inviteSchema = z.object({
  email: z.email(),
  fullName: z.string().trim().min(2).max(80),
  roleId: z.uuid(),
});

export async function inviteUser(input: z.infer<typeof inviteSchema>): Promise<ActionResult> {
  const user = await requirePermission("settings.users");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Nhập email đúng định dạng, họ tên và chọn vai trò." };
  const { email, fullName, roleId } = parsed.data;

  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id, is_owner").eq("id", roleId).maybeSingle();
  if (!role || role.is_owner)
    return { ok: false, message: "Chọn một vai trò hợp lệ. Không mời thêm Owner qua màn hình này." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl()}/invite`,
  });
  if (error || !data.user)
    return { ok: false, message: "Không gửi được lời mời. Có thể email này đã có tài khoản." };

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    showroom_id: user.showroomId,
    full_name: fullName,
    role_id: roleId,
    created_by: user.id,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, message: "Không tạo được hồ sơ người dùng. Lời mời đã được hủy." };
  }
  await admin.from("audit_logs").insert({
    showroom_id: user.showroomId,
    actor_type: "user",
    actor_id: user.id,
    action: "profile.invite",
    entity: "profiles",
    entity_id: data.user.id,
    metadata: { role_id: roleId },
  });

  revalidatePath("/settings/users");
  return { ok: true, message: `Đã gửi lời mời tới ${email}` };
}
