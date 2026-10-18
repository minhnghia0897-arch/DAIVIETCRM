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
// báo giá: sản phẩm, giá, chính sách giao lắp, bảo hành, thanh toán, thông tin chuyển khoản. Không hiện số điện thoại,
// tên nhân viên hay thông tin nội bộ. Lần mở đầu tiên được ghi lại.
export default async function Page({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: q } = /^[0-9a-f]{36}$/.test(token)
    ? await admin
        .from("quotes")
        .select(
          "id, code, status, valid_until, pricing, total, deposit_min, gift_message, ship_province, showroom_id, showrooms(name)",
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

  const [{ data: settings }, { data: notes }] = await Promise.all([
    admin.from("sales_settings").select("bank_info").eq("showroom_id", q.showroom_id).maybeSingle(),
    admin
      .from("policies")
      .select("type, name, rules")
      .eq("showroom_id", q.showroom_id)
      .eq("is_current", true)
      .eq("status", "active")
      .in("type", ["payment", "warranty", "return"]),
  ]);
  const pricing = q.pricing as unknown as QuoteResult;
  const delivery = pricing.appliedPolicies?.filter((p) => p.type === "delivery") ?? [];

  return (
    <Shell>
      <p className="c-lbl m-0">{q.showrooms?.name ?? "Showroom Đại Việt"}</p>
      <h1>Báo giá {q.code}</h1>
      <p className="c-lbl">
        {expired ? (
          <b className="text-err">Báo giá đã hết hạn ngày {day.format(new Date(q.valid_until))}.</b>
        ) : (
          <>Báo giá có hiệu lực đến hết ngày {day.format(new Date(q.valid_until))}.</>
        )}
        {q.ship_province ? ` Giao tới: ${q.ship_province}.` : ""}
      </p>

      <table className="c-rl my-4 w-full" aria-label="Sản phẩm báo giá">
        <tbody>
          {pricing.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.name} × {l.qty}
                {l.isGift ? <span className="c-pill is-ok ml-1">Quà tặng</span> : null}
              </td>
              <td className="tabular text-right">{formatMoney(l.isGift ? 0 : l.total)}</td>
            </tr>
          ))}
          {pricing.totals.discount ? (
            <tr>
              <td className="c-lbl">Đã giảm</td>
              <td className="tabular text-right">−{formatMoney(pricing.totals.discount)}</td>
            </tr>
          ) : null}
          {pricing.totals.fees ? (
            <tr>
              <td className="c-lbl">Phí giao, lắp đặt</td>
              <td className="tabular text-right">{formatMoney(pricing.totals.fees)}</td>
            </tr>
          ) : null}
          <tr>
            <td>
              <b>Tổng thanh toán</b>
            </td>
            <td className="tabular text-right">
              <b>{formatMoney(q.total)}</b>
            </td>
          </tr>
          <tr>
            <td className="c-lbl">Đặt cọc tối thiểu</td>
            <td className="tabular text-right">{formatMoney(q.deposit_min)}</td>
          </tr>
        </tbody>
      </table>

      {pricing.appliedPolicies?.some((p) => p.type === "promotion") ? (
        <p>
          Ưu đãi đã áp:{" "}
          {pricing.appliedPolicies
            .filter((p) => p.type === "promotion")
            .map((p) => `${p.name}${p.benefit ? ` (${p.benefit})` : ""}`)
            .join("; ")}
          .
        </p>
      ) : null}
      {delivery.length ? <p>Giao lắp: {delivery.map((d) => d.benefit).join("; ")}.</p> : null}
      {q.gift_message ? <p>Lời nhắn kèm quà: “{q.gift_message}”</p> : null}

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
          <p className="c-lbl">Nội dung chuyển khoản ghi mã báo giá {q.code} để showroom đối soát nhanh.</p>
        </section>
      ) : null}

      {q.status === "accepted" ? (
        <p className="rounded-control bg-ok-soft px-3 py-2">Anh chị đã đồng ý báo giá này. Cảm ơn anh chị!</p>
      ) : expired ? null : (
        <AcceptQuote token={token} />
      )}
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
