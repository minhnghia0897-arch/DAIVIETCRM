"use client";

import { Copy, FileText, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { toQuoteInput, type Cart } from "@/lib/sales/checkout";
import { priceQuote, type PricingCatalog } from "@/lib/sales/pricing";

import { acceptQuoteForCustomer, createOrder, createQuote } from "@/app/(app)/inbox/order-actions";

import { PricingSummary } from "./pricing-summary";

// Tab Lên đơn của Hội thoại (kiểu Pancake): chọn ghế, combo, số lượng, giảm tay, phí giao lắp nhân viên nhập, địa chỉ
// giao; tạo đơn hoặc gửi báo giá có link cho khách. Số trên màn do hàm định giá dùng chung tính ngay trên trình duyệt
// để xem trước; server tính lại từ database khi lưu (CLAUDE.md 8.1, 8.5).

export interface OrderSide {
  leadId: string | null;
  canCreate: boolean;
  canQuote: boolean;
  /** Bốn thông tin bắt buộc còn thiếu trên lead. */
  missing: string[];
  catalog: PricingCatalog | null;
  products: { variantId: string; sku: string; name: string; price: number }[];
  combos: { id: string; code: string; name: string }[];
  context: {
    showroomId: string;
    buyerCountry: string;
    customerTags: string[];
    recipientProvince: string | null;
    sellerId: string;
    sellerRole: string;
  } | null;
  addresses: { id: string; label: string; province: string }[];
  orders: {
    id: string;
    code: string;
    status: string;
    statusLabel: string;
    total: number;
    discount: number;
    at: string;
    items: string;
  }[];
  quotes: {
    id: string;
    code: string;
    status: string;
    total: number;
    token: string;
    orderId: string | null;
    validUntil: string;
  }[];
}

const FIELD = "block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const QUOTE_STATUS: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  viewed: "Khách đã xem",
  accepted: "Khách đã đồng ý",
  expired: "Hết hạn",
  rejected: "Khách từ chối",
};

/** Đọc số tiền nhân viên gõ: bỏ dấu chấm, dấu phẩy, khoảng trắng ("1.500.000" → 1500000). */
function parseMoney(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function OrderTab({ order }: { order: OrderSide }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discType, setDiscType] = useState<"amount" | "pct">("amount");
  const [discRaw, setDiscRaw] = useState("");
  const [deliveryRaw, setDeliveryRaw] = useState("");
  const [installRaw, setInstallRaw] = useState("");
  const [addressId, setAddressId] = useState(order.addresses[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [gift, setGift] = useState("");
  const [created, setCreated] = useState<{
    href: string;
    label: string;
    message: string;
    link?: string;
  } | null>(null);

  const items = [
    ...order.products.map((p) => ({ key: `v:${p.variantId}`, label: p.sku, sub: formatMoney(p.price) })),
    ...order.combos.map((c) => ({ key: `c:${c.id}`, label: `Combo ${c.code}`, sub: c.name })),
  ];
  const discValue =
    discType === "pct" ? Math.min(Number(discRaw.replace(",", ".")) || 0, 100) : parseMoney(discRaw);
  const cartValue: Cart = {
    lines: Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([k, qty]) =>
        k.startsWith("c:") ? { comboId: k.slice(2), qty } : { variantId: k.slice(2), qty },
      ),
    discount: discValue > 0 ? { type: discType, value: discValue } : null,
    deliveryFee: deliveryRaw.trim() ? parseMoney(deliveryRaw) : null,
    installationFee: installRaw.trim() ? parseMoney(installRaw) : null,
  };
  const province =
    order.addresses.find((a) => a.id === addressId)?.province ?? order.context?.recipientProvince;
  const preview = useMemo(() => {
    if (!order.catalog || !order.context || !cartValue.lines.length) return null;
    return priceQuote(
      toQuoteInput(
        cartValue,
        { ...order.context, recipientProvince: province ?? undefined, channel: "online", date: new Date() },
        order.catalog,
      ),
      order.catalog,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cartValue dựng lại mỗi lần vẽ từ các state bên dưới
  }, [cart, discType, discRaw, deliveryRaw, installRaw, province, order.catalog, order.context]);

  const setQty = (key: string, qty: number) =>
    setCart((c) => ({ ...c, [key]: Math.max(0, Math.min(99, qty)) }));
  const payload = () => ({
    leadId: order.leadId!,
    lines: cartValue.lines,
    addressId: addressId || null,
    discount: cartValue.discount,
    deliveryFee: cartValue.deliveryFee,
    installationFee: cartValue.installationFee,
    note: note.trim() || undefined,
    giftMessage: gift.trim() || undefined,
  });
  const reset = () => {
    setCart({});
    setDiscRaw("");
    setDeliveryRaw("");
    setInstallRaw("");
    setNote("");
    setGift("");
  };

  function submitOrder() {
    start(async () => {
      const r = await createOrder(payload());
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        if (r.orderId) setCreated({ href: `/orders/${r.orderId}`, label: "Mở đơn", message: r.message });
        reset();
        router.refresh();
      }
    });
  }

  function submitQuote() {
    start(async () => {
      const r = await createQuote(payload());
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok && r.link) {
        setCreated({ href: r.link, label: "Xem báo giá", message: r.message, link: r.link });
        reset();
        router.refresh();
      }
    });
  }

  const blocker = !order.leadId
    ? "Hội thoại chưa gắn lead nên chưa lên đơn được."
    : !order.canCreate && !order.canQuote
      ? "Anh chị chưa được cấp quyền tạo đơn, báo giá cho lead này."
      : order.missing.length
        ? `Lead còn thiếu: ${order.missing.join(", ")}. Điền ở thẻ Khách rồi lên đơn.`
        : !items.length
          ? "Chưa có sản phẩm nào đang bán trong bảng giá."
          : !order.addresses.length
            ? "Chưa có địa chỉ giao. Lưu địa chỉ ở thẻ Khách trước."
            : null;

  return (
    <div className="space-y-2.5">
      <div className="cv-card">
        <h3>
          <ShoppingCart size={15} aria-hidden /> Lên đơn
        </h3>
        {created ? (
          <div className="cv-done" aria-live="polite">
            {created.message}.{" "}
            <Link href={created.href} className="font-semibold underline">
              {created.label}
            </Link>
            {created.link ? (
              <span className="mt-1 flex items-center gap-1.5">
                <input
                  readOnly
                  aria-label="Link báo giá"
                  value={created.link}
                  className={`${FIELD} text-sm`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="c-ib"
                  aria-label="Chép link báo giá"
                  onClick={() => {
                    void navigator.clipboard?.writeText(created.link!);
                    toast("Đã chép link, dán vào khung chat để gửi khách", "ok");
                  }}
                >
                  <Copy size={14} />
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
        {blocker ? (
          <p className="c-lbl" role="note">
            {blocker}
          </p>
        ) : (
          <form
            aria-label="Lên đơn"
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitOrder();
            }}
          >
            <ul className="space-y-1.5" aria-label="Sản phẩm">
              {items.map((p) => {
                const qty = cart[p.key] ?? 0;
                return (
                  <li key={p.key} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{p.label}</b>
                      <span className="c-lbl block truncate">{p.sub}</span>
                    </span>
                    {qty > 0 ? (
                      <>
                        <button
                          type="button"
                          className="c-ib"
                          aria-label={`Bớt ${p.label}`}
                          onClick={() => setQty(p.key, qty - 1)}
                        >
                          {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                        </button>
                        <span aria-label={`Số lượng ${p.label}`} className="w-5 text-center">
                          {qty}
                        </span>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="c-ib"
                      aria-label={`Thêm ${p.label}`}
                      onClick={() => setQty(p.key, qty + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {cartValue.lines.length ? (
              <>
                <label className="block text-sm">
                  Giảm giá
                  <span className="mt-1 flex gap-1.5">
                    <input
                      aria-label="Mức giảm"
                      inputMode="decimal"
                      placeholder="0"
                      value={discRaw}
                      onChange={(e) => setDiscRaw(e.target.value)}
                      className={FIELD}
                    />
                    <select
                      aria-label="Kiểu giảm"
                      value={discType}
                      onChange={(e) => setDiscType(e.target.value as "amount" | "pct")}
                      className="rounded-control border border-line bg-surface px-1.5"
                    >
                      <option value="amount">đ</option>
                      <option value="pct">%</option>
                    </select>
                  </span>
                </label>
                <span className="grid grid-cols-2 gap-1.5">
                  <label className="block text-sm">
                    Phí giao
                    <input
                      aria-label="Phí giao"
                      inputMode="numeric"
                      placeholder="Theo chính sách"
                      value={deliveryRaw}
                      onChange={(e) => setDeliveryRaw(e.target.value)}
                      className={`${FIELD} mt-1`}
                    />
                  </label>
                  <label className="block text-sm">
                    Phí lắp
                    <input
                      aria-label="Phí lắp"
                      inputMode="numeric"
                      placeholder="Theo chính sách"
                      value={installRaw}
                      onChange={(e) => setInstallRaw(e.target.value)}
                      className={`${FIELD} mt-1`}
                    />
                  </label>
                </span>
                <label className="block text-sm">
                  Giao tới
                  <select
                    aria-label="Địa chỉ giao"
                    value={addressId}
                    onChange={(e) => setAddressId(e.target.value)}
                    className={`${FIELD} mt-1`}
                  >
                    {order.addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Lời nhắn kèm quà
                  <textarea
                    aria-label="Lời nhắn kèm quà"
                    rows={2}
                    maxLength={500}
                    placeholder="Ví dụ: Chúc bố mạnh khỏe"
                    value={gift}
                    onChange={(e) => setGift(e.target.value)}
                    className={`${FIELD} mt-1`}
                  />
                </label>
                <label className="block text-sm">
                  Ghi chú đơn
                  <textarea
                    aria-label="Ghi chú đơn"
                    rows={2}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={`${FIELD} mt-1`}
                  />
                </label>

                {preview ? <PricingSummary result={preview} /> : null}
                <p className="c-lbl">Hệ thống tính lại theo bảng giá và chính sách khi lưu.</p>
                <div className="flex gap-1.5">
                  {order.canCreate ? (
                    <button type="submit" className="c-btn is-go flex-1" disabled={pending || !addressId}>
                      Tạo đơn
                    </button>
                  ) : null}
                  {order.canQuote ? (
                    <button type="button" className="c-btn flex-1" disabled={pending} onClick={submitQuote}>
                      <FileText size={14} className="mr-1 inline" aria-hidden />
                      Gửi báo giá
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="c-lbl">Bấm + để thêm sản phẩm, combo vào đơn.</p>
            )}
          </form>
        )}
      </div>

      {order.quotes.length ? (
        <div className="cv-card">
          <h3>Báo giá đã gửi</h3>
          <ul className="space-y-1.5" aria-label="Báo giá đã gửi">
            {order.quotes.map((q) => (
              <li key={q.id} className="text-sm">
                <span className="flex justify-between gap-2">
                  <a
                    href={`/q/${q.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="c-link font-semibold"
                  >
                    {q.code}
                  </a>
                  <span>{formatMoney(q.total)}</span>
                </span>
                <span className="c-lbl block">
                  {QUOTE_STATUS[q.status] ?? q.status} · hạn {q.validUntil}
                </span>
                {q.orderId ? (
                  <Link href={`/orders/${q.orderId}`} className="c-lbl underline">
                    Mở đơn từ báo giá
                  </Link>
                ) : ["sent", "viewed"].includes(q.status) && order.canCreate ? (
                  <button
                    type="button"
                    className="c-btn mt-1"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await acceptQuoteForCustomer(q.id);
                        toast(r.message, r.ok ? "ok" : "err");
                        if (r.ok) router.refresh();
                      })
                    }
                  >
                    Khách đã đồng ý
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="cv-card">
        <h3>Đơn của khách</h3>
        {order.orders.length ? (
          <ul className="space-y-1.5" aria-label="Đơn của khách">
            {order.orders.map((o) => (
              <li key={o.id} className="text-sm">
                <span className="flex justify-between gap-2">
                  <Link href={`/orders/${o.id}`} className="c-link font-semibold">
                    {o.code}
                  </Link>
                  <span>{formatMoney(o.total)}</span>
                </span>
                <span className="c-lbl block">
                  {o.statusLabel} · {o.items} · {o.at}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="c-lbl">Khách chưa có đơn nào.</p>
        )}
      </div>
    </div>
  );
}
