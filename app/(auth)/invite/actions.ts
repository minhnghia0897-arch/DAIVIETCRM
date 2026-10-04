"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/db/server";

const schema = z
  .object({ password: z.string().min(10), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

export interface SetPasswordState {
  error?: string;
}

export async function setPassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const parsed = schema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: "Mật khẩu cần ít nhất 10 ký tự và hai lần nhập phải giống nhau." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error)
    return { error: "Không đặt được mật khẩu vì link đã hết hạn. Nhờ quản lý showroom gửi lại lời mời." };
  redirect("/home");
}
