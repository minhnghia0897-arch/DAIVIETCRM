"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";

import { createOrder } from "@/app/(app)/inbox/order-actions";

// Tab Lên đơn của Hội thoại (kiểu Pancake): chọn ghế, số lượng, giảm tay, phí giao lắp nhân viên nhập, địa chỉ giao.
// Số trên màn chỉ là tạm tính để nhân viên đọc cho khách; giá và tổng tiền thật do database tính lại từ bảng giá khi
// tạo đơn (CLAUDE.md 8.1). Chưa trừ kho, chưa giữ hàng (lát sau).

export interface OrderSide {
  leadId: string | null;
  canCreate: boolean;
  /** Bốn thông tin bắt buộc còn thiếu trên lead. */
  missing: string[];
  /** Mức giảm tối đa người bán tự áp (%); null là không giới hạn. */
  discountLimit: number | null;
  products: { variantId: string; sku: string; name: string; price: number }[];
  addresses: { id: string; label: string }[];
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
}

const FIELD = "block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

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
  const [created, setCreated] = useState<{ id: string; message: string } | null>(null);

  const lines = order.products.filter((p) => (cart[p.variantId] ?? 0) > 0);
  const subtotal = lines.reduce((s, p) => s + p.price * cart[p.variantId], 0);
  const discValue =
    discType === "pct" ? Math.min(Number(discRaw.replace(",", ".")) || 0, 100) : parseMoney(discRaw);
  const discount = Math.min(
    discType === "pct" ? Math.floor((subtotal * discValue) / 100) : discValue,
    subtotal,
  );
  const delivery = parseMoney(deliveryRaw);
  const install = parseMoney(installRaw);
  const total = subtotal - discount + delivery + install;
  const pct = subtotal ? Math.round((discount * 10000) / subtotal) / 100 : 0;
  const overLimit = order.discountLimit !== null && pct > order.discountLimit;

  const setQty = (id: string, qty: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, qty)) }));

  function submit() {
    if (!order.leadId) return;
    start(async () => {
      const r = await createOrder({
        leadId: order.leadId!,
        lines: lines.map((p) => ({ variantId: p.variantId, qty: cart[p.variantId] })),
        addressId,
        discount: discValue > 0 ? { type: discType, value: discValue } : null,
        deliveryFee: delivery,
        installationFee: install,
        note: note.trim() || undefined,
        giftMessage: gift.trim() || undefined,
      });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        if (r.orderId) setCreated({ id: r.orderId, message: r.message });
        setGift("");
        setCart({});
        setDiscRaw("");
        setDeliveryRaw("");
        setInstallRaw("");
        setNote("");
        router.refresh();
      }
    });
  }

  const blocker = !order.leadId
    ? "Hội thoại chưa gắn lead nên chưa lên đơn được."
    : !order.canCreate
      ? "Anh chị chưa được cấp quyền tạo đơn cho lead này."
      : order.missing.length
        ? `Lead còn thiếu: ${order.missing.join(", ")}. Điền ở thẻ Khách rồi lên đơn.`
        : !order.products.length
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
          <p role="status" className="cv-done">
            {created.message}.{" "}
            <Link href={`/orders/${created.id}`} className="font-semibold underline">
              Mở đơn
            </Link>
          </p>
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
              submit();
            }}
          >
            <ul className="space-y-1.5" aria-label="Sản phẩm">
              {order.products.map((p) => {
                const qty = cart[p.variantId] ?? 0;
                return (
                  <li key={p.variantId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{p.sku}</b>
                      <span className="c-lbl">{formatMoney(p.price)}</span>
                    </span>
                    {qty > 0 ? (
                      <>
                        <button
                          type="button"
                          className="c-ib"
                          aria-label={`Bớt ${p.sku}`}
                          onClick={() => setQty(p.variantId, qty - 1)}
                        >
                          {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                        </button>
                        <span aria-label={`Số lượng ${p.sku}`} className="w-5 text-center">
                          {qty}
                        </span>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="c-ib"
                      aria-label={`Thêm ${p.sku}`}
                      onClick={() => setQty(p.variantId, qty + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {lines.length ? (
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
                      placeholder="0"
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
                      placeholder="0"
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

                <dl className="space-y-0.5 text-sm" aria-label="Tạm tính">
                  <Row label="Tạm tính" value={formatMoney(subtotal)} />
                  {discount ? <Row label={`Giảm (${pct}%)`} value={`−${formatMoney(discount)}`} /> : null}
                  {delivery ? <Row label="Phí giao" value={formatMoney(delivery)} /> : null}
                  {install ? <Row label="Phí lắp" value={formatMoney(install)} /> : null}
                  <Row label="Tổng" value={formatMoney(total)} strong />
                </dl>
                {overLimit ? (
                  <p className="c-lbl text-warn" role="note">
                    Giảm {pct}% vượt mức {order.discountLimit}% anh chị tự áp được: đơn sẽ chờ Owner duyệt.
                  </p>
                ) : null}
                <p className="c-lbl">Hệ thống tính lại giá theo bảng giá khi tạo đơn.</p>
                <button type="submit" className="c-btn is-go w-full" disabled={pending || !addressId}>
                  Tạo đơn
                </button>
              </>
            ) : (
              <p className="c-lbl">Bấm + để thêm sản phẩm vào đơn.</p>
            )}
          </form>
        )}
      </div>

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

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
