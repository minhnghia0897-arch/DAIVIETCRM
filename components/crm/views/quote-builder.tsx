"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { missingInfo } from "@/lib/demo/ops-data";
import { COMBOS, PRICING_VARIANTS, PROVINCES_ALL, demoCatalog } from "@/lib/demo/sales-catalog";
import type { Opportunity } from "@/lib/demo/crm-data";
import { priceQuote, type QuoteInput, type QuoteResult } from "@/lib/sales/pricing";
import { useShell } from "../shell-context";
import { simDate, useCrm, vnd, type QuoteRec } from "../store";

interface Row {
  key: number;
  ref: string;
  qty: number;
  discount: number;
}

const PRODUCT_REF: [string, string][] = [
  ["DV-X9", "v:v-x9-br"],
  ["DV-S7", "v:v-s7-bk"],
  ["DV-M5", "v:v-m5"],
  ["lọc nước", "v:v-ion"],
  ["Lõi", "v:v-core"],
];

const OPTIONS = [
  ...Object.values(PRICING_VARIANTS).map((v) => ({
    value: `v:${v.id}`,
    label: `${v.name} · ${vnd(v.price)}`,
  })),
  ...Object.values(COMBOS).map((c) => ({ value: `c:${c.id}`, label: `Combo: ${c.name}` })),
];

function toLines(rows: Row[]): QuoteInput["lines"] {
  return rows.map((r) => {
    const [kind, id] = r.ref.split(":");
    return {
      ...(kind === "c" ? { comboId: id } : { variantId: id }),
      qty: r.qty,
      manualDiscount: r.discount ? { kind: "percent" as const, value: r.discount } : undefined,
    };
  });
}

/** Tạo báo giá: mọi con số do hàm định giá dùng chung tính, giao diện không tự cộng tiền. */
export function QuoteBuilder({ opp, onDone }: { opp: Opportunity; onDone: () => void }) {
  const { state, act } = useCrm();
  const { me, roleKey } = useShell();
  const info = state.leadInfo[opp.id];
  const initial = PRODUCT_REF.find(([k]) => opp.product.includes(k))?.[1] ?? "v:v-x9-br";
  const [rows, setRows] = useState<Row[]>([{ key: 1, ref: initial, qty: 1, discount: 0 }]);
  const [province, setProvince] = useState(info?.recipientProvince || "TP.HCM");

  const result = useMemo(
    () =>
      priceQuote(
        {
          lines: toLines(rows),
          context: {
            showroomId: "q4",
            channel: "online",
            buyerCountry: info?.market ?? "VN",
            customerTags: info?.tags ?? [],
            recipientProvince: province,
            date: simDate(state.minutes),
            sellerId: me,
            sellerRole: roleKey,
          },
        },
        demoCatalog(state.settings.policies),
      ),
    [rows, province, info, state.minutes, state.settings.policies, me, roleKey],
  );

  const missing = info ? missingInfo(info) : ["Mua cho ai", "Tỉnh người nhận", "Dịp mua", "Ngân sách"];
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="c-nba" style={{ marginTop: 0 }}>
      <h3>Báo giá mới cho {opp.name}</h3>
      {missing.length ? (
        <p className="m-0 rounded-control bg-warn-soft px-2.5 py-2 text-warn">
          Chưa tạo được báo giá: thiếu {missing.join(", ").toLowerCase()}.
        </p>
      ) : null}
      <div className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Sản phẩm dòng ${i + 1}`}
              value={r.ref}
              onChange={(e) => update(r.key, { ref: e.target.value })}
              className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
            >
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 c-lbl">
              SL
              <input
                aria-label={`Số lượng dòng ${i + 1}`}
                type="number"
                min={1}
                value={r.qty}
                onChange={(e) => update(r.key, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                className="w-14 rounded-control border border-line bg-surface px-2 py-1.5 text-text"
              />
            </label>
            <label className="flex items-center gap-1 c-lbl">
              Giảm %
              <input
                aria-label={`Giảm tay dòng ${i + 1}`}
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={r.discount}
                onChange={(e) =>
                  update(r.key, { discount: Math.min(50, Math.max(0, Number(e.target.value) || 0)) })
                }
                className="w-16 rounded-control border border-line bg-surface px-2 py-1.5 text-text"
              />
            </label>
            {rows.length > 1 ? (
              <button
                type="button"
                className="c-ib"
                aria-label={`Xóa dòng ${i + 1}`}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="c-btn"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { key: (rs.at(-1)?.key ?? 0) + 1, ref: "v:v-pillow", qty: 1, discount: 0 },
              ])
            }
          >
            <Plus size={13} className="mr-1 inline" aria-hidden />
            Thêm dòng
          </button>
          <label className="ml-auto flex items-center gap-1.5 c-lbl">
            Giao tới
            <select
              aria-label="Tỉnh giao"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="rounded-control border border-line bg-surface px-2 py-1.5 text-text"
            >
              {PROVINCES_ALL.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <QuoteSummary result={result} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="c-btn is-brand"
          disabled={missing.length > 0 || result.lines.length === 0}
          onClick={() => {
            const token = Math.random().toString(36).slice(2, 10);
            act(
              { type: "sendQuote", oppId: opp.id, token, lines: toLines(rows), province, result, actor: me },
              result.approvalsNeeded.length
                ? "Đã gửi duyệt giảm giá, báo giá chờ Owner"
                : "Đã gửi báo giá cho khách",
            );
            onDone();
          }}
        >
          {result.approvalsNeeded.length ? "Gửi duyệt giảm giá" : "Gửi báo giá"}
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </div>
  );
}

export function QuoteSummary({ result }: { result: QuoteResult }) {
  return (
    <div className="mt-3" aria-label="Kết quả định giá" role="group">
      <table className="c-rl">
        <tbody>
          {result.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.name} × {l.qty}
                {l.isGift ? <span className="c-pill is-ok ml-1">Tặng</span> : null}
                {l.discount && !l.isGift ? <div className="c-lbl">Giảm {vnd(l.discount)}</div> : null}
              </td>
              <td className="tabular">{l.isGift ? "0đ" : vnd(l.total)}</td>
            </tr>
          ))}
          <tr>
            <td className="c-lbl">Tạm tính (giá lẻ)</td>
            <td className="tabular">{vnd(result.totals.subtotal)}</td>
          </tr>
          <tr>
            <td className="c-lbl">Giảm</td>
            <td className="tabular">−{vnd(result.totals.discount)}</td>
          </tr>
          <tr>
            <td className="c-lbl">
              Phí giao {vnd(result.fees.delivery)}, lắp {vnd(result.fees.installation)}
            </td>
            <td className="tabular">{vnd(result.totals.fees)}</td>
          </tr>
          <tr>
            <td>
              <b>Tổng</b>
            </td>
            <td className="tabular">
              <b>{vnd(result.totals.total)}</b>
            </td>
          </tr>
          <tr>
            <td className="c-lbl">Cọc tối thiểu, giữ hàng {result.deposit.holdDays} ngày</td>
            <td className="tabular">{vnd(result.deposit.minimum)}</td>
          </tr>
        </tbody>
      </table>
      {result.appliedPolicies.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.appliedPolicies.map((p) => (
            <span key={p.id} className="c-pill is-ai whitespace-normal" title={p.benefit}>
              {p.name}
              {p.benefit ? `: ${p.benefit}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {result.approvalsNeeded.map((a) => (
        <p key={a.reason} className="mt-2 mb-0 rounded-control bg-warn-soft px-2.5 py-1.5 text-warn">
          Cần Owner duyệt: {a.reason}
        </p>
      ))}
      {result.warnings.map((w) => (
        <p key={w} className="mt-2 mb-0 rounded-control bg-err-soft px-2.5 py-1.5 text-err">
          {w}
        </p>
      ))}
    </div>
  );
}

const QUOTE_STATUS: Record<QuoteRec["status"], [string, string]> = {
  pending_approval: ["Chờ duyệt giảm giá", "is-warn"],
  sent: ["Đã gửi", "is-n"],
  viewed: ["Khách đã xem", "is-ai"],
  accepted: ["Khách đồng ý", "is-ok"],
  rejected: ["Từ chối", "is-err"],
};

/** Trang báo giá khách thấy qua link /q/<token>: không có số điện thoại hay thông tin nội bộ. */
export function CustomerQuotePreview({ quote, opp }: { quote: QuoteRec; opp: Opportunity }) {
  return (
    <div
      className="mt-2 rounded-card border border-line bg-surface-2 p-3"
      aria-label="Trang báo giá cho khách"
    >
      <p className="c-lbl m-0">Khách mở link /q/{quote.token} sẽ thấy:</p>
      <div className="mx-auto mt-2 max-w-sm rounded-card border border-line bg-surface p-3">
        <b className="text-brand-strong">Đại Việt · Showroom Quận 4</b>
        <p className="mb-1">
          Báo giá {quote.id} gửi anh chị {opp.name.split(" ").pop()}, hiệu lực đến {quote.validUntil}
        </p>
        <QuoteSummary result={{ ...quote.result, approvalsNeeded: [], warnings: [] }} />
        <p className="c-lbl mb-0">
          Giao và lắp tận nhà tại {quote.province}. Bảo hành điện tử gửi về Zalo người đặt. Chuyển khoản vào
          tài khoản công ty, nội dung: <b>{quote.id}</b>.
        </p>
      </div>
    </div>
  );
}

export function QuoteList({ oppId }: { oppId: string }) {
  const { state, act } = useCrm();
  const { me, can } = useShell();
  const [preview, setPreview] = useState<string | null>(null);
  const quotes = state.quotes.filter((q) => q.oppId === oppId);
  const opp = state.opps.find((o) => o.id === oppId);
  if (!quotes.length || !opp)
    return <p className="c-lbl m-0">Chưa có báo giá. Bấm Tạo báo giá khi đã đủ 4 thông tin bắt buộc.</p>;
  return (
    <div className="space-y-2">
      {quotes.map((q) => (
        <div key={q.id} className="c-nba" style={{ marginTop: 0 }}>
          <div className="flex flex-wrap items-center gap-2">
            <b>{q.id}</b>
            <span className={`c-pill ${QUOTE_STATUS[q.status][1]}`}>{QUOTE_STATUS[q.status][0]}</span>
            <span className="tabular">{vnd(q.result.totals.total)}</span>
            <span className="c-lbl">
              {q.createdBy} · {q.time}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {q.status !== "pending_approval" && q.status !== "rejected" ? (
              <button
                type="button"
                className="c-btn"
                onClick={() => setPreview(preview === q.id ? null : q.id)}
              >
                {preview === q.id ? "Ẩn trang khách" : "Xem trang khách"}
              </button>
            ) : null}
            {q.status === "sent" ? (
              <button
                type="button"
                className="c-btn"
                onClick={() =>
                  act(
                    { type: "markQuote", id: q.id, status: "viewed", actor: "Khách" },
                    "Khách đã mở báo giá",
                  )
                }
              >
                Mô phỏng: khách mở link
              </button>
            ) : null}
            {(q.status === "sent" || q.status === "viewed") && can("order.create") ? (
              <>
                <button
                  type="button"
                  className="c-btn is-brand"
                  onClick={() =>
                    act(
                      { type: "markQuote", id: q.id, status: "accepted", actor: me },
                      "Khách đã đồng ý, đã tạo đơn hàng",
                    )
                  }
                >
                  Khách đã đồng ý
                </button>
                <button
                  type="button"
                  className="c-btn"
                  onClick={() =>
                    act(
                      { type: "markQuote", id: q.id, status: "rejected", actor: me },
                      "Đã ghi khách từ chối",
                    )
                  }
                >
                  Khách từ chối
                </button>
              </>
            ) : null}
          </div>
          {preview === q.id ? <CustomerQuotePreview quote={q} opp={opp} /> : null}
        </div>
      ))}
    </div>
  );
}
