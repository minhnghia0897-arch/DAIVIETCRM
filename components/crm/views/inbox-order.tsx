"use client";

import { Copy, Download, FileImage, Gift, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { toQuoteInput, type Cart } from "@/lib/sales/checkout";
import { priceQuote, type PricingCatalog } from "@/lib/sales/pricing";

import { acceptQuoteForCustomer, createOrder, createQuote } from "@/app/(app)/inbox/order-actions";
import { renameContact, saveContactAddress, saveContactPhone } from "@/app/(app)/inbox/side-actions";
import { setBuyerMarket, setRecipient, updateLeadInfo } from "@/app/(app)/leads/[id]/actions";

import type { LiveSide } from "./inbox-live-side";
import { PricingSummary } from "./pricing-summary";

// Tab Lên đơn của Hội thoại, bố cục như bản demo: Người đặt, Người nhận, Địa chỉ giao, Hàng, tổng tiền dính đáy cột.
// Mọi ô điền sẵn từ hồ sơ đúng khách của hội thoại đang mở và từ tin khách nhắn; nhân viên kiểm lại rồi bấm Tạo đơn
// hoặc Ảnh báo giá (ảnh PNG đầy đủ thông tin để gửi khách trong khung chat). Bấm thì lưu phần hồ sơ đã sửa (tên, số, nơi sống, người nhận, dịp, ngân sách, địa chỉ mới) rồi mới
// tạo đơn. Số trên màn do hàm định giá dùng chung tính trên trình duyệt để xem trước; server tính lại từ database
// khi lưu (CLAUDE.md 8.1, 8.5).

export interface OrderSide {
  leadId: string | null;
  canCreate: boolean;
  canQuote: boolean;
  /** Bốn thông tin bắt buộc còn thiếu trên lead. */
  missing: string[];
  catalog: PricingCatalog | null;
  products: { variantId: string; sku: string; name: string; price: number }[];
  /** Danh mục Quà tặng (màn /gifts): quà tặng kèm giá 0đ. */
  gifts: { variantId: string; sku: string; name: string; value: number }[];
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

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const QUOTE_STATUS: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  viewed: "Khách đã xem",
  accepted: "Khách đã đồng ý",
  expired: "Hết hạn",
  rejected: "Khách từ chối",
};
const SALES_CHANNELS = [
  ["zalo_oa", "Zalo OA"],
  ["messenger", "Tin nhắn Facebook"],
  ["showroom", "Khách đến showroom"],
  ["hotline", "Hotline"],
  ["referral", "Giới thiệu"],
] as const;
type SalesChannel = (typeof SALES_CHANNELS)[number][0];
const NEW_ADDRESS = "new";

/** Đọc số tiền nhân viên gõ: bỏ dấu chấm, dấu phẩy, khoảng trắng ("1.500.000" → 1500000). */
function parseMoney(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

interface Row {
  key: number;
  ref: string;
  qty: number;
  /** Quà tặng kèm: giá 0đ trên đơn. */
  gift?: boolean;
}

type Result = { ok: boolean; message: string };

/** Giá trị ban đầu của form: hồ sơ khách, lead của hội thoại, rồi tới thông tin khách nhắn trong tin. */
function initialOf(side: LiveSide, channel: string) {
  const { lead, findings } = side;
  const addr = findings.find((f) => f.kind === "address")?.value;
  const relation = findings.find((f) => f.kind === "recipient")?.value.relation;
  const phone = findings.find((f) => f.kind === "phone")?.value.phone;
  const occasion = findings.find((f) => f.kind === "occasion")?.value.occasion;
  const products = [
    ...new Set(findings.filter((f) => f.kind === "product").map((f) => `v:${f.value.productKey}`)),
  ].filter((k) => side.order.products.some((p) => `v:${p.variantId}` === k));
  const firstItem = side.order.products[0]
    ? `v:${side.order.products[0].variantId}`
    : side.order.combos[0]
      ? `c:${side.order.combos[0].id}`
      : "";
  const self = lead?.recipient ? lead.recipient.self : !relation;
  return {
    buyerName: side.contact.name,
    buyerPhone: side.contact.phones.length ? "" : (phone ?? ""),
    buyerCountry: side.contact.country,
    channel: (channel === "Zalo" ? "zalo_oa" : "messenger") as SalesChannel,
    self,
    recipientName: lead?.recipient && !lead.recipient.self ? (lead.recipient.name ?? "") : (relation ?? ""),
    recipientRelation: lead?.recipient?.relation ?? relation ?? "",
    keepSurprise: lead?.keepSurprise ?? false,
    occasionId:
      lead?.occasionId ??
      side.occasions.find((o) => o.label.toLowerCase() === occasion?.toLowerCase())?.id ??
      "",
    budgetId: lead?.budgetRangeId ?? "",
    addressId: side.order.addresses[0]?.id ?? NEW_ADDRESS,
    province: addr?.province ?? lead?.recipientProvince ?? "",
    district: addr?.district ?? "",
    ward: addr?.ward ?? "",
    street: addr?.street ?? "",
    rows: (products.length ? products : firstItem ? [firstItem] : []).map((ref, i) => ({
      key: i + 1,
      ref,
      qty: 1,
    })) as Row[],
    prefilled: findings.length > 0 || Boolean(lead),
  };
}

export function OrderTab({ side, channel }: { side: LiveSide; channel: string }) {
  const order = side.order;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [init] = useState(() => initialOf(side, channel));
  const [f, setF] = useState(init);
  const set = (patch: Partial<typeof init>) => setF((x) => ({ ...x, ...patch }));
  const [discType, setDiscType] = useState<"amount" | "pct">("amount");
  const [discRaw, setDiscRaw] = useState("");
  const [deliveryRaw, setDeliveryRaw] = useState("");
  const [installRaw, setInstallRaw] = useState("");
  const [note, setNote] = useState("");
  const [gift, setGift] = useState("");
  const [tried, setTried] = useState(false);
  const [created, setCreated] = useState<{
    href: string;
    label: string;
    message: string;
    /** Ảnh báo giá gửi khách. */
    image?: { url: string; code: string };
  } | null>(null);

  const options = [
    ...order.products.map((p) => ({
      value: `v:${p.variantId}`,
      label: `${p.name} · ${formatMoney(p.price)}`,
    })),
    ...order.combos.map((c) => ({ value: `c:${c.id}`, label: `Combo: ${c.name}` })),
  ];
  const giftOptions = order.gifts.map((g) => ({
    value: `v:${g.variantId}`,
    label: g.value ? `${g.name} · trị giá ${formatMoney(g.value)}` : g.name,
  }));
  const saleRows = f.rows.filter((r) => !r.gift);
  const giftRows = f.rows.filter((r) => r.gift);
  const discValue =
    discType === "pct" ? Math.min(Number(discRaw.replace(",", ".")) || 0, 100) : parseMoney(discRaw);
  const cartValue: Cart = {
    lines: f.rows
      .filter((r) => r.ref && r.qty > 0)
      .map((r) =>
        r.ref.startsWith("c:")
          ? { comboId: r.ref.slice(2), qty: r.qty }
          : { variantId: r.ref.slice(2), qty: r.qty, ...(r.gift ? { isGift: true } : {}) },
      ),
    discount: discValue > 0 ? { type: discType, value: discValue } : null,
    deliveryFee: deliveryRaw.trim() ? parseMoney(deliveryRaw) : null,
    installationFee: installRaw.trim() ? parseMoney(installRaw) : null,
  };
  const province =
    f.addressId === NEW_ADDRESS
      ? f.province
      : (order.addresses.find((a) => a.id === f.addressId)?.province ?? "");
  const preview = useMemo(() => {
    if (!order.catalog || !order.context || !cartValue.lines.length) return null;
    return priceQuote(
      toQuoteInput(
        cartValue,
        {
          ...order.context,
          buyerCountry: f.buyerCountry,
          recipientProvince: province || undefined,
          channel: f.channel === "showroom" ? "showroom" : "online",
          date: new Date(),
        },
        order.catalog,
      ),
      order.catalog,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cartValue dựng lại mỗi lần vẽ từ các state bên dưới
  }, [
    f.rows,
    f.buyerCountry,
    f.channel,
    discType,
    discRaw,
    deliveryRaw,
    installRaw,
    province,
    order.catalog,
    order.context,
  ]);

  const blocker = !order.leadId
    ? "Hội thoại chưa gắn lead nên chưa lên đơn được."
    : !order.canCreate && !order.canQuote
      ? "Anh chị chưa được cấp quyền tạo đơn, báo giá cho lead này."
      : !options.length
        ? "Chưa có sản phẩm nào đang bán trong bảng giá."
        : null;
  const ro = !side.canEdit;
  const errors = [
    !f.buyerName.trim() && "Chưa nhập tên người đặt",
    !f.self && !f.recipientName.trim() && "Chưa nhập tên người nhận",
    !f.occasionId && "Chưa chọn dịp mua",
    !f.budgetId && "Chưa chọn ngân sách",
    !province && "Chưa chọn tỉnh giao",
    f.addressId === NEW_ADDRESS && !f.street.trim() && "Chưa nhập số nhà, đường",
    !cartValue.lines.some((l) => !l.isGift) && "Chưa có dòng hàng",
  ].filter((x): x is string => Boolean(x));
  // Người không sửa được hồ sơ chỉ lên đơn khi lead đã đủ thông tin và đã có địa chỉ lưu sẵn.
  const roBlock = ro && (order.missing.length > 0 || f.addressId === NEW_ADDRESS);

  /** Lưu phần hồ sơ đã sửa trên form; trả về địa chỉ giao dùng cho đơn. */
  async function saveProfile(): Promise<Result & { addressId?: string }> {
    if (ro) return { ok: true, message: "", addressId: f.addressId };
    const lead = side.lead!;
    const steps: (() => Promise<Result>)[] = [];
    if (f.buyerName.trim() !== side.contact.name)
      steps.push(() => renameContact({ contactId: side.contact.id, name: f.buyerName }));
    if (f.buyerPhone.trim())
      steps.push(() =>
        saveContactPhone({ contactId: side.contact.id, raw: f.buyerPhone, country: f.buyerCountry }),
      );
    if (f.buyerCountry !== side.contact.country)
      steps.push(() =>
        setBuyerMarket({ leadId: lead.id, contactId: side.contact.id, country: f.buyerCountry }),
      );
    const r0 = lead.recipient;
    if (
      !r0 ||
      r0.self !== f.self ||
      (!f.self &&
        (f.recipientName.trim() !== (r0.name ?? "") || f.recipientRelation.trim() !== (r0.relation ?? "")))
    )
      steps.push(() =>
        setRecipient({
          leadId: lead.id,
          self: f.self,
          name: f.self ? undefined : f.recipientName,
          relation: f.self ? undefined : f.recipientRelation || undefined,
        }),
      );
    const info: Parameters<typeof updateLeadInfo>[0] = { leadId: lead.id };
    if (province !== (lead.recipientProvince ?? "")) info.recipientProvince = province;
    if (f.occasionId !== (lead.occasionId ?? "")) info.occasionId = f.occasionId || null;
    if (f.budgetId !== (lead.budgetRangeId ?? "")) info.budgetRangeId = f.budgetId || null;
    if (!f.self && f.keepSurprise !== lead.keepSurprise) info.keepSurprise = f.keepSurprise;
    if (Object.keys(info).length > 1) steps.push(() => updateLeadInfo(info));
    for (const s of steps) {
      const r = await s();
      if (!r.ok) return r;
    }
    if (f.addressId !== NEW_ADDRESS) return { ok: true, message: "", addressId: f.addressId };
    const a = await saveContactAddress({
      contactId: side.contact.id,
      receiver: f.self ? undefined : f.recipientName || undefined,
      street: f.street,
      ward: f.ward || undefined,
      district: f.district || undefined,
      province,
    });
    if (!a.ok || !a.id) return { ok: false, message: a.message };
    set({ addressId: a.id });
    return { ok: true, message: "", addressId: a.id };
  }

  function submit(kind: "order" | "quote") {
    setTried(true);
    if (errors.length || roBlock) return;
    start(async () => {
      const saved = await saveProfile();
      if (!saved.ok) {
        toast(saved.message, "err");
        return;
      }
      const payload = {
        leadId: order.leadId!,
        lines: cartValue.lines,
        addressId: saved.addressId ?? null,
        discount: cartValue.discount,
        deliveryFee: cartValue.deliveryFee,
        installationFee: cartValue.installationFee,
        note: note.trim() || undefined,
        giftMessage: f.self ? undefined : gift.trim() || undefined,
        channel: f.channel,
      };
      if (kind === "order") {
        const r = await createOrder(payload);
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok && r.orderId) {
          setCreated({ href: `/orders/${r.orderId}`, label: "Mở đơn", message: r.message });
          reset();
        }
      } else {
        const r = await createQuote(payload);
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok && r.quoteId) {
          const url = `/api/quotes/${r.quoteId}/image`;
          const code = r.code ?? "bao-gia";
          setCreated({ href: url, label: "Mở ảnh", message: r.message, image: { url, code } });
          reset();
        }
      }
      router.refresh();
    });
  }

  function reset() {
    setF((x) => ({ ...x, rows: init.rows }));
    setDiscRaw("");
    setDeliveryRaw("");
    setInstallRaw("");
    setNote("");
    setGift("");
    setTried(false);
  }

  const updateRow = (key: number, patch: Partial<Row>) =>
    set({ rows: f.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const addRow = (row: Pick<Row, "ref" | "gift">) =>
    set({ rows: [...f.rows, { key: Math.max(0, ...f.rows.map((r) => r.key)) + 1, qty: 1, ...row }] });
  const total = preview?.totals.total ?? 0;

  return (
    <div className="space-y-2.5">
      {order.quotes.length ? (
        <div className="cv-card">
          <h3>Báo giá đã gửi</h3>
          <ul className="space-y-1.5" aria-label="Báo giá đã gửi">
            {order.quotes.map((q) => (
              <li key={q.id} className="text-sm">
                <span className="flex justify-between gap-2">
                  <a
                    href={`/api/quotes/${q.id}/image`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="c-link font-semibold"
                    title="Mở ảnh báo giá"
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

      {order.orders.length ? (
        <div className="cv-card">
          <h3>Đơn của khách</h3>
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
        </div>
      ) : null}
      <div className="cv-order" role="region" aria-label="Lên đơn từ hội thoại">
        {created ? (
          <div className="cv-done" aria-live="polite">
            {created.message}.{" "}
            <Link href={created.href} className="font-semibold underline">
              {created.label}
            </Link>
            {created.image ? <QuoteImageActions image={created.image} /> : null}
          </div>
        ) : null}
        {blocker ? (
          <p className="c-lbl" role="note">
            {blocker}
          </p>
        ) : (
          <>
            <p className="cv-hint">
              <Sparkles size={14} aria-hidden />
              {init.prefilled
                ? "Đã điền sẵn từ tin của khách và hồ sơ lead. Kiểm lại trước khi tạo."
                : "Chưa thấy địa chỉ, sản phẩm trong tin của khách: điền tay."}
            </p>
            {ro ? (
              <p className="c-lbl" role="note">
                Anh chị không sửa được hồ sơ khách này: chỉ lên đơn được khi lead đã đủ thông tin và đã có địa
                chỉ giao.
              </p>
            ) : null}
            <form
              aria-label="Lên đơn"
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit(order.canCreate ? "order" : "quote");
              }}
            >
              <fieldset className="m-0 grid gap-2 border-0">
                <legend className="font-bold">Người đặt</legend>
                <label className="c-lbl">
                  Từ lead đang mở
                  <select className={FIELD} aria-label="Từ lead đang mở" value={side.lead?.id ?? ""} disabled>
                    {side.lead ? (
                      <option value={side.lead.id}>
                        {side.contact.name} · {side.lead.stageLabel}
                      </option>
                    ) : null}
                  </select>
                </label>
                <label className="c-lbl">
                  Họ tên người đặt
                  <input
                    className={FIELD}
                    maxLength={120}
                    disabled={ro}
                    value={f.buyerName}
                    onChange={(e) => set({ buyerName: e.target.value })}
                  />
                </label>
                <label className="c-lbl">
                  Số điện thoại người đặt
                  {side.contact.phones.length ? (
                    <input className={FIELD} readOnly value={side.contact.phones.join(", ")} />
                  ) : (
                    <input
                      className={FIELD}
                      inputMode="tel"
                      maxLength={40}
                      disabled={ro}
                      placeholder="Khách chưa cho số"
                      value={f.buyerPhone}
                      onChange={(e) => set({ buyerPhone: e.target.value })}
                    />
                  )}
                </label>
                <label className="c-lbl">
                  Người đặt đang sống ở
                  <select
                    className={FIELD}
                    disabled={ro}
                    value={f.buyerCountry}
                    onChange={(e) => set({ buyerCountry: e.target.value })}
                  >
                    {side.markets.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                    <option value="unknown">Chưa rõ</option>
                  </select>
                </label>
                <label className="c-lbl">
                  Kênh bán
                  <select
                    className={FIELD}
                    value={f.channel}
                    onChange={(e) => set({ channel: e.target.value as SalesChannel })}
                  >
                    {SALES_CHANNELS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <fieldset className="m-0 grid gap-2 border-0" disabled={ro}>
                <legend className="font-bold">Người nhận</legend>
                <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Mua cho ai">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={f.self} onChange={() => set({ self: true })} />
                    Mua cho chính mình
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={!f.self} onChange={() => set({ self: false })} />
                    Tặng người khác
                  </label>
                </div>
                {!f.self ? (
                  <>
                    <label className="c-lbl">
                      Họ tên người nhận
                      <input
                        className={FIELD}
                        maxLength={120}
                        value={f.recipientName}
                        onChange={(e) => set({ recipientName: e.target.value })}
                      />
                    </label>
                    <label className="c-lbl">
                      Quan hệ với người đặt
                      <input
                        className={FIELD}
                        maxLength={40}
                        placeholder="Bố, mẹ, vợ…"
                        value={f.recipientRelation}
                        onChange={(e) => set({ recipientRelation: e.target.value })}
                      />
                    </label>
                    <label className="c-lbl">
                      Lời nhắn quà
                      <input
                        className={FIELD}
                        aria-label="Lời nhắn kèm quà"
                        maxLength={500}
                        placeholder="Ví dụ: Chúc bố mạnh khỏe"
                        value={gift}
                        onChange={(e) => setGift(e.target.value)}
                      />
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={f.keepSurprise}
                        onChange={(e) => set({ keepSurprise: e.target.checked })}
                      />
                      Giữ bất ngờ: không liên hệ người nhận khi người đặt chưa cho phép
                    </label>
                  </>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="c-lbl">
                    Dịp mua
                    <select
                      className={FIELD}
                      aria-label="Dịp mua"
                      value={f.occasionId}
                      onChange={(e) => set({ occasionId: e.target.value })}
                    >
                      <option value="">Chọn dịp…</option>
                      {side.occasions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="c-lbl">
                    Ngân sách
                    <select
                      className={FIELD}
                      aria-label="Ngân sách khách"
                      value={f.budgetId}
                      onChange={(e) => set({ budgetId: e.target.value })}
                    >
                      <option value="">Chọn…</option>
                      {side.budgets.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              <fieldset className="m-0 grid gap-2 border-0">
                <legend className="font-bold">Địa chỉ giao</legend>
                {order.addresses.length ? (
                  <label className="c-lbl">
                    Giao tới
                    <select
                      className={FIELD}
                      aria-label="Địa chỉ giao"
                      value={f.addressId}
                      onChange={(e) => set({ addressId: e.target.value })}
                    >
                      {order.addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                      {ro ? null : <option value={NEW_ADDRESS}>Địa chỉ mới…</option>}
                    </select>
                  </label>
                ) : null}
                {f.addressId === NEW_ADDRESS ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="c-lbl">
                      Tỉnh, thành
                      <select
                        aria-label="Tỉnh giao"
                        className={FIELD}
                        disabled={ro}
                        value={f.province}
                        onChange={(e) => set({ province: e.target.value })}
                      >
                        <option value="">Chọn tỉnh…</option>
                        {[...new Set([...side.provinces, f.province].filter(Boolean))].map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label className="c-lbl">
                      Quận, huyện
                      <input
                        className={FIELD}
                        maxLength={80}
                        disabled={ro}
                        value={f.district}
                        onChange={(e) => set({ district: e.target.value })}
                      />
                    </label>
                    <label className="c-lbl">
                      Phường, xã
                      <input
                        className={FIELD}
                        maxLength={80}
                        disabled={ro}
                        value={f.ward}
                        onChange={(e) => set({ ward: e.target.value })}
                      />
                    </label>
                    <label className="c-lbl">
                      Số nhà, đường
                      <input
                        className={FIELD}
                        maxLength={200}
                        disabled={ro}
                        value={f.street}
                        onChange={(e) => set({ street: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="m-0 border-0">
                <legend className="font-bold">Hàng</legend>
                <div className="space-y-2">
                  {saleRows.map((r, i) => (
                    <LineRow
                      key={r.key}
                      row={r}
                      what={`Sản phẩm dòng ${i + 1}`}
                      qtyLabel={`Số lượng dòng ${i + 1}`}
                      removeLabel={`Xóa dòng ${i + 1}`}
                      options={options}
                      onChange={(patch) => updateRow(r.key, patch)}
                      onRemove={() => set({ rows: f.rows.filter((x) => x.key !== r.key) })}
                    />
                  ))}
                  {giftRows.length ? (
                    <div className="space-y-2" role="group" aria-label="Quà tặng kèm">
                      <span className="c-lbl block font-semibold">Quà tặng kèm (0đ)</span>
                      {giftRows.map((r, i) => (
                        <LineRow
                          key={r.key}
                          row={r}
                          what={`Quà tặng dòng ${i + 1}`}
                          qtyLabel={`Số lượng quà dòng ${i + 1}`}
                          removeLabel={`Xóa quà dòng ${i + 1}`}
                          options={giftOptions}
                          onChange={(patch) => updateRow(r.key, patch)}
                          onRemove={() => set({ rows: f.rows.filter((x) => x.key !== r.key) })}
                        />
                      ))}
                    </div>
                  ) : null}
                  <span className="flex flex-wrap gap-1.5">
                    <button type="button" className="c-btn" onClick={() => addRow({ ref: options[0].value })}>
                      <Plus size={13} className="mr-1 inline" aria-hidden />
                      Thêm dòng
                    </button>
                    <button
                      type="button"
                      className="c-btn"
                      disabled={!giftOptions.length}
                      onClick={() => addRow({ ref: giftOptions[0].value, gift: true })}
                    >
                      <Gift size={13} className="mr-1 inline" aria-hidden />
                      Thêm quà tặng
                    </button>
                  </span>
                  {giftOptions.length ? null : (
                    <p className="c-lbl m-0">
                      Chưa có quà nào. Thêm quà ở{" "}
                      <Link href="/gifts" className="c-link">
                        Sản phẩm, Quà tặng
                      </Link>
                      .
                    </p>
                  )}
                  <label className="block c-lbl">
                    Giảm giá cả đơn
                    <span className="mt-0.5 flex gap-1.5">
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
                    <label className="block c-lbl">
                      Phí giao
                      <input
                        aria-label="Phí giao"
                        inputMode="numeric"
                        placeholder="Theo chính sách"
                        value={deliveryRaw}
                        onChange={(e) => setDeliveryRaw(e.target.value)}
                        className={FIELD}
                      />
                    </label>
                    <label className="block c-lbl">
                      Phí lắp
                      <input
                        aria-label="Phí lắp"
                        inputMode="numeric"
                        placeholder="Theo chính sách"
                        value={installRaw}
                        onChange={(e) => setInstallRaw(e.target.value)}
                        className={FIELD}
                      />
                    </label>
                  </span>
                  <label className="block c-lbl">
                    Ghi chú đơn
                    <textarea
                      aria-label="Ghi chú đơn"
                      rows={2}
                      maxLength={1000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className={FIELD}
                    />
                  </label>
                  {preview ? <PricingSummary result={preview} /> : null}
                </div>
              </fieldset>

              {tried && (errors.length || roBlock) ? (
                <ul className="m-0 list-none space-y-1 p-0" aria-label="Còn thiếu">
                  {(roBlock ? ["Lead chưa đủ thông tin hoặc chưa có địa chỉ giao đã lưu"] : errors).map(
                    (e) => (
                      <li key={e} className="text-err">
                        {e}
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
              <div className="cv-order-foot is-wrap">
                <span className="cv-total">
                  <small>Khách trả</small>
                  <b className="tabular">{formatMoney(total)}</b>
                </span>
                {order.canCreate ? (
                  <button type="submit" className="c-btn is-go" disabled={pending}>
                    {preview?.approvalsNeeded.length ? "Tạo đơn, chờ duyệt" : "Tạo đơn"}
                  </button>
                ) : null}
                {order.canQuote ? (
                  <button type="button" className="c-btn" disabled={pending} onClick={() => submit("quote")}>
                    <FileImage size={14} className="mr-1 inline" aria-hidden />
                    Ảnh báo giá
                  </button>
                ) : null}
                <button type="button" className="c-btn" disabled={pending} onClick={() => setF(init)}>
                  Hủy
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Một dòng hàng hoặc quà: chọn SKU, số lượng, xóa. */
function LineRow({
  row,
  what,
  qtyLabel,
  removeLabel,
  options,
  onChange,
  onRemove,
}: {
  row: Row;
  what: string;
  qtyLabel: string;
  removeLabel: string;
  options: { value: string; label: string }[];
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={what}
        value={row.ref}
        onChange={(e) => onChange({ ref: e.target.value })}
        className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 c-lbl">
        SL
        <input
          aria-label={qtyLabel}
          type="number"
          min={1}
          max={99}
          value={row.qty}
          onChange={(e) =>
            onChange({ qty: Math.min(99, Math.max(1, Math.floor(Number(e.target.value) || 1))) })
          }
          className="w-14 rounded-control border border-line bg-surface px-2 py-1.5 text-text"
        />
      </label>
      <button type="button" className="c-ib" aria-label={removeLabel} onClick={onRemove}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/** Ảnh báo giá vừa tạo: xem trước, tải về hoặc chép để dán vào khung chat (Zalo, Messenger) gửi khách. */
function QuoteImageActions({ image }: { image: { url: string; code: string } }) {
  const toast = useToast();
  async function copy() {
    try {
      const blob = await (await fetch(image.url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast("Đã chép ảnh, dán vào khung chat để gửi khách", "ok");
    } catch {
      toast("Trình duyệt chưa cho chép ảnh, bấm Tải ảnh rồi gửi tệp", "err");
    }
  }
  return (
    <span className="mt-2 block space-y-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh sinh động theo báo giá, không qua tối ưu ảnh */}
      <img
        src={image.url}
        alt={`Ảnh báo giá ${image.code}`}
        className="block w-full rounded-control border border-line bg-surface"
      />
      <span className="flex gap-1.5">
        <a className="c-btn flex-1 text-center" href={image.url} download={`${image.code}.png`}>
          <Download size={14} className="mr-1 inline" aria-hidden />
          Tải ảnh
        </a>
        <button type="button" className="c-btn flex-1" onClick={() => void copy()}>
          <Copy size={14} className="mr-1 inline" aria-hidden />
          Chép ảnh
        </button>
      </span>
    </span>
  );
}
