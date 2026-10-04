import type { Metadata } from "next";

import { MarketTag } from "@/components/market-tag";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: "Trang chủ · Đại Việt CRM" };

const STAGE_LABEL: Record<string, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  demo: "Demo, video call",
  quoted: "Báo giá",
  deposit: "Đặt cọc",
  won: "Thành công",
  lost: "Thất bại",
};

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const teamView = user.permissions.has("lead.view_all");

  let query = supabase
    .from("leads")
    .select(
      "id, stage, source, sla_due_at, first_contact_at, assigned_to, window_wait_until, contacts!leads_contact_id_fkey(full_name, country_of_residence), profiles(full_name)",
    )
    .not("stage", "in", "(won,lost)")
    .order("sla_due_at", { ascending: true, nullsFirst: false })
    .limit(50);
  if (!teamView) query = query.eq("assigned_to", user.id);
  const [{ data: leads }, { data: markets }] = await Promise.all([
    query,
    supabase.from("markets").select("country_code, name, color_token").eq("is_active", true),
  ]);

  const rows = leads ?? [];
  const { overdue, unassigned, fresh } = summarize(rows, new Date());

  return (
    <main className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>{teamView ? "Đội hôm nay" : "Việc của tôi hôm nay"}</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Lead đang mở" value={rows.length} />
          <Metric label="Lead mới" value={fresh} />
          <Metric label="Quá hạn" value={overdue} tone={overdue ? "err" : undefined} />
          {teamView ? (
            <Metric label="Chưa phân" value={unassigned} tone={unassigned ? "warn" : undefined} />
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{teamView ? "Lead đang mở của showroom" : "Hàng chờ gọi"}</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <CardBody className="text-text-weak">
            Chưa có lead nào chờ gọi. Lead mới sẽ hiện ở đây ngay khi được giao cho anh chị.
          </CardBody>
        ) : (
          <ul>
            {rows.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 px-[14px] py-2 last:border-0"
              >
                <span className="font-semibold">{l.contacts?.full_name}</span>
                <MarketTag code={l.contacts?.country_of_residence ?? "unknown"} markets={markets ?? []} />
                <Pill>{STAGE_LABEL[l.stage] ?? l.stage}</Pill>
                {teamView ? (
                  <span className="text-label text-text-weak">
                    {l.profiles?.full_name ? `Giao cho ${l.profiles.full_name}` : "Chưa phân"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "err" | "warn" }) {
  return (
    <div>
      <p className="text-label text-text-weak">{label}</p>
      <p
        className={`tabular text-metric font-light ${tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function summarize(
  rows: {
    stage: string;
    assigned_to: string | null;
    first_contact_at: string | null;
    sla_due_at: string | null;
  }[],
  now: Date,
) {
  return {
    overdue: rows.filter(
      (l) => !l.first_contact_at && l.sla_due_at && Date.parse(l.sla_due_at) < now.getTime(),
    ).length,
    unassigned: rows.filter((l) => !l.assigned_to).length,
    fresh: rows.filter((l) => l.stage === "new").length,
  };
}
