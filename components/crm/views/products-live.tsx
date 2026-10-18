"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { productCsv, PRODUCT_TEMPLATE } from "@/lib/sales/product-csv";

import { PageHead } from "../parts";

// Sản phẩm bản thật (route /products): danh mục, SKU, giá hiện hành; thêm, sửa, nhập và xuất CSV.

type Result = { ok: boolean; message: string };

export interface LiveProduct {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  category: string | null;
  brand: string | null;
  description: string | null;
  price: number | null;
  warrantyMonths: number | null;
  requiresInstallation: boolean;
  installationCrewSize: number | null;
  bulky: boolean;
  trackSerial: boolean;
  isSellable: boolean;
  isGiftOnly: boolean;
  active: boolean;
}

export interface ProductFormValue {
  id?: string;
  sku: string;
  name: string;
  categoryId: string | null;
  brand: string;
  description: string;
  warrantyMonths: number | null;
  requiresInstallation: boolean;
  installationCrewSize: number | null;
  bulky: boolean;
  trackSerial: boolean;
  isSellable: boolean;
  isGiftOnly: boolean;
  active: boolean;
  price: number | null;
}

export interface ProductActions {
  saveProduct(i: ProductFormValue): Promise<Result & { id?: string }>;
  importProducts?(f: FormData): Promise<Result & { errors?: { line: number; message: string }[] }>;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProductsLive({
  rows,
  categories,
  perms,
  actions,
}: {
  rows: LiveProduct[];
  categories: { id: string; name: string }[];
  perms: { manage: boolean; price: boolean };
  actions: ProductActions;
}) {
  const [cat, setCat] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const shown = rows.filter((r) => !cat || r.categoryId === cat);
  const usedCats = categories.filter((c) => rows.some((r) => r.categoryId === c.id));
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Package} color="var(--obj-product, var(--warn))" kicker="Sản phẩm" title="Sản phẩm">
          <span className="c-lbl">{shown.length} SKU</span>
          <button
            type="button"
            className="c-btn"
            onClick={() =>
              download(
                "san-pham.csv",
                productCsv(
                  rows.map((r) => ({
                    sku: r.sku,
                    name: r.name,
                    category: r.category,
                    brand: r.brand,
                    price: r.price,
                    warrantyMonths: r.warrantyMonths,
                    bulky: r.bulky,
                    requiresInstallation: r.requiresInstallation,
                    trackSerial: r.trackSerial,
                  })),
                ),
              )
            }
          >
            Xuất CSV
          </button>
          {perms.manage ? (
            <>
              <button
                type="button"
                className="c-btn"
                aria-expanded={importing}
                onClick={() => setImporting((v) => !v)}
              >
                Nhập CSV
              </button>
              <button
                type="button"
                className="c-btn is-blue"
                aria-expanded={adding}
                onClick={() => setAdding((v) => !v)}
              >
                Thêm sản phẩm
              </button>
            </>
          ) : null}
        </PageHead>
        <div className="c-ftabs mx-4" role="tablist" aria-label="Lọc theo nhóm">
          <button
            type="button"
            role="tab"
            aria-selected={!cat}
            className="c-ftab"
            onClick={() => setCat(null)}
          >
            Tất cả
          </button>
          {usedCats.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat === c.id}
              className="c-ftab"
              onClick={() => setCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      {importing && actions.importProducts ? <ImportCsv onImport={actions.importProducts} /> : null}
      {adding ? (
        <ProductForm
          categories={categories}
          canPrice={perms.price}
          save={actions.saveProduct}
          onDone={() => setAdding(false)}
        />
      ) : null}

      <section className="c-card" aria-label="Danh sách sản phẩm">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Nhóm</th>
                <th className="text-right">Giá bán</th>
                <th>Bảo hành</th>
                <th>Giao lắp</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/products/${r.id}`} className="c-link font-semibold">
                      {r.name}
                    </Link>{" "}
                    <span className="c-lbl tabular">{r.sku}</span>
                    {!r.active ? <span className="c-pill is-n ml-1">Ngừng bán</span> : null}
                  </td>
                  <td>{r.category ?? "—"}</td>
                  <td className="text-right tabular">
                    {r.price === null ? <span className="text-warn">Chưa có giá</span> : formatMoney(r.price)}
                  </td>
                  <td>
                    {r.warrantyMonths ? `${r.warrantyMonths} tháng` : <span className="c-lbl">Chưa đặt</span>}
                  </td>
                  <td>
                    {r.bulky ? "Cồng kềnh" : "Hàng nhỏ"}
                    {r.requiresInstallation ? ", cần lắp" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 ? <p className="c-empty">Chưa có sản phẩm nào trong nhóm này.</p> : null}
        <p className="c-lbl px-4 py-2">
          Giá bán là giá hiện hành của bảng giá bán lẻ. Đổi giá không làm đổi đơn cũ.
        </p>
      </section>
    </div>
  );
}

function ImportCsv({
  onImport,
}: {
  onImport: (f: FormData) => Promise<Result & { errors?: { line: number; message: string }[] }>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  return (
    <form
      className="c-card c-cb space-y-2"
      style={{ paddingTop: 14 }}
      aria-label="Nhập sản phẩm từ CSV"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          const r = await onImport(form);
          toast(r.message, r.ok ? "ok" : "err");
          setErrors(r.errors ?? []);
          if (r.ok) router.refresh();
        });
      }}
    >
      <b>Nhập sản phẩm từ CSV</b>
      <p className="c-lbl m-0">
        Cột: sku, ten, nhom, thuong_hieu, gia_ban, bao_hanh_thang, hang_cong_kenh, can_lap_dat. SKU đã có thì
        cập nhật, SKU mới thì thêm.{" "}
        <button
          type="button"
          className="c-link"
          onClick={() => download("mau-san-pham.csv", PRODUCT_TEMPLATE)}
        >
          Tải file mẫu
        </button>
      </p>
      <input
        name="file"
        type="file"
        accept=".csv,text/csv"
        aria-label="File CSV sản phẩm"
        className="block text-sm"
      />
      <button type="submit" className="c-btn is-brand" disabled={pending}>
        Nhập
      </button>
      {errors.length ? (
        <ul className="m-0 list-none space-y-1 p-0" aria-label="Dòng cần xem lại">
          {errors.map((e) => (
            <li key={`${e.line}-${e.message}`} className="text-warn">
              Dòng {e.line}: {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

export function ProductForm({
  initial,
  categories,
  canPrice,
  save,
  onDone,
}: {
  initial?: LiveProduct;
  categories: { id: string; name: string }[];
  canPrice: boolean;
  save: ProductActions["saveProduct"];
  onDone?: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<ProductFormValue>({
    id: initial?.id,
    sku: initial?.sku ?? "",
    name: initial?.name ?? "",
    categoryId: initial?.categoryId ?? categories[0]?.id ?? null,
    brand: initial?.brand ?? "",
    description: initial?.description ?? "",
    warrantyMonths: initial?.warrantyMonths ?? null,
    requiresInstallation: initial?.requiresInstallation ?? false,
    installationCrewSize: initial?.installationCrewSize ?? null,
    bulky: initial?.bulky ?? false,
    trackSerial: initial?.trackSerial ?? false,
    isSellable: initial?.isSellable ?? true,
    isGiftOnly: initial?.isGiftOnly ?? false,
    active: initial?.active ?? true,
    price: initial?.price ?? null,
  });
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) =>
    setV((x) => ({ ...x, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d]/g, "")));
  return (
    <form
      className="c-card c-cb grid gap-2 sm:grid-cols-2"
      style={{ paddingTop: 14 }}
      aria-label={initial ? "Sửa sản phẩm" : "Thêm sản phẩm"}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save(v);
          toast(r.message, r.ok ? "ok" : "err");
          if (r.ok) {
            onDone?.();
            router.refresh();
          }
        });
      }}
    >
      <b className="sm:col-span-2">{initial ? "Sửa sản phẩm" : "Thêm sản phẩm"}</b>
      <label className="c-lbl">
        Mã SKU
        <input
          aria-label="Mã SKU"
          required
          maxLength={60}
          value={v.sku}
          onChange={(e) => set("sku", e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Tên sản phẩm
        <input
          aria-label="Tên sản phẩm"
          required
          maxLength={200}
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl">
        Nhóm
        <select
          aria-label="Nhóm sản phẩm"
          value={v.categoryId ?? ""}
          onChange={(e) => set("categoryId", e.target.value || null)}
          className={FIELD}
        >
          <option value="">Chưa phân nhóm</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="c-lbl">
        Thương hiệu
        <input
          aria-label="Thương hiệu"
          maxLength={80}
          value={v.brand}
          onChange={(e) => set("brand", e.target.value)}
          className={FIELD}
        />
      </label>
      {canPrice ? (
        <label className="c-lbl">
          Giá bán (đồng)
          <input
            aria-label="Giá bán"
            inputMode="numeric"
            value={v.price === null ? "" : new Intl.NumberFormat("vi-VN").format(v.price)}
            onChange={(e) => set("price", num(e.target.value))}
            className={FIELD}
          />
        </label>
      ) : null}
      <label className="c-lbl">
        Bảo hành (tháng)
        <input
          aria-label="Bảo hành (tháng)"
          inputMode="numeric"
          value={v.warrantyMonths ?? ""}
          onChange={(e) => set("warrantyMonths", num(e.target.value))}
          className={FIELD}
        />
      </label>
      <label className="c-lbl sm:col-span-2">
        Mô tả
        <textarea
          aria-label="Mô tả"
          rows={2}
          maxLength={2000}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          className={FIELD}
        />
      </label>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 sm:col-span-2">
        {(
          [
            ["bulky", "Hàng cồng kềnh (cần xe, đội lắp)"],
            ["requiresInstallation", "Cần lắp đặt"],
            ["isSellable", "Đang bán"],
            ["isGiftOnly", "Chỉ làm quà tặng"],
            ["active", "Đang dùng"],
          ] as [keyof ProductFormValue, string][]
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(v[k])}
              onChange={(e) => set(k, e.target.checked as never)}
            />
            {l}
          </label>
        ))}
      </fieldset>
      {v.requiresInstallation ? (
        <label className="c-lbl">
          Số người lắp
          <input
            aria-label="Số người lắp"
            inputMode="numeric"
            value={v.installationCrewSize ?? ""}
            onChange={(e) => set("installationCrewSize", num(e.target.value))}
            className={FIELD}
          />
        </label>
      ) : null}
      <div className="flex gap-1.5 sm:col-span-2">
        <button
          type="submit"
          className="c-btn is-brand"
          disabled={pending || !v.sku.trim() || !v.name.trim()}
        >
          Lưu
        </button>
        {onDone ? (
          <button type="button" className="c-btn" onClick={onDone}>
            Hủy
          </button>
        ) : null}
      </div>
    </form>
  );
}
