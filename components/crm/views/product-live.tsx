"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatMoney } from "@/lib/format";

import { PageHead } from "../parts";
import { ProductForm, type LiveProduct, type ProductActions } from "./products-live";

// Hồ sơ sản phẩm bản thật (route /products/[id]): giá hiện hành và lịch sử giá, tồn theo kho, đơn đang giữ hàng.

export interface LiveProductDetail {
  product: LiveProduct;
  stock: { warehouse: string; display: boolean; onHand: number; available: number }[];
  priceHistory: { price: number; from: string }[];
  holds: { orderId: string; code: string; qty: number; until: string | null }[];
  categories: { id: string; name: string }[];
  perms: { manage: boolean; price: boolean };
}

export function ProductLive({ data, actions }: { data: LiveProductDetail; actions: ProductActions }) {
  const p = data.product;
  const [editing, setEditing] = useState(false);
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Package}
          color="var(--obj-product, var(--warn))"
          kicker={`Sản phẩm · ${p.sku}`}
          title={p.name}
          back={{ href: "/products", label: "Sản phẩm" }}
        >
          {!p.active ? <span className="c-pill is-n">Ngừng bán</span> : null}
          {data.perms.manage ? (
            <button
              type="button"
              className="c-btn"
              aria-expanded={editing}
              onClick={() => setEditing((x) => !x)}
            >
              Sửa sản phẩm
            </button>
          ) : null}
        </PageHead>
        <div className="c-hl">
          <div>
            <span className="c-lbl">Giá bán</span>
            <b className="tabular">{p.price === null ? "Chưa có giá" : formatMoney(p.price)}</b>
          </div>
          <div>
            <span className="c-lbl">Nhóm</span>
            <b>{p.category ?? "—"}</b>
          </div>
          <div>
            <span className="c-lbl">Bảo hành</span>
            <b>{p.warrantyMonths ? `${p.warrantyMonths} tháng` : "Chưa đặt"}</b>
          </div>
          <div>
            <span className="c-lbl">Giao lắp</span>
            <b>
              {p.bulky ? "Cồng kềnh" : "Hàng nhỏ"}
              {p.requiresInstallation ? `, lắp ${p.installationCrewSize ?? "?"} người` : ""}
            </b>
          </div>
          <div>
            <span className="c-lbl">Theo dõi serial</span>
            <b>{p.trackSerial ? "Có" : "Không"}</b>
          </div>
        </div>
      </section>

      {editing ? (
        <ProductForm
          initial={p}
          categories={data.categories}
          canPrice={data.perms.price}
          save={actions.saveProduct}
          onDone={() => setEditing(false)}
        />
      ) : null}

      <div className="c-g84">
        <div className="c-stack">
          <section className="c-card" aria-label="Tồn theo kho">
            <div className="c-ch">
              <h2>Tồn theo kho</h2>
            </div>
            <div className="c-tw">
              <table className="c-table">
                <thead>
                  <tr>
                    <th>Kho</th>
                    <th className="text-right">Đang có</th>
                    <th className="text-right">Khả dụng</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock.map((s) => (
                    <tr key={s.warehouse}>
                      <td>
                        {s.warehouse}
                        {s.display ? <span className="c-lbl"> (không bán)</span> : null}
                      </td>
                      <td className="text-right tabular">{s.onHand}</td>
                      <td className="text-right tabular">
                        <b>{s.available}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {p.description ? (
            <section className="c-card">
              <div className="c-ch">
                <h2>Thông tin</h2>
              </div>
              <p className="c-cb m-0">{p.description}</p>
            </section>
          ) : null}
        </div>
        <div className="c-stack">
          <section className="c-card" aria-label="Lịch sử giá">
            <div className="c-ch">
              <h2>Lịch sử giá</h2>
            </div>
            <ul className="m-0 list-none space-y-1 px-4 pb-3">
              {data.priceHistory.length === 0 ? <li className="c-lbl">Chưa có giá.</li> : null}
              {data.priceHistory.map((h, i) => (
                <li key={`${h.from}-${i}`} className="flex justify-between gap-2">
                  <span className="c-lbl">Từ {h.from}</span>
                  <span className="tabular">{formatMoney(h.price)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="c-card" aria-label="Đơn đang giữ hàng">
            <div className="c-ch">
              <h2>Đơn đang giữ hàng</h2>
            </div>
            <ul className="m-0 list-none space-y-1 px-4 pb-3">
              {data.holds.length === 0 ? (
                <li className="c-lbl">Không có đơn nào đang giữ sản phẩm này.</li>
              ) : null}
              {data.holds.map((h) => (
                <li key={h.orderId} className="flex justify-between gap-2">
                  <Link href={`/orders/${h.orderId}`} className="c-link font-semibold">
                    {h.code}
                  </Link>
                  <span className="c-lbl">
                    giữ {h.qty}
                    {h.until ? `, đến ${h.until}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
