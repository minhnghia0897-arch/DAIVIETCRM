"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/db/server";

const schema = z.object({ email: z.email(), password: z.string().min(1) });

export interface LoginState {
  error?: string;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Nhập email và mật khẩu để đăng nhập." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email hoặc mật khẩu chưa đúng. Kiểm tra lại rồi đăng nhập." };
  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  // Chỉ thoát trên thiết bị này; thu hồi mọi phiên là việc của thao tác khóa người dùng.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
