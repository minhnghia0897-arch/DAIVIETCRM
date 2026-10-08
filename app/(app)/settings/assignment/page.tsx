import type { Metadata } from "next";

import { AssignmentLive } from "@/components/crm/views/settings-live";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { saveAssignmentRules } from "../config-actions";

export const metadata: Metadata = { title: "Phân lead · Đại Việt CRM" };

// Luật phân lead thật (assignment_rules): hạn gọi lần đầu, giới hạn lead chưa gọi mỗi người.
export default async function Page() {
  const user = await requirePermission("settings.assignment");
  const supabase = await createClient();
  const canSeeDuty = user.permissions.has("attendance.view_team") || user.permissions.has("staff.manage");
  const [{ data: rules }, { data: duty }] = await Promise.all([
    supabase.from("assignment_rules").select("sla_minutes, max_uncontacted_per_person").maybeSingle(),
    canSeeDuty
      ? supabase
          .from("duty_sessions")
          .select("profiles!duty_sessions_user_id_fkey(full_name)")
          .is("ended_at", null)
      : Promise.resolve({ data: null }),
  ]);
  const onDuty = canSeeDuty
    ? (duty ?? []).flatMap((d) => {
        const p = (d as { profiles: { full_name: string } | { full_name: string }[] | null }).profiles;
        return (Array.isArray(p) ? p : p ? [p] : []).map((x) => x.full_name);
      })
    : null;
  return (
    <AssignmentLive
      rules={{
        slaMinutes: rules?.sla_minutes ?? 5,
        maxUncontacted: rules?.max_uncontacted_per_person ?? 10,
      }}
      onDuty={onDuty}
      readOnly={Boolean(user.viewAs)}
      save={saveAssignmentRules}
    />
  );
}
