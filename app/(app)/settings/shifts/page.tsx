import type { Metadata } from "next";

import { ShiftEditor } from "@/components/crm/views/shift-editor";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { saveShift, setShiftMember } from "../../team/duty-actions";

export const metadata: Metadata = { title: "Ca trực · Đại Việt CRM" };

// Lịch ca thật (shifts, shift_members; CLAUDE.md mục 7). Giờ ca theo giờ Việt Nam.
export default async function Page() {
  const user = await requirePermission("settings.assignment");
  const supabase = await createClient();
  const [{ data: shifts }, { data: members }, { data: people }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, name, days, start_time, end_time, is_active")
      .order("sort")
      .order("created_at"),
    supabase.from("shift_members").select("shift_id, user_id"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("created_at"),
  ]);
  return (
    <ShiftEditor
      readOnly={Boolean(user.viewAs)}
      shifts={(shifts ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        days: s.days,
        start: s.start_time.slice(0, 5),
        end: s.end_time.slice(0, 5),
        isActive: s.is_active,
        members: (members ?? []).filter((m) => m.shift_id === s.id).map((m) => m.user_id),
      }))}
      people={(people ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
      actions={{ saveShift, setShiftMember }}
    />
  );
}
