import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { type PersonCredit, SalesPersonView } from "@/components/crm/views/sales-kpi";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { formatDateTime } from "@/lib/format";
import { currentMonth, parseMonth, shiftMonth } from "@/lib/sales/credits";

export const metadata: Metadata = { title: "Hiệu suất · Đại Việt CRM" };

// Hiệu suất một người: doanh số đã cọc trong tháng, từng đơn được tính, chỉ tiêu, 6 tháng gần nhất. Ai xem được
// người nào do database quyết (can_view_sales_of, RLS của sales_credits, targets); bảng xếp hạng tắt thì chỉ mở được
// trang của chính mình (nghiệm thu tuần 7).
export default async function Page({ params, searchParams }: PageProps<"/team/people/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const self = id === user.id;
  if (!self && !user.permissions.has("kpi.leaderboard")) notFound();
  const month = parseMonth((await searchParams).thang);
  const from = shiftMonth(month, -5);
  const supabase = await createClient();

  const [{ data: visible }, { data: profile }, { data: credits }, { data: targets }] = await Promise.all([
    supabase.rpc("can_view_sales_of", { p_user: id }),
    supabase.from("profiles").select("id, full_name").eq("id", id).maybeSingle(),
    supabase
      .from("sales_credits")
      .select("id, order_id, kind, amount, reason, credited_at, month")
      .eq("seller_id", id)
      .gte("month", from)
      .lte("month", month)
      .order("credited_at", { ascending: false })
      .limit(1000),
    supabase
      .from("targets")
      .select("period_start, target_value")
      .eq("user_id", id)
      .eq("period", "month")
      .eq("metric_key", "revenue_deposit")
      .gte("period_start", from)
      .lte("period_start", month),
  ]);
  if (!visible || !profile) notFound();

  const all = credits ?? [];
  const inMonth = all.filter((c) => c.month === month);
  const orderIds = [...new Set(inMonth.map((c) => c.order_id))];
  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("id, code, status, buyer:contacts!orders_buyer_contact_id_fkey(full_name)")
        .in("id", orderIds)
    : { data: [] };

  const targetOf = (m: string) => targets?.find((t) => t.period_start === m)?.target_value ?? null;
  const sum = (rows: typeof all) => rows.reduce((s, c) => s + c.amount, 0);
  const rows: PersonCredit[] = inMonth.map((c) => {
    const o = orders?.find((x) => x.id === c.order_id);
    return {
      id: c.id,
      orderId: c.order_id,
      code: o?.code ?? null,
      customer: o?.buyer?.full_name ?? null,
      status: o?.status ?? null,
      kind: c.kind === "reversal" ? "reversal" : "sale",
      amount: c.amount,
      reason: c.reason,
      at: formatDateTime(c.credited_at),
    };
  });
  const history = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -i)).map((m) => ({
    month: m,
    net: sum(all.filter((c) => c.month === m)),
    target: targetOf(m),
  }));

  return (
    <SalesPersonView
      month={month}
      current={currentMonth()}
      self={self}
      name={profile.full_name}
      row={{
        user_id: id,
        full_name: profile.full_name,
        sold: sum(inMonth.filter((c) => c.kind === "sale")),
        reversed: sum(inMonth.filter((c) => c.kind === "reversal")),
        net: sum(inMonth),
        orders: inMonth.filter((c) => c.kind === "sale").length,
        target: targetOf(month),
      }}
      credits={rows}
      history={history}
      canSetTarget={user.permissions.has("target.manage") && !user.viewAs}
    />
  );
}
