"use client";

import { Plus, ScrollText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { toQuoteInput } from "@/lib/sales/checkout";
import { POLICY_TYPE_LABEL, SALES_CHANNELS, type PolicyType } from "@/lib/sales/policy-rules";
import { priceQuote, type Policy, type PricingCatalog } from "@/lib/sales/pricing";

import { PageHead } from "../parts";
import { PricingSummary } from "./pricing-summary";

// Chính sách, combo, Thử chính sách bản thật (route /policies), bám bản mô phỏng policies.tsx. Sửa chính sách đã chạy
// tạo phiên bản mới (database); Thử chính sách gọi đúng hàm định giá dùng chung trên danh mục thật.

type Result = { ok: boolean; message: string };

export interface LivePolicy {
  id: string;
  policyKey: string;
  version: number;
  oldVersions: number;
  type: string;
  name: string;
  status: string;
  validFrom: string;
  validTo: string | null;
  channels: string[];
  priority: number;
  stackable: boolean;
  rules: unknown;
}

export interface LiveCombo {
  id?: string;
  code: string;
  name: string;
  description: string;
  pricingMode: "fixed_price" | "sum_minus";
  amount: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  items: { variantId: string; qty: number; isGift: boolean }[];
}

interface Actions {
  savePolicy(i: {
    policyKey?: string;
    type: PolicyType;
    name: string;
    status: "draft" | "active" | "paused" | "expired";
    validFrom: string;
    validTo: string | null;
    channels: string[];
    priority: number;
    stackable: boolean;
    rules: unknown;
  }): Promise<Result>;
  setPolicyStatus(i: { policyKey: string; status: string }): Promise<Result>;
  saveCombo(i: LiveCombo): Promise<Result>;
}

const STATUS: Record<string, [string, string]> = {
  draft: ["Nháp", "is-n"],
  active: ["Đang áp", "is-ok"],
  paused: ["Tạm dừng", "is-warn"],
  expired: ["Hết hạn", "is-n"],
};
const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : "không hạn");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

function useRun() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<Result>, after?: () => void) =>
      start(async () => {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok) {
          after?.();
          router.refresh();
        }
      }),
  };
}

export function PoliciesLive({
  policies,
  combos,
  catalog,
  products,
  gifts,
  categories,
  roles,
  provinces,
  showroomId,
  perms,
  actions,
}: {
  policies: LivePolicy[];
  combos: LiveCombo[];
  catalog: PricingCatalog;
  products: { variantId: string; sku: string; name: string; price: number }[];
  /** Danh mục Quà tặng (/gifts): chọn quà cho khuyến mãi, combo. */
  gifts: { variantId: string; sku: string; name: string }[];
  categories: { id: string; name: string }[];
  roles: { key: string; name: string }[];
  provinces: string[];
  showroomId: string;
  perms: { policy: boolean; combo: boolean; viewPolicies: boolean };
  actions: Actions;
}) {
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [comboEditing, setComboEditing] = useState<string | null>(null);
  const variantName = (id: string) => catalog.variants[id]?.name ?? "SKU";
  const ctx = { products, gifts, categories, roles, provinces, combos, variantName };

  function summary(p: LivePolicy): string {
    const r = p.rules as Record<string, never>;
    switch (p.type) {
      case "promotion": {
        const b = (r.benefit ?? {}) as {
          percentOff?: number;
          amountOff?: number;
          giftVariantIds?: string[];
          freeInstallation?: boolean;
          freeDelivery?: boolean;
        };
        return [
          b.percentOff ? `giảm ${b.percentOff}%` : "",
          b.amountOff ? `giảm ${formatMoney(b.amountOff)}` : "",
          b.giftVariantIds?.length ? `tặng ${b.giftVariantIds.map(variantName).join(", ")}` : "",
          b.freeInstallation ? "miễn phí lắp" : "",
          b.freeDelivery ? "miễn phí giao" : "",
        ]
          .filter(Boolean)
          .join(", ");
      }
      case "delivery":
        return ((r.zones ?? []) as { label: string; fee: number }[])
          .map((z) => `${z.label}: ${formatMoney(z.fee)}`)
          .join(" · ");
      case "deposit": {
        const d = r as unknown as { minAmount: number; minPercent: number; holdDays: number };
        return `Tối thiểu ${formatMoney(d.minAmount)} hoặc ${d.minPercent}%`;
      }
      case "discount_limit":
        return Object.entries((r.byRole ?? {}) as Record<string, number>)
          .map(([k, v]) => `${roles.find((x) => x.key === k)?.name ?? k} ${v}%`)
          .join(", ");
      default:
        return String((r as { text?: string }).text ?? "").slice(0, 120);
    }
  }

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={ScrollText}
          color="var(--ai)"
          kicker="Áp vào báo giá và đơn qua hàm định giá"
          title="Chính sách"
        >
          {perms.policy ? (
            <button type="button" className="c-btn is-blue" onClick={() => setEditing("new")}>
              Thêm chính sách
            </button>
          ) : null}
        </PageHead>
      </section>

      {editing === "new" ? (
        <PolicyForm ctx={ctx} save={actions.savePolicy} onDone={() => setEditing(null)} />
      ) : null}

      {perms.viewPolicies ? (
        <section className="c-card" aria-label="Danh sách chính sách">
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
                  {perms.policy ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-normal">
                      <b>{p.name}</b>
                    </td>
                    <td>{POLICY_TYPE_LABEL[p.type as PolicyType] ?? p.type}</td>
                    <td className="c-lbl max-w-80 whitespace-normal">{summary(p)}</td>
                    <td className="tabular">
                      {dmy(p.validFrom)} → {dmy(p.validTo)}
                    </td>
                    <td className="tabular">
                      {p.priority}
                      {p.type === "promotion" && !p.stackable ? " · không cộng dồn" : ""}
                    </td>
                    <td className="tabular">
                      v{p.version}
                      {p.oldVersions ? <span className="c-lbl"> · lưu {p.oldVersions} bản cũ</span> : null}
                    </td>
                    <td>
                      <span className={`c-pill ${STATUS[p.status]?.[1] ?? "is-n"}`}>
                        {STATUS[p.status]?.[0] ?? p.status}
                      </span>
                    </td>
                    {perms.policy ? (
                      <td>
                        <span className="flex gap-1">
                          <button type="button" className="c-btn" onClick={() => setEditing(p.id)}>
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="c-btn"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                actions.setPolicyStatus({
                                  policyKey: p.policyKey,
                                  status: p.status === "active" ? "paused" : "active",
                                }),
                              )
                            }
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
          {policies.length === 0 ? (
            <p className="c-empty">
              Chưa có chính sách nào. Khi chưa bật chính sách đặt cọc, giới hạn giảm thì hệ thống dùng mức
              trong Cài đặt, Bán hàng.
            </p>
          ) : null}
          {editing && editing !== "new" ? (
            <PolicyForm
              key={editing}
              ctx={ctx}
              initial={policies.find((p) => p.id === editing)}
              save={actions.savePolicy}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </section>
      ) : null}

      <section className="c-card" aria-label="Combo">
        <div className="c-ch">
          <h2>Combo</h2>
          {perms.combo ? (
            <button type="button" className="c-btn c-r" onClick={() => setComboEditing("new")}>
              Thêm combo
            </button>
          ) : null}
        </div>
        {comboEditing ? (
          <ComboForm
            key={comboEditing}
            initial={combos.find((c) => c.id === comboEditing)}
            products={products}
            gifts={gifts}
            save={actions.saveCombo}
            onDone={() => setComboEditing(null)}
          />
        ) : null}
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Combo</th>
                <th>Thành phần</th>
                <th>Giá</th>
                {perms.combo ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b> <span className="c-lbl">{c.code}</span>
                    {!c.active ? <span className="c-pill is-n ml-1">Ngừng</span> : null}
                  </td>
                  <td className="c-lbl whitespace-normal">
                    {c.items
                      .map((i) => `${variantName(i.variantId)} × ${i.qty}${i.isGift ? " (tặng)" : ""}`)
                      .join(", ")}
                  </td>
                  <td className="whitespace-normal">
                    {c.pricingMode === "fixed_price"
                      ? `Trọn gói ${formatMoney(c.amount)}`
                      : `Tổng giá lẻ trừ ${formatMoney(c.amount)}`}
                  </td>
                  {perms.combo ? (
                    <td>
                      <button type="button" className="c-btn" onClick={() => setComboEditing(c.id!)}>
                        Sửa
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {combos.length === 0 ? <p className="c-empty">Chưa có combo nào.</p> : null}
        <p className="c-lbl px-4 py-2">
          Bán combo thì đơn tách thành từng sản phẩm, giá combo chia theo giá lẻ.
        </p>
      </section>

      <PolicyTester
        catalog={catalog}
        policies={policies}
        products={products}
        combos={combos}
        roles={roles}
        provinces={provinces}
        showroomId={showroomId}
      />
    </div>
  );
}

interface Ctx {
  products: { variantId: string; sku: string; name: string }[];
  gifts: { variantId: string; sku: string; name: string }[];
  categories: { id: string; name: string }[];
  roles: { key: string; name: string }[];
  provinces: string[];
  combos: LiveCombo[];
  variantName: (id: string) => string;
}

type Zone = {
  label: string;
  provinces: string;
  fee: string;
  bulky: string;
  parcel: string;
  leadDays: string;
  cutoffDate: string;
  cutoffLabel: string;
};

function PolicyForm({
  ctx,
  initial,
  save,
  onDone,
}: {
  ctx: Ctx;
  initial?: LivePolicy;
  save: Actions["savePolicy"];
  onDone: () => void;
}) {
  const { run, pending } = useRun();
  const r = (initial?.rules ?? {}) as Record<string, unknown>;
  const [type, setType] = useState<PolicyType>((initial?.type as PolicyType) ?? "promotion");
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? today());
  const [validTo, setValidTo] = useState(initial?.validTo ?? "");
  const [channels, setChannels] = useState<string[]>(initial?.channels ?? []);
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  const [stackable, setStackable] = useState(initial?.stackable ?? false);
  // Khuyến mãi
  const b = (r.benefit ?? {}) as Record<string, unknown>;
  const s = (r.scope ?? {}) as Record<string, string[] | undefined>;
  const [scopeVariants, setScopeVariants] = useState<string[]>(s.variantIds ?? []);
  const [scopeCats, setScopeCats] = useState<string[]>(s.categoryIds ?? []);
  const [scopeCombos, setScopeCombos] = useState<string[]>(s.comboIds ?? []);
  const [minSubtotal, setMinSubtotal] = useState(String(r.minSubtotal ?? ""));
  const [countries, setCountries] = useState<string[]>((r.buyerCountries as string[]) ?? []);
  const [tags, setTags] = useState(((r.customerTags as string[]) ?? []).join(", "));
  const [percentOff, setPercentOff] = useState(String(b.percentOff ?? ""));
  const [amountOff, setAmountOff] = useState(String(b.amountOff ?? ""));
  const [gifts, setGifts] = useState<string[]>((b.giftVariantIds as string[]) ?? []);
  const [freeInstall, setFreeInstall] = useState(Boolean(b.freeInstallation));
  const [freeDelivery, setFreeDelivery] = useState(Boolean(b.freeDelivery));
  // Giao lắp
  const [zones, setZones] = useState<Zone[]>(
    ((r.zones as Record<string, unknown>[]) ?? []).map((z) => ({
      label: String(z.label ?? ""),
      provinces: z.provinces === "*" ? "*" : ((z.provinces as string[]) ?? []).join(", "),
      fee: String(z.fee ?? 0),
      bulky: String((z.installation as Record<string, number>)?.bulky ?? 0),
      parcel: String((z.installation as Record<string, number>)?.parcel ?? 0),
      leadDays: String(z.leadDays ?? 3),
      cutoffDate: String((z.cutoff as Record<string, string>)?.date ?? ""),
      cutoffLabel: String((z.cutoff as Record<string, string>)?.label ?? ""),
    })),
  );
  // Đặt cọc
  const [minAmount, setMinAmount] = useState(String(r.minAmount ?? 10000000));
  const [minPercent, setMinPercent] = useState(String(r.minPercent ?? 10));
  // Không giữ hàng nữa (không quản lý kho); giữ nguyên giá trị cũ cho đúng mẫu quy tắc chính sách cọc.
  const holdDays = String(r.holdDays ?? 14);
  // Giới hạn giảm
  const [byRole, setByRole] = useState<Record<string, string>>(
    Object.fromEntries(
      ctx.roles.map((x) => [x.key, String((r.byRole as Record<string, number>)?.[x.key] ?? "")]),
    ),
  );
  const [text, setText] = useState(String(r.text ?? ""));

  function rules(): unknown {
    switch (type) {
      case "promotion": {
        const scope = {
          ...(scopeVariants.length ? { variantIds: scopeVariants } : {}),
          ...(scopeCats.length ? { categoryIds: scopeCats } : {}),
          ...(scopeCombos.length ? { comboIds: scopeCombos } : {}),
        };
        return {
          ...(Object.keys(scope).length ? { scope } : {}),
          ...(minSubtotal.trim() ? { minSubtotal: num(minSubtotal) } : {}),
          ...(countries.length ? { buyerCountries: countries } : {}),
          ...(tags.trim()
            ? {
                customerTags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              }
            : {}),
          benefit: {
            ...(percentOff.trim() ? { percentOff: num(percentOff) } : {}),
            ...(amountOff.trim() ? { amountOff: num(amountOff) } : {}),
            ...(gifts.length ? { giftVariantIds: gifts } : {}),
            ...(freeInstall ? { freeInstallation: true } : {}),
            ...(freeDelivery ? { freeDelivery: true } : {}),
          },
        };
      }
      case "delivery":
        return {
          zones: zones.map((z) => ({
            label: z.label.trim(),
            provinces:
              z.provinces.trim() === "*"
                ? "*"
                : z.provinces
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
            fee: num(z.fee),
            installation: { bulky: num(z.bulky), parcel: num(z.parcel) },
            leadDays: num(z.leadDays),
            ...(z.cutoffDate
              ? { cutoff: { date: z.cutoffDate, label: z.cutoffLabel.trim() || "dịp lễ" } }
              : {}),
          })),
        };
      case "deposit":
        return { minAmount: num(minAmount), minPercent: num(minPercent), holdDays: num(holdDays) };
      case "discount_limit":
        return {
          byRole: Object.fromEntries(
            Object.entries(byRole)
              .filter(([, v]) => v.trim() !== "")
              .map(([k, v]) => [k, num(v)]),
          ),
        };
      default:
        return { text: text.trim() };
    }
  }

  const multi = (
    label: string,
    options: { value: string; label: string }[],
    value: string[],
    set: (v: string[]) => void,
  ) => (
    <fieldset className="c-lbl">
      <legend>{label}</legend>
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={value.includes(o.value)}
              onChange={(e) =>
                set(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))
              }
            />
            {o.label}
          </label>
        ))}
      </span>
    </fieldset>
  );

  return (
    <form
      className="c-cb grid gap-2 border-t border-line-2 sm:grid-cols-3"
      style={{ paddingTop: 14 }}
      aria-label={initial ? `Sửa ${initial.name}` : "Thêm chính sách"}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            save({
              policyKey: initial?.policyKey,
              type,
              name,
              status: status as "draft",
              validFrom,
              validTo: validTo || null,
              channels,
              priority: Math.round(Number(priority) || 0),
              stackable,
              rules: rules(),
            }),
          onDone,
        );
      }}
    >
      <b className="sm:col-span-3">{initial ? `Sửa ${initial.name}` : "Thêm chính sách"}</b>
      <label className="c-lbl">
        Loại
        <select
          aria-label="Loại chính sách"
          value={type}
          disabled={Boolean(initial)}
          onChange={(e) => setType(e.target.value as PolicyType)}
          className={FIELD}
        >
          {Object.entries(POLICY_TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="c-lbl sm:col-span-2">
        Tên chính sách
        <input
          aria-label="Tên chính sách"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Từ ngày
        <input
          aria-label="Từ ngày"
          type="date"
          required
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Đến ngày (để trống là không hạn)
        <input
          aria-label="Đến ngày"
          type="date"
          value={validTo}
          onChange={(e) => setValidTo(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Trạng thái
        <select
          aria-label="Trạng thái chính sách"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={FIELD}
        >
          {Object.entries(STATUS).map(([k, [l]]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {multi(
        "Kênh áp dụng (để trống là mọi kênh)",
        SALES_CHANNELS.map((c) => ({ value: c.key, label: c.label })),
        channels,
        setChannels,
      )}
      {type === "promotion" || type === "delivery" ? (
        <label className="c-lbl">
          Độ ưu tiên (cao áp trước)
          <input
            aria-label="Độ ưu tiên"
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={FIELD}
          />
        </label>
      ) : null}
      {type === "promotion" ? (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} /> Cộng
          dồn với khuyến mãi khác
        </label>
      ) : null}

      {type === "promotion" ? (
        <div className="grid gap-2 sm:col-span-3 sm:grid-cols-3">
          <label className="c-lbl">
            Giảm %
            <input
              aria-label="Giảm phần trăm"
              inputMode="decimal"
              value={percentOff}
              onChange={(e) => setPercentOff(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Giảm tiền (đồng)
            <input
              aria-label="Giảm tiền"
              inputMode="numeric"
              value={amountOff}
              onChange={(e) => setAmountOff(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Đơn tối thiểu (đồng)
            <input
              aria-label="Đơn tối thiểu"
              inputMode="numeric"
              value={minSubtotal}
              onChange={(e) => setMinSubtotal(e.target.value)}
              className={FIELD}
            />
          </label>
          <div className="sm:col-span-3 flex flex-wrap gap-x-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={freeInstall}
                onChange={(e) => setFreeInstall(e.target.checked)}
              />{" "}
              Miễn phí lắp
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={freeDelivery}
                onChange={(e) => setFreeDelivery(e.target.checked)}
              />{" "}
              Miễn phí giao
            </label>
          </div>
          <div className="sm:col-span-3">
            {multi(
              "Áp cho SKU (để trống cả ba ô là mọi sản phẩm)",
              ctx.products.map((p) => ({ value: p.variantId, label: p.sku })),
              scopeVariants,
              setScopeVariants,
            )}
          </div>
          <div className="sm:col-span-3">
            {multi(
              "Áp cho nhóm",
              ctx.categories.map((c) => ({ value: c.id, label: c.name })),
              scopeCats,
              setScopeCats,
            )}
          </div>
          {ctx.combos.length ? (
            <div className="sm:col-span-3">
              {multi(
                "Áp cho combo",
                ctx.combos.map((c) => ({ value: c.id!, label: c.code })),
                scopeCombos,
                setScopeCombos,
              )}
            </div>
          ) : null}
          <div className="sm:col-span-3">
            {multi(
              "Tặng kèm (quà trong danh mục Quà tặng)",
              ctx.gifts.map((g) => ({ value: g.variantId, label: g.name })),
              gifts,
              setGifts,
            )}
          </div>
          {multi(
            "Người đặt ở (để trống là mọi nơi)",
            [
              { value: "VN", label: "Việt Nam" },
              { value: "KR", label: "Hàn Quốc" },
            ],
            countries,
            setCountries,
          )}
          <label className="c-lbl sm:col-span-2">
            Chỉ cho khách có thẻ (cách nhau dấu phẩy; ví dụ: Khách cũ, referral)
            <input
              aria-label="Thẻ khách áp dụng"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={FIELD}
            />
          </label>
        </div>
      ) : null}

      {type === "delivery" ? (
        <div className="space-y-2 sm:col-span-3" aria-label="Vùng giao">
          {zones.map((z, i) => (
            <div key={i} className="grid gap-1.5 rounded-control border border-line-2 p-2 sm:grid-cols-4">
              {(
                [
                  ["label", "Tên vùng"],
                  ["provinces", "Tỉnh (dấu phẩy; * là mọi tỉnh còn lại)"],
                  ["fee", "Phí giao"],
                  ["bulky", "Phí lắp hàng cồng kềnh"],
                  ["parcel", "Phí lắp hàng nhỏ"],
                  ["leadDays", "Số ngày giao"],
                  ["cutoffDate", "Ngày chốt đơn dịp lễ"],
                  ["cutoffLabel", "Tên dịp"],
                ] as [keyof Zone, string][]
              ).map(([k, l]) => (
                <label key={k} className={`c-lbl ${k === "provinces" ? "sm:col-span-3" : ""}`}>
                  {l}
                  <input
                    aria-label={`${l} vùng ${i + 1}`}
                    type={k === "cutoffDate" ? "date" : "text"}
                    list={k === "provinces" ? "policy-provinces" : undefined}
                    value={z[k]}
                    onChange={(e) =>
                      setZones((zs) => zs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                    }
                    className={FIELD}
                  />
                </label>
              ))}
              <button
                type="button"
                className="c-ib"
                aria-label={`Xóa vùng ${i + 1}`}
                onClick={() => setZones((zs) => zs.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <datalist id="policy-provinces">
            {ctx.provinces.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button
            type="button"
            className="c-btn"
            onClick={() =>
              setZones((zs) => [
                ...zs,
                {
                  label: "",
                  provinces: zs.length ? "*" : "TP.HCM",
                  fee: "0",
                  bulky: "0",
                  parcel: "0",
                  leadDays: "3",
                  cutoffDate: "",
                  cutoffLabel: "",
                },
              ])
            }
          >
            <Plus size={13} className="mr-1 inline" aria-hidden /> Thêm vùng
          </button>
          <p className="c-lbl m-0">Phí nhân viên nhập tay trên đơn sẽ thay phí theo vùng.</p>
        </div>
      ) : null}

      {type === "deposit" ? (
        <>
          <label className="c-lbl">
            Cọc tối thiểu (đồng)
            <input
              aria-label="Cọc tối thiểu"
              inputMode="numeric"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Hoặc % tổng đơn (lấy mức cao hơn)
            <input
              aria-label="Cọc phần trăm"
              inputMode="decimal"
              value={minPercent}
              onChange={(e) => setMinPercent(e.target.value)}
              className={FIELD}
            />
          </label>
        </>
      ) : null}

      {type === "discount_limit" ? (
        <div className="grid gap-1.5 sm:col-span-3 sm:grid-cols-3">
          {ctx.roles.map((x) => (
            <label key={x.key} className="c-lbl">
              {x.name} (% tối đa, trống là 0)
              <input
                aria-label={`Giảm tối đa ${x.name}`}
                inputMode="decimal"
                value={byRole[x.key] ?? ""}
                onChange={(e) => setByRole((m) => ({ ...m, [x.key]: e.target.value }))}
                className={FIELD}
              />
            </label>
          ))}
        </div>
      ) : null}

      {type === "payment" || type === "warranty" || type === "return" ? (
        <label className="c-lbl sm:col-span-3">
          Nội dung hiện cho khách trên báo giá
          <textarea
            aria-label="Nội dung chính sách"
            rows={4}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={FIELD}
          />
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 sm:col-span-3">
        <button type="submit" className="c-btn is-brand" disabled={pending || !name.trim()}>
          Lưu
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
        {initial && initial.status !== "draft" ? (
          <span className="c-lbl">
            Chính sách đã chạy: lưu sẽ tạo phiên bản {initial.version + 1}, đơn cũ giữ phiên bản cũ.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function ComboForm({
  initial,
  products,
  gifts,
  save,
  onDone,
}: {
  initial?: LiveCombo;
  products: { variantId: string; sku: string; name: string }[];
  /** Quà trong danh mục Quà tặng, chọn được cho dòng combo đánh dấu Tặng. */
  gifts: { variantId: string; sku: string; name: string }[];
  save: Actions["saveCombo"];
  onDone: () => void;
}) {
  const { run, pending } = useRun();
  const [v, setV] = useState<LiveCombo>(
    initial ?? {
      code: "",
      name: "",
      description: "",
      pricingMode: "sum_minus",
      amount: 0,
      validFrom: null,
      validTo: null,
      active: true,
      items: [{ variantId: products[0]?.variantId ?? "", qty: 1, isGift: false }],
    },
  );
  return (
    <form
      className="c-cb grid gap-2 border-b border-line-2 sm:grid-cols-3"
      aria-label={initial ? `Sửa combo ${initial.code}` : "Thêm combo"}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => save(v), onDone);
      }}
    >
      <label className="c-lbl">
        Mã combo
        <input
          aria-label="Mã combo"
          required
          maxLength={40}
          value={v.code}
          onChange={(e) => setV({ ...v, code: e.target.value })}
          className={FIELD}
        />
      </label>
      <label className="c-lbl sm:col-span-2">
        Tên combo
        <input
          aria-label="Tên combo"
          required
          maxLength={200}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Cách tính giá
        <select
          aria-label="Cách tính giá combo"
          value={v.pricingMode}
          onChange={(e) => setV({ ...v, pricingMode: e.target.value as LiveCombo["pricingMode"] })}
          className={FIELD}
        >
          <option value="sum_minus">Tổng giá lẻ trừ một khoản</option>
          <option value="fixed_price">Giá trọn gói</option>
        </select>
      </label>
      <label className="c-lbl">
        {v.pricingMode === "fixed_price" ? "Giá trọn gói (đồng)" : "Khoản trừ (đồng)"}
        <input
          aria-label="Giá combo"
          inputMode="numeric"
          value={new Intl.NumberFormat("vi-VN").format(v.amount)}
          onChange={(e) => setV({ ...v, amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
          className={FIELD}
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={v.active}
          onChange={(e) => setV({ ...v, active: e.target.checked })}
        />{" "}
        Đang bán
      </label>
      <div className="space-y-1.5 sm:col-span-3">
        {v.items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Sản phẩm combo dòng ${i + 1}`}
              value={it.variantId}
              onChange={(e) =>
                setV({
                  ...v,
                  items: v.items.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)),
                })
              }
              className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
            >
              {products.map((p) => (
                <option key={p.variantId} value={p.variantId}>
                  {p.name} ({p.sku})
                </option>
              ))}
              {gifts.length ? (
                <optgroup label="Quà tặng">
                  {gifts.map((g) => (
                    <option key={g.variantId} value={g.variantId}>
                      {g.name} ({g.sku})
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <input
              aria-label={`Số lượng combo dòng ${i + 1}`}
              type="number"
              min={1}
              max={99}
              value={it.qty}
              onChange={(e) =>
                setV({
                  ...v,
                  items: v.items.map((x, j) =>
                    j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x,
                  ),
                })
              }
              className="w-16 rounded-control border border-line bg-surface px-1.5 py-1.5"
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={it.isGift}
                onChange={(e) =>
                  setV({
                    ...v,
                    items: v.items.map((x, j) => (j === i ? { ...x, isGift: e.target.checked } : x)),
                  })
                }
              />
              Tặng
            </label>
            {v.items.length > 1 ? (
              <button
                type="button"
                className="c-ib"
                aria-label={`Xóa dòng combo ${i + 1}`}
                onClick={() => setV({ ...v, items: v.items.filter((_, j) => j !== i) })}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="c-btn"
          onClick={() =>
            setV({
              ...v,
              items: [...v.items, { variantId: products[0]?.variantId ?? "", qty: 1, isGift: false }],
            })
          }
        >
          <Plus size={13} className="mr-1 inline" aria-hidden /> Thêm sản phẩm
        </button>
      </div>
      <div className="flex gap-1.5 sm:col-span-3">
        <button
          type="submit"
          className="c-btn is-brand"
          disabled={pending || !v.code.trim() || !v.name.trim()}
        >
          Lưu combo
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}

/** Thử chính sách: chọn SKU hoặc combo, kênh, tỉnh, ngày, người bán; xem hàm định giá trả gì, kể cả chính sách nháp. */
function PolicyTester({
  catalog,
  policies,
  products,
  combos,
  roles,
  provinces,
  showroomId,
}: {
  catalog: PricingCatalog;
  policies: LivePolicy[];
  products: { variantId: string; sku: string; name: string }[];
  combos: LiveCombo[];
  roles: { key: string; name: string }[];
  provinces: string[];
  showroomId: string;
}) {
  const items = [
    ...products.map((p) => ({ value: `v:${p.variantId}`, label: `${p.name} (${p.sku})` })),
    ...combos.filter((c) => c.active).map((c) => ({ value: `c:${c.id}`, label: `Combo: ${c.name}` })),
  ];
  const [item, setItem] = useState(items[0]?.value ?? "");
  const [qty, setQty] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [province, setProvince] = useState(provinces[0] ?? "");
  const [country, setCountry] = useState("VN");
  const [channel, setChannel] = useState("online");
  const [referral, setReferral] = useState(false);
  const [date, setDate] = useState(today());
  const [role, setRole] = useState(roles.find((r) => r.key === "telesale")?.key ?? roles[0]?.key ?? "");
  const [drafts, setDrafts] = useState(true);

  const result = useMemo(() => {
    if (!item) return null;
    // Chính sách nháp, tạm dừng được tính như đang áp để xem trước khi bật.
    const tested: PricingCatalog = drafts
      ? {
          ...catalog,
          policies: catalog.policies.map((p) =>
            policies.some((x) => x.id === p.id && (x.status === "draft" || x.status === "paused"))
              ? ({ ...p, status: "active" } as Policy)
              : p,
          ),
        }
      : catalog;
    const [kind, id] = item.split(":");
    return priceQuote(
      toQuoteInput(
        {
          lines: [kind === "c" ? { comboId: id, qty } : { variantId: id, qty }],
          discount: discount ? { type: "pct", value: discount } : null,
          deliveryFee: null,
          installationFee: null,
        },
        {
          showroomId,
          channel,
          buyerCountry: country,
          customerTags: referral ? ["referral"] : [],
          recipientProvince: province,
          date: new Date(`${date}T10:00:00+07:00`),
          sellerId: "test",
          sellerRole: role,
        },
        tested,
      ),
      tested,
    );
  }, [
    item,
    qty,
    discount,
    province,
    country,
    channel,
    referral,
    date,
    role,
    drafts,
    catalog,
    policies,
    showroomId,
  ]);

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
              className={FIELD}
            >
              {items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Số lượng
            <input
              aria-label="Số lượng thử"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Giảm tay %
            <input
              aria-label="Giảm tay thử"
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Tỉnh người nhận
            <select
              aria-label="Tỉnh thử"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className={FIELD}
            >
              {provinces.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Người đặt ở
            <select
              aria-label="Người đặt ở"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={FIELD}
            >
              <option value="VN">Việt Nam</option>
              <option value="KR">Hàn Quốc</option>
            </select>
          </label>
          <label className="c-lbl">
            Kênh
            <select
              aria-label="Kênh thử"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={FIELD}
            >
              {SALES_CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Ngày
            <input
              aria-label="Ngày thử"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Người bán
            <select
              aria-label="Vai trò người bán thử"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={FIELD}
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 sm:col-span-2">
            <input type="checkbox" checked={referral} onChange={(e) => setReferral(e.target.checked)} /> Khách
            được giới thiệu
          </label>
          <label className="flex items-center gap-1.5 sm:col-span-2">
            <input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} /> Tính cả
            chính sách nháp, tạm dừng
          </label>
        </div>
        {result ? (
          <PricingSummary result={result} label="Kết quả định giá" />
        ) : (
          <p className="c-empty">Chưa có sản phẩm để thử.</p>
        )}
      </div>
    </section>
  );
}
