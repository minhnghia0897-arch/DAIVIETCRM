import type { Metadata } from "next";

import { OrdersLive, type LiveOrderRow } from "@/components/crm/views/orders-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

// Danh sách đơn thật. RLS trả đơn mình bán (order.view_own), mọi đơn (order.view_all), đơn đang giao (delivery.update)
// hoặc đơn để xác nhận tiền (payment.confirm).
export default async function Page() {
  const user = await requireAnyPermission([
    "order.view_own",
    "order.view_all",
    "delivery.update",
    "payment.confirm",
  ]);
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, code, status, total, paid_amount, created_at, seller_id, is_gift, recipient_contact_id, buyer:contacts!orders_buyer_contact_id_fkey(full_name, country_of_residence), recipient:contacts!orders_recipient_contact_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const list = orders ?? [];
  const ids = list.map((o) => o.id);
  const sellerIds = [...new Set(list.map((o) => o.seller_id).filter((x): x is string => Boolean(x)))];
  const [{ data: pending }, { data: sellers }] = await Promise.all([
    ids.length
      ? supabase
          .from("payments")
          .select("order_id, amount")
          .eq("status", "recorded")
          .neq("type", "refund")
          .in("order_id", ids)
      : Promise.resolve({ data: [] as { order_id: string; amount: number }[] }),
    sellerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", sellerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const rows: LiveOrderRow[] = list.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    buyer: o.buyer?.full_name ?? "Khách",
    buyerMarket: o.buyer?.country_of_residence ?? "unknown",
    recipient: o.is_gift ? (o.recipient?.full_name ?? null) : null,
    self: !o.is_gift,
    total: o.total,
    confirmed: o.paid_amount,
    pending: (pending ?? []).filter((p) => p.order_id === o.id).reduce((s, p) => s + p.amount, 0),
    seller: sellers?.find((s) => s.id === o.seller_id)?.full_name ?? "—",
    createdAt: o.created_at,
  }));

  return <OrdersLive rows={rows} allOrders={user.permissions.has("order.view_all")} />;
}
