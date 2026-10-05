import type { Metadata } from "next";

import { AuditLogView } from "@/components/crm/views/settings";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: "Nhật ký kiểm toán · Đại Việt CRM" };

const ACTION_LABEL: Record<string, string> = {
  "role_permission.grant": "Bật quyền cho vai trò",
  "role_permission.revoke": "Tắt quyền của vai trò",
  "user_permission.insert": "Đặt quyền riêng cho người dùng",
  "user_permission.update": "Đổi quyền riêng của người dùng",
  "user_permission.delete": "Bỏ quyền riêng của người dùng",
  "profile.invite": "Mời người dùng",
  "profile.lock": "Khóa người dùng",
  "profile.unlock": "Mở khóa người dùng",
  "profile.role_change": "Đổi vai trò",
  "view_as.start": "Bắt đầu xem như người dùng",
  "view_as.end": "Kết thúc xem như người dùng",
};

const fmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "short",
  timeStyle: "short",
});

/** Chi tiết đọc được từ metadata; không bao giờ chứa số điện thoại hay nội dung tin nhắn (CLAUDE.md mục 4). */
function detail(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  return Object.entries(meta as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

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
          <h2>Phân quyền và người dùng</h2>
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
                  <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="whitespace-normal c-lbl">{detail(r.metadata)}</td>
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
