import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/record";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/auth/types";
import { ProductAvailable, StockCell } from "@/components/crm/live-stock";
import { getProduct } from "@/lib/demo/repo";
import { formatDate, formatMoney } from "@/lib/format";

export function ProductView({ user, id }: { user: SessionUser; id: string }) {
  const data = getProduct(user, id);
  if (!data) notFound();
  const { product: p, variants, reservedBy } = data;
  const showCost = user.permissions.has("product.view_cost");

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        kind="product"
        label="Sản phẩm"
        title={p.name}
        demo
        highlights={[
          { label: "Danh mục", value: p.category },
          { label: "Bảo hành", value: p.warrantyMonths ? `${p.warrantyMonths} tháng` : "Không" },
          {
            label: "Giao lắp",
            value: p.deliveryClass === "bulky" ? `Cồng kềnh, ${p.crewSize} người` : "Hàng nhỏ",
          },
          { label: "Cân nặng", value: `${p.weightKg} kg` },
          { label: "Theo dõi serial", value: p.trackSerial ? "Có" : "Không" },
          { label: "Tồn khả dụng", value: <ProductAvailable productId={p.id} /> },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>SKU, giá và tồn theo kho</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-line bg-surface text-left text-label text-text-weak">
              <tr>
                <th className="px-[14px] py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Phiên bản</th>
                <th className="px-3 py-2 text-right font-semibold">Giá niêm yết</th>
                <th className="px-3 py-2 text-right font-semibold">Giá online</th>
                {showCost ? <th className="px-3 py-2 text-right font-semibold">Giá vốn</th> : null}
                {variants[0]?.stock.map((s) => (
                  <th key={s.warehouse.id} className="px-3 py-2 text-right font-semibold">
                    {s.warehouse.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="h-10 border-t border-line-2">
                  <td className="tabular px-[14px] py-1 font-semibold whitespace-nowrap">{v.sku}</td>
                  <td className="px-3 py-1">{v.name}</td>
                  <td className="tabular px-3 py-1 text-right">{formatMoney(v.price)}</td>
                  <td className="tabular px-3 py-1 text-right">{formatMoney(v.onlinePrice)}</td>
                  {showCost ? (
                    <td className="tabular px-3 py-1 text-right">{formatMoney(v.cost ?? 0)}</td>
                  ) : null}
                  {v.stock.map((s) => (
                    <td key={s.warehouse.id} className="tabular px-3 py-1 text-right">
                      <StockCell variantId={v.id} warehouseId={s.warehouse.id} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="text-label text-text-weak">
          Ô tồn: khả dụng / đang có. Khả dụng = đang có trừ hàng đang giữ cho đơn đã cọc.
          {showCost ? null : " Giá vốn chỉ hiện với người có quyền xem giá vốn."}
        </CardBody>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardBody>{p.description}</CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Đơn đang giữ hàng</CardTitle>
          </CardHeader>
          <CardBody>
            {reservedBy.length === 0 ? (
              <p className="text-text-weak">Không có đơn nào đang giữ sản phẩm này.</p>
            ) : (
              <ul className="space-y-1">
                {reservedBy.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <Link href={`/orders/${o.id}`} className="font-bold text-text hover:underline">
                      {o.code}
                    </Link>
                    <span className="text-text-weak">Giữ đến {formatDate(o.holdUntil!)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
