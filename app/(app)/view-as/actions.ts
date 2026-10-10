"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, VIEW_AS_COOKIE } from "@/lib/db/server";

// "Xem như người dùng" (DESIGN.md 4): mở phiên ở database, giữ mã phiên trong cookie 30 phút.
export async function startViewAs(targetId: string) {
  const supabase = await createClient({ ignoreViewAs: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("showroom_id").eq("id", user.id).single();
  const { data, error } = await supabase
    .from("view_as_sessions")
    .insert({ owner_id: user.id, target_id: z.uuid().parse(targetId), showroom_id: me!.showroom_id })
    .select("id")
    .single();
  if (error || !data) redirect("/settings/users?view_as=denied");

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, data.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 60 });
  redirect("/home");
}

export async function endViewAs() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(VIEW_AS_COOKIE)?.value;
  cookieStore.delete(VIEW_AS_COOKIE);
  if (sessionId) {
    const supabase = await createClient({ ignoreViewAs: true });
    await supabase
      .from("view_as_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
  }
  redirect("/settings/users");
}
