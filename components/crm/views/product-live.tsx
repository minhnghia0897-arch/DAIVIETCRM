"use client";

import { Package } from "lucide-react";
import { useState } from "react";

import { formatMoney } from "@/lib/format";

import { PageHead } from "../parts";
import { ProductForm, type LiveProduct, type ProductActions } from "./products-live";

// Hồ sơ sản phẩm bản thật (route /products/[id]): giá hiện hành và lịch sử giá. Không quản lý tồn kho (Owner chốt
// 18/10/2026).

export interface LiveProductDetail {
  product: LiveProduct;
  priceHistory: { price: number; from: string }[];
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
        </div>
      </div>
    </div>
  );
}
