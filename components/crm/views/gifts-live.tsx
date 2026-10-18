"use client";

import { Gift } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";

import { PageHead } from "../parts";
import type { ProductActions } from "./products-live";

// Danh mục Quà tặng (route /gifts): quà tặng kèm khi lên đơn, trong combo và khuyến mãi. Quà là sản phẩm "chỉ làm
// quà tặng" (is_gift_only), không hiện ở danh sách sản phẩm bán, giá 0đ trên đơn; giá trị chỉ để tham khảo.

export interface LiveGift {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  /** Giá trị tham khảo (bảng giá mặc định), không tính vào đơn. */
  value: number | null;
  warrantyMonths: number | null;
  active: boolean;
}

interface GiftFormValue {
  id?: string;
  sku: string;
  name: string;
  description: string;
  value: number | null;
  warrantyMonths: number | null;
  active: boolean;
}

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

/** Mã gợi ý cho quà mới: QT001, QT002… theo số quà đang có, bỏ qua mã đã dùng. */
function nextCode(rows: LiveGift[]): string {
  const used = new Set(rows.map((r) => r.sku.toUpperCase()));
  for (let n = rows.length + 1; ; n++) {
    const code = `QT${String(n).padStart(3, "0")}`;
    if (!used.has(code)) return code;
  }
}

export function GiftsLive({
  rows,
  categoryId,
  perms,
  actions,
}: {
  rows: LiveGift[];
  /** Nhóm "Quà tặng kèm" để xếp quà mới vào; chưa có nhóm thì để trống. */
  categoryId: string | null;
  perms: { manage: boolean; price: boolean };
  actions: Pick<ProductActions, "saveProduct">;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const form = (initial?: LiveGift) => (
    <GiftForm
      key={initial?.id ?? "new"}
      initial={initial}
      code={nextCode(rows)}
      categoryId={categoryId}
      canPrice={perms.price}
      save={actions.saveProduct}
      onDone={() => setEditing(null)}
    />
  );
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Gift} color="var(--obj-product, var(--warn))" kicker="Sản phẩm" title="Quà tặng">
          <span className="c-lbl">{rows.length} quà</span>
          {perms.manage ? (
            <button
              type="button"
              className="c-btn is-blue"
              aria-expanded={editing === "new"}
              onClick={() => setEditing((v) => (v === "new" ? null : "new"))}
            >
              Thêm quà
            </button>
          ) : null}
        </PageHead>
        <p className="c-lbl mx-4 mt-0 mb-3">
          Quà tặng kèm khi lên đơn, trong combo và khuyến mãi, giá 0đ trên đơn. Quà không nằm trong danh sách
          sản phẩm bán.
        </p>
      </section>

      {editing === "new" ? form() : null}

      <section className="c-card" aria-label="Danh sách quà tặng">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Quà</th>
                <th>Mô tả</th>
                <th className="text-right">Giá trị tham khảo</th>
                <th>Bảo hành</th>
                {perms.manage ? <th aria-label="Thao tác" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b> <span className="c-lbl tabular">{r.sku}</span>
                    {!r.active ? <span className="c-pill is-n ml-1">Ngừng dùng</span> : null}
                  </td>
                  <td className="whitespace-normal">
                    {r.description || <span className="c-lbl">Chưa có</span>}
                  </td>
                  <td className="text-right tabular">
                    {r.value ? formatMoney(r.value) : <span className="c-lbl">Chưa có</span>}
                  </td>
                  <td>
                    {r.warrantyMonths ? `${r.warrantyMonths} tháng` : <span className="c-lbl">Không</span>}
                  </td>
                  {perms.manage ? (
                    <td className="text-right">
                      <button
                        type="button"
                        className="c-btn"
                        aria-label={`Sửa quà ${r.name}`}
                        aria-expanded={editing === r.id}
                        onClick={() => setEditing((v) => (v === r.id ? null : r.id))}
                      >
                        Sửa
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="c-empty">
            Chưa có quà nào.{perms.manage ? " Bấm Thêm quà để tạo quà đầu tiên." : ""}
          </p>
        ) : null}
      </section>

      {editing && editing !== "new" ? form(rows.find((r) => r.id === editing)) : null}
    </div>
  );
}

function GiftForm({
  initial,
  code,
  categoryId,
  canPrice,
  save,
  onDone,
}: {
  initial?: LiveGift;
  code: string;
  categoryId: string | null;
  canPrice: boolean;
  save: ProductActions["saveProduct"];
  onDone: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<GiftFormValue>({
    id: initial?.id,
    sku: initial?.sku ?? code,
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    value: initial?.value ?? null,
    warrantyMonths: initial?.warrantyMonths ?? null,
    active: initial?.active ?? true,
  });
  const set = <K extends keyof GiftFormValue>(k: K, val: GiftFormValue[K]) =>
    setV((x) => ({ ...x, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d]/g, "")));
  const title = initial ? `Sửa quà ${initial.name}` : "Thêm quà";
  return (
    <form
      className="c-card c-cb grid gap-2 sm:grid-cols-2"
      style={{ paddingTop: 14 }}
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save({
            id: v.id,
            sku: v.sku,
            name: v.name,
            categoryId,
            brand: "",
            description: v.description,
            warrantyMonths: v.warrantyMonths,
            requiresInstallation: false,
            installationCrewSize: null,
            bulky: false,
            trackSerial: false,
            isSellable: false,
            isGiftOnly: true,
            active: v.active,
            price: v.value,
          });
          toast(r.ok ? (initial ? "Đã lưu quà" : "Đã thêm quà") : r.message, r.ok ? "ok" : "err");
          if (r.ok) {
            onDone();
            router.refresh();
          }
        });
      }}
    >
      <b className="sm:col-span-2">{title}</b>
      <label className="c-lbl">
        Tên quà
        <input
          aria-label="Tên quà"
          required
          maxLength={200}
          placeholder="Ví dụ: Gối massage cổ"
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Mã quà
        <input
          aria-label="Mã quà"
          required
          maxLength={60}
          value={v.sku}
          onChange={(e) => set("sku", e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl sm:col-span-2">
        Mô tả
        <textarea
          aria-label="Mô tả quà"
          rows={2}
          maxLength={2000}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          className={FIELD}
        />
      </label>
      {canPrice ? (
        <label className="c-lbl">
          Giá trị tham khảo (đồng)
          <input
            aria-label="Giá trị tham khảo"
            inputMode="numeric"
            placeholder="Không tính vào đơn"
            value={v.value === null ? "" : new Intl.NumberFormat("vi-VN").format(v.value)}
            onChange={(e) => set("value", num(e.target.value))}
            className={FIELD}
          />
        </label>
      ) : null}
      <label className="c-lbl">
        Bảo hành (tháng)
        <input
          aria-label="Bảo hành quà (tháng)"
          inputMode="numeric"
          value={v.warrantyMonths ?? ""}
          onChange={(e) => set("warrantyMonths", num(e.target.value))}
          className={FIELD}
        />
      </label>
      <label className="flex items-center gap-1.5 sm:col-span-2">
        <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
        Đang dùng (bỏ chọn thì quà không hiện khi lên đơn)
      </label>
      <div className="flex gap-1.5 sm:col-span-2">
        <button
          type="submit"
          className="c-btn is-brand"
          disabled={pending || !v.sku.trim() || !v.name.trim()}
        >
          Lưu
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}
