import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { formatMoney } from "@/lib/format";
import { loadQuoteView, type QuoteView } from "@/lib/sales/quote-view";

// Ảnh báo giá gửi khách (PNG): nhân viên tải hoặc chép ảnh rồi gửi trong khung chat, không cần link. Chỉ người xem
// được báo giá (RLS của quotes: xem được lead) mới lấy được ảnh.

export const runtime = "nodejs";

const W = 900;
const PAD = 44;
const INK = "#1d1d1f";
const MUTED = "#6b6b70";
const LINE = "#e6e6ea";
const BRAND = "#1f7a4d";

const day = (d: Date) =>
  d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

let fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const read = async (f: string) => {
    const b = await readFile(join(process.cwd(), "assets/fonts", f));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  fonts = [
    { name: "Be Vietnam Pro", data: await read("BeVietnamPro-Regular.ttf"), weight: 400, style: "normal" },
    { name: "Be Vietnam Pro", data: await read("BeVietnamPro-Bold.ttf"), weight: 700, style: "normal" },
  ];
  return fonts;
}

/** Số dòng chữ ước tính của một đoạn ở cỡ chữ đã cho (để tính chiều cao ảnh). */
function rows(text: string, size: number, width = W - PAD * 2): number {
  const perLine = Math.max(20, Math.floor(width / (size * 0.52)));
  return text.split("\n").reduce((n, t) => n + Math.max(1, Math.ceil(t.length / perLine)), 0);
}

function lineDetail(l: QuoteView["lines"][number]): string {
  return [
    l.sku ? `Mã ${l.sku}` : null,
    `SL ${l.qty}`,
    l.isGift ? null : `Đơn giá ${formatMoney(l.unitPrice)}`,
    l.discount && !l.isGift ? `Giảm ${formatMoney(l.discount)}` : null,
    l.warrantyMonths ? `Bảo hành ${l.warrantyMonths} tháng` : null,
    l.installation ? "Lắp đặt tận nơi" : null,
    l.combo ? `Combo ${l.combo}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function estimateHeight(v: QuoteView): number {
  let h = 260; // đầu ảnh, ngày
  h += 60 + [v.buyer, v.recipient, v.address, v.occasion, v.giftMessage].filter(Boolean).length * 34;
  if (v.address) h += (rows(v.address, 19, W - PAD * 2 - 170) - 1) * 28;
  h += 60 + v.lines.reduce((n, l) => n + 40 + rows(lineDetail(l), 16, W - PAD * 2 - 180) * 24, 0);
  h += 8 * 36 + 30;
  if (v.promotions.length) h += 56 + v.promotions.reduce((n, p) => n + rows(p, 17) * 26, 0);
  if (v.delivery.length) h += 56 + v.delivery.reduce((n, p) => n + rows(p, 17) * 26, 0);
  if (v.bankInfo) h += 90 + rows(v.bankInfo, 18) * 28;
  for (const n of v.notes) h += 56 + rows(n.text, 16) * 24;
  h += 120; // chân ảnh
  return Math.min(Math.ceil(h), 6000);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
      <div
        style={{
          display: "flex",
          fontSize: 15,
          fontWeight: 700,
          color: BRAND,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", fontSize: 19, marginBottom: 8 }}>
      <div style={{ display: "flex", width: 170, color: MUTED, flexShrink: 0 }}>{label}</div>
      <div style={{ display: "flex", flex: 1, fontWeight: strong ? 700 : 400 }}>{value}</div>
    </div>
  );
}

function Money({
  label,
  value,
  big,
  muted,
}: {
  label: string;
  value: string;
  big?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: big ? 26 : 19,
        fontWeight: big ? 700 : 400,
        color: muted ? MUTED : INK,
        padding: big ? "12px 0" : "6px 0",
        borderTop: big ? `2px solid ${INK}` : "none",
        marginTop: big ? 6 : 0,
      }}
    >
      <div style={{ display: "flex" }}>{label}</div>
      <div style={{ display: "flex" }}>{value}</div>
    </div>
  );
}

function QuoteImage({ v }: { v: QuoteView }) {
  const remaining = Math.max(0, v.total - v.depositMin);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        color: INK,
        fontFamily: "Be Vietnam Pro",
        padding: PAD,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 18, color: MUTED }}>{v.showroom}</div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, marginTop: 4 }}>BÁO GIÁ</div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: BRAND }}>{v.code}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 17 }}>
          <div style={{ display: "flex", color: MUTED }}>Ngày lập: {day(v.issuedAt)}</div>
          <div style={{ display: "flex", color: MUTED, marginTop: 4 }}>Hiệu lực đến: {day(v.validUntil)}</div>
          {v.orderCode ? (
            <div style={{ display: "flex", fontWeight: 700, marginTop: 4 }}>Mã đơn: {v.orderCode}</div>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", height: 4, background: BRAND, marginTop: 18, borderRadius: 2 }} />

      <Section title="Thông tin đặt hàng">
        <Row label="Người đặt" value={v.buyer} strong />
        <Row label="Người nhận" value={v.recipient ?? "Chính người đặt"} strong />
        {v.address ? <Row label="Giao tới" value={v.address} /> : null}
        {v.occasion ? <Row label="Dịp" value={v.occasion} /> : null}
        {v.giftMessage ? <Row label="Lời nhắn quà" value={`“${v.giftMessage}”`} /> : null}
      </Section>

      <Section title="Sản phẩm">
        {v.lines.map((l, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0",
              borderTop: i ? `1px solid ${LINE}` : "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 20 }}>
              <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>
                {l.name}
                {l.isGift ? <span style={{ color: BRAND, marginLeft: 8 }}>(Quà tặng)</span> : null}
              </div>
              <div style={{ display: "flex", fontSize: 16, color: MUTED, marginTop: 4 }}>{lineDetail(l)}</div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 700,
                width: 170,
                justifyContent: "flex-end",
              }}
            >
              {l.isGift ? "0đ" : formatMoney(l.total)}
            </div>
          </div>
        ))}
      </Section>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 16,
          padding: "14px 20px",
          background: "#f6f7f8",
          borderRadius: 14,
        }}
      >
        <Money label="Tạm tính theo giá lẻ" value={formatMoney(v.subtotal)} />
        {v.discount ? <Money label="Giảm giá" value={`−${formatMoney(v.discount)}`} /> : null}
        <Money label="Phí giao hàng" value={v.deliveryFee ? formatMoney(v.deliveryFee) : "Miễn phí"} />
        <Money label="Phí lắp đặt" value={v.installationFee ? formatMoney(v.installationFee) : "Miễn phí"} />
        <Money label="TỔNG THANH TOÁN" value={formatMoney(v.total)} big />
        <Money label="Đặt cọc tối thiểu" value={formatMoney(v.depositMin)} />
        <Money label="Còn lại thanh toán khi nhận hàng" value={formatMoney(remaining)} muted />
      </div>

      {v.promotions.length ? (
        <Section title="Ưu đãi đã áp">
          {v.promotions.map((p) => (
            <div key={p} style={{ display: "flex", fontSize: 17, marginBottom: 4 }}>
              • {p}
            </div>
          ))}
        </Section>
      ) : null}
      {v.delivery.length ? (
        <Section title="Giao hàng và lắp đặt">
          {v.delivery.map((p) => (
            <div key={p} style={{ display: "flex", fontSize: 17, marginBottom: 4 }}>
              • {p}
            </div>
          ))}
        </Section>
      ) : null}

      {v.bankInfo ? (
        <Section title="Chuyển khoản đặt cọc">
          <div style={{ display: "flex", fontSize: 18, whiteSpace: "pre-wrap" }}>{v.bankInfo}</div>
          <div style={{ display: "flex", fontSize: 18, marginTop: 8 }}>
            Nội dung chuyển khoản:&nbsp;<b>{v.orderCode ?? v.code}</b>
          </div>
        </Section>
      ) : null}

      {v.notes.map((n) => (
        <Section key={n.name} title={n.name}>
          <div style={{ display: "flex", fontSize: 16, color: MUTED, whiteSpace: "pre-wrap" }}>{n.text}</div>
        </Section>
      ))}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "auto",
          paddingTop: 24,
          fontSize: 16,
          color: MUTED,
        }}
      >
        <div style={{ display: "flex" }}>
          Anh chị nhắn showroom &quot;Đồng ý&quot; để xác nhận đơn và chuyển khoản đặt cọc.
        </div>
        <div style={{ display: "flex", marginTop: 4 }}>
          Giá áp dụng đến hết ngày {day(v.validUntil)}. Cảm ơn anh chị đã tin chọn {v.showroom}.
        </div>
      </div>
    </div>
  );
}

export async function GET(_req: Request, ctx: RouteContext<"/api/quotes/[id]/image">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Không tìm thấy", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  // Kiểm quyền xem bằng RLS của chính người dùng trước khi đọc đủ dữ liệu bằng service_role.
  const { data: visible } = await (
    await createClient()
  )
    .from("quotes")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!visible) return new Response("Không tìm thấy", { status: 404 });
  const v = await loadQuoteView(createAdminClient(), id);
  if (!v) return new Response("Không tìm thấy", { status: 404 });

  return new ImageResponse(<QuoteImage v={v} />, {
    width: W,
    height: estimateHeight(v),
    fonts: await loadFonts(),
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${v.code}.png"`,
    },
  });
}
