import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketTag } from "@/components/market-tag";
import { PageHeader } from "@/components/record";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/lib/auth/session";
import { CUSTOMERS } from "@/lib/demo/data";
import { MARKETS, ORDER_PATH, ORDER_STATUS } from "@/lib/demo/labels";
import { getOrder, orderTotals, staffName, variantInfo } from "@/lib/demo/repo";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

const PAY_TYPE = { deposit: "Cọc", balance: "Phần còn lại", refund: "Hoàn tiền" };
const PAY_STATUS = {
  recorded: { label: "Chờ xác nhận", tone: "warn" as const },
  confirmed: { label: "Đã xác nhận", tone: "ok" as const },
  rejected: { label: "Từ chối", tone: "err" as const },
};

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const o = getOrder(user, id);
  if (!o) notFound();
  const t = orderTotals(o);
  const buyer = CUSTOMERS.find((c) => c.id === o.buyerId)!;
  const recipient = CUSTOMERS.find((c) => c.id === o.recipientId)!;
  const self = o.buyerId === o.recipientId;
  const readOnly = Boolean(user.viewAs);
  const currentIndex = ORDER_PATH.findIndex((p) => p.status === o.status);

  return (
    <main className="mx-auto max-w-7xl space-y-3 px-4 py-4">
      <PageHeader
        kind="order"
        label="Đơn hàng"
        title={`Đơn ${o.code}`}
        demo
        tags={
          <>
            <MarketTag code={buyer.market} markets={MARKETS} />
            <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill>
          </>
        }
        actions={
          readOnly ? null : (
            <>
              {user.permissions.has("payment.record") ? (
                <Button variant="secondary">Ghi thanh toán</Button>
              ) : null}
              <Button>Chuyển bước</Button>
            </>
          )
        }
        highlights={[
          { label: "Kênh", value: o.channel },
          { label: "Người bán", value: staffName(o.sellerId) },
          { label: "Tạo lúc", value: formatDateTime(o.createdAt) },
          { label: "Hẹn giao", value: o.deliveryDate ? formatDate(o.deliveryDate) : "Chưa hẹn" },
          { label: "Tổng", value: formatMoney(t.total) },
          { label: "Còn lại", value: formatMoney(Math.max(t.balance, 0)) },
        ]}
      />

      {o.status === "pending_approval" ? (
        <p className="rounded-card border border-warn bg-warn-soft px-[14px] py-2 text-warn">
          Đơn giảm vượt giới hạn của người bán, đang chờ Owner duyệt. Chưa giữ hàng.
        </p>
      ) : (
        <ol
          aria-label="Các bước đơn hàng"
          className="flex overflow-x-auto rounded-card border border-line bg-surface"
        >
          {ORDER_PATH.map((p, i) => (
            <li
              key={p.status}
              aria-current={i === currentIndex ? "step" : undefined}
              className={cn(
                "flex-1 px-3 py-2 text-center whitespace-nowrap",
                i < currentIndex && "bg-ok-soft text-ok",
                i === currentIndex && "bg-brand-strong font-bold text-white",
                i > currentIndex && "bg-surface-2 text-text-weak",
              )}
            >
              {p.label}
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
            <Card className="border-l-[3px] border-l-brand">
              <CardBody>
                <p className="text-label text-text-weak">Người đặt</p>
                <Link href={`/customers/${buyer.id}`} className="font-semibold text-brand">
                  {buyer.fullName}
                </Link>{" "}
                <MarketTag code={buyer.market} markets={MARKETS} />
                <p className="text-label text-text-weak">
                  {[buyer.city, buyer.province].filter(Boolean).join(", ")}
                </p>
                <p className="tabular">{buyer.phoneMasked}</p>
              </CardBody>
            </Card>
            <span aria-hidden className="hidden items-center text-text-weak sm:flex">
              →
            </span>
            <Card>
              <CardBody>
                <p className="text-label text-text-weak">Người nhận</p>
                {self ? (
                  <p className="font-semibold">Chính người đặt</p>
                ) : (
                  <>
                    <Link href={`/customers/${recipient.id}`} className="font-semibold text-brand">
                      {recipient.fullName}
                    </Link>{" "}
                    <span className="text-label text-text-weak">{recipient.relation}</span>
                  </>
                )}
                <p className="text-label text-text-weak">{o.address}</p>
                {o.keepSurprise ? (
                  <p className="mt-2 rounded-control bg-warn-soft px-2 py-1 text-label text-warn">
                    Giữ bất ngờ: không liên hệ người nhận khi người đặt chưa cho phép.
                  </p>
                ) : (
                  <p className="tabular">{recipient.phoneMasked}</p>
                )}
              </CardBody>
            </Card>
          </div>
          {o.giftMessage ? (
            <Card>
              <CardBody>
                <p className="text-label text-text-weak">Lời nhắn quà</p>
                <p>{o.giftMessage}</p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Sản phẩm</CardTitle>
            </CardHeader>
            <ul>
              {o.lines.map((l, i) => {
                const { label, variant } = variantInfo(l.variantId);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 px-[14px] py-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {label} {l.isGift ? <Pill tone="ok">Quà tặng</Pill> : null}
                      </p>
                      <p className="tabular text-label text-text-weak">
                        {variant.sku}
                        {l.serial ? `, serial ${l.serial}` : ""}
                      </p>
                    </div>
                    <span className="tabular">x{l.qty}</span>
                    <span className="tabular w-36 text-right">
                      {formatMoney(l.unitPrice * l.qty - l.discount)}
                      {l.discount ? (
                        <span className="block text-label text-text-weak">
                          giảm {formatMoney(l.discount)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chính sách đã áp</CardTitle>
              <span className="text-label text-text-weak">Ảnh chụp lúc chốt đơn</span>
            </CardHeader>
            <CardBody>
              {o.policies.length === 0 ? (
                <p className="text-text-weak">Không áp chính sách nào.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {o.policies.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Tiền</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="tabular space-y-1">
                <Row label="Tạm tính" value={formatMoney(t.subtotal)} />
                <Row label="Giảm" value={t.discount ? `−${formatMoney(t.discount)}` : "0đ"} />
                <Row label="Phí giao, lắp" value={formatMoney(t.fees)} />
                <Row label="Tổng" value={formatMoney(t.total)} strong />
                <Row label="Đã xác nhận" value={formatMoney(t.confirmed)} />
                <Row label="Chờ xác nhận" value={formatMoney(t.pending)} />
                <Row label="Còn lại" value={formatMoney(Math.max(t.balance, 0))} strong />
              </dl>
              {o.holdUntil ? (
                <p className="mt-2 text-label text-warn">Giữ hàng đến {formatDate(o.holdUntil)}</p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Các khoản thanh toán</CardTitle>
            </CardHeader>
            <CardBody>
              {o.payments.length === 0 ? (
                <p className="text-text-weak">Chưa có khoản nào.</p>
              ) : (
                <ul className="space-y-2">
                  {o.payments.map((p, i) => (
                    <li key={i}>
                      <p className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{PAY_TYPE[p.type]}</span>
                        <span className="tabular">{formatMoney(p.amount)}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-label text-text-weak">
                        {p.method}, {p.reference}
                        <Pill tone={PAY_STATUS[p.status].tone}>{PAY_STATUS[p.status].label}</Pill>
                      </p>
                      <p className="text-label text-text-weak">
                        Ghi bởi {staffName(p.recordedBy)}, {formatDateTime(p.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2", strong && "font-bold")}>
      <dt className={strong ? "" : "text-text-weak"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
