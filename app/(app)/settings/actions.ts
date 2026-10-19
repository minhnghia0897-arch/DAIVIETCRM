"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { INVITE_LINK_DAYS, hashInviteToken, newInviteToken } from "@/lib/auth/invite-token";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireWritable as requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { siteUrl } from "@/lib/db/env";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "./types";

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

export type InviteLinkResult = { ok: true; message: string; link: string } | { ok: false; message: string };

// Địa chỉ CRM người mời đang mở (Vercel gửi tên miền thật qua x-forwarded-host); thiếu thì lấy NEXT_PUBLIC_SITE_URL.
async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteUrl();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

// Link một lần, mở ra là vào màn Đặt mật khẩu (/auth/confirm kiểm mã ở máy chủ rồi chuyển sang /invite). Không gửi
// email: chưa có SMTP riêng thì Supabase chỉ gửi thư cho thành viên nhóm dự án, nên người mời tự gửi link qua Zalo,
// Telegram. Link là bí mật đăng nhập: không ghi vào nhật ký, không lưu ở đâu.
const confirmLink = (origin: string, type: "invite" | "recovery", hashedToken: string) =>
  `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=/invite`;

const inviteLinkSchema = z.object({
  roleId: z.uuid(),
  note: z.string().trim().max(120).optional(),
});

/**
 * Link mời theo vị trí (Owner chốt 19/10/2026): người nhận mở /join/<mã>, tự nhập họ tên, email, mật khẩu và vào làm
 * ngay với quyền của vị trí. Một link cho một người, hết hạn sau 7 ngày. Database chỉ giữ mã băm; link đầy đủ chỉ
 * trả về một lần ở đây, không ghi nhật ký.
 */
export async function createInviteLink(input: z.infer<typeof inviteLinkSchema>): Promise<InviteLinkResult> {
  const user = await requirePermission("settings.users");
  const parsed = inviteLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Chọn vị trí để tạo link mời." };
  const { roleId, note } = parsed.data;

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id, name, is_owner")
    .eq("id", roleId)
    .maybeSingle();
  if (!role || role.is_owner)
    return { ok: false, message: "Chọn một vị trí hợp lệ. Không mời thêm Owner qua link." };

  const token = newInviteToken();
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("invite_links")
    .insert({
      showroom_id: user.showroomId,
      role_id: role.id,
      token_hash: hashInviteToken(token),
      note: note || null,
      expires_at: new Date(Date.now() + INVITE_LINK_DAYS * 24 * 3600_000).toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !invite) return { ok: false, message: "Chưa tạo được link mời, thử lại sau ít phút." };
  await admin.from("audit_logs").insert({
    showroom_id: user.showroomId,
    actor_type: "user",
    actor_id: user.id,
    action: "invite_link.create",
    entity: "invite_links",
    entity_id: invite.id,
    metadata: { role_id: role.id },
  });

  revalidatePath("/settings/users");
  return {
    ok: true,
    message: `Đã tạo link mời vị trí ${role.name}`,
    link: `${await appOrigin()}/join/${token}`,
  };
}

/** Hủy link mời chưa dùng (gửi nhầm người, người đó không vào làm nữa). */
export async function revokeInviteLink(inviteId: string): Promise<ActionResult> {
  const user = await requirePermission("settings.users");
  const id = z.uuid().safeParse(inviteId);
  if (!id.success) return { ok: false, message: "Không tìm thấy link mời." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("invite_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq("id", id.data)
    .eq("showroom_id", user.showroomId)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, message: "Link này đã được dùng hoặc đã hủy." };
  await admin.from("audit_logs").insert({
    showroom_id: user.showroomId,
    actor_type: "user",
    actor_id: user.id,
    action: "invite_link.revoke",
    entity: "invite_links",
    entity_id: data.id,
    metadata: {},
  });
  revalidatePath("/settings/users");
  return { ok: true, message: "Đã hủy link mời. Người có link không tạo được tài khoản nữa." };
}

/**
 * Link vào CRM cho người đã có tài khoản: chưa nhận lời mời thì là link mời mới, đã vào rồi thì là link đặt lại mật
 * khẩu (thay cho email Quên mật khẩu khi chưa có SMTP). Không dùng cho Owner và cho chính mình.
 */
export async function issueLoginLink(userId: string): Promise<InviteLinkResult> {
  const user = await requirePermission("settings.users");
  const id = z.uuid().safeParse(userId);
  if (!id.success || id.data === user.id) return { ok: false, message: "Không tạo được link cho người này." };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, is_active, roles(is_owner)")
    .eq("id", id.data)
    .maybeSingle();
  if (!target || target.roles?.is_owner) return { ok: false, message: "Không tạo được link cho người này." };
  if (!target.is_active)
    return { ok: false, message: `${target.full_name} đang bị khóa. Mở khóa trước rồi tạo link.` };

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(id.data);
  const email = authUser.user?.email;
  if (!email) return { ok: false, message: "Tài khoản này chưa có email, không tạo được link." };
  const type = authUser.user?.email_confirmed_at ? "recovery" : "invite";
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data.properties?.hashed_token)
    return { ok: false, message: "Chưa tạo được link, thử lại sau ít phút." };

  await admin.from("audit_logs").insert({
    showroom_id: user.showroomId,
    actor_type: "user",
    actor_id: user.id,
    action: "profile.login_link",
    entity: "profiles",
    entity_id: id.data,
    metadata: { type },
  });
  return {
    ok: true,
    message:
      type === "invite"
        ? `Đã tạo link mời mới cho ${target.full_name}`
        : `Đã tạo link đặt lại mật khẩu cho ${target.full_name}`,
    link: confirmLink(await appOrigin(), type, data.properties.hashed_token),
  };
}
