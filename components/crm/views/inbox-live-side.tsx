"use client";

import {
  CalendarHeart,
  Check,
  Gift,
  MapPin,
  Package,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Plus,
  ShoppingCart,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import type { Finding } from "@/lib/inbox/extract";

import { OrderTab, type OrderSide } from "./inbox-order";

export type { OrderSide };

import { setRecipient, updateLeadInfo } from "@/app/(app)/leads/[id]/actions";
import {
  addContactNote,
  deleteContactAddress,
  deleteContactNote,
  pinContactNote,
  renameContact,
  saveContactAddress,
  saveContactPhone,
} from "@/app/(app)/inbox/side-actions";

// Cột phải màn Hội thoại bản thật (kiểu Pancake, open question 32): hồ sơ khách, "Khách đã cho biết" đọc từ tin của
// khách, bốn thông tin bắt buộc của lead, địa chỉ giao, ghi chú ghim. Không tự ghi gì: nhân viên bấm Lưu mới vào hồ
// sơ (CLAUDE.md 10.7). Tab Lên đơn tạo đơn thật (components/crm/views/inbox-order.tsx).

export interface LiveSide {
  order: OrderSide;
  contact: { id: string; name: string; country: string; phones: string[] };
  canEdit: boolean;
  lead: {
    id: string;
    stageLabel: string;
    recipient: { self: boolean; name: string | null; relation: string | null } | null;
    recipientProvince: string | null;
    occasionId: string | null;
    occasionDate: string | null;
    budgetRangeId: string | null;
    keepSurprise: boolean;
  } | null;
  occasions: { id: string; label: string }[];
  budgets: { id: string; label: string }[];
  provinces: string[];
  addresses: {
    id: string;
    receiver: string | null;
    street: string | null;
    ward: string | null;
    district: string | null;
    province: string;
    isDefault: boolean;
  }[];
  notes: { id: string; text: string; pinned: boolean; by: string; at: string }[];
  findings: Finding[];
}

type Tab = "info" | "order" | "notes";
type Act = () => Promise<{ ok: boolean; message: string }>;

/** Thẻ khách: danh mục thẻ, thẻ đang gắn, lệnh gắn gỡ và tạo thẻ (null khi không sửa được). */
export interface Tagging {
  all: { id: string; label: string; color: string }[];
  on: string[];
  toggle: (input: { contactId: string; tagId: string }) => Promise<{ ok: boolean; message: string }>;
  create: (input: { contactId: string; label: string }) => Promise<{ ok: boolean; message: string }>;
}

const KIND_ICON: Record<Finding["kind"], LucideIcon> = {
  phone: Phone,
  address: MapPin,
  recipient: Gift,
  product: Package,
  occasion: CalendarHeart,
};
const KIND_LABEL: Record<Finding["kind"], string> = {
  phone: "Số điện thoại",
  address: "Địa chỉ",
  recipient: "Người nhận",
  product: "Sản phẩm",
  occasion: "Dịp",
};

const FIELD = "block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

export function InboxLiveSide({
  side,
  channel,
  tagging = null,
}: {
  side: LiveSide;
  channel: string;
  tagging?: Tagging | null;
}) {
  const [tab, setTab] = useState<Tab>("info");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (act: Act, after?: () => void) =>
    start(async () => {
      const r = await act();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <aside className="tg-info cv-info" aria-label="Thông tin khách">
      <ContactHead side={side} channel={channel} run={run} pending={pending} />
      <div className="cv-tabs" role="tablist" aria-label="Khung bên phải">
        {(
          [
            ["info", "Khách", UserRound],
            ["order", "Lên đơn", ShoppingCart],
            ["notes", "Ghi chú", StickyNote],
          ] as [Tab, string, LucideIcon][]
        ).map(([k, l, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            <Icon size={15} aria-hidden />
            {l}
            {k === "notes" && side.notes.length ? (
              <span className="cv-count">{side.notes.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="tg-info-b">
        {tab === "info" ? (
          <div className="space-y-2.5">
            {tagging ? <TagsCard side={side} tagging={tagging} run={run} pending={pending} /> : null}
            <Findings side={side} run={run} pending={pending} />
            {side.lead ? <LeadInfo side={side} run={run} pending={pending} /> : null}
            <Addresses side={side} run={run} pending={pending} />
          </div>
        ) : tab === "order" ? (
          <OrderTab order={side.order} />
        ) : (
          <Notes side={side} run={run} pending={pending} />
        )}
      </div>
    </aside>
  );
}

/** Bấm thẻ để gắn hoặc gỡ, gõ tên để tạo thẻ mới (như Pancake). Thẻ đi theo khách qua mọi kênh. */
function TagsCard({ side, tagging, run, pending }: PartProps & { tagging: Tagging }) {
  const [adding, setAdding] = useState("");
  const canTag = side.canEdit;
  const shown = canTag ? tagging.all : tagging.all.filter((t) => tagging.on.includes(t.id));
  if (!canTag && !shown.length) return null;
  return (
    <div className="cv-card">
      <h3>
        <Tag size={15} aria-hidden /> Thẻ khách
      </h3>
      <div className="cv-tagpick" role="group" aria-label="Thẻ khách">
        {shown.map((t) => {
          const on = tagging.on.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              disabled={!canTag || pending}
              className={`cv-tag ${on ? "is-on" : "is-off"}`}
              style={{ "--t": t.color } as React.CSSProperties}
              onClick={() => run(() => tagging.toggle({ contactId: side.contact.id, tagId: t.id }))}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {canTag ? (
        <form
          className="cv-tagnew"
          onSubmit={(e) => {
            e.preventDefault();
            const label = adding.trim();
            if (!label) return;
            run(
              () => tagging.create({ contactId: side.contact.id, label }),
              () => setAdding(""),
            );
          }}
        >
          <input
            aria-label="Tạo thẻ mới"
            placeholder="Tạo thẻ mới…"
            maxLength={30}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <button type="submit" className="tg-ib" aria-label="Thêm thẻ" disabled={!adding.trim() || pending}>
            <Plus size={16} />
          </button>
        </form>
      ) : null}
    </div>
  );
}

interface PartProps {
  side: LiveSide;
  run: (act: Act, after?: () => void) => void;
  pending: boolean;
}

function ContactHead({ side, channel, run, pending }: PartProps & { channel: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(side.contact.name);
  return (
    <div className="cv-info-top">
      {editing ? (
        <form
          className="flex w-full items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => renameContact({ contactId: side.contact.id, name }),
              () => setEditing(false),
            );
          }}
        >
          <input
            aria-label="Tên khách"
            value={name}
            maxLength={120}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
          <button
            type="submit"
            className="c-btn is-go"
            disabled={pending || !name.trim()}
            aria-label="Lưu tên"
          >
            <Check size={15} />
          </button>
        </form>
      ) : (
        <b className="flex items-center gap-1.5 text-[16px]">
          {side.contact.name}
          {side.canEdit ? (
            <button
              type="button"
              className="c-ib"
              aria-label="Sửa tên khách"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
            </button>
          ) : null}
        </b>
      )}
      <span className="tg-sub">
        {channel}
        {side.contact.phones.length ? ` · ${side.contact.phones.join(", ")}` : ""}
      </span>
      {side.lead ? (
        <Link href={`/leads/${side.lead.id}`} className="tg-sub underline">
          Lead: {side.lead.stageLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Thông tin tìm thấy trong tin của khách; bấm Lưu mới ghi vào hồ sơ. */
function Findings({ side, run, pending }: PartProps) {
  if (!side.findings.length) return null;
  const save = (f: Finding): Act | null => {
    if (!side.canEdit) return null;
    if (f.kind === "phone" && f.value.phone)
      return () =>
        saveContactPhone({ contactId: side.contact.id, raw: f.value.phone!, country: side.contact.country });
    if (f.kind === "address" && f.value.province)
      return () =>
        saveContactAddress({
          contactId: side.contact.id,
          street: f.value.street,
          ward: f.value.ward,
          district: f.value.district,
          province: f.value.province!,
        });
    if (f.kind === "recipient" && side.lead && f.value.relation)
      return () =>
        setRecipient({
          leadId: side.lead!.id,
          self: false,
          name: f.value.relation,
          relation: f.value.relation,
        });
    if (f.kind === "occasion" && side.lead) {
      const o = side.occasions.find((x) => x.label.toLowerCase() === f.value.occasion?.toLowerCase());
      if (o) return () => updateLeadInfo({ leadId: side.lead!.id, occasionId: o.id });
    }
    return null;
  };
  return (
    <div className="cv-card">
      <h3>
        <Sparkles size={15} aria-hidden /> Khách đã cho biết
      </h3>
      <ul className="cv-facts" aria-label="Khách đã cho biết">
        {side.findings.map((f, i) => {
          const Icon = KIND_ICON[f.kind];
          const act = save(f);
          return (
            <li key={i}>
              <span className="cv-fact-ic">
                <Icon size={15} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <small>{KIND_LABEL[f.kind]}</small>
                {f.label}
              </span>
              {act ? (
                <button
                  type="button"
                  className="c-btn"
                  disabled={pending}
                  aria-label={`Lưu ${KIND_LABEL[f.kind].toLowerCase()} vào hồ sơ`}
                  onClick={() => run(act)}
                >
                  Lưu
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="c-lbl mb-0 mt-1.5">Đọc từ tin của khách. Kiểm lại rồi bấm Lưu để ghi vào hồ sơ.</p>
    </div>
  );
}

/** Bốn thông tin telesale phải hỏi ở cuộc gọi đầu (CLAUDE.md mục 6), sửa ngay cạnh khung chat. */
function LeadInfo({ side, run, pending }: PartProps) {
  const lead = side.lead!;
  const [self, setSelf] = useState(lead.recipient?.self ?? true);
  const [rName, setRName] = useState(lead.recipient?.self ? "" : (lead.recipient?.name ?? ""));
  const [rRel, setRRel] = useState(lead.recipient?.relation ?? "");
  const [province, setProvince] = useState(lead.recipientProvince ?? "");
  const [occasionId, setOccasionId] = useState(lead.occasionId ?? "");
  const [occasionDate, setOccasionDate] = useState(lead.occasionDate ?? "");
  const [budgetId, setBudgetId] = useState(lead.budgetRangeId ?? "");
  const [surprise, setSurprise] = useState(lead.keepSurprise);
  const missing = [
    !lead.recipient && "mua cho ai",
    !lead.recipientProvince && "tỉnh người nhận",
    !lead.occasionId && "dịp",
    !lead.budgetRangeId && "ngân sách",
  ].filter(Boolean);
  const ro = !side.canEdit;

  return (
    <form
      className="cv-card space-y-2"
      aria-label="Bốn thông tin bắt buộc"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r1 = await setRecipient({
            leadId: lead.id,
            self,
            name: self ? undefined : rName,
            relation: self ? undefined : rRel || undefined,
          });
          if (!r1.ok) return r1;
          return updateLeadInfo({
            leadId: lead.id,
            recipientProvince: province || null,
            occasionId: occasionId || null,
            occasionDate: occasionDate || null,
            budgetRangeId: budgetId || null,
            keepSurprise: surprise,
          });
        });
      }}
    >
      <h3>
        <Gift size={15} aria-hidden /> Bốn thông tin bắt buộc
      </h3>
      {missing.length ? (
        <p className="c-lbl m-0 text-warn">Còn thiếu: {missing.join(", ")}.</p>
      ) : (
        <p className="c-lbl m-0">Đã đủ bốn thông tin.</p>
      )}
      <fieldset className="space-y-1" disabled={ro}>
        <legend className="c-lbl">Mua cho ai</legend>
        <label className="mr-3 inline-flex items-center gap-1.5">
          <input type="radio" name="self" checked={self} onChange={() => setSelf(true)} /> Chính mình
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" name="self" checked={!self} onChange={() => setSelf(false)} /> Tặng người khác
        </label>
        {!self ? (
          <div className="grid grid-cols-2 gap-1.5">
            <input
              aria-label="Tên người nhận"
              placeholder="Tên người nhận"
              value={rName}
              maxLength={120}
              onChange={(e) => setRName(e.target.value)}
              className={FIELD}
            />
            <input
              aria-label="Quan hệ"
              placeholder="Bố, mẹ, vợ…"
              value={rRel}
              maxLength={40}
              onChange={(e) => setRRel(e.target.value)}
              className={FIELD}
            />
          </div>
        ) : null}
      </fieldset>
      <label className="c-lbl block">
        Tỉnh người nhận
        <input
          aria-label="Tỉnh người nhận"
          list="inbox-provinces"
          value={province}
          maxLength={80}
          disabled={ro}
          onChange={(e) => setProvince(e.target.value)}
          className={FIELD}
        />
        <datalist id="inbox-provinces">
          {side.provinces.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="c-lbl block">
          Dịp
          <select
            aria-label="Dịp"
            value={occasionId}
            disabled={ro}
            onChange={(e) => setOccasionId(e.target.value)}
            className={FIELD}
          >
            <option value="">Chưa rõ</option>
            {side.occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="c-lbl block">
          Ngày dịp
          <input
            aria-label="Ngày dịp"
            type="date"
            value={occasionDate}
            disabled={ro}
            onChange={(e) => setOccasionDate(e.target.value)}
            className={FIELD}
          />
        </label>
      </div>
      <label className="c-lbl block">
        Ngân sách
        <select
          aria-label="Ngân sách"
          value={budgetId}
          disabled={ro}
          onChange={(e) => setBudgetId(e.target.value)}
          className={FIELD}
        >
          <option value="">Chưa rõ</option>
          {side.budgets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      {!self ? (
        <label className="flex items-start gap-1.5">
          <input
            type="checkbox"
            className="mt-1"
            checked={surprise}
            disabled={ro}
            onChange={(e) => setSurprise(e.target.checked)}
          />
          <span>Giữ bất ngờ: không liên hệ người nhận khi người đặt chưa cho phép</span>
        </label>
      ) : null}
      {ro ? null : (
        <button type="submit" className="c-btn is-go" disabled={pending || (!self && !rName.trim())}>
          Lưu thông tin
        </button>
      )}
    </form>
  );
}

function Addresses({ side, run, pending }: PartProps) {
  const [open, setOpen] = useState(false);
  const empty = { receiver: "", street: "", ward: "", district: "", province: "" };
  const [a, setA] = useState(empty);
  return (
    <div className="cv-card">
      <h3>
        <MapPin size={15} aria-hidden /> Địa chỉ giao
      </h3>
      {side.addresses.length ? (
        <ul className="m-0 list-none space-y-1.5 p-0" aria-label="Địa chỉ giao đã lưu">
          {side.addresses.map((x) => (
            <li key={x.id} className="flex items-start gap-1.5">
              <span className="min-w-0 flex-1">
                {x.receiver ? <b>{x.receiver}: </b> : null}
                {[x.street, x.ward, x.district, x.province].filter(Boolean).join(", ")}
                {x.isDefault ? <span className="c-lbl"> · mặc định</span> : null}
              </span>
              {side.canEdit ? (
                <button
                  type="button"
                  className="c-ib"
                  aria-label="Xóa địa chỉ"
                  disabled={pending}
                  onClick={() => run(() => deleteContactAddress({ id: x.id }))}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-lbl m-0">Chưa có địa chỉ giao.</p>
      )}
      {side.canEdit ? (
        open ? (
          <form
            className="mt-2 space-y-1.5"
            aria-label="Thêm địa chỉ giao"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => saveContactAddress({ contactId: side.contact.id, ...a }),
                () => {
                  setA(empty);
                  setOpen(false);
                },
              );
            }}
          >
            <input
              aria-label="Người nhận tại địa chỉ"
              placeholder="Người nhận (nếu khác khách)"
              value={a.receiver}
              maxLength={120}
              onChange={(e) => setA({ ...a, receiver: e.target.value })}
              className={FIELD}
            />
            <input
              aria-label="Số nhà, đường"
              placeholder="Số nhà, đường"
              value={a.street}
              maxLength={200}
              onChange={(e) => setA({ ...a, street: e.target.value })}
              className={FIELD}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                aria-label="Xã, phường"
                placeholder="Xã, phường"
                value={a.ward}
                maxLength={80}
                onChange={(e) => setA({ ...a, ward: e.target.value })}
                className={FIELD}
              />
              <input
                aria-label="Quận, huyện"
                placeholder="Quận, huyện"
                value={a.district}
                maxLength={80}
                onChange={(e) => setA({ ...a, district: e.target.value })}
                className={FIELD}
              />
            </div>
            <input
              aria-label="Tỉnh, thành phố"
              placeholder="Tỉnh, thành phố"
              list="inbox-provinces"
              value={a.province}
              maxLength={80}
              onChange={(e) => setA({ ...a, province: e.target.value })}
              className={FIELD}
            />
            <div className="flex gap-1.5">
              <button type="submit" className="c-btn is-go" disabled={pending || !a.province.trim()}>
                Lưu địa chỉ
              </button>
              <button type="button" className="c-btn" onClick={() => setOpen(false)}>
                Đóng
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="c-btn mt-2" onClick={() => setOpen(true)}>
            Thêm địa chỉ
          </button>
        )
      ) : null}
    </div>
  );
}

function Notes({ side, run, pending }: PartProps) {
  const [text, setText] = useState("");
  const save = (pinned: boolean) =>
    run(
      () => addContactNote({ contactId: side.contact.id, text, pinned }),
      () => setText(""),
    );
  return (
    <div className="space-y-2.5">
      <form
        className="cv-card"
        aria-label="Thêm ghi chú"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) save(true);
        }}
      >
        <textarea
          aria-label="Ghi chú về khách"
          placeholder="Khách thích màu nâu, chỉ gọi sau 21h giờ Hàn…"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          className={`${FIELD} h-20`}
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button type="submit" className="c-btn is-go" disabled={pending || !text.trim()}>
            Ghim ghi chú
          </button>
          <button
            type="button"
            className="c-btn"
            disabled={pending || !text.trim()}
            onClick={() => save(false)}
          >
            Lưu không ghim
          </button>
        </div>
      </form>
      {side.notes.length ? (
        <ul className="m-0 list-none space-y-2 p-0" aria-label="Ghi chú đã lưu">
          {side.notes.map((n) => (
            <li key={n.id} className={`cv-note ${n.pinned ? "is-pinned" : ""}`}>
              <p className="m-0 whitespace-pre-wrap">{n.text}</p>
              <div className="c-lbl mt-1 flex items-center gap-2">
                <span className="flex-1">
                  {n.by} · {n.at}
                </span>
                <button
                  type="button"
                  className="c-ib"
                  disabled={pending}
                  aria-label={n.pinned ? "Bỏ ghim" : "Ghim lên đầu hội thoại"}
                  onClick={() => run(() => pinContactNote({ id: n.id, pinned: !n.pinned }))}
                >
                  {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button
                  type="button"
                  className="c-ib"
                  disabled={pending}
                  aria-label="Xóa ghi chú"
                  onClick={() => run(() => deleteContactNote({ id: n.id }))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-lbl m-0">
          Chưa có ghi chú. Ghi chú được ghim hiện ở đầu khung chat cho mọi người trả lời khách này, và lưu vào
          dòng hoạt động của lead đang mở.
        </p>
      )}
    </div>
  );
}
