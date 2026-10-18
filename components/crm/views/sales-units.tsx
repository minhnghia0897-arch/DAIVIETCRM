"use client";

import { Package } from "lucide-react";

import { monthLabel, monthShort } from "@/lib/sales/credits";

import { PageHead } from "../parts";
import { MonthNav } from "./sales-kpi";

// Số lượng bán (Owner chốt 18/10/2026): hàng xuất hết từ kho Đại Việt nên CRM không quản lý tồn kho, chỉ đếm bán được
// bao nhiêu mỗi sản phẩm (hàm sales_units_month, migration 20261018000100_simple_stock.sql).

export interface UnitRow {
  variantId: string;
  sku: string;
  name: string;
  sold: number;
  gifts: number;
  delivered: number;
  returned: number;
  pending: number;
}

export function SalesUnitsView({
  month,
  current,
  rows,
}: {
  month: string;
  current: string;
  rows: UnitRow[];
}) {
  const sum = (k: keyof Pick<UnitRow, "sold" | "gifts" | "delivered" | "returned" | "pending">) =>
    rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Package}
          color="var(--warn)"
          kicker="Hàng xuất từ kho Đại Việt, CRM chỉ đếm số bán"
          title="Số lượng bán"
        >
          <MonthNav month={month} basePath="/inventory" current={current} />
        </PageHead>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Đã cọc {monthShort(month)}</span>
            <strong>{sum("sold")}</strong>
          </div>
          <div>
            <span className="c-lbl">Đã giao xong {monthShort(month)}</span>
            <strong>{sum("delivered")}</strong>
          </div>
          <div>
            <span className="c-lbl">Đang chờ giao</span>
            <strong>{sum("pending")}</strong>
          </div>
          <div>
            <span className="c-lbl">Hủy, trả {monthShort(month)}</span>
            <strong className={sum("returned") ? "text-err" : undefined}>{sum("returned")}</strong>
          </div>
        </div>
      </section>

      <section className="c-card" aria-labelledby="units-h">
        <div className="c-ch">
          <h2 id="units-h">Từng sản phẩm, {monthLabel(month).toLowerCase()}</h2>
        </div>
        {rows.length === 0 ? (
          <p className="c-cb m-0 text-text-weak">
            Chưa có sản phẩm nào được cọc, giao hay đang chờ giao trong {monthLabel(month).toLowerCase()}.
          </p>
        ) : (
          <div className="c-tw">
            <table className="c-table" aria-label={`Số lượng bán ${monthLabel(month)}`}>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="text-right">Đã cọc</th>
                  <th className="text-right">Tặng kèm</th>
                  <th className="text-right">Đã giao xong</th>
                  <th className="text-right">Hủy, trả</th>
                  <th className="text-right">Đang chờ giao</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.variantId}>
                    <td>
                      <b>{r.name}</b> <span className="c-lbl">{r.sku}</span>
                    </td>
                    <td className="text-right tabular">
                      <b>{r.sold}</b>
                    </td>
                    <td className="text-right tabular">{r.gifts || "—"}</td>
                    <td className="text-right tabular">{r.delivered}</td>
                    <td className={`text-right tabular ${r.returned ? "text-err" : ""}`}>
                      {r.returned || "—"}
                    </td>
                    <td className="text-right tabular">{r.pending || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <b>Cộng</b>
                  </td>
                  <td className="text-right tabular">
                    <b>{sum("sold")}</b>
                  </td>
                  <td className="text-right tabular">{sum("gifts")}</td>
                  <td className="text-right tabular">{sum("delivered")}</td>
                  <td className="text-right tabular">{sum("returned")}</td>
                  <td className="text-right tabular">{sum("pending")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="c-lbl c-cb m-0">
          Đã cọc: sản phẩm của đơn khách cọc xong trong tháng (cùng mốc với doanh số từng sale), không tính
          quà tặng kèm. Đã giao xong: đơn hoàn tất trong tháng. Hủy, trả: đơn đã cọc bị hủy hoặc khách trả
          hàng trong tháng. Đang chờ giao: đơn đã cọc chưa giao xong, tính đến hôm nay.
        </p>
      </section>
    </div>
  );
}
