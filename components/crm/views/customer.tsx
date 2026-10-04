"use client";

import { Copy, Download, MessageCircle, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  CHANNEL_LABEL,
  PURPOSE_LABEL,
  canContact,
  type Channel,
  type Consent,
  type Purpose,
} from "@/lib/cdp/consent";
import { CUSTOMERS, EVENTS, HOUSEHOLDS, PRODUCTS, STAFF, TASKS, VARIANTS } from "@/lib/demo/data";
import { LIFECYCLE, ORDER_STATUS } from "@/lib/demo/labels";
import { LocTag, PageHead } from "../parts";
import { useShell } from "../shell-context";
import { careOf, orderMoney, useCrm, vnd } from "../store";

// Hồ sơ khách 360 (CLAUDE.md 1.1, DESIGN.md 6.15): định danh, đồng ý theo mục đích và kênh, hộ, đơn,
// sản phẩm đang dùng, ngày quan trọng, dòng sự kiện, việc. Gọi, nhắn đều kiểm đồng ý trước.

const TONE = { ok: "is-ok", warn: "is-warn", err: "is-err", neutral: "is-n", ai: "is-ai" } as const;
const staff = (id: string) => STAFF.find((s) => s.id === id)?.fullName ?? "Chưa phân";
const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
/** Số đầy đủ mô phỏng sinh từ số che; bản thật lấy từ server khi có quyền và ghi nhật ký. */
const fullPhone = (masked: string) => masked.replace(/•+/, (m) => "3579".repeat(2).slice(0, m.length));

export function CrmCustomer({ id }: { id: string }) {
  const { state, act } = useCrm();
  const { can, me, userId, isOwner } = useShell();
  const router = useRouter();
  const [reveal, setReveal] = useState(false);
  const [compose, setCompose] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);

  const visibleOrders = can("order.view_all")
    ? state.orders
    : can("order.view_own")
      ? state.orders.filter((o) => o.sellerId === userId)
      : [];
  const visible = (cid: string) =>
    can("lead.view_all") ||
    (can("lead.view_own") &&
      (CUSTOMERS.find((x) => x.id === cid)?.ownerId === userId ||
        visibleOrders.some((o) => o.buyerId === cid || o.recipientId === cid)));
  const c = CUSTOMERS.find((x) => x.id === id);
  if (!c || !visible(c.id)) notFound();

  const care = careOf(state, c.id);
  const anon = Boolean(care.anonymized);
  const household = HOUSEHOLDS.find((h) => h.id === c.householdId);
  const members = household ? CUSTOMERS.filter((m) => m.householdId === household.id && m.id !== c.id) : [];
  const orders = visibleOrders.filter((o) => o.buyerId === c.id || o.recipientId === c.id);
  const openOrder = orders.some((o) => !["completed", "cancelled"].includes(o.status));
  const purpose: Purpose = openOrder ? "care" : "marketing";
  const zalo = canContact(care.consents, purpose, "zalo_oa");
  const call = canContact(care.consents, openOrder ? "care" : "care", "call");
  const canReveal =
    can("contact.phone_reveal") || (can("contact.phone_reveal_assigned") && c.ownerId === userId);
  const canEditConsent = can("lead.edit_all") || (can("lead.edit_own") && c.ownerId === userId);
  const owned = orders
    .filter((o) => o.status === "completed" && o.recipientId === c.id)
    .flatMap((o) => o.lines.filter((l) => l.serial).map((l) => ({ o, l })));
  const events = [
    ...care.events,
    ...EVENTS.filter((e) => e.customerId === c.id).map((e) => ({
      at: e.at,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const tasks = TASKS.filter((t) => t.customerId === c.id);
  const lc = LIFECYCLE[c.lifecycle];
  const name = anon ? "Khách đã ẩn danh" : c.fullName;

  function exportData() {
    const payload = {
      khach: { ...c, consents: care.consents },
      don_hang: orders.map((o) => ({ code: o.code, status: o.status, ...orderMoney(o) })),
      su_kien: events,
      xuat_luc: new Date().toISOString(),
    };
    const a = document.createElement("a");
    a.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
    a.download = `du-lieu-khach-${c!.id}.json`;
    a.click();
    act(
      {
        type: "audit",
        actor: me,
        action: "Trích xuất dữ liệu khách",
        entity: `Khách ${c!.fullName}`,
        detail: "Theo yêu cầu của khách",
      },
      "Đã xuất dữ liệu của khách",
    );
  }

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={UserRound} color="var(--obj-contact)" kicker="Khách" title={name}>
          <LocTag loc={c.market} />
          <span
            className={`c-pill ${TONE[lc.tone as keyof typeof TONE] ?? "is-n"}`}
            title="Tính từ dữ liệu, không sửa tay"
          >
            {lc.label}
          </span>
        </PageHead>
        {anon ? (
          <p className="mx-4 mb-3 rounded-control bg-warn-soft px-2.5 py-2 text-warn">
            Khách đã yêu cầu xóa dữ liệu: thông tin cá nhân đã ẩn danh hóa, mọi đồng ý đã rút. Chứng từ đơn
            hàng, thanh toán được giữ theo luật kế toán.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {can("call.make") ? (
              <button
                type="button"
                className="c-btn is-go"
                disabled={!canReveal || !call.allowed}
                title={
                  !call.allowed
                    ? call.reason
                    : !canReveal
                      ? "Chỉ người giữ khách mới xem được số để gọi"
                      : undefined
                }
                onClick={() => {
                  act({
                    type: "audit",
                    actor: me,
                    action: "Xem số điện thoại",
                    entity: `Khách ${c.fullName}`,
                    detail: "Bấm Gọi trên hồ sơ khách",
                  });
                  setReveal(true);
                }}
              >
                <Phone size={13} className="mr-1 inline" aria-hidden />
                Gọi
              </button>
            ) : null}
            {can("message.zalo_send") ? (
              <button
                type="button"
                className="c-btn"
                disabled={!zalo.allowed}
                title={zalo.allowed ? zalo.reason : zalo.reason}
                onClick={() => setCompose((v) => !v)}
              >
                <MessageCircle size={13} className="mr-1 inline" aria-hidden />
                Nhắn Zalo
              </button>
            ) : null}
            {can("lead.create") ? (
              <button
                type="button"
                className="c-btn"
                onClick={() => {
                  act(
                    {
                      type: "createLead",
                      name: c.fullName,
                      phoneRaw: fullPhone(c.phoneMasked),
                      market: c.market,
                      source: "Giới thiệu từ khách cũ",
                      product: "Chưa rõ",
                      note: "Tạo từ hồ sơ khách",
                      actor: me,
                    },
                    "Đã tạo lead (chống trùng theo số của khách)",
                  );
                  router.push("/opportunities");
                }}
              >
                Tạo lead
              </button>
            ) : null}
            {!zalo.allowed && can("message.zalo_send") ? (
              <span className="c-lbl self-center">Zalo: {zalo.reason}</span>
            ) : null}
          </div>
        )}
        {reveal && !anon ? (
          <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2">
            <b className="tabular">{fullPhone(c.phoneMasked)}</b>
            <a className="c-btn" href={`tel:${fullPhone(c.phoneMasked).replace(/\s/g, "")}`}>
              Mở trình gọi
            </a>
            <button
              type="button"
              className="c-ib"
              aria-label="Sao chép số"
              onClick={() => navigator.clipboard?.writeText(fullPhone(c.phoneMasked)).catch(() => undefined)}
            >
              <Copy size={15} />
            </button>
            <span className="c-lbl">Lượt xem số được ghi lại.</span>
          </div>
        ) : null}
        {compose && !anon ? (
          <form
            className="mx-4 mb-3 flex gap-1.5"
            aria-label="Nhắn Zalo"
            onSubmit={(e) => {
              e.preventDefault();
              if (!msg.trim()) return;
              act(
                {
                  type: "customerEvent",
                  customerId: c.id,
                  kind: "zalo",
                  title: "Tin Zalo OA đi",
                  detail: `${purpose === "care" ? "Chăm sóc đơn" : "Tin tiếp thị"}, ${me} gửi`,
                },
                "Đã gửi tin Zalo OA",
              );
              setMsg("");
              setCompose(false);
            }}
          >
            <input
              aria-label="Nội dung Zalo"
              placeholder={`Nhắn ${c.fullName} qua Zalo OA (${purpose === "care" ? "chăm sóc đơn" : "tiếp thị"})`}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
            />
            <button type="submit" className="c-btn is-brand">
              Gửi
            </button>
          </form>
        ) : null}
        <div className="c-hl">
          <div>
            <span className="c-lbl">Đã chi</span>
            <b className="tabular">
              {vnd(orders.filter((o) => o.buyerId === c.id).reduce((s, o) => s + orderMoney(o).confirmed, 0))}
            </b>
          </div>
          <div>
            <span className="c-lbl">Đơn</span>
            <b>{orders.length}</b>
          </div>
          <div>
            <span className="c-lbl">Hộ</span>
            <b>{household?.name ?? "Chưa gắn hộ"}</b>
          </div>
          <div>
            <span className="c-lbl">Phụ trách</span>
            <b>{staff(c.ownerId)}</b>
          </div>
          <div>
            <span className="c-lbl">Nguồn</span>
            <b>{c.source}</b>
          </div>
        </div>
      </section>

      <div className="c-g84">
        <div className="c-stack">
          <section className="c-card" aria-label="Dòng sự kiện">
            <div className="c-ch">
              <h2>Dòng sự kiện</h2>
            </div>
            {events.length === 0 ? <p className="c-empty">Chưa có sự kiện nào.</p> : null}
            <ul className="m-0 list-none px-4 pb-3">
              {events.map((e, i) => (
                <li key={i} className="flex gap-2 border-t border-line-2 py-1.5 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <b>{e.title}</b>
                    <span className="c-lbl block">{anon ? "Đã ẩn danh" : e.detail}</span>
                  </span>
                  <span className="c-lbl tabular">{fmtDate(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="c-card">
            <div className="c-ch">
              <h2>Việc tiếp theo</h2>
            </div>
            {tasks.length === 0 ? <p className="c-empty">Chưa có việc nào cho khách này.</p> : null}
            <ul className="m-0 list-none px-4 pb-3">
              {tasks.map((t) => (
                <li key={t.id} className="py-1">
                  {t.title} <span className="c-lbl">· {staff(t.assigneeId)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="c-card">
            <div className="c-ch">
              <h2>Đơn hàng</h2>
            </div>
            {orders.length === 0 ? <p className="c-empty">Chưa có đơn.</p> : null}
            <ul className="m-0 list-none px-4 pb-3">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 py-1">
                  <Link href={`/orders/${o.id}`} className="c-link font-semibold">
                    {o.code}
                  </Link>
                  <span className={`c-pill ${TONE[ORDER_STATUS[o.status].tone]}`}>
                    {ORDER_STATUS[o.status].label}
                  </span>
                  <span className="ml-auto tabular">{vnd(orderMoney(o).total)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="c-stack">
          <ConsentCard
            customerId={c.id}
            consents={care.consents}
            editable={canEditConsent && !anon}
            phone={anon ? "Đã ẩn danh" : c.phoneMasked}
          />
          <section className="c-card">
            <div className="c-ch">
              <h2>{household?.name ?? "Hộ gia đình"}</h2>
            </div>
            <div className="c-cb">
              {members.length === 0 ? <p className="c-lbl m-0">Chưa có thành viên khác trong hộ.</p> : null}
              <ul className="m-0 list-none space-y-1 p-0">
                {members.map((m) => (
                  <li key={m.id}>
                    {visible(m.id) ? (
                      <Link href={`/customers/${m.id}`} className="c-link font-semibold">
                        {m.fullName}
                      </Link>
                    ) : (
                      <span className="c-lbl">Thành viên khác</span>
                    )}{" "}
                    <span className="c-lbl">{m.relation}</span> <LocTag loc={m.market} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="c-card">
            <div className="c-ch">
              <h2>Sản phẩm đang dùng</h2>
            </div>
            <div className="c-cb">
              {owned.length === 0 ? <p className="c-lbl m-0">Chưa có sản phẩm đã giao.</p> : null}
              {owned.map(({ o, l }) => {
                const p = PRODUCTS.find(
                  (x) => x.id === VARIANTS.find((v) => v.id === l.variantId)?.productId,
                );
                return (
                  <p key={l.serial} className="m-0 py-1">
                    <b>{p?.name}</b>
                    <span className="c-lbl block">
                      Serial {l.serial}, đơn {o.code}, bảo hành {p?.warrantyMonths} tháng
                    </span>
                  </p>
                );
              })}
            </div>
          </section>
          <section className="c-card">
            <div className="c-ch">
              <h2>Ngày quan trọng</h2>
            </div>
            <div className="c-cb">
              {c.importantDates.length === 0 || anon ? <p className="c-lbl m-0">Chưa ghi ngày nào.</p> : null}
              {!anon
                ? c.importantDates.map((d) => (
                    <p key={d.label} className="m-0 flex justify-between py-0.5">
                      <span>{d.label}</span>
                      <span className="tabular">{fmtDate(d.date)}</span>
                    </p>
                  ))
                : null}
            </div>
          </section>
          {isOwner ? (
            <section className="c-card" aria-label="Dữ liệu và quyền riêng tư">
              <div className="c-ch">
                <h2>Dữ liệu và quyền riêng tư</h2>
              </div>
              <div className="c-cb space-y-2">
                <button type="button" className="c-btn" onClick={exportData}>
                  <Download size={13} className="mr-1 inline" aria-hidden />
                  Trích xuất dữ liệu của khách
                </button>
                {!anon ? (
                  confirmErase ? (
                    <div className="rounded-control bg-err-soft p-2.5">
                      <p className="mt-0 mb-2 text-err">
                        Ẩn danh hóa thông tin cá nhân của {c.fullName}? Chứng từ đơn, thanh toán vẫn giữ theo
                        luật kế toán. Không hoàn tác được.
                      </p>
                      <button
                        type="button"
                        className="c-btn"
                        style={{ color: "var(--err)" }}
                        onClick={() => {
                          act(
                            { type: "customerAnonymize", customerId: c.id, actor: me },
                            "Đã ẩn danh hóa hồ sơ khách",
                          );
                          setConfirmErase(false);
                        }}
                      >
                        Xác nhận ẩn danh hóa
                      </button>{" "}
                      <button type="button" className="c-btn" onClick={() => setConfirmErase(false)}>
                        Thôi
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="c-btn"
                      style={{ color: "var(--err)" }}
                      onClick={() => setConfirmErase(true)}
                    >
                      Xử lý yêu cầu xóa dữ liệu
                    </button>
                  )
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ROWS: { purpose: Purpose; channel: Channel }[] = [
  { purpose: "care", channel: "call" },
  { purpose: "care", channel: "zalo_oa" },
  { purpose: "marketing", channel: "all" },
  { purpose: "ads_measurement", channel: "all" },
];

function ConsentCard({
  customerId,
  consents,
  editable,
  phone,
}: {
  customerId: string;
  consents: Consent[];
  editable: boolean;
  phone: string;
}) {
  const { act } = useCrm();
  const { me } = useShell();
  return (
    <section className="c-card" aria-label="Liên hệ và đồng ý">
      <div className="c-ch">
        <h2>Liên hệ và đồng ý</h2>
      </div>
      <div className="c-cb">
        <p className="mt-0 mb-2 tabular">{phone}</p>
        <table className="c-rl">
          <tbody>
            {ROWS.map((r) => {
              const allowed = canContact(
                consents,
                r.purpose,
                r.channel === "all" ? "zalo_oa" : r.channel,
              ).allowed;
              const rec = consents.find((c) => c.purpose === r.purpose && c.channel === r.channel);
              return (
                <tr key={`${r.purpose}-${r.channel}`}>
                  <td>
                    {PURPOSE_LABEL[r.purpose]}
                    <span className="c-lbl block">
                      {CHANNEL_LABEL[r.channel]}
                      {rec
                        ? ` · nguồn ${rec.source}`
                        : r.purpose === "care"
                          ? " · không cần đồng ý riêng"
                          : " · chưa có căn cứ"}
                      {rec?.withdrawnAt ? ` · rút ${fmtDate(rec.withdrawnAt)}` : ""}
                    </span>
                  </td>
                  <td>
                    <Switch
                      label={`${PURPOSE_LABEL[r.purpose]}, ${CHANNEL_LABEL[r.channel]}`}
                      checked={allowed}
                      disabled={!editable}
                      onCheckedChange={(v) =>
                        act(
                          {
                            type: "consentChange",
                            customerId,
                            consent: {
                              purpose: r.purpose,
                              channel: r.channel,
                              granted: v,
                              source: v ? "Khách đồng ý qua điện thoại" : "Khách yêu cầu",
                            },
                            withdraw: !v,
                            actor: me,
                          },
                          v ? "Đã ghi nhận đồng ý" : "Đã ghi nhận khách rút đồng ý",
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="c-lbl mt-2 mb-0">
          Gọi, nhắn, gửi dữ liệu ra ngoài đều kiểm bảng này ở server. Chăm sóc đơn đang có không cần đồng ý
          tiếp thị.
        </p>
      </div>
    </section>
  );
}
