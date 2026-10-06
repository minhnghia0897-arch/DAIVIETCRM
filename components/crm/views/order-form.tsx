"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PROVINCES_ALL, demoCatalog } from "@/lib/demo/sales-catalog";
import { priceQuote } from "@/lib/sales/pricing";
import { visibleOpps } from "../access";
import { useShell } from "../shell-context";
import {
  ORDER_LINES_EDITABLE,
  nextOrderRef,
  orderPeople,
  simDate,
  useCrm,
  type OrderDraft,
  type OrderRec,
} from "../store";
import { LineEditor, QuoteSummary, toLines, type Row } from "./quote-builder";

// Tạo đơn tay và sửa đơn (CLAUDE.md 8.7): người đặt, người nhận, địa chỉ giao đủ tỉnh, huyện, xã, chi tiết;
// các dòng hàng tính bằng hàm định giá dùng chung; giảm vượt giới hạn vai trò thì đơn vào hàng chờ duyệt.

const CHANNELS = ["Khách đến showroom", "Facebook", "Zalo OA", "TikTok Shop", "Hotline", "Giới thiệu"];
const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

function rowsFrom(lines: OrderDraft["lines"]): Row[] {
  return lines.map((l, i) => ({
    key: i + 1,
    ref: l.comboId ? `c:${l.comboId}` : `v:${l.variantId}`,
    qty: l.qty,
    discount: l.manualDiscount?.kind === "percent" ? l.manualDiscount.value : 0,
  }));
}

/** Dữ liệu ban đầu của form: đơn đã có thì lấy lại đúng như lúc nhập; đơn cũ chưa có form thì suy từ đơn. */
function draftOf(o?: OrderRec): OrderDraft {
  if (o?.form) return o.form;
  if (o) {
    const p = orderPeople(o);
    return {
      oppId: o.oppId,
      buyerName: p.buyer,
      buyerPhone: "",
      buyerMarket: p.buyerMarket,
      buyFor: p.self ? "self" : "other",
      recipientName: p.recipient,
      recipientRelation: "",
      keepSurprise: o.keepSurprise,
      province: "",
      district: "",
      ward: "",
      street: o.address,
      channel: o.channel,
      giftMessage: o.giftMessage,
      lines: o.lines.filter((l) => !l.isGift).map((l) => ({ variantId: l.variantId, qty: l.qty })),
    };
  }
  return {
    buyerName: "",
    buyerPhone: "",
    buyerMarket: "VN",
    buyFor: "self",
    recipientName: "",
    recipientRelation: "",
    keepSurprise: false,
    province: "TP.HCM",
    district: "",
    ward: "",
    street: "",
    channel: CHANNELS[0],
    giftMessage: "",
    lines: [{ variantId: "v-x9-br", qty: 1 }],
  };
}

export function OrderForm({ order, onDone }: { order?: OrderRec; onDone: () => void }) {
  const { state, act, who } = useCrm();
  const { me, userId, roleKey } = useShell();
  const router = useRouter();
  const [d, setD] = useState<OrderDraft>(() => draftOf(order));
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(draftOf(order).lines));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<OrderDraft>) => setD((x) => ({ ...x, ...patch }));
  const linesLocked = order ? !ORDER_LINES_EDITABLE.includes(order.status) : false;
  const leads = visibleOpps(state, who).filter((o) => o.stage < 5);

  const result = useMemo(
    () =>
      priceQuote(
        {
          lines: toLines(rows),
          context: {
            showroomId: "q4",
            channel: d.channel === "Khách đến showroom" ? "showroom" : "online",
            buyerCountry: d.buyerMarket,
            customerTags: d.oppId ? (state.leadInfo[d.oppId]?.tags ?? []) : [],
            recipientProvince: d.province || undefined,
            date: simDate(state.minutes),
            sellerId: me,
            sellerRole: roleKey,
          },
        },
        demoCatalog(state.settings.policies),
      ),
    [
      rows,
      d.channel,
      d.buyerMarket,
      d.oppId,
      d.province,
      state.leadInfo,
      state.minutes,
      state.settings.policies,
      me,
      roleKey,
    ],
  );

  const errors = [
    !d.buyerName.trim() && "Chưa nhập tên người đặt",
    !order && !d.oppId && !d.buyerPhone.trim() && "Khách mới cần số điện thoại người đặt",
    d.buyFor === "other" && !d.recipientName.trim() && "Chưa nhập tên người nhận",
    !d.province && "Chưa chọn tỉnh giao",
    !d.street.trim() && "Chưa nhập số nhà, đường",
    !linesLocked && result.lines.length === 0 && "Chưa có dòng hàng",
  ].filter((x): x is string => Boolean(x));

  function pickLead(oppId: string) {
    const o = state.opps.find((x) => x.id === oppId);
    const info = state.leadInfo[oppId];
    if (!o) return set({ oppId: undefined });
    set({
      oppId,
      buyerName: o.name,
      buyerMarket: info?.market === "KR" ? "KR" : "VN",
      buyFor: info?.buyFor === "other" ? "other" : "self",
      recipientName: info?.recipientName ?? "",
      recipientRelation: info?.recipientRelation ?? "",
      keepSurprise: Boolean(info?.keepSurprise),
      province: info?.recipientProvince || d.province,
    });
  }

  function submit() {
    setTried(true);
    if (errors.length) return;
    const draft: OrderDraft = { ...d, lines: linesLocked ? d.lines : toLines(rows) };
    const needs = result.approvalsNeeded.length > 0;
    if (order) {
      act(
        { type: "editOrder", orderId: order.id, draft, result, actor: me },
        needs && !linesLocked
          ? `Đã sửa đơn ${order.code}, mức giảm chờ Owner duyệt`
          : `Đã lưu đơn ${order.code}`,
      );
      onDone();
      return;
    }
    const next = nextOrderRef(state);
    act(
      { type: "createOrderManual", draft, result, actorId: userId, actor: me },
      needs ? `Đã tạo đơn ${next.code}, mức giảm chờ Owner duyệt` : `Đã tạo đơn ${next.code}`,
    );
    onDone();
    router.push(`/orders/${next.id}`);
  }

  return (
    <form
      className="c-card c-cb space-y-5"
      style={{ paddingTop: 14 }}
      aria-label={order ? `Sửa đơn ${order.code}` : "Tạo đơn"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="m-0 text-[16px] font-extrabold">{order ? `Sửa đơn ${order.code}` : "Tạo đơn mới"}</h2>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="mb-1 font-bold">Người đặt</legend>
        {!order ? (
          <label className="c-lbl sm:col-span-2">
            Từ lead đang mở
            <select
              className={FIELD}
              value={d.oppId ?? ""}
              onChange={(e) => pickLead(e.target.value)}
              aria-label="Từ lead đang mở"
            >
              <option value="">Khách mới, không qua lead (khách đến showroom…)</option>
              {leads.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.product}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="c-lbl">
          Họ tên người đặt
          <input className={FIELD} value={d.buyerName} onChange={(e) => set({ buyerName: e.target.value })} />
        </label>
        {!d.oppId ? (
          <label className="c-lbl">
            Số điện thoại người đặt
            <input
              className={FIELD}
              inputMode="tel"
              value={d.buyerPhone}
              onChange={(e) => set({ buyerPhone: e.target.value })}
            />
          </label>
        ) : null}
        <label className="c-lbl">
          Người đặt đang sống ở
          <select
            className={FIELD}
            value={d.buyerMarket}
            onChange={(e) => set({ buyerMarket: e.target.value as OrderDraft["buyerMarket"] })}
          >
            <option value="VN">Việt Nam</option>
            <option value="KR">Hàn Quốc</option>
          </select>
        </label>
        <label className="c-lbl">
          Kênh bán
          <select className={FIELD} value={d.channel} onChange={(e) => set({ channel: e.target.value })}>
            {[...new Set([...CHANNELS, d.channel])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="mb-1 font-bold">Người nhận</legend>
        <div className="flex flex-wrap gap-4 sm:col-span-2" role="radiogroup" aria-label="Mua cho ai">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={d.buyFor === "self"} onChange={() => set({ buyFor: "self" })} />
            Mua cho chính mình
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={d.buyFor === "other"} onChange={() => set({ buyFor: "other" })} />
            Tặng người khác
          </label>
        </div>
        {d.buyFor === "other" ? (
          <>
            <label className="c-lbl">
              Họ tên người nhận
              <input
                className={FIELD}
                value={d.recipientName}
                onChange={(e) => set({ recipientName: e.target.value })}
              />
            </label>
            <label className="c-lbl">
              Quan hệ với người đặt
              <input
                className={FIELD}
                placeholder="Bố, mẹ, vợ…"
                value={d.recipientRelation}
                onChange={(e) => set({ recipientRelation: e.target.value })}
              />
            </label>
            <label className="c-lbl sm:col-span-2">
              Lời nhắn quà
              <input
                className={FIELD}
                value={d.giftMessage}
                onChange={(e) => set({ giftMessage: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={d.keepSurprise}
                onChange={(e) => set({ keepSurprise: e.target.checked })}
              />
              Giữ bất ngờ: không liên hệ người nhận khi người đặt chưa cho phép
            </label>
          </>
        ) : null}
      </fieldset>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-4">
        <legend className="mb-1 font-bold">Địa chỉ giao</legend>
        <label className="c-lbl">
          Tỉnh, thành
          <select
            aria-label="Tỉnh giao"
            className={FIELD}
            value={d.province}
            onChange={(e) => set({ province: e.target.value })}
          >
            <option value="">Chọn tỉnh…</option>
            {PROVINCES_ALL.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Quận, huyện
          <input className={FIELD} value={d.district} onChange={(e) => set({ district: e.target.value })} />
        </label>
        <label className="c-lbl">
          Phường, xã
          <input className={FIELD} value={d.ward} onChange={(e) => set({ ward: e.target.value })} />
        </label>
        <label className="c-lbl">
          Số nhà, đường
          <input className={FIELD} value={d.street} onChange={(e) => set({ street: e.target.value })} />
        </label>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 font-bold">Hàng</legend>
        {linesLocked ? (
          <p className="c-lbl m-0">
            Đơn đã cọc, đang giữ hàng: không đổi dòng hàng được nữa. Cần đổi hàng thì hủy đơn và tạo đơn mới.
          </p>
        ) : (
          <>
            <LineEditor rows={rows} setRows={setRows} />
            <QuoteSummary result={result} />
          </>
        )}
      </fieldset>

      {tried && errors.length ? (
        <ul className="m-0 list-none space-y-1 p-0" aria-label="Còn thiếu">
          {errors.map((e) => (
            <li key={e} className="text-err">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" className="c-btn is-brand">
          {order ? "Lưu đơn" : result.approvalsNeeded.length ? "Tạo đơn, gửi duyệt giảm giá" : "Tạo đơn"}
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
      <p className="c-lbl m-0">
        Tiền tính bằng hàm định giá dùng chung theo chính sách đang chạy; đơn mới ở bước Nháp, bấm Xác nhận
        đơn khi đủ người nhận và địa chỉ.
      </p>
    </form>
  );
}
