import type { Metadata } from "next";

import { AttendanceView } from "@/components/crm/views/attendance";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { vnStartOfToday, vnToday } from "@/lib/team/attendance";

import { addAbsence, cancelAbsence, endDutyFor } from "../duty-actions";

export const metadata: Metadata = { title: "Nghỉ và trực · Đại Việt CRM" };

// Giờ trực thực tế và ngày nghỉ của đội (CLAUDE.md mục 9.2), đọc từ duty_sessions, shifts, absences. RLS chỉ trả
// phiên trực, ngày nghỉ của cả đội cho người có attendance.view_team hoặc staff.manage.
export default async function Page() {
  const user = await requireAnyPermission(["staff.manage", "attendance.view_team"]);
  const supabase = await createClient();
  const now = new Date();
  const today = vnToday(now);
  const [{ data: people }, { data: shifts }, { data: members }, { data: sessions }, { data: absences }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("is_active", true).order("created_at"),
      supabase.from("shifts").select("id, name, days, start_time, end_time").eq("is_active", true),
      supabase.from("shift_members").select("shift_id, user_id"),
      supabase
        .from("duty_sessions")
        .select("id, user_id, started_at, ended_at, end_source")
        .or(`ended_at.is.null,started_at.gte.${vnStartOfToday(now).toISOString()}`)
        .order("started_at", { ascending: false })
        .limit(500),
      supabase
        .from("absences")
        .select("id, user_id, kind, starts_on, ends_on, note")
        .is("deleted_at", null)
        .gte("ends_on", today)
        .order("starts_on")
        .limit(200),
    ]);

  return (
    <AttendanceView
      now={now.toISOString()}
      today={today}
      canManage={user.permissions.has("staff.manage") && !user.viewAs}
      people={(people ?? []).map((p) => ({
        id: p.id,
        name: p.full_name,
        shifts: (shifts ?? [])
          .filter((s) => (members ?? []).some((m) => m.shift_id === s.id && m.user_id === p.id))
          .map((s) => ({
            name: s.name,
            days: s.days,
            start: s.start_time.slice(0, 5),
            end: s.end_time.slice(0, 5),
          })),
      }))}
      sessions={(sessions ?? []).map((s) => ({
        id: s.id,
        userId: s.user_id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        endSource: s.end_source,
      }))}
      absences={(absences ?? []).map((a) => ({
        id: a.id,
        userId: a.user_id,
        kind: a.kind,
        startsOn: a.starts_on,
        endsOn: a.ends_on,
        note: a.note,
      }))}
      actions={{ addAbsence, cancelAbsence, endDutyFor }}
    />
  );
}
