import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { maskPhonesInText } from "@/lib/phone";

import type { QuoteResult } from "./pricing";

// Dữ liệu đầy đủ của một báo giá để vẽ ảnh gửi khách: người đặt, người nhận, địa chỉ giao, dòng hàng (mã, đơn giá,
// giảm, bảo hành, lắp đặt), phí, cọc, phần còn lại, ưu đãi, chính sách, chuyển khoản. Không có số điện thoại đầy đủ,
// tên nhân viên, giá vốn hay ghi chú nội bộ (CLAUDE.md mục 5, 8.6). Gọi bằng client service_role sau khi đã kiểm người
// xem được báo giá.

type Db = SupabaseClient<Database>;

export interface QuoteView {
  code: string;
  showroom: string;
  status: string;
  issuedAt: Date;
  validUntil: Date;
  buyer: string;
  recipient: string | null;
  address: string | null;
  occasion: string | null;
  giftMessage: string | null;
  lines: {
    name: string;
    sku: string | null;
    qty: number;
    unitPrice: number;
    discount: number;
    total: number;
    isGift: boolean;
    combo: string | null;
    warrantyMonths: number | null;
    installation: boolean;
  }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  installationFee: number;
  total: number;
  depositMin: number;
  holdDays: number;
  promotions: string[];
  delivery: string[];
  notes: { name: string; text: string }[];
  bankInfo: string | null;
  orderCode: string | null;
}

export async function loadQuoteView(admin: Db, quoteId: string): Promise<QuoteView | null> {
  const { data: q } = await admin
    .from("quotes")
    .select(
      "id, code, status, valid_until, sent_at, created_at, pricing, total, deposit_min, gift_message, ship_province, showroom_id, lead_id, buyer_contact_id, recipient_contact_id, address_id, order_id, showrooms(name)",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) return null;
  const pricing = q.pricing as unknown as QuoteResult;
  const variantIds = [...new Set(pricing.lines.map((l) => l.variantId))];
  const comboIds = [...new Set(pricing.lines.map((l) => l.comboId).filter((x): x is string => Boolean(x)))];
  const [settings, notes, variants, combos, people, addr, lead, order] = await Promise.all([
    admin.from("sales_settings").select("bank_info").eq("showroom_id", q.showroom_id).maybeSingle(),
    admin
      .from("policies")
      .select("type, name, rules")
      .eq("showroom_id", q.showroom_id)
      .eq("is_current", true)
      .eq("status", "active")
      .in("type", ["payment", "warranty", "return"]),
    admin
      .from("product_variants")
      .select("id, sku, products(warranty_months, requires_installation)")
      .in("id", variantIds),
    comboIds.length
      ? admin.from("combos").select("id, name").in("id", comboIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin
      .from("contacts")
      .select("id, full_name, relation_in_household")
      .in(
        "id",
        [q.buyer_contact_id, q.recipient_contact_id].filter((x): x is string => Boolean(x)),
      ),
    q.address_id
      ? admin
          .from("contact_addresses")
          .select("receiver, street, ward, district, province")
          .eq("id", q.address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("leads").select("occasion_date, occasions(label)").eq("id", q.lead_id).maybeSingle(),
    q.order_id
      ? admin.from("orders").select("code").eq("id", q.order_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const variantOf = new Map((variants.data ?? []).map((v) => [v.id, v]));
  const comboName = new Map((combos.data ?? []).map((c) => [c.id, c.name]));
  const buyer = people.data?.find((p) => p.id === q.buyer_contact_id);
  const rc =
    q.recipient_contact_id && q.recipient_contact_id !== q.buyer_contact_id
      ? people.data?.find((p) => p.id === q.recipient_contact_id)
      : null;
  const a = addr.data;
  const address = a
    ? [
        a.receiver ? `${a.receiver}:` : null,
        [a.street, a.ward, a.district, a.province].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join(" ")
    : q.ship_province;
  const occ = lead.data?.occasions?.label ?? null;
  const occDate = lead.data?.occasion_date
    ? new Date(lead.data.occasion_date).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : null;

  return {
    code: q.code,
    showroom: q.showrooms?.name ?? "Showroom Đại Việt",
    status: q.status,
    issuedAt: new Date(q.sent_at ?? q.created_at),
    validUntil: new Date(q.valid_until),
    buyer: buyer?.full_name ?? "Quý khách",
    recipient: rc
      ? `${rc.full_name}${rc.relation_in_household ? ` (${rc.relation_in_household})` : ""}`
      : null,
    address: address ? maskPhonesInText(address) : null,
    occasion: occ ? (occDate ? `${occ}, ngày ${occDate}` : occ) : null,
    giftMessage: q.gift_message,
    lines: pricing.lines.map((l) => {
      const v = variantOf.get(l.variantId);
      return {
        name: l.name,
        sku: v?.sku ?? null,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discount: l.discount,
        total: l.isGift ? 0 : l.total,
        isGift: l.isGift,
        combo: l.comboId ? (comboName.get(l.comboId) ?? null) : null,
        warrantyMonths: v?.products?.warranty_months ?? null,
        installation: Boolean(v?.products?.requires_installation),
      };
    }),
    subtotal: pricing.totals.subtotal,
    discount: pricing.totals.discount,
    deliveryFee: pricing.fees.delivery,
    installationFee: pricing.fees.installation,
    total: q.total,
    depositMin: q.deposit_min,
    holdDays: pricing.deposit?.holdDays ?? 0,
    promotions: (pricing.appliedPolicies ?? [])
      .filter((p) => p.type === "promotion")
      .map((p) => (p.benefit ? `${p.name}: ${p.benefit}` : p.name)),
    delivery: (pricing.appliedPolicies ?? [])
      .filter((p) => p.type === "delivery")
      .map((p) => p.benefit || p.name),
    notes: (notes.data ?? [])
      .map((n) => ({ name: n.name, text: String((n.rules as { text?: string })?.text ?? "").trim() }))
      .filter((n) => n.text),
    bankInfo: settings.data?.bank_info?.trim() || null,
    orderCode: order.data?.code ?? null,
  };
}
