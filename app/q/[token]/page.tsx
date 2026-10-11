import type { Metadata } from "next";

import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { formatMoney } from "@/lib/format";
import type { QuoteResult } from "@/lib/sales/pricing";

import { AcceptQuote } from "./accept";

export const metadata: Metadata = {
  title: "Báo giá · Showroom Đại Việt",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Trang báo giá công khai cho khách (CLAUDE.md 8.6): mở bằng mã khó đoán, hết hạn theo valid_until. Chỉ hiện dữ liệu
// báo giá như một đơn hàng: người đặt, người nhận, địa chỉ giao, sản phẩm (mã, đơn giá, giảm, bảo hành), phí giao, lắp,
// cọc và phần còn lại, ưu đãi, chính sách, chuyển khoản, bước tiếp theo. Không hiện số điện thoại, tên nhân viên, giá
// vốn hay ghi chú nội bộ. Lần mở đầu tiên được ghi lại.
export default async function Page({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: q } = /^[0-9a-f]{36}$/.test(token)
    ? await admin
        .from("quotes")
        .select(
          "id, code, status, valid_until, sent_at, created_at, pricing, total, deposit_min, gift_message, ship_province, showroom_id, lead_id, buyer_contact_id, recipient_contact_id, address_id, order_id, showrooms(name)",
        )
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  if (!q || q.status === "draft") {
    return (
      <Shell>
        <h1>Không tìm thấy báo giá</h1>
        <p>Link có thể đã sai hoặc đã bị thu hồi. Anh chị vui lòng nhắn showroom để nhận báo giá mới.</p>
      </Shell>
    );
  }
  const expired = q.status === "expired" || (new Date(q.valid_until) < new Date() && q.status !== "accepted");
  // Nhân viên đang đăng nhập mở thử link thì không tính là khách đã xem.
  const {
    data: { user: staff },
  } = await (await createClient()).auth.getUser();
  if (!expired && !staff) await admin.rpc("mark_quote_viewed", { p_token: token });

  const pricing = q.pricing as unknown as QuoteResult;
  const variantIds = [...new Set(pricing.lines.map((l) => l.variantId))];
  const comboIds = [...new Set(pricing.lines.map((l) => l.comboId).filter((x): x is string => Boolean(x)))];
  const [
    { data: settings },
    { data: notes },
    { data: variants },
    { data: combos },
    people,
    addr,
    lead,
    order,
  ] = await Promise.all([
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
    admin.from("leads").select("occasions(label), occasion_date").eq("id", q.lead_id).maybeSingle(),
    q.order_id
      ? admin.from("orders").select("code").eq("id", q.order_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const variantOf = new Map((variants ?? []).map((v) => [v.id, v]));
  const comboName = new Map((combos ?? []).map((c) => [c.id, c.name]));
  const buyer = people.data?.find((p) => p.id === q.buyer_contact_id);
  const recipient =
    q.recipient_contact_id && q.recipient_contact_id !== q.buyer_contact_id
      ? people.data?.find((p) => p.id === q.recipient_contact_id)
      : null;
  const a = addr.data;
  const address = a ? [a.street, a.ward, a.district, a.province].filter(Boolean).join(", ") : q.ship_province;
  const promos = pricing.appliedPolicies?.filter((p) => p.type === "promotion") ?? [];
  const delivery = pricing.appliedPolicies?.filter((p) => p.type === "delivery") ?? [];
  const orderCode = order.data?.code ?? null;
  const transferRef = orderCode ?? q.code;
  const remaining = Math.max(0, q.total - q.deposit_min);
  const occasion = lead.data?.occasions?.label;

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="c-lbl m-0">{q.showrooms?.name ?? "Showroom Đại Việt"}</p>
          <h1 className="m-0">Báo giá {q.code}</h1>
        </div>
        <span
          className={`c-pill ${q.status === "accepted" ? "is-ok" : expired ? "is-err" : "is-ai"}`}
          aria-label="Trạng thái báo giá"
        >
          {q.status === "accepted" ? "Đã đồng ý" : expired ? "Hết hạn" : "Chờ anh chị xác nhận"}
        </span>
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="c-lbl">Ngày lập</dt>
        <dd className="m-0 text-right sm:text-left">{day.format(new Date(q.sent_at ?? q.created_at))}</dd>
        <dt className="c-lbl">Hiệu lực đến hết ngày</dt>
        <dd className={`m-0 text-right sm:text-left ${expired ? "text-err" : ""}`}>
          {day.format(new Date(q.valid_until))}
        </dd>
        {orderCode ? (
          <>
            <dt className="c-lbl">Mã đơn hàng</dt>
            <dd className="m-0 text-right font-bold sm:text-left">{orderCode}</dd>
          </>
        ) : null}
      </dl>
      {expired ? (
        <p className="rounded-control bg-err-soft px-3 py-2 text-err">
          Báo giá đã hết hạn. Anh chị nhắn showroom để nhận báo giá mới theo giá hiện hành.
        </p>
      ) : null}

      <h2>Thông tin đặt hàng</h2>
      <dl className="grid gap-y-1.5 text-sm sm:grid-cols-[160px_1fr]" aria-label="Thông tin đặt hàng">
        <dt className="c-lbl">Người đặt</dt>
        <dd className="m-0 font-semibold">{buyer?.full_name ?? "Quý khách"}</dd>
        <dt className="c-lbl">Người nhận</dt>
        <dd className="m-0 font-semibold">
          {recipient
            ? `${recipient.full_name}${recipient.relation_in_household ? ` (${recipient.relation_in_household})` : ""}`
            : "Chính người đặt"}
        </dd>
        <dt className="c-lbl">Giao tới</dt>
        <dd className="m-0">
          {a?.receiver ? <b>{a.receiver}: </b> : null}
          {address || "Showroom sẽ xác nhận với anh chị"}
        </dd>
        {occasion ? (
          <>
            <dt className="c-lbl">Dịp</dt>
            <dd className="m-0">
              {occasion}
              {lead.data?.occasion_date ? `, ngày ${day.format(new Date(lead.data.occasion_date))}` : ""}
            </dd>
          </>
        ) : null}
        {q.gift_message ? (
          <>
            <dt className="c-lbl">Lời nhắn kèm quà</dt>
            <dd className="m-0 italic">“{q.gift_message}”</dd>
          </>
        ) : null}
      </dl>

      <h2>Sản phẩm</h2>
      <ul
        className="m-0 list-none divide-y divide-line p-0"
        aria-label="Sản phẩm báo giá"
        style={{ paddingLeft: 0 }}
      >
        {pricing.lines.map((l, i) => {
          const v = variantOf.get(l.variantId);
          const months = v?.products?.warranty_months;
          return (
            <li key={i} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <b>{l.name}</b>
                {l.isGift ? <span className="c-pill is-ok ml-1.5">Quà tặng</span> : null}
                <div className="c-lbl text-sm">
                  {[
                    v?.sku ? `Mã ${v.sku}` : null,
                    `Số lượng ${l.qty}`,
                    l.isGift ? null : `Đơn giá ${formatMoney(l.unitPrice)}`,
                    l.comboId && comboName.get(l.comboId) ? `Thuộc combo ${comboName.get(l.comboId)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="c-lbl text-sm">
                  {[
                    months ? `Bảo hành ${months} tháng` : null,
                    v?.products?.requires_installation ? "Có lắp đặt tận nơi" : null,
                    l.discount && !l.isGift ? `Đã giảm ${formatMoney(l.discount)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span className="tabular shrink-0 text-right font-semibold">
                {formatMoney(l.isGift ? 0 : l.total)}
              </span>
            </li>
          );
        })}
      </ul>

      <table className="c-rl mt-2 w-full" aria-label="Tổng tiền">
        <tbody>
          <tr>
            <td className="c-lbl">Tạm tính theo giá lẻ</td>
            <td className="tabular text-right">{formatMoney(pricing.totals.subtotal)}</td>
          </tr>
          {pricing.totals.discount ? (
            <tr>
              <td className="c-lbl">Giảm giá</td>
              <td className="tabular text-right">−{formatMoney(pricing.totals.discount)}</td>
            </tr>
          ) : null}
          <tr>
            <td className="c-lbl">Phí giao hàng</td>
            <td className="tabular text-right">
              {pricing.fees.delivery ? formatMoney(pricing.fees.delivery) : "Miễn phí"}
            </td>
          </tr>
          <tr>
            <td className="c-lbl">Phí lắp đặt</td>
            <td className="tabular text-right">
              {pricing.fees.installation ? formatMoney(pricing.fees.installation) : "Miễn phí"}
            </td>
          </tr>
          <tr>
            <td>
              <b>Tổng thanh toán</b>
            </td>
            <td className="tabular text-right text-[18px]">
              <b>{formatMoney(q.total)}</b>
            </td>
          </tr>
          <tr>
            <td className="c-lbl">
              Đặt cọc tối thiểu để giữ hàng
              {pricing.deposit?.holdDays ? ` (giữ hàng ${pricing.deposit.holdDays} ngày)` : ""}
            </td>
            <td className="tabular text-right">{formatMoney(q.deposit_min)}</td>
          </tr>
          <tr>
            <td className="c-lbl">Còn lại thanh toán khi nhận hàng</td>
            <td className="tabular text-right">{formatMoney(remaining)}</td>
          </tr>
        </tbody>
      </table>

      {promos.length ? (
        <>
          <h2>Ưu đãi đã áp</h2>
          <ul>
            {promos.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.benefit ? `: ${p.benefit}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {delivery.length ? (
        <>
          <h2>Giao hàng và lắp đặt</h2>
          <ul>
            {delivery.map((d) => (
              <li key={d.id}>{d.benefit || d.name}</li>
            ))}
          </ul>
        </>
      ) : null}

      {(notes ?? []).map((n) => (
        <section key={`${n.type}-${n.name}`}>
          <h2>{n.name}</h2>
          <p style={{ whiteSpace: "pre-line" }}>{String((n.rules as { text?: string })?.text ?? "")}</p>
        </section>
      ))}

      {settings?.bank_info ? (
        <section>
          <h2>Chuyển khoản đặt cọc</h2>
          <p style={{ whiteSpace: "pre-line" }}>{settings.bank_info}</p>
          <p>
            Nội dung chuyển khoản: <b>{transferRef}</b>
          </p>
          <p className="c-lbl">Ghi đúng nội dung để showroom đối soát và xác nhận tiền nhanh.</p>
        </section>
      ) : null}

      <h2>Bước tiếp theo</h2>
      <ol>
        <li>
          {q.status === "accepted"
            ? "Anh chị đã đồng ý báo giá."
            : "Anh chị kiểm lại thông tin rồi bấm Đồng ý báo giá."}
        </li>
        <li>Chuyển khoản đặt cọc tối thiểu {formatMoney(q.deposit_min)} để showroom giữ hàng.</li>
        <li>Showroom gọi xác nhận đơn, hẹn ngày giao và lắp đặt.</li>
        <li>Nhận hàng, kiểm tra và thanh toán phần còn lại {formatMoney(remaining)}.</li>
      </ol>

      {q.status === "accepted" ? (
        <p className="rounded-control bg-ok-soft px-3 py-2">
          Anh chị đã đồng ý báo giá này{orderCode ? `, mã đơn ${orderCode}` : ""}. Cảm ơn anh chị!
        </p>
      ) : expired ? null : (
        <AcceptQuote token={token} />
      )}
      <p className="c-lbl mt-4 text-sm">
        Thông tin cần sửa (người nhận, địa chỉ, sản phẩm) anh chị nhắn lại showroom để được gửi báo giá mới.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 justify-center bg-surface-2 px-4 py-10">
      <article className="c-legal w-full max-w-2xl rounded-card border border-line bg-surface px-6 py-8 shadow-card">
        {children}
      </article>
    </main>
  );
}
