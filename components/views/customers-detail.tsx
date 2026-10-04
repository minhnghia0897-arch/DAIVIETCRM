import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketTag } from "@/components/market-tag";
import { Field, PageHeader } from "@/components/record";
import { TasksBlock } from "@/components/tasks-block";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import type { SessionUser } from "@/lib/auth/types";
import { LIFECYCLE, MARKETS, ORDER_STATUS } from "@/lib/demo/labels";
import { getCustomer, orderTotals, staffName } from "@/lib/demo/repo";
import { dueLabel } from "@/lib/demo/time";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort } from "@/lib/format";

const EVENT_DOT: Record<string, string> = {
  lead: "bg-obj-lead",
  call: "bg-obj-call",
  zalo: "bg-obj-zalo",
  quote: "bg-brand",
  order: "bg-brand-strong",
  payment: "bg-ok",
  delivery: "bg-ok",
  warranty: "bg-err",
  note: "bg-text-weak",
};

export function CustomerView({ user, id }: { user: SessionUser; id: string }) {
  const data = getCustomer(user, id);
  if (!data) notFound();
  const { customer: c, household, members, orders, owned, events, tasks, totalPaid } = data;
  const readOnly = Boolean(user.viewAs);
  const lc = LIFECYCLE[c.lifecycle];

  return (
    <main className="mx-auto max-w-7xl space-y-3 px-4 py-4">
      <PageHeader
        kind="contact"
        label="Khách"
        title={c.fullName}
        demo
        tags={
          <>
            <MarketTag code={c.market} markets={MARKETS} />
            <Pill tone={lc.tone} title="Tính từ dữ liệu, không sửa tay">
              {lc.label}
            </Pill>
          </>
        }
        actions={
          readOnly ? null : (
            <>
              <Button variant="secondary">Gọi</Button>
              <Button variant="secondary">Zalo</Button>
              <Button>Tạo lead</Button>
            </>
          )
        }
        highlights={[
          { label: "Đã chi", value: formatMoneyShort(totalPaid) },
          { label: "Đơn", value: orders.length },
          { label: "Hộ", value: household?.name ?? "Chưa gắn hộ" },
          { label: "Tương tác gần nhất", value: formatDate(c.lastInteraction) },
          { label: "Phụ trách", value: staffName(c.ownerId) },
          { label: "Nguồn", value: c.source },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Việc tiếp theo</CardTitle>
            </CardHeader>
            <TasksBlock
              readOnly={readOnly}
              empty="Chưa có việc nào cho khách này."
              items={tasks.map((t) => {
                const d = dueLabel(t.due);
                return {
                  ...t,
                  dueLabel: d.label,
                  overdue: d.overdue,
                  sub: `Giao cho ${staffName(t.assigneeId)}`,
                };
              })}
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dòng sự kiện</CardTitle>
              <span className="text-label text-text-weak">
                Lead, cuộc gọi, tin nhắn, báo giá, đơn, thanh toán, giao lắp, bảo hành
              </span>
            </CardHeader>
            {events.length === 0 ? (
              <CardBody className="text-text-weak">Chưa có sự kiện nào.</CardBody>
            ) : (
              <ol className="relative px-[14px] py-3">
                {events.map((e, i) => (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className={`mt-1 size-3 shrink-0 rounded-full ${EVENT_DOT[e.kind]}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{e.title}</p>
                      <p className="text-text-weak">{e.detail}</p>
                    </div>
                    <span className="tabular shrink-0 text-label text-text-weak">{formatDateTime(e.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Liên hệ và đồng ý</CardTitle>
            </CardHeader>
            <CardBody>
              <Field label="Số điện thoại">{c.phoneMasked}</Field>
              <Field label="Nơi ở">{[c.city, c.province].filter(Boolean).join(", ")}</Field>
              <Field label="Đồng ý">
                {c.consents.length ? (
                  <span className="flex flex-wrap gap-1">
                    {c.consents.map((x) => (
                      <Pill key={x.channel} tone={x.granted ? "ok" : "neutral"}>
                        {x.label}
                      </Pill>
                    ))}
                  </span>
                ) : (
                  <span className="text-text-weak">
                    Chưa có căn cứ đồng ý. Thông tin do người đặt cung cấp.
                  </span>
                )}
              </Field>
              {c.note ? <Field label="Ghi chú">{c.note}</Field> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{household ? household.name : "Hộ gia đình"}</CardTitle>
              {household ? <span className="text-label text-text-weak">{household.place}</span> : null}
            </CardHeader>
            <CardBody>
              {members.length === 0 ? (
                <p className="text-text-weak">Chưa có thành viên khác trong hộ.</p>
              ) : (
                <ul className="space-y-1.5">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      {m.fullName ? (
                        <Link href={`/customers/${m.id}`} className="font-semibold text-brand">
                          {m.fullName}
                        </Link>
                      ) : (
                        <span className="text-text-weak">Thành viên khác</span>
                      )}
                      <span className="text-label text-text-weak">{m.relation}</span>
                      <MarketTag code={m.market} markets={MARKETS} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sản phẩm đang dùng</CardTitle>
            </CardHeader>
            <CardBody>
              {owned.length === 0 ? (
                <p className="text-text-weak">Chưa có sản phẩm đã giao.</p>
              ) : (
                <ul className="space-y-2">
                  {owned.map((o) => (
                    <li key={o.serial}>
                      <p className="font-semibold">{o.name}</p>
                      <p className="text-label text-text-weak">
                        Serial {o.serial}, giao {formatDate(o.delivered)}, bảo hành đến{" "}
                        {formatDate(o.warrantyEnd)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ngày quan trọng</CardTitle>
            </CardHeader>
            <CardBody>
              {c.importantDates.length === 0 ? (
                <p className="text-text-weak">Chưa ghi ngày nào.</p>
              ) : (
                <ul className="space-y-1">
                  {c.importantDates.map((d) => (
                    <li key={d.label} className="flex justify-between gap-2">
                      <span>{d.label}</span>
                      <span className="tabular text-text-weak">{formatDate(d.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Đơn hàng</CardTitle>
            </CardHeader>
            <CardBody>
              {orders.length === 0 ? (
                <p className="text-text-weak">Chưa có đơn.</p>
              ) : (
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/orders/${o.id}`} className="font-semibold text-brand">
                        {o.code}
                      </Link>
                      <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill>
                      <span className="tabular ml-auto">{formatMoney(orderTotals(o).total)}</span>
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
