import { ListHeader } from "@/components/record";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import type { SessionUser } from "@/lib/auth/types";

import { WAREHOUSES, inventory } from "@/lib/demo/repo";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS = {
  ok: { label: "Đủ hàng", tone: "ok" as const, row: "" },
  low: { label: "Sắp hết", tone: "warn" as const, row: "bg-warn-soft" },
  out: { label: "Hết hàng", tone: "err" as const, row: "bg-err-soft" },
};

export function InventoryView({ user, searchParams }: { user: SessionUser; searchParams: SearchParams }) {
  const { wh } = searchParams;
  const warehouseId = typeof wh === "string" && WAREHOUSES.some((w) => w.id === wh) ? wh : WAREHOUSES[0].id;
  const rows = inventory(user, warehouseId);
  const canDocument = user.permissions.has("inventory.document") && !user.viewAs;

  return (
    <main className="mx-auto max-w-7xl px-4 py-4">
      <Card>
        <ListHeader
          kind="inventory"
          title="Tồn kho"
          summary={`${rows.filter((r) => r.status !== "ok").length} SKU cần chú ý ở ${WAREHOUSES.find((w) => w.id === warehouseId)!.name}`}
          demo
          filters={WAREHOUSES.map((w) => ({
            href: `/inventory?wh=${w.id}`,
            label: w.name,
            active: w.id === warehouseId,
          }))}
          actions={
            canDocument ? (
              <>
                <Button variant="secondary">Lập phiếu nhập</Button>
                <Button variant="secondary">Chuyển kho</Button>
                <Button variant="secondary">Kiểm kê</Button>
              </>
            ) : null
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                <th className="px-[14px] py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 text-right font-semibold">Có</th>
                <th className="px-3 py-2 text-right font-semibold">Đang giữ</th>
                <th className="px-3 py-2 text-right font-semibold">Khả dụng</th>
                <th className="px-3 py-2 text-right font-semibold">Ngưỡng</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("h-10 border-t border-line-2", STATUS[r.status].row)}>
                  <td className="px-[14px] py-1">
                    <span className="font-semibold">{r.label}</span>
                    <span className="tabular ml-2 text-label text-text-weak">{r.sku}</span>
                  </td>
                  <td className="tabular px-3 py-1 text-right">{r.onHand}</td>
                  <td className="tabular px-3 py-1 text-right">{r.reserved}</td>
                  <td className="tabular px-3 py-1 text-right text-card-title font-bold">{r.available}</td>
                  <td className="tabular px-3 py-1 text-right">{r.threshold}</td>
                  <td className="px-3 py-1">
                    <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
