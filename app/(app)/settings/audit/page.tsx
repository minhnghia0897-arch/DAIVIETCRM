import type { Metadata } from "next";

import { AuditLogView } from "@/components/crm/views/settings";
import { auditActionLabel, auditDetail } from "@/lib/audit/describe";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { integrations } from "@/lib/integrations/registry";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: "Nhật ký kiểm toán · Đại Việt CRM" };

const fmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "short",
  timeStyle: "short",
});

const permLabel = (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? "Quyền khác";
const integrationLabel = (key: string) => integrations.find((i) => i.key === key)?.name ?? "Đấu nối khác";

// Nhật ký thật đọc từ bảng audit_logs (RLS chỉ cho người có audit.view); bên dưới là nhật ký của các màn
// đang chạy dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requirePermission("audit.view");
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("audit_logs")
    .select("id, at, actor_type, actor_id, action, entity, metadata")
    .order("at", { ascending: false })
    .limit(200);
  const ids = [...new Set((rows ?? []).map((r) => r.actor_id).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const name = (id: string | null, type: string) =>
    people?.find((p) => p.id === id)?.full_name ?? (type === "system" ? "Hệ thống" : "Không rõ");

  return (
    <div className="c-stack">
      <section className="c-card" aria-label="Nhật ký kiểm toán phân quyền và người dùng">
        <div className="c-ch">
          <h2>Thao tác đã ghi</h2>
          <span className="c-r c-lbl">200 thao tác gần nhất · không sửa, không xóa được</span>
        </div>
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người</th>
                <th>Hành động</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="c-empty">
                    Chưa có thao tác nào được ghi.
                  </td>
                </tr>
              ) : null}
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="tabular">{fmt.format(new Date(r.at))}</td>
                  <td>{name(r.actor_id, r.actor_type)}</td>
                  <td>{auditActionLabel(r.action)}</td>
                  <td className="whitespace-normal c-lbl">
                    {auditDetail(r.metadata, { permission: permLabel, integration: integrationLabel })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <AuditLogView />
    </div>
  );
}
