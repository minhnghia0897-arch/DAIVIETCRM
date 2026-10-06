import type { Metadata } from "next";

import { CrmTasks, type LiveApproval, type LiveTask } from "@/components/crm/views/tasks";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { APPROVAL_TYPE_LABEL, dueGroup, formatDue } from "@/lib/tasks/view";

import { decideApproval, taskAction } from "./actions";

export const metadata: Metadata = { title: "Việc cần làm · Đại Việt CRM" };

// Việc và hàng chờ duyệt đọc từ database dưới phiên người đang đăng nhập: RLS chỉ trả việc giao cho mình (hoặc mọi
// việc khi có lead.view_all) và đề xuất mình có quyền duyệt hoặc do mình gửi.
export default async function Page() {
  const user = await requireAnyPermission(["lead.view_own", "lead.view_all"]);
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();

  const [{ data: open }, { data: closed }, { data: approvals }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, type, title, lead_id, due_at, priority, status, outcome, source, assigned_to, profiles(full_name)",
      )
      .eq("status", "open")
      .order("due_at")
      .limit(300),
    supabase
      .from("tasks")
      .select(
        "id, type, title, lead_id, due_at, priority, status, outcome, source, assigned_to, profiles(full_name)",
      )
      .neq("status", "open")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("approvals")
      .select("id, type, reason, requested_by, requested_by_type, created_at")
      .eq("status", "pending")
      .order("created_at"),
  ]);

  // Tên người đề xuất (requested_by không có khóa ngoại vì có thể là agent AI).
  const requesterIds = [...new Set((approvals ?? []).map((a) => a.requested_by).filter(Boolean))] as string[];
  const { data: requesters } = requesterIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", requesterIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((requesters ?? []).map((p) => [p.id, p.full_name]));

  const toLive = (t: NonNullable<typeof open>[number]): LiveTask => ({
    id: t.id,
    type: t.type,
    title: t.title,
    href: t.lead_id ? `/leads/${t.lead_id}` : null,
    ownerName: t.profiles?.full_name ?? "",
    mine: t.assigned_to === user.id,
    shared: t.assigned_to === null,
    group: dueGroup(t.due_at, now),
    dueLabel: formatDue(t.due_at, now),
    high: t.priority === 1,
    status: t.status as LiveTask["status"],
    outcome: t.outcome,
    source: t.source as LiveTask["source"],
  });

  const isOwner = user.permissions.has("settings.permissions");
  const liveApprovals: LiveApproval[] = (approvals ?? []).map((a) => ({
    id: a.id,
    title: APPROVAL_TYPE_LABEL[a.type] ?? a.type,
    reason: a.reason ?? "",
    requestedBy:
      a.requested_by_type === "ai" ? "Agent AI" : (nameOf.get(a.requested_by ?? "") ?? "Không rõ người gửi"),
    mine: a.requested_by === user.id,
  }));

  return (
    <CrmTasks
      live={{
        tasks: [...(open ?? []), ...(closed ?? [])].map(toLive),
        // Người đề xuất không tự duyệt được, trừ Owner (CLAUDE.md mục 4, approvals).
        toApprove: liveApprovals.filter((a) => !a.mine || isOwner),
        waiting: liveApprovals.filter((a) => a.mine),
        taskAction,
        decideApproval,
      }}
    />
  );
}
