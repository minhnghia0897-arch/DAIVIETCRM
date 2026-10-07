"use client";

import {
  Bot,
  CalendarHeart,
  Gift,
  MapPin,
  Package,
  Phone,
  Pin,
  PinOff,
  Plus,
  ShoppingCart,
  Sparkles,
  Tag,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { Conversation } from "@/lib/demo/crm-data";
import { PROVINCES_ALL } from "@/lib/demo/sales-catalog";
import { extractFindings, type Finding, type ProductHint } from "@/lib/inbox/extract";
import { useToast } from "@/components/ui/toast";
import { visibleOpps } from "../access";
import { useShell } from "../shell-context";
import { useCrm, type OrderDraft } from "../store";
import { ConvAvatar } from "./conv-avatar";
import { OrderForm } from "./order-form";

// Lên đơn và ghi chú ngay trong hội thoại, kiểu Pancake: đọc tin của khách để điền sẵn địa chỉ, người nhận, sản
// phẩm; nhân viên kiểm lại rồi bấm Tạo đơn. Tiền vẫn tính bằng hàm định giá dùng chung, giảm vượt mức vẫn chờ duyệt
// (CLAUDE.md 8.1, 8.5): không có đơn nào tự sinh mà không qua tay người.

/** Cách khách hay gọi sản phẩm trong tin nhắn (viết thường, không dấu) → dòng hàng của bản demo. */
const PRODUCT_HINTS: ProductHint[] = [
  { key: "v:v-x9-br", label: "Ghế massage DV-X9", words: ["x9", "dv-x9", "dvx9"] },
  { key: "v:v-s7-be", label: "Ghế massage DV-S7", words: ["s7", "dv-s7"] },
  { key: "v:v-m5", label: "Ghế massage DV-M5", words: ["m5", "dv-m5"] },
  { key: "v:v-ion", label: "Máy lọc nước ion kiềm", words: ["may loc nuoc ion", "ion kiem", "loc ion"] },
  { key: "v:v-ro", label: "Máy lọc nước RO", words: ["ro", "loc ro"] },
  { key: "v:v-core", label: "Bộ lõi lọc thay thế", words: ["loi loc", "thay loi"] },
  { key: "v:v-pillow", label: "Gối massage cổ", words: ["goi massage", "goi co"] },
  { key: "v:v-foot", label: "Máy massage chân", words: ["massage chan", "f2"] },
];

const CHANNEL_OF: Record<Conversation["channel"], string> = {
  Zalo: "Zalo OA",
  Facebook: "Facebook",
  "TikTok Live": "TikTok Shop",
  Hotline: "Hotline",
};

type Tab = "assist" | "order" | "notes";

/** Nơi ở trên hội thoại là thành phố Hàn thì người đặt đang sống ở Hàn. */
const KR_CITY = /seoul|daegu|busan|incheon|gimhae|suwon|ulsan|daejeon|gwangju|changwon|ansan|cheonan/i;

export function ConvSidePanel({
  conv: c,
  canSend,
  onPickReply,
  children,
}: {
  conv: Conversation;
  canSend: boolean;
  onPickReply: (text: string) => void;
  /** Phần trợ lý sẵn có (ý định, tóm tắt, hồ sơ). */
  children: React.ReactNode;
}) {
  const { state, act, who } = useCrm();
  const { can, me } = useShell();
  const toast = useToast();
  const canOrder = can("order.create");
  const [tab, setTab] = useState<Tab>("assist");
  const [formKey, setFormKey] = useState(0);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const notesCount = (state.convNotes[c.id] ?? []).length;

  const findings = useMemo(
    () =>
      extractFindings(
        c.messages.filter(([from]) => from === "cu").map(([, body, time]) => [body, time]),
        PROVINCES_ALL,
        PRODUCT_HINTS,
      ),
    [c.messages],
  );

  // Lead gắn với hội thoại (nếu người này được xem): người đặt, người nhận lấy từ hồ sơ lead.
  const opp = c.moveOpportunity
    ? visibleOpps(state, who).find((o) => o.id === c.moveOpportunity && o.stage < 5)
    : undefined;
  const info = opp ? state.leadInfo[opp.id] : undefined;

  const initial = useMemo(() => {
    const addr = findings.find((f) => f.kind === "address")?.value;
    const relation = findings.find((f) => f.kind === "recipient")?.value.relation;
    const phone = findings.find((f) => f.kind === "phone")?.value.phone;
    const products = findings.filter((f) => f.kind === "product").map((f) => f.value.productKey!);
    const d: Partial<OrderDraft> = {
      oppId: opp?.id,
      buyerName: opp?.name ?? c.name,
      buyerPhone: opp ? "" : (phone ?? ""),
      buyerMarket: (info?.market ?? (KR_CITY.test(c.location) ? "KR" : "VN")) === "KR" ? "KR" : "VN",
      channel: CHANNEL_OF[c.channel],
      buyFor: relation || info?.buyFor === "other" ? "other" : "self",
      recipientName: info?.recipientName ?? "",
      recipientRelation: relation ?? info?.recipientRelation ?? "",
      keepSurprise: Boolean(info?.keepSurprise),
      province: addr?.province ?? info?.recipientProvince ?? "",
      district: addr?.district ?? "",
      ward: addr?.ward ?? "",
      street: addr?.street ?? "",
    };
    if (products.length) {
      d.lines = products.map((k) =>
        k.startsWith("c:") ? { comboId: k.slice(2), qty: 1 } : { variantId: k.slice(2), qty: 1 },
      );
    }
    return d;
  }, [findings, opp, info, c]);

  return (
    <aside className="tg-info cv-info" aria-label="Trợ lý hội thoại">
      <div className="cv-info-top">
        <ConvAvatar c={c} size={56} />
        <b className="text-[16px]">{c.name}</b>
        <span className="tg-sub">
          {c.channel} · {c.location}
        </span>
      </div>
      <div className="cv-tabs" role="tablist" aria-label="Khung bên phải">
        {(
          [
            ["assist", "Trợ lý", Sparkles],
            ...(canOrder ? [["order", "Lên đơn", ShoppingCart]] : []),
            ["notes", "Ghi chú", StickyNote],
          ] as [Tab, string, LucideIcon][]
        ).map(([k, l, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            <Icon size={15} aria-hidden />
            {l}
            {k === "notes" && notesCount ? <span className="cv-count">{notesCount}</span> : null}
          </button>
        ))}
      </div>

      <div className="tg-info-b">
        {tab === "assist" ? (
          <div className="space-y-2.5">
            <TagsCard conv={c} />
            <Findings findings={findings} />
            {canOrder ? (
              <button type="button" className="cv-cta" onClick={() => setTab("order")}>
                <ShoppingCart size={17} aria-hidden />
                Lên đơn cho {c.name}
              </button>
            ) : null}
            {children}
            {c.suggestions.length && canSend && c.status !== "done" ? (
              <div className="cv-card">
                <h3>
                  <Bot size={15} aria-hidden /> AI gợi ý trả lời
                </h3>
                <div className="space-y-1.5">
                  {c.suggestions.map((s) => (
                    <button key={s} type="button" className="cv-sugg" onClick={() => onPickReply(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <p className="c-lbl mb-0 mt-1.5">Bấm để đưa vào ô soạn, sửa rồi gửi.</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "order" && canOrder ? (
          <div className="cv-order" aria-label="Lên đơn từ hội thoại" role="region">
            {created ? (
              <p role="status" className="cv-done">
                Đã lên đơn {created.code}.{" "}
                <Link href={`/orders/${created.id}`} className="font-semibold underline">
                  Mở đơn
                </Link>
              </p>
            ) : null}
            <p className="cv-hint">
              <Sparkles size={14} aria-hidden />
              {findings.length
                ? "Đã điền sẵn từ tin của khách và hồ sơ lead. Kiểm lại trước khi tạo."
                : "Chưa thấy địa chỉ, sản phẩm trong tin của khách: điền tay."}
            </p>
            <OrderForm
              key={`${c.id}:${formKey}`}
              compact
              initial={initial}
              onCreated={(o) => {
                act({ type: "convOrderCreated", convId: c.id, code: o.code, total: o.total, actor: me });
                setCreated(o);
                setFormKey((k) => k + 1);
                // OrderForm gọi onDone trước (đóng form); ở lại tab Lên đơn để thấy đơn vừa tạo.
                setTab("order");
              }}
              onDone={() => setTab("assist")}
            />
          </div>
        ) : null}

        {tab === "notes" ? <Notes convId={c.id} summary={c.summary} onSaved={(m) => toast(m, "ok")} /> : null}
      </div>
    </aside>
  );
}

const KIND_LABEL: Record<Finding["kind"], string> = {
  phone: "Số điện thoại",
  address: "Địa chỉ",
  recipient: "Người nhận",
  product: "Sản phẩm",
  occasion: "Dịp",
};

/** Thẻ của khách: bấm để gắn hoặc gỡ, gõ để tạo thẻ mới (như Pancake). */
function TagsCard({ conv: c }: { conv: Conversation }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [adding, setAdding] = useState("");
  const all = [
    ...state.convTags,
    ...c.tags
      .filter((t) => !state.convTags.some((x) => x.label === t))
      .map((label) => ({ label, color: "#8e99a4" })),
  ];
  return (
    <div className="cv-card">
      <h3>
        <Tag size={15} aria-hidden /> Thẻ khách
      </h3>
      <div className="cv-tagpick" role="group" aria-label="Thẻ khách">
        {all.map((t) => {
          const on = c.tags.includes(t.label);
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={on}
              className={`cv-tag ${on ? "is-on" : "is-off"}`}
              style={{ "--t": t.color } as React.CSSProperties}
              onClick={() => act({ type: "toggleConvTag", convId: c.id, tag: t.label, actor: me })}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <form
        className="cv-tagnew"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding.trim()) return;
          act(
            { type: "createConvTag", convId: c.id, label: adding, actor: me },
            `Đã gắn thẻ ${adding.trim()}`,
          );
          setAdding("");
        }}
      >
        <input
          aria-label="Tạo thẻ mới"
          placeholder="Tạo thẻ mới…"
          maxLength={30}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        />
        <button type="submit" className="tg-ib" aria-label="Thêm thẻ" disabled={!adding.trim()}>
          <Plus size={16} />
        </button>
      </form>
    </div>
  );
}

const KIND_ICON: Record<Finding["kind"], LucideIcon> = {
  phone: Phone,
  address: MapPin,
  recipient: Gift,
  product: Package,
  occasion: CalendarHeart,
};

/** Thông tin tìm thấy trong tin của khách, để nhân viên nhìn là biết, không phải đọc lại cả hội thoại. */
function Findings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <div className="cv-card">
      <h3>
        <Sparkles size={15} aria-hidden /> Khách đã cho biết
      </h3>
      <ul className="cv-facts" aria-label="Khách đã cho biết">
        {findings.map((f, i) => {
          const Icon = KIND_ICON[f.kind];
          return (
            <li key={i}>
              <span className="cv-fact-ic">
                <Icon size={15} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <small>{KIND_LABEL[f.kind]}</small>
                {f.label}
              </span>
              <span className="tg-time">{f.at}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Notes({
  convId,
  summary,
  onSaved,
}: {
  convId: string;
  summary: string;
  onSaved: (m: string) => void;
}) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [text, setText] = useState("");
  const notes = state.convNotes[convId] ?? [];
  const save = (t: string, pinned: boolean) => {
    act({ type: "addConvNote", convId, text: t, pinned, actor: me });
    onSaved(pinned ? "Đã ghim ghi chú lên đầu hội thoại" : "Đã lưu ghi chú");
  };
  return (
    <div className="space-y-2.5">
      <form
        className="cv-card"
        aria-label="Thêm ghi chú"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          save(text, true);
          setText("");
        }}
      >
        <textarea
          aria-label="Ghi chú về khách"
          placeholder="Khách thích màu nâu, chỉ gọi sau 21h giờ Hàn…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="block h-20 w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text"
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button type="submit" className="c-btn is-go" disabled={!text.trim()}>
            Ghim ghi chú
          </button>
          <button type="button" className="c-btn" onClick={() => save(summary, false)}>
            Lưu tóm tắt hội thoại
          </button>
        </div>
      </form>
      {notes.length ? (
        <ul className="m-0 list-none space-y-2 p-0" aria-label="Ghi chú đã lưu">
          {notes.map((n) => (
            <li key={n.id} className={`cv-note ${n.pinned ? "is-pinned" : ""}`}>
              <p className="m-0 whitespace-pre-wrap">{n.text}</p>
              <div className="c-lbl mt-1 flex items-center gap-2">
                <span className="flex-1">
                  {n.actor} · {n.time}
                </span>
                <button
                  type="button"
                  className="c-ib"
                  aria-label={n.pinned ? "Bỏ ghim" : "Ghim lên đầu hội thoại"}
                  onClick={() => act({ type: "toggleConvNotePin", convId, noteId: n.id })}
                >
                  {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-lbl m-0">
          Chưa có ghi chú. Ghi chú được ghim hiện ở đầu khung chat cho mọi người trả lời khách này; hội thoại
          gắn lead thì ghi chú cũng lưu vào dòng hoạt động của lead.
        </p>
      )}
    </div>
  );
}
