import Link from "next/link";

import { ListHeader } from "@/components/record";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import type { SessionUser } from "@/lib/auth/types";

import { listProducts } from "@/lib/demo/repo";
import { formatMoneyShort } from "@/lib/format";

type SearchParams = Record<string, string | string[] | undefined>;

export function ProductsView({ user, searchParams }: { user: SessionUser; searchParams: SearchParams }) {
  const { category } = searchParams;
  const all = listProducts(user);
  const categories = [...new Set(all.map((p) => p.product.category))];
  const rows = all.filter((p) => typeof category !== "string" || p.product.category === category);
  const showCost = user.permissions.has("product.view_cost");

  return (
    <main className="mx-auto max-w-7xl px-4 py-4">
      <Card>
        <ListHeader
          kind="product"
          title="Sản phẩm"
          summary={`${rows.length} sản phẩm, ${rows.reduce((s, p) => s + p.variants.length, 0)} SKU`}
          demo
          filters={[
            { href: "/products", label: "Tất cả", active: typeof category !== "string" },
            ...categories.map((c) => ({
              href: `/products?category=${encodeURIComponent(c)}`,
              label: c,
              active: category === c,
            })),
          ]}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                <th className="px-[14px] py-2 font-semibold">Tên</th>
                <th className="px-3 py-2 font-semibold">Danh mục</th>
                <th className="px-3 py-2 text-right font-semibold">SKU</th>
                <th className="px-3 py-2 text-right font-semibold">Giá bán từ</th>
                {showCost ? <th className="px-3 py-2 text-right font-semibold">Biên lợi nhuận</th> : null}
                <th className="px-3 py-2 text-right font-semibold">Tồn khả dụng</th>
                <th className="px-3 py-2 font-semibold">Giao lắp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product: p, variants, priceFrom, available }) => {
                const margin =
                  showCost && variants[0].cost !== undefined
                    ? 1 - variants[0].cost / variants[0].price
                    : null;
                return (
                  <tr key={p.id} className="h-10 border-t border-line-2 hover:bg-surface-2">
                    <td className="px-[14px] py-1">
                      <Link href={`/products/${p.id}`} className="font-semibold text-brand">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1">{p.category}</td>
                    <td className="tabular px-3 py-1 text-right">{variants.length}</td>
                    <td className="tabular px-3 py-1 text-right">{formatMoneyShort(priceFrom)}</td>
                    {showCost ? (
                      <td className="tabular px-3 py-1 text-right">
                        {margin === null ? "—" : `${Math.round(margin * 100)}%`}
                      </td>
                    ) : null}
                    <td className="tabular px-3 py-1 text-right font-bold">{available}</td>
                    <td className="px-3 py-1">
                      {p.deliveryClass === "bulky" ? (
                        <Pill>{`Cồng kềnh, ${p.crewSize} người lắp`}</Pill>
                      ) : (
                        <Pill>Hàng nhỏ, gửi vận chuyển</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
