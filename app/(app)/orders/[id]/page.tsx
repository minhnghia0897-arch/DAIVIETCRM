import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderLive, type LiveOrderDetail } from "@/components/crm/views/order-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { monthShort, orderSalesValue } from "@/lib/sales/credits";

import {
  advanceOrder,
  approveCod,
  cancelOrder,
  issueStock,
  recordPayment,
  recordRefund,
  setBackorder,
  setOrderWarehouse,
  updateDelivery,
} from "../actions";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

// Hồ sơ đơn thật: đọc dưới RLS (đơn không được xem thì không tìm thấy). Ảnh chứng từ mở qua link ký 10 phút, chỉ cấp
// sau khi RLS đã trả đơn cho người đang xem.
export default async function Page({ params }: PageProps<"/orders/[id]">) {
  const user = await requireAnyPermission([
    "order.view_own",
    "order.view_all",
    "delivery.update",
    "payment.confirm",
  ]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select(
      "*, buyer:contacts!orders_buyer_contact_id_fkey(id, full_name, country_of_residence), recipient:contacts!orders_recipient_contact_id_fkey(id, full_name, relation_in_household)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();

  const [items, payments, delivery, warranties, warehouses, blockers, seller, phones, holds, credits] =
    await Promise.all([
      supabase
        .from("order_items")
        .select(
          "id, variant_id, sku, name, qty, unit_price, discount, line_total, is_gift, product_variants(products(track_serial))",
        )
        .eq("order_id", id)
        .order("created_at"),
      supabase
        .from("payments")
        .select(
          "id, type, method, amount, reference, proof_path, status, recorded_by, created_at, decision_note",
        )
        .eq("order_id", id)
        .order("created_at"),
      supabase
        .from("deliveries")
        .select("scheduled_on, crew_note, installed_at, handover_sent_at")
        .eq("order_id", id)
        .maybeSingle(),
      supabase
        .from("warranties")
        .select("code, product_name, serial, ends_on")
        .eq("order_id", id)
        .order("code"),
      supabase
        .from("warehouses")
        .select("id, name, is_display, is_active")
        .eq("is_active", true)
        .order("sort"),
      supabase.rpc("order_blockers", { p_order_id: id }),
      o.seller_id
        ? supabase.from("profiles").select("full_name").eq("id", o.seller_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("contact_identity_display")
        .select("display_masked")
        .eq("contact_id", o.buyer_contact_id)
        .eq("type", "phone")
        .limit(1),
      supabase.from("stock_reservations").select("qty").eq("order_id", id).is("released_at", null),
      // Doanh số của đơn (sổ sales_credits): ai xem được đơn thì thấy đơn được tính bao nhiêu, vào tháng nào.
      supabase.from("sales_credits").select("kind, amount, reason, month").eq("order_id", id),
    ]);

  const itemRows = items.data ?? [];
  const serials = itemRows.length
    ? ((
        await supabase
          .from("serial_units")
          .select("serial, order_item_id")
          .in(
            "order_item_id",
            itemRows.map((i) => i.id),
          )
      ).data ?? [])
    : [];
  // Serial còn trong kho xuất để gợi ý khi xuất kho.
  const tracked = itemRows.filter((i) => i.product_variants?.products?.track_serial);
  const inStock =
    tracked.length && o.warehouse_id
      ? ((
          await supabase
            .from("serial_units")
            .select("serial, variant_id")
            .eq("warehouse_id", o.warehouse_id)
            .eq("status", "in_stock")
            .in(
              "variant_id",
              tracked.map((i) => i.variant_id),
            )
            .limit(200)
        ).data ?? [])
      : [];

  const payRows = payments.data ?? [];
  const recorderIds = [...new Set(payRows.map((p) => p.recorded_by).filter((x): x is string => Boolean(x)))];
  const { data: recorders } = recorderIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", recorderIds)
    : { data: [] as { id: string; full_name: string }[] };
  const proofPaths = payRows.map((p) => p.proof_path).filter((x): x is string => Boolean(x));
  const signed = proofPaths.length
    ? ((await createAdminClient().storage.from("payment-proofs").createSignedUrls(proofPaths, 600)).data ??
      [])
    : [];

  const confirmed = payRows
    .filter((p) => p.status === "confirmed")
    .reduce((s, p) => s + (p.type === "refund" ? -p.amount : p.amount), 0);
  const pending = payRows
    .filter((p) => p.status === "recorded" && p.type !== "refund")
    .reduce((s, p) => s + p.amount, 0);
  const refunded = payRows
    .filter((p) => p.status === "confirmed" && p.type === "refund")
    .reduce((s, p) => s + p.amount, 0);
  const mine = o.seller_id === user.id;
  const can = (p: string) => user.permissions.has(p) && !user.viewAs;

  const data: LiveOrderDetail = {
    id: o.id,
    code: o.code,
    status: o.status,
    channel: o.channel === "inbox" ? "Hội thoại" : (o.channel ?? "—"),
    seller: seller.data?.full_name ?? "—",
    leadId: o.lead_id,
    holdUntil: o.hold_until ? time.format(new Date(o.hold_until)) : null,
    cancelReason: o.cancel_reason,
    buyer: {
      id: o.buyer?.id ?? null,
      name: o.buyer?.full_name ?? "Khách",
      market: o.buyer?.country_of_residence ?? "unknown",
      phone: phones.data?.[0]?.display_masked ?? null,
    },
    self: !o.is_gift,
    recipient: o.recipient
      ? { name: o.recipient.full_name, relation: o.recipient.relation_in_household }
      : null,
    address: [o.ship_receiver, o.ship_street, o.ship_ward, o.ship_district, o.ship_province]
      .filter(Boolean)
      .join(", "),
    keepSurprise: o.keep_surprise,
    giftMessage: o.gift_message,
    note: o.note,
    items: itemRows.map((i) => ({
      id: i.id,
      sku: i.sku,
      name: i.name,
      qty: i.qty,
      lineTotal: i.line_total,
      isGift: i.is_gift,
      trackSerial: Boolean(i.product_variants?.products?.track_serial),
      serials: serials.filter((s) => s.order_item_id === i.id).map((s) => s.serial),
      suggest: inStock.filter((s) => s.variant_id === i.variant_id).map((s) => s.serial),
    })),
    money: {
      subtotal: o.subtotal,
      discount: o.discount,
      fees: o.delivery_fee + o.installation_fee,
      total: o.total,
      confirmed,
      pending,
      depositMin: o.deposit_min ?? 0,
      refundable: Math.max(0, confirmed),
      refunded,
    },
    payments: payRows.map((p) => ({
      id: p.id,
      type: p.type,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      status: p.status,
      by: recorders?.find((r) => r.id === p.recorded_by)?.full_name ?? "—",
      at: time.format(new Date(p.created_at)),
      proofUrl: signed.find((s) => s.path === p.proof_path)?.signedUrl ?? null,
      note: p.decision_note,
    })),
    delivery: {
      scheduledOn: delivery.data?.scheduled_on ?? null,
      note: delivery.data?.crew_note ?? "",
      installedAt: delivery.data?.installed_at ? time.format(new Date(delivery.data.installed_at)) : null,
      handoverSent: Boolean(delivery.data?.handover_sent_at),
      stockIssued: Boolean(o.stock_issued_at),
    },
    warranties: (warranties.data ?? []).map((w) => ({
      code: w.code,
      product: w.product_name,
      serial: w.serial,
      endsOn: w.ends_on,
    })),
    warehouseId: o.warehouse_id,
    warehouses: (warehouses.data ?? []).filter((w) => !w.is_display).map((w) => ({ id: w.id, name: w.name })),
    reservedQty: (holds.data ?? []).reduce((s, h) => s + h.qty, 0),
    sales: {
      value: orderSalesValue(o.subtotal, o.discount),
      credits: (credits.data ?? []).map((c) => ({
        kind: c.kind === "reversal" ? ("reversal" as const) : ("sale" as const),
        amount: c.amount,
        reason: c.reason,
        month: monthShort(c.month),
      })),
    },
    codApproved: Boolean(o.cod_approved_at),
    backorderUntil: o.backorder_until,
    blockers: (blockers.data as string[] | null) ?? [],
    perms: {
      edit: can("order.edit_all") || (can("order.edit_own") && mine),
      delivery: can("delivery.update"),
      post: can("inventory.post"),
      codApprove: can("payment.confirm") && (!mine || user.permissions.has("settings.permissions")),
      backorder: can("order.allow_backorder"),
      cancel: can("order.cancel"),
      record: can("payment.record") && (can("order.edit_all") || (can("order.edit_own") && mine)),
      refund: can("payment.refund"),
    },
  };

  return (
    <OrderLive
      data={data}
      actions={{
        advanceOrder,
        approveCod,
        cancelOrder,
        issueStock,
        recordPayment,
        recordRefund,
        setBackorder,
        setOrderWarehouse,
        updateDelivery,
      }}
    />
  );
}
