"use client";

import { Copy, Download, MessageCircle, Phone, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MarketTag, type MarketInfo } from "@/components/market-tag";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  CHANNEL_LABEL,
  FLAG_LABEL,
  PURPOSE_LABEL,
  consentState,
  lifecycleOf,
  stoppedContact,
  type ConsentChannel,
  type ConsentPurpose,
  type ConsentRow,
} from "@/lib/cdp/lifecycle";
import type { Json } from "@/lib/db/types";
import { PROVINCES_ALL } from "@/lib/demo/sales-catalog";
import { formatDate, formatMoney } from "@/lib/format";
import { ORDER_STATUS_LIVE, ORDER_TONE } from "@/lib/sales/order-labels";

import { PageHead } from "../parts";
import { useShell } from "../shell-context";

// Hồ sơ khách 360 bản thật (route /customers/[id], CLAUDE.md 1.1, DESIGN.md 6.15): định danh, đồng ý theo mục đích
// và kênh, hộ, lead, đơn, sản phẩm đang dùng, ngày quan trọng, dòng sự kiện, việc. Dữ liệu do server page đọc dưới
// RLS; mọi thao tác gọi server action, quyền và nhật ký kiểm ở database.

type Result = { ok: boolean; message: string };

export interface CustomerLiveData {
  id: string;
  name: string;
  relation: string | null;
  market: string;
  province: string | null;
  city: string | null;
  stage: string;
  stageLabel: string;
  stageSince: string | null;
  flags: string[];
  lastInteraction: string | null;
  createdAt: string;
  ownerName: string | null;
  totalPaid: number;
  ordersCount: number;
  owned: { name: string; serial: string | null; warrantyEnds: string | null; qty: number | null }[];
  /** Người không có số riêng, liên lạc qua số của người khác trong hộ. */
  sharedPhone: boolean;
  identities: { id: string; type: string; label: string; masked: string; primary: boolean; valid: boolean }[];
  consents: ConsentRow[];
  leads: {
    id: string;
    stage: string;
    closed: boolean;
    lost: boolean;
    source: string;
    role: "buyer" | "recipient";
    owner: string | null;
    createdAt: string;
  }[];
  orders: {
    id: string;
    code: string;
    status: string;
    total: number;
    paid: number;
    role: "buyer" | "recipient";
    createdAt: string;
  }[];
  household: { id: string; name: string } | null;
  members: { id: string; name: string; relation: string | null; market: string; stageLabel: string }[];
  dates: { id: string; label: string; date: string; yearly: boolean }[];
  tasks: { id: string; label: string; due: string; overdue: boolean; assignee: string | null }[];
  conversationId: string | null;
  /** Lead đang mở của khách (người đặt), để ghi kết quả cuộc gọi. */
  openLeadId: string | null;
  /** Giữ lead của khách hoặc đang trả lời khách đang hỏi (cùng luật assert_contact_editor). */
  mine: boolean;
  /** Đang giữ lead mở của khách: được xem số để gọi khi chỉ có contact.phone_reveal_assigned. */
  holdsOpenLead: boolean;
  /** Khách là người nhận của lead hoặc đơn đang giữ bất ngờ. */
  surprise: boolean;
  markets: MarketInfo[];
  activity: { id: string; kind: string; text: string; actor: string; time: string }[];
}

export interface CustomerLiveActions {
  revealPhone(i: {
    contactId: string;
    identityId: string;
  }): Promise<{ ok: true; phone: string } | { ok: false; message: string }>;
  rename(i: { contactId: string; name: string }): Promise<Result>;
  updateProfile(i: {
    contactId: string;
    country: string;
    province: string;
    relation: string;
  }): Promise<Result>;
  setConsent(i: {
    contactId: string;
    purpose: ConsentPurpose;
    channel: ConsentChannel | "all";
    granted: boolean;
    source?: string;
  }): Promise<Result>;
  addDate(i: { contactId: string; label: string; date: string; yearly: boolean }): Promise<Result>;
  removeDate(i: { contactId: string; id: string }): Promise<Result>;
  openLead(i: {
    contactId: string;
    note?: string;
  }): Promise<
    { ok: true; message: string; leadId: string; canOpen: boolean } | { ok: false; message: string }
  >;
  exportData(i: { contactId: string }): Promise<{ ok: true; data: Json } | { ok: false; message: string }>;
}

const INPUT = "rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const CONSENT_ROWS: { purpose: ConsentPurpose; channel: ConsentChannel | "all" }[] = [
  { purpose: "care", channel: "call" },
  { purpose: "care", channel: "zalo_oa" },
  { purpose: "care", channel: "messenger" },
  { purpose: "marketing", channel: "all" },
  { purpose: "ads_measurement", channel: "all" },
];
const ROLE_LABEL = { buyer: "Người đặt", recipient: "Người nhận" } as const;

export function CustomerLive({ data: d, actions }: { data: CustomerLiveData; actions: CustomerLiveActions }) {
  const { can } = useShell();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [leadNote, setLeadNote] = useState<string | null>(null);

  const lc = lifecycleOf(d.stage);
  const stopped = stoppedContact(d.consents);
  const careCall = consentState(d.consents, "care", "call");
  const phone = d.identities.find((i) => i.type === "phone") ?? null;
  // Cùng luật với database: sửa khách khi sửa được mọi lead, hoặc giữ lead của khách (assert_contact_editor).
  const canEdit = can("lead.edit_all") || (can("lead.edit_own") && d.mine);
  const canReveal = can("contact.phone_reveal") || (can("contact.phone_reveal_assigned") && d.holdsOpenLead);
  const callBlock = !phone
    ? d.sharedPhone
      ? "Khách dùng chung số của người khác trong hộ: gọi qua hồ sơ người đó"
      : "Khách chưa có số điện thoại"
    : d.surprise
      ? "Người đặt đang giữ bất ngờ: chưa liên hệ người nhận"
      : stopped || !careCall.allowed
        ? "Khách đã yêu cầu không gọi"
        : !canReveal
          ? "Chỉ người đang giữ lead của khách mới xem được số để gọi"
          : null;

  function run(fn: () => Promise<Result>, after?: () => void) {
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch {
        toast("Chưa lưu được, thử lại sau ít phút.", "err");
      }
    });
  }

  function call() {
    if (!phone) return;
    start(async () => {
      const r = await actions.revealPhone({ contactId: d.id, identityId: phone.id });
      if (r.ok) setRevealed(r.phone);
      else toast(r.message, "err");
    });
  }

  function openLead() {
    start(async () => {
      const r = await actions.openLead({ contactId: d.id, note: leadNote?.trim() || undefined });
      toast(r.message, r.ok ? "ok" : "err");
      if (!r.ok) return;
      setLeadNote(null);
      if (r.canOpen) router.push(`/leads/${r.leadId}`);
      else router.refresh();
    });
  }

  function exportData() {
    start(async () => {
      const r = await actions.exportData({ contactId: d.id });
      if (!r.ok) return toast(r.message, "err");
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `du-lieu-khach-${d.id}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Đã xuất dữ liệu của khách. Lượt xuất được ghi vào nhật ký kiểm toán.", "ok");
    });
  }

  const openLeadRow = d.leads.find((l) => !l.closed && l.role === "buyer");

  return (
    <div className="c-stack">
      <section className="c-card" aria-label={`Hồ sơ khách ${d.name}`} aria-busy={pending}>
        <PageHead
          icon={UserRound}
          color="var(--obj-contact)"
          kicker="Khách"
          title={d.name}
          back={{ href: "/customers", label: "Khách" }}
        >
          <MarketTag code={d.market} markets={d.markets} />
          <span className={`c-pill ${ORDER_TONE[lc.tone]}`} title="Tính tự động từ dữ liệu, không sửa tay">
            {lc.label}
          </span>
        </PageHead>

        <div className="c-cb">
          {d.stage === "do_not_contact" ? (
            <p className="mt-0 mb-2 rounded-control bg-err-soft px-2.5 py-2 text-err" role="note">
              <b>Ngừng liên hệ:</b> khách đã yêu cầu ngừng mọi liên hệ. Không gọi, không nhắn, không làm nóng
              lại. Khách cho phép lại thì đổi ở mục Liên hệ và đồng ý.
            </p>
          ) : null}
          {d.flags.filter((f) => f !== "stop_contact").length ? (
            <p className="mt-0 mb-2 rounded-control bg-warn-soft px-2.5 py-2 text-warn" role="note">
              <b>{lc.label}:</b>{" "}
              {d.flags
                .filter((f) => f !== "stop_contact")
                .map((f) => FLAG_LABEL[f] ?? f)
                .join("; ")}
              .
            </p>
          ) : null}
          {d.surprise ? (
            <p className="mt-0 mb-2 rounded-control bg-ai-soft px-2.5 py-2 text-ai" role="note">
              <b>Giữ bất ngờ:</b> khách là người nhận quà, người đặt chưa cho phép liên hệ. Không gọi, không
              nhắn, không hiện số.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {can("call.make") ? (
              <button
                type="button"
                className="c-btn is-go"
                disabled={pending || Boolean(callBlock)}
                title={callBlock ?? undefined}
                onClick={call}
              >
                <Phone size={13} className="mr-1 inline" aria-hidden />
                Gọi
              </button>
            ) : null}
            {d.conversationId ? (
              <Link href={`/inbox?c=${d.conversationId}`} className="c-btn">
                <MessageCircle size={13} className="mr-1 inline" aria-hidden />
                Mở hội thoại
              </Link>
            ) : null}
            {openLeadRow ? (
              <Link href={`/leads/${openLeadRow.id}`} className="c-btn">
                Mở lead đang tư vấn
              </Link>
            ) : can("lead.create") && d.stage !== "do_not_contact" ? (
              <button
                type="button"
                className="c-btn"
                disabled={pending}
                onClick={() => setLeadNote((v) => (v === null ? "" : null))}
              >
                Mở lead mới
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="c-btn" onClick={() => setEditing((v) => !v)}>
                Sửa thông tin
              </button>
            ) : null}
          </div>
          {callBlock && can("call.make") ? <p className="c-lbl mt-1.5 mb-0">{callBlock}.</p> : null}

          {revealed !== null ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2">
              <b className="tabular text-[15px]">{revealed}</b>
              <a className="c-btn" href={`tel:${revealed.replace(/\s/g, "")}`}>
                Mở trình gọi
              </a>
              <button
                type="button"
                className="c-ib"
                aria-label="Sao chép số"
                onClick={() => navigator.clipboard?.writeText(revealed).catch(() => undefined)}
              >
                <Copy size={15} />
              </button>
              <span className="c-lbl">Lượt xem số được ghi lại.</span>
              {d.openLeadId ? (
                <Link href={`/leads/${d.openLeadId}`} className="c-link text-label">
                  Ghi kết quả cuộc gọi ở hồ sơ lead
                </Link>
              ) : null}
              <button type="button" className="c-link ml-auto text-label" onClick={() => setRevealed(null)}>
                Ẩn số
              </button>
            </div>
          ) : null}

          {leadNote !== null ? (
            <form
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label="Mở lead mới"
              onSubmit={(e) => {
                e.preventDefault();
                openLead();
              }}
            >
              <input
                aria-label="Khách cần gì"
                placeholder="Khách cần gì (không bắt buộc), ví dụ mua thêm máy lọc cho nhà con gái"
                value={leadNote}
                onChange={(e) => setLeadNote(e.target.value)}
                className={`${INPUT} min-w-0 flex-1`}
              />
              <button type="submit" className="c-btn is-blue" disabled={pending}>
                Mở lead và giao người trực
              </button>
            </form>
          ) : null}

          {editing && canEdit ? (
            <ProfileForm
              d={d}
              pending={pending}
              run={run}
              actions={actions}
              onDone={() => setEditing(false)}
            />
          ) : null}
        </div>

        <div className="c-hl">
          <div>
            <span className="c-lbl">Đã trả</span>
            <b className="tabular">{formatMoney(d.totalPaid)}</b>
          </div>
          <div>
            <span className="c-lbl">Đơn đã đặt</span>
            <b>{d.ordersCount}</b>
          </div>
          <div>
            <span className="c-lbl">Hộ</span>
            <b>{d.household?.name ?? "Chưa gắn hộ"}</b>
          </div>
          <div>
            <span className="c-lbl">Phụ trách</span>
            <b>{d.ownerName ?? "Chưa phân"}</b>
          </div>
          <div>
            <span className="c-lbl">Tương tác gần nhất</span>
            <b className="tabular">{d.lastInteraction ? formatDate(d.lastInteraction) : "—"}</b>
          </div>
          <div>
            <span className="c-lbl">Ở giai đoạn này từ</span>
            <b className="tabular">{d.stageSince ? formatDate(d.stageSince) : formatDate(d.createdAt)}</b>
          </div>
        </div>
      </section>

      <div className="c-g84">
        <div className="c-stack">
          <section className="c-card" aria-label="Dòng sự kiện">
            <div className="c-ch">
              <h2>Dòng sự kiện</h2>
            </div>
            {d.activity.length === 0 ? (
              <p className="c-empty">Chưa có sự kiện nào. Mỗi lần gọi, nhắn, mua hàng đều được ghi ở đây.</p>
            ) : null}
            <ul className="m-0 list-none px-4 pb-3">
              {d.activity.map((e) => (
                <li key={e.id} className="flex gap-2 border-t border-line-2 py-1.5 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <b>{e.kind}</b> {e.text}
                    {e.actor ? <span className="c-lbl block">{e.actor}</span> : null}
                  </span>
                  <span className="c-lbl tabular shrink-0">{e.time}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="c-card" aria-label="Việc đang mở">
            <div className="c-ch">
              <h2>Việc đang mở</h2>
            </div>
            {d.tasks.length === 0 ? (
              <p className="c-empty">Không có việc nào đang mở cho khách này.</p>
            ) : null}
            <ul className="m-0 list-none px-4 pb-3">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap gap-2 py-1">
                  <span className="min-w-0 flex-1">
                    {t.label} <span className="c-lbl">· {t.assignee ?? "Hàng chung"}</span>
                  </span>
                  <span className={`c-lbl tabular ${t.overdue ? "text-err" : ""}`}>{t.due}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="c-card" aria-label="Lead">
            <div className="c-ch">
              <h2>Lead</h2>
            </div>
            {d.leads.length === 0 ? (
              <p className="c-empty">
                Chưa có lead. Khách mới nhắn hỏi thì sale admin chuyển thành lead ở Hội thoại.
              </p>
            ) : null}
            <ul className="m-0 list-none px-4 pb-3">
              {d.leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 py-1">
                  <Link href={`/leads/${l.id}`} className="c-link font-semibold">
                    {l.source}
                  </Link>
                  <span className={`c-pill ${l.lost ? "is-err" : l.closed ? "is-ok" : "is-n"}`}>
                    {l.stage}
                  </span>
                  <span className="c-lbl">
                    {ROLE_LABEL[l.role]} · {l.owner ?? "Chưa phân"} · {formatDate(l.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="c-card" aria-label="Đơn hàng">
            <div className="c-ch">
              <h2>Đơn hàng</h2>
            </div>
            {d.orders.length === 0 ? <p className="c-empty">Chưa có đơn.</p> : null}
            <ul className="m-0 list-none px-4 pb-3">
              {d.orders.map((o) => {
                const st = ORDER_STATUS_LIVE[o.status] ?? { label: o.status, tone: "neutral" as const };
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-1">
                    <Link href={`/orders/${o.id}`} className="c-link font-semibold tabular">
                      {o.code}
                    </Link>
                    <span className={`c-pill ${ORDER_TONE[st.tone]}`}>{st.label}</span>
                    <span className="c-lbl">
                      {ROLE_LABEL[o.role]} · {formatDate(o.createdAt)}
                    </span>
                    <span className="ml-auto tabular">{formatMoney(o.total)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="c-stack">
          <ConsentCard d={d} editable={canEdit} pending={pending} run={run} actions={actions} />

          <section className="c-card" aria-label="Hộ gia đình">
            <div className="c-ch">
              <h2>{d.household?.name ?? "Hộ gia đình"}</h2>
            </div>
            <div className="c-cb">
              {!d.household ? (
                <p className="c-lbl m-0">Chưa gắn hộ. Gắn hộ để biết khách mua thêm cho người nhà.</p>
              ) : d.members.length === 0 ? (
                <p className="c-lbl m-0">Chưa có thành viên khác trong hộ mà anh chị xem được.</p>
              ) : null}
              <ul className="m-0 list-none space-y-1 p-0">
                {d.members.map((m) => (
                  <li key={m.id}>
                    <Link href={`/customers/${m.id}`} className="c-link font-semibold">
                      {m.name}
                    </Link>{" "}
                    {m.relation ? <span className="c-lbl">{m.relation}</span> : null}{" "}
                    <MarketTag code={m.market} markets={d.markets} />{" "}
                    <span className="c-lbl">{m.stageLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="c-card" aria-label="Sản phẩm đang dùng">
            <div className="c-ch">
              <h2>Sản phẩm đang dùng</h2>
            </div>
            <div className="c-cb">
              {d.owned.length === 0 ? <p className="c-lbl m-0">Chưa có sản phẩm đã giao.</p> : null}
              {d.owned.map((o, i) => (
                <p key={`${o.name}-${o.serial ?? i}`} className="m-0 py-1">
                  <b>{o.name}</b>
                  {o.qty && o.qty > 1 ? ` × ${o.qty}` : ""}
                  {o.serial || o.warrantyEnds ? (
                    <span className="c-lbl block">
                      {o.serial ? `Serial ${o.serial}` : ""}
                      {o.serial && o.warrantyEnds ? ", " : ""}
                      {o.warrantyEnds ? `bảo hành đến ${formatDate(o.warrantyEnds)}` : ""}
                    </span>
                  ) : null}
                </p>
              ))}
            </div>
          </section>

          <DatesCard d={d} pending={pending} run={run} actions={actions} />

          {can("lead.export") ? (
            <section className="c-card" aria-label="Dữ liệu và quyền riêng tư">
              <div className="c-ch">
                <h2>Dữ liệu và quyền riêng tư</h2>
              </div>
              <div className="c-cb space-y-2">
                <button type="button" className="c-btn" disabled={pending} onClick={exportData}>
                  <Download size={13} className="mr-1 inline" aria-hidden />
                  Trích xuất dữ liệu của khách
                </button>
                <p className="c-lbl m-0">
                  Dùng khi khách yêu cầu xem dữ liệu CRM giữ về mình. File gồm định danh, đồng ý, lead, đơn,
                  bảo hành, tin nhắn; mỗi lần xuất được ghi vào nhật ký kiểm toán.
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProfileForm({
  d,
  pending,
  run,
  actions,
  onDone,
}: {
  d: CustomerLiveData;
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  actions: CustomerLiveActions;
  onDone: () => void;
}) {
  const [name, setName] = useState(d.name);
  const [country, setCountry] = useState(d.market);
  const [province, setProvince] = useState(d.province ?? "");
  const [relation, setRelation] = useState(d.relation ?? "");
  return (
    <form
      className="mt-2 grid gap-2 rounded-control border border-line bg-surface-2 p-3 sm:grid-cols-2"
      aria-label="Sửa thông tin khách"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          if (name.trim() !== d.name) {
            const r = await actions.rename({ contactId: d.id, name });
            if (!r.ok) return r;
          }
          return actions.updateProfile({ contactId: d.id, country, province, relation });
        }, onDone);
      }}
    >
      <label className="grid gap-1">
        <span className="c-lbl">Họ tên</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
          required
          maxLength={120}
        />
      </label>
      <label className="grid gap-1">
        <span className="c-lbl">Nơi khách đang sống</span>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={INPUT}>
          {d.markets.map((m) => (
            <option key={m.country_code} value={m.country_code}>
              {m.name}
            </option>
          ))}
          <option value="unknown">Chưa rõ</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="c-lbl">Tỉnh, thành phố</span>
        <input
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          list="customer-provinces"
          className={INPUT}
          maxLength={80}
        />
        <datalist id="customer-provinces">
          {PROVINCES_ALL.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <label className="grid gap-1">
        <span className="c-lbl">Quan hệ trong hộ</span>
        <input
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="Ví dụ: Bố, Mẹ, Con gái"
          className={INPUT}
          maxLength={60}
        />
      </label>
      <div className="flex gap-1.5 sm:col-span-2">
        <button type="submit" className="c-btn is-blue" disabled={pending}>
          Lưu
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Thôi
        </button>
      </div>
    </form>
  );
}

function ConsentCard({
  d,
  editable,
  pending,
  run,
  actions,
}: {
  d: CustomerLiveData;
  editable: boolean;
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  actions: CustomerLiveActions;
}) {
  // Công tắc đổi ngay khi bấm; lưu lỗi hoặc tải lại thì về giá trị server.
  const server = JSON.stringify(d.consents);
  const [seen, setSeen] = useState(server);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  if (seen !== server) {
    setSeen(server);
    setLocal({});
  }
  const stopped = local["care:all"] !== undefined ? !local["care:all"] : stoppedContact(d.consents);

  function toggle(purpose: ConsentPurpose, channel: ConsentChannel | "all", granted: boolean) {
    const key = `${purpose}:${channel}`;
    setLocal((s) => ({ ...s, [key]: granted }));
    run(async () => {
      const r = await actions.setConsent({ contactId: d.id, purpose, channel, granted });
      if (!r.ok) setLocal((s) => ({ ...s, [key]: !granted }));
      return r;
    }, undefined);
  }

  return (
    <section className="c-card" aria-label="Liên hệ và đồng ý">
      <div className="c-ch">
        <h2>Liên hệ và đồng ý</h2>
      </div>
      <div className="c-cb">
        {d.identities.length === 0 ? (
          <p className="c-lbl mt-0 mb-2">
            {d.sharedPhone ? "Khách dùng chung số của người khác trong hộ." : "Chưa có định danh liên lạc."}
          </p>
        ) : (
          <ul className="m-0 mb-2 list-none space-y-0.5 p-0">
            {d.identities.map((i) => (
              <li key={i.id} className="flex flex-wrap gap-2">
                <span className="c-lbl w-20 shrink-0">{i.label}</span>
                <span className="tabular">{i.masked}</span>
                {i.primary && d.identities.length > 1 ? <span className="c-lbl">chính</span> : null}
                {!i.valid ? <span className="c-pill is-warn">Số sai dạng</span> : null}
              </li>
            ))}
          </ul>
        )}
        <table className="c-rl">
          <tbody>
            {CONSENT_ROWS.map((r) => {
              const key = `${r.purpose}:${r.channel}`;
              const st = consentState(d.consents, r.purpose, r.channel);
              const allowed = !stopped && (local[key] ?? st.allowed);
              return (
                <tr key={key}>
                  <td>
                    {PURPOSE_LABEL[r.purpose]}
                    <span className="c-lbl block">
                      {CHANNEL_LABEL[r.channel]}
                      {st.state === "default"
                        ? r.purpose === "care"
                          ? " · không cần đồng ý riêng"
                          : " · chưa có căn cứ đồng ý"
                        : st.source
                          ? ` · nguồn: ${st.source}`
                          : ""}
                    </span>
                  </td>
                  <td>
                    <Switch
                      label={`${PURPOSE_LABEL[r.purpose]}, ${CHANNEL_LABEL[r.channel]}`}
                      checked={allowed}
                      disabled={!editable || pending || stopped}
                      onCheckedChange={(v) => toggle(r.purpose, r.channel, v)}
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>
                <b>Ngừng mọi liên hệ</b>
                <span className="c-lbl block">Khách yêu cầu không gọi, không nhắn, không làm nóng lại</span>
              </td>
              <td>
                <Switch
                  label="Ngừng mọi liên hệ"
                  checked={stopped}
                  disabled={!editable || pending}
                  onCheckedChange={(v) => toggle("care", "all", !v)}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="c-lbl mt-2 mb-0">
          Gọi, nhắn, gửi dữ liệu ra ngoài đều kiểm bảng này ở server. Chăm sóc đơn đang có không cần đồng ý
          tiếp thị; làm nóng lại, tin khuyến mãi thì cần.
        </p>
        {!editable ? (
          <p className="c-lbl mt-1 mb-0">
            Chỉ người giữ lead của khách hoặc người sửa được mọi lead mới đổi được.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DatesCard({
  d,
  pending,
  run,
  actions,
}: {
  d: CustomerLiveData;
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  actions: CustomerLiveActions;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [yearly, setYearly] = useState(true);
  return (
    <section className="c-card" aria-label="Ngày quan trọng">
      <div className="c-ch">
        <h2>Ngày quan trọng</h2>
        <span className="c-r">
          <button type="button" className="c-link text-label" onClick={() => setAdding((v) => !v)}>
            Thêm ngày
          </button>
        </span>
      </div>
      <div className="c-cb">
        {d.dates.length === 0 && !adding ? (
          <p className="c-lbl m-0">
            Chưa ghi ngày nào. Sinh nhật, mừng thọ nghe được khi gọi thì ghi ở đây để nhắc dịp tặng.
          </p>
        ) : null}
        {d.dates.map((x) => (
          <p key={x.id} className="m-0 flex items-center gap-2 py-0.5">
            <span className="flex-1">{x.label}</span>
            <span className="tabular">
              {x.yearly ? `${x.date.slice(8, 10)}/${x.date.slice(5, 7)}, hằng năm` : formatDate(x.date)}
            </span>
            <button
              type="button"
              className="c-ib"
              aria-label={`Xóa ${x.label}`}
              disabled={pending}
              onClick={() => run(() => actions.removeDate({ contactId: d.id, id: x.id }))}
            >
              <Trash2 size={14} />
            </button>
          </p>
        ))}
        {adding ? (
          <form
            className="mt-2 grid gap-1.5"
            aria-label="Thêm ngày quan trọng"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => actions.addDate({ contactId: d.id, label, date, yearly }),
                () => {
                  setAdding(false);
                  setLabel("");
                  setDate("");
                },
              );
            }}
          >
            <input
              aria-label="Tên ngày"
              placeholder="Ví dụ: Sinh nhật bố, Mừng thọ mẹ"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={INPUT}
              required
              maxLength={80}
            />
            <input
              aria-label="Ngày"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT}
              required
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
              <span>Lặp lại hằng năm</span>
            </label>
            <button type="submit" className="c-btn is-blue justify-self-start" disabled={pending}>
              Lưu ngày
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
