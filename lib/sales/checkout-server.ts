import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/types";
import { createClient } from "@/lib/db/server";

import { loadCatalog } from "./catalog-server";
import { toPersistPayload, toQuoteInput, type Cart } from "./checkout";
import { priceQuote, type QuoteResult } from "./pricing";

// Định giá rồi ghi đơn, báo giá (CLAUDE.md 8.1, 8.5, 8.6). Lead được đọc dưới quyền người dùng (RLS) trước; định giá
// trên dữ liệu database; ghi bằng persist_* (service_role) với người thao tác là người dùng, database kiểm lại quyền.

export type CheckoutError =
  | "lead_not_found"
  | "missing_required_info"
  | "address_required"
  | "lead_lost"
  | "not_allowed"
  | "invalid"
  | "quote_closed"
  | "quote_changed"
  | "failed";

export interface CheckoutInput {
  leadId: string;
  cart: Cart;
  addressId: string | null;
  giftMessage?: string;
  note?: string;
}

const KNOWN: CheckoutError[] = ["missing_required_info", "address_required", "lead_lost", "quote_closed"];

function mapError(e: { code?: string; message?: string } | null): CheckoutError {
  const key = (e?.message ?? "").split(":")[0].trim();
  if ((KNOWN as string[]).includes(key)) return key as CheckoutError;
  if (e?.code === "42501") return "not_allowed";
  if (e?.code === "P0002") return "lead_not_found";
  if (e?.code === "22023") return "invalid";
  return "failed";
}

/** Bối cảnh định giá của một lead: thị trường người đặt, thẻ khách, tỉnh người nhận. */
export async function contextOf(leadId: string, addressId: string | null) {
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select(
      "id, showroom_id, source, recipient_province, contact_id, contacts!leads_contact_id_fkey(country_of_residence, lifecycle_stage)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;
  const [{ data: tags }, { data: addr }] = await Promise.all([
    admin.from("contact_tags").select("tags(label)").eq("contact_id", lead.contact_id),
    addressId
      ? admin.from("contact_addresses").select("province").eq("id", addressId).maybeSingle()
      : Promise.resolve({ data: null as { province: string } | null }),
  ]);
  const customerTags = [
    ...(tags ?? []).map((t) => t.tags?.label).filter((x): x is string => Boolean(x)),
    lead.contacts?.lifecycle_stage ?? "",
    lead.source === "referral" ? "referral" : "",
  ].filter(Boolean);
  return {
    showroomId: lead.showroom_id,
    buyerCountry: lead.contacts?.country_of_residence ?? "unknown",
    customerTags,
    recipientProvince: addr?.province ?? lead.recipient_province ?? undefined,
  };
}

async function price(
  input: CheckoutInput,
  seller: { id: string; roleKey: string },
  channel = "online",
): Promise<{ ok: true; result: QuoteResult; showroomId: string } | { ok: false; error: CheckoutError }> {
  const ctx = await contextOf(input.leadId, input.addressId);
  if (!ctx) return { ok: false, error: "lead_not_found" };
  const { catalog } = await loadCatalog(createAdminClient(), ctx.showroomId);
  // Quà tặng kèm chỉ lấy từ danh mục Quà tặng.
  if (input.cart.lines.some((l) => l.isGift && !(l.variantId && catalog.variants[l.variantId]?.giftOnly)))
    return { ok: false, error: "invalid" };
  const result = priceQuote(
    toQuoteInput(
      input.cart,
      { ...ctx, channel, date: new Date(), sellerId: seller.id, sellerRole: seller.roleKey },
      catalog,
    ),
    catalog,
  );
  if (!result.lines.length) return { ok: false, error: "invalid" };
  return { ok: true, result, showroomId: ctx.showroomId };
}

export async function placeOrder(
  user: SessionUser,
  input: CheckoutInput,
  extra: { channel?: string; quoteId?: string; byCustomer?: boolean } = {},
): Promise<
  { ok: true; orderId: string; status: string; code: string } | { ok: false; error: CheckoutError }
> {
  // Người dùng phải xem được lead dưới quyền của mình trước khi server định giá giúp.
  const { data: visible } = await (
    await createClient()
  )
    .from("leads")
    .select("id")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!visible) return { ok: false, error: "lead_not_found" };
  if (!input.addressId) return { ok: false, error: "address_required" };
  const priced = await price(
    input,
    { id: user.id, roleKey: user.roleKey },
    extra.channel === "showroom" ? "showroom" : "online",
  );
  if (!priced.ok) return priced;
  return persistOrder(user.id, input, priced.result, extra);
}

async function persistOrder(
  actor: string,
  input: CheckoutInput,
  result: QuoteResult,
  extra: { channel?: string; quoteId?: string; byCustomer?: boolean },
): Promise<
  { ok: true; orderId: string; status: string; code: string } | { ok: false; error: CheckoutError }
> {
  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("persist_priced_order", {
    p_actor: actor,
    p: {
      ...toPersistPayload(result),
      lead_id: input.leadId,
      address_id: input.addressId,
      gift_message: input.giftMessage,
      note: input.note,
      channel: extra.channel ?? "inbox",
      quote_id: extra.quoteId,
      by_customer: extra.byCustomer ?? false,
    } as unknown as Json,
  });
  if (error || !id) return { ok: false, error: mapError(error) };
  const { data: o } = await admin.from("orders").select("code, status").eq("id", id).maybeSingle();
  return { ok: true, orderId: id, status: o?.status ?? "confirmed", code: o?.code ?? "" };
}

export async function sendQuote(
  user: SessionUser,
  input: CheckoutInput,
): Promise<{ ok: true; quoteId: string; token: string; code: string } | { ok: false; error: CheckoutError }> {
  const { data: visible } = await (
    await createClient()
  )
    .from("leads")
    .select("id")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!visible) return { ok: false, error: "lead_not_found" };
  const priced = await price(input, { id: user.id, roleKey: user.roleKey });
  if (!priced.ok) return priced;
  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("persist_quote", {
    p_actor: user.id,
    p: {
      ...toPersistPayload(priced.result),
      lead_id: input.leadId,
      address_id: input.addressId,
      gift_message: input.giftMessage,
      note: input.note,
      input: { cart: input.cart, addressId: input.addressId, giftMessage: input.giftMessage ?? null },
      pricing: priced.result,
    } as unknown as Json,
  });
  if (error || !id) return { ok: false, error: mapError(error) };
  const { data: q } = await admin.from("quotes").select("code, token").eq("id", id).maybeSingle();
  return { ok: true, quoteId: id, token: q?.token ?? "", code: q?.code ?? "" };
}

/**
 * Khách đồng ý báo giá (trên trang công khai, hoặc nhân viên bấm thay): định giá lại với dữ liệu hiện tại; tổng khác
 * báo giá thì không tạo đơn, báo người bán gửi báo giá mới (CLAUDE.md 8.6). Người thao tác là người bán của báo giá.
 */
export async function acceptQuote(
  quoteId: string,
  byCustomer: boolean,
): Promise<{ ok: true; orderId: string; code: string } | { ok: false; error: CheckoutError }> {
  const admin = createAdminClient();
  const { data: q } = await admin
    .from("quotes")
    .select(
      "id, code, lead_id, seller_id, status, valid_until, total, input, gift_message, note, showroom_id",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (!q || !q.seller_id || !["sent", "viewed"].includes(q.status) || new Date(q.valid_until) < new Date())
    return { ok: false, error: "quote_closed" };
  const { data: seller } = await admin
    .from("profiles")
    .select("id, roles(key)")
    .eq("id", q.seller_id)
    .maybeSingle();
  const stored = q.input as unknown as { cart: Cart; addressId: string | null; giftMessage: string | null };
  const input: CheckoutInput = {
    leadId: q.lead_id,
    cart: stored.cart,
    addressId: stored.addressId,
    giftMessage: stored.giftMessage ?? undefined,
    note: q.note ?? undefined,
  };
  const priced = await price(input, { id: q.seller_id, roleKey: seller?.roles?.key ?? "" });
  if (!priced.ok) return priced;
  if (priced.result.totals.total !== q.total) {
    await admin.from("notifications").insert({
      showroom_id: q.showroom_id,
      user_id: q.seller_id,
      type: "quote_changed",
      title: `Khách đồng ý báo giá ${q.code} nhưng giá đã đổi, gửi báo giá mới`,
      link: `/leads/${q.lead_id}`,
    });
    return { ok: false, error: "quote_changed" };
  }
  if (!input.addressId) return { ok: false, error: "address_required" };
  // Database khóa báo giá, đánh dấu đã đồng ý và gắn đơn trong cùng giao dịch.
  const placed = await persistOrder(q.seller_id, input, priced.result, {
    channel: byCustomer ? "quote" : "inbox",
    quoteId: q.id,
    byCustomer,
  });
  if (!placed.ok) return placed;
  return { ok: true, orderId: placed.orderId, code: placed.code };
}

export const CHECKOUT_MESSAGE: Record<CheckoutError, string> = {
  lead_not_found: "Anh chị không còn giữ lead này.",
  missing_required_info:
    "Lead chưa đủ bốn thông tin bắt buộc (mua cho ai, tỉnh người nhận, dịp, ngân sách). Điền ở thẻ Khách rồi lên đơn.",
  address_required: "Chọn địa chỉ giao của người đặt hoặc người nhận.",
  lead_lost: "Lead này đã đánh thất bại, không lên đơn được.",
  not_allowed: "Anh chị chưa được cấp quyền làm việc này.",
  invalid: "Dòng hàng, giảm giá hoặc phí chưa đúng, kiểm lại rồi thử lại.",
  quote_closed: "Báo giá đã hết hạn hoặc đã được xử lý.",
  quote_changed: "Giá đã đổi so với báo giá, cần gửi báo giá mới.",
  failed: "Chưa lưu được, thử lại sau ít phút.",
};
