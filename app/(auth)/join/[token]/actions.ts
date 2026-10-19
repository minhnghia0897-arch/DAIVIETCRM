"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { hashInviteToken, isInviteToken } from "@/lib/auth/invite-token";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";

export interface JoinState {
  error?: string;
}

const GONE =
  "Link mời này không còn dùng được (đã dùng, đã hủy hoặc hết hạn). Nhờ quản lý showroom gửi link mới.";

const schema = z
  .object({
    token: z.string().refine(isInviteToken),
    fullName: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
    password: z.string().min(10).max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

const FIELD_ERROR: Record<string, string> = {
  token: GONE,
  fullName: "Nhập họ tên của anh chị (ít nhất 2 ký tự).",
  email: "Nhập email đúng định dạng, ví dụ ten@gmail.com.",
  password: "Mật khẩu cần từ 10 đến 72 ký tự.",
  confirm: "Hai lần nhập mật khẩu chưa giống nhau.",
};

/**
 * Người được mời tự tạo tài khoản từ link mời theo vị trí: tài khoản của chính họ (email, mật khẩu họ tự đặt), vai
 * trò lấy từ link, vào làm ngay (Owner chốt 19/10/2026). Link dùng được một lần: giữ link bằng một câu UPDATE có
 * điều kiện nên hai người mở cùng lúc thì chỉ một người tạo được.
 */
export async function joinWithInvite(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: FIELD_ERROR[String(parsed.error.issues[0]?.path[0])] ?? GONE };
  const { token, fullName, email, password } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user: current },
  } = await supabase.auth.getUser();
  if (current)
    return {
      error: "Thiết bị này đang đăng nhập tài khoản khác. Tải lại trang, đăng xuất rồi tạo tài khoản.",
    };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: invite } = await admin
    .from("invite_links")
    .update({ used_at: now })
    .eq("token_hash", hashInviteToken(token))
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id, showroom_id, role_id, created_by, roles(name, is_owner)")
    .maybeSingle();
  if (!invite) return { error: GONE };
  const release = async () => {
    await admin.from("invite_links").update({ used_at: null }).eq("id", invite.id);
  };
  if (!invite.roles || invite.roles.is_owner) {
    await release();
    return { error: GONE };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    await release();
    return createError?.code === "email_exists" || /already/i.test(createError?.message ?? "")
      ? {
          error:
            "Email này đã có tài khoản. Đăng nhập ở trang Đăng nhập, quên mật khẩu thì nhờ quản lý tạo link vào CRM.",
        }
      : createError?.code === "weak_password"
        ? { error: "Mật khẩu quá dễ đoán, chọn mật khẩu khác." }
        : { error: "Chưa tạo được tài khoản, thử lại sau ít phút." };
  }
  const newId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: newId,
    showroom_id: invite.showroom_id,
    full_name: fullName,
    role_id: invite.role_id,
    created_by: invite.created_by,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(newId);
    await release();
    return { error: "Chưa tạo được tài khoản, thử lại sau ít phút." };
  }
  await admin.from("invite_links").update({ used_by: newId }).eq("id", invite.id);
  await admin.from("audit_logs").insert({
    showroom_id: invite.showroom_id,
    actor_type: "user",
    actor_id: newId,
    action: "profile.join",
    entity: "profiles",
    entity_id: newId,
    metadata: { role_id: invite.role_id, invite_id: invite.id, invited_by: invite.created_by },
  });
  await admin.from("notifications").insert({
    showroom_id: invite.showroom_id,
    user_id: invite.created_by,
    type: "user_joined",
    title: `${fullName} đã nhận lời mời, vào CRM với vị trí ${invite.roles.name}`,
    link: "/settings/users",
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  redirect(signInError ? "/login" : "/home");
}

/** Thiết bị đang đăng nhập tài khoản khác (thường là Owner mở thử link): đăng xuất rồi mở lại đúng link mời. */
export async function leaveForJoin(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(isInviteToken(token) ? `/join/${token}` : "/login");
}
