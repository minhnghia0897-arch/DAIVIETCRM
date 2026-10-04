"use client";

import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";

import { COMBOS, PRICING_VARIANTS, PROVINCES_ALL, demoCatalog } from "@/lib/demo/sales-catalog";
import { priceQuote, type Policy } from "@/lib/sales/pricing";
import { PageHead } from "../parts";
import { useShell } from "../shell-context";
import { useCrm, vnd } from "../store";
import { QuoteSummary } from "./quote-builder";

const TYPE_LABEL: Record<Policy["type"], string> = {
  promotion: "Khuyến mãi",
  delivery: "Giao lắp",
  deposit: "Đặt cọc",
  discount_limit: "Giới hạn giảm giá",
};

const STATUS: Record<Policy["status"], [string, string]> = {
  draft: ["Nháp", "is-n"],
  active: ["Đang áp", "is-ok"],
  paused: ["Tạm dừng", "is-warn"],
  expired: ["Hết hạn", "is-n"],
};

const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : "không hạn");

function summary(p: Policy): string {
  switch (p.type) {
    case "promotion": {
      const b = p.rules.benefit;
      const parts = [
        b.percentOff ? `giảm ${b.percentOff}%` : "",
        b.amountOff ? `giảm ${vnd(b.amountOff)}` : "",
        b.giftVariantIds?.length
          ? `tặng ${b.giftVariantIds.map((g) => PRICING_VARIANTS[g]?.name ?? g).join(", ")}`
          : "",
        b.freeInstallation ? "miễn phí lắp" : "",
        b.freeDelivery ? "miễn phí giao" : "",
      ].filter(Boolean);
      const cond = [
        p.rules.scope?.categoryIds?.length ? `nhóm ${p.rules.scope.categoryIds.join(", ")}` : "",
        p.rules.buyerCountries?.length ? `người đặt ở ${p.rules.buyerCountries.join(", ")}` : "",
        p.rules.customerTags?.includes("referral") ? "khách được giới thiệu" : "",
        p.rules.minSubtotal ? `đơn từ ${vnd(p.rules.minSubtotal)}` : "",
      ].filter(Boolean);
      return `${parts.join(", ")}${cond.length ? `; điều kiện: ${cond.join(", ")}` : ""}`;
    }
    case "delivery":
      return p.rules.zones
        .map((z) => `${z.label}: giao ${vnd(z.fee)}, lắp ghế ${vnd(z.installation.bulky)}`)
        .join(" · ");
    case "deposit":
      return `Tối thiểu ${vnd(p.rules.minAmount)} hoặc ${p.rules.minPercent}%, giữ hàng ${p.rules.holdDays} ngày`;
    case "discount_limit":
      return Object.entries(p.rules.byRole)
        .map(
          ([r, v]) => `${{ owner: "Owner", sale_admin: "Sale admin", telesale: "Telesale" }[r] ?? r} ${v}%`,
        )
        .join(", ");
  }
}

// Chính sách và Thử chính sách (CLAUDE.md 8.5): sửa chính sách đang chạy tạo phiên bản mới, đơn cũ giữ phiên bản đã áp.
export function CrmPolicies() {
  const { state, act } = useCrm();
  const { can, me } = useShell();
  const manage = can("policy.manage");
  const policies = state.settings.policies;
  const [editing, setEditing] = useState<string | null>(null);

  function save(next: Policy[], label: string, detail: string) {
    act({ type: "setSettings", patch: { policies: next }, actor: me, label, detail }, `${label}: ${detail}`);
  }

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={ScrollText}
          color="var(--ai)"
          kicker="Áp vào báo giá và đơn qua hàm định giá"
          title="Chính sách"
        />
      </section>
      <section className="c-card">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Chính sách</th>
                <th>Loại</th>
                <th>Nội dung</th>
                <th>Hiệu lực</th>
                <th>Ưu tiên</th>
                <th>Phiên bản</th>
                <th>Trạng thái</th>
                {manage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-normal">
                    <b>{p.name}</b>
                    {editing === p.id && p.type === "promotion" ? (
                      <PromotionEditor
                        policy={p}
                        onCancel={() => setEditing(null)}
                        onSave={(np) => {
                          setEditing(null);
                          const versioned = p.status === "active" ? { ...np, version: p.version + 1 } : np;
                          save(
                            policies.map((x) => (x.id === p.id ? versioned : x)),
                            "Sửa chính sách",
                            `${p.name}${p.status === "active" ? `, tạo phiên bản ${versioned.version}` : ""}`,
                          );
                        }}
                      />
                    ) : null}
                  </td>
                  <td>{TYPE_LABEL[p.type]}</td>
                  <td className="max-w-80 whitespace-normal c-lbl">{summary(p)}</td>
                  <td className="tabular">
                    {dmy(p.validFrom)} → {dmy(p.validTo)}
                  </td>
                  <td className="tabular">
                    {p.priority}
                    {p.type === "promotion" && !p.stackable ? " · không cộng dồn" : ""}
                  </td>
                  <td className="tabular">v{p.version}</td>
                  <td>
                    <span className={`c-pill ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>
                  </td>
                  {manage ? (
                    <td>
                      <span className="flex gap-1">
                        {p.type === "promotion" ? (
                          <button type="button" className="c-btn" onClick={() => setEditing(p.id)}>
                            Sửa
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="c-btn"
                          onClick={() => {
                            const status = p.status === "active" ? "paused" : "active";
                            save(
                              policies.map((x) => (x.id === p.id ? ({ ...x, status } as Policy) : x)),
                              status === "active" ? "Bật chính sách" : "Tạm dừng chính sách",
                              p.name,
                            );
                          }}
                        >
                          {p.status === "active" ? "Tạm dừng" : "Bật"}
                        </button>
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PolicyTester />
    </div>
  );
}

function PromotionEditor({
  policy,
  onSave,
  onCancel,
}: {
  policy: Extract<Policy, { type: "promotion" }>;
  onSave: (p: Policy) => void;
  onCancel: () => void;
}) {
  const [validTo, setValidTo] = useState(policy.validTo ?? "");
  const [percent, setPercent] = useState(String(policy.rules.benefit.percentOff ?? 0));
  const [amount, setAmount] = useState(String(policy.rules.benefit.amountOff ?? 0));
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      aria-label={`Sửa ${policy.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...policy,
          validTo: validTo || null,
          rules: {
            ...policy.rules,
            benefit: {
              ...policy.rules.benefit,
              percentOff: Number(percent) || undefined,
              amountOff: Number(amount) || undefined,
            },
          },
        });
      }}
    >
      <label className="c-lbl">
        Hết hạn
        <input
          type="date"
          value={validTo}
          onChange={(e) => setValidTo(e.target.value)}
          className="block rounded-control border border-line bg-surface px-1.5 py-1 text-text"
        />
      </label>
      <label className="c-lbl">
        Giảm %
        <input
          aria-label="Giảm phần trăm"
          type="number"
          min={0}
          max={50}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className="block w-16 rounded-control border border-line bg-surface px-1.5 py-1 text-text"
        />
      </label>
      <label className="c-lbl">
        Giảm tiền (đồng)
        <input
          aria-label="Giảm tiền"
          type="number"
          min={0}
          step={100000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="block w-32 rounded-control border border-line bg-surface px-1.5 py-1 text-text"
        />
      </label>
      <button type="submit" className="c-btn is-brand">
        Lưu
      </button>
      <button type="button" className="c-btn" onClick={onCancel}>
        Hủy
      </button>
      {policy.status === "active" ? (
        <span className="c-lbl w-full">Chính sách đang áp: lưu sẽ tạo phiên bản {policy.version + 1}.</span>
      ) : null}
    </form>
  );
}

const ITEMS = [
  ...Object.values(PRICING_VARIANTS).map((v) => ({ value: `v:${v.id}`, label: v.name })),
  ...Object.values(COMBOS).map((c) => ({ value: `c:${c.id}`, label: `Combo: ${c.name}` })),
];

/** Thử chính sách: chọn SKU, kênh, tỉnh, ngày, xem hàm định giá trả gì trước khi bật chính sách. */
function PolicyTester() {
  const { state } = useCrm();
  const [item, setItem] = useState("v:v-x9-br");
  const [qty, setQty] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [province, setProvince] = useState("Nghệ An");
  const [country, setCountry] = useState("KR");
  const [referral, setReferral] = useState(false);
  const [date, setDate] = useState("2026-10-04");
  const [role, setRole] = useState("telesale");

  const result = useMemo(() => {
    const [kind, id] = item.split(":");
    return priceQuote(
      {
        lines: [
          {
            ...(kind === "c" ? { comboId: id } : { variantId: id }),
            qty,
            manualDiscount: discount ? { kind: "percent", value: discount } : undefined,
          },
        ],
        context: {
          showroomId: "q4",
          channel: "online",
          buyerCountry: country,
          customerTags: referral ? ["referral"] : [],
          recipientProvince: province,
          date: new Date(`${date}T10:00:00+07:00`),
          sellerId: "test",
          sellerRole: role,
        },
      },
      demoCatalog(state.settings.policies),
    );
  }, [item, qty, discount, province, country, referral, date, role, state.settings.policies]);

  const field = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
  return (
    <section className="c-card c-einc" aria-label="Thử chính sách">
      <div className="c-ch">
        <h2>Thử chính sách</h2>
        <span className="c-r c-lbl">Không tạo báo giá, chỉ xem kết quả</span>
      </div>
      <div className="c-cb">
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="c-lbl sm:col-span-2">
            Sản phẩm, combo
            <select
              aria-label="Sản phẩm thử"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              className={field}
            >
              {ITEMS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Số lượng
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className={field}
            />
          </label>
          <label className="c-lbl">
            Giảm tay %
            <input
              aria-label="Giảm tay thử"
              type="number"
              min={0}
              max={50}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              className={field}
            />
          </label>
          <label className="c-lbl">
            Tỉnh người nhận
            <select value={province} onChange={(e) => setProvince(e.target.value)} className={field}>
              {PROVINCES_ALL.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Người đặt ở
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              <option value="KR">Hàn Quốc</option>
              <option value="VN">Việt Nam</option>
            </select>
          </label>
          <label className="c-lbl">
            Ngày
            <input
              aria-label="Ngày thử"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </label>
          <label className="c-lbl">
            Người bán
            <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
              <option value="telesale">Telesale</option>
              <option value="sale_admin">Sale admin</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 sm:col-span-4">
            <input type="checkbox" checked={referral} onChange={(e) => setReferral(e.target.checked)} /> Khách
            được giới thiệu
          </label>
        </div>
        <QuoteSummary result={result} />
      </div>
    </section>
  );
}
