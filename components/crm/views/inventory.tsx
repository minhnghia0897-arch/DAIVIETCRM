"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { PRODUCTS, VARIANTS, WAREHOUSES } from "@/lib/demo/data";
import { COMBOS } from "@/lib/demo/sales-catalog";
import { available, comboAvailability, levelOf, type DocumentKind } from "@/lib/sales/inventory";
import { PageHead } from "../parts";
import { useShell } from "../shell-context";
import { useCrm, type StockDoc } from "../store";

// Kho (CLAUDE.md 8.3): tồn chỉ đổi qua phiếu kho đã ghi sổ; sổ kho chỉ thêm, không sửa, không xóa.

const label = (variantId: string) => {
  const v = VARIANTS.find((x) => x.id === variantId);
  const p = PRODUCTS.find((x) => x.id === v?.productId);
  if (!v || !p) return variantId;
  return v.name === "Tiêu chuẩn" ? p.name : `${p.name} ${v.name.toLowerCase()}`;
};
const whName = (id?: string) => WAREHOUSES.find((w) => w.id === id)?.name ?? "";

const KIND: Record<DocumentKind, string> = {
  receipt: "Phiếu nhập",
  issue: "Phiếu xuất",
  transfer: "Phiếu chuyển kho",
  count: "Phiếu kiểm kê",
};
const DOC_STATUS: Record<StockDoc["status"], [string, string]> = {
  draft: ["Nháp", "is-n"],
  pending_approval: ["Chờ duyệt chênh lệch", "is-warn"],
  posted: ["Đã ghi sổ", "is-ok"],
  rejected: ["Bị từ chối", "is-err"],
};
const MOVE: Record<string, string> = {
  receipt: "Nhập",
  sale_out: "Xuất bán",
  transfer_out: "Chuyển đi",
  transfer_in: "Chuyển đến",
  return_in: "Khách trả",
  adjust_plus: "Kiểm kê thừa",
  adjust_minus: "Kiểm kê thiếu",
};

type Tab = "stock" | "docs" | "ledger" | "combos";

export function CrmInventory() {
  const { state, act } = useCrm();
  const { can, me } = useShell();
  const [tab, setTab] = useState<Tab>("stock");
  const [wh, setWh] = useState(WAREHOUSES[0].id);
  const [form, setForm] = useState<DocumentKind | null>(null);
  const canDoc = can("inventory.document");

  const rows = VARIANTS.map((v) => {
    const l = levelOf(state.stock, v.id, wh);
    const avail = available(l);
    const status = avail <= 0 ? "out" : avail <= v.lowStock ? "low" : "ok";
    return { v, l, avail, status };
  });

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Package}
          color="var(--warn)"
          kicker="Tồn chỉ đổi qua phiếu kho đã ghi sổ"
          title="Tồn kho"
        >
          {canDoc
            ? (["receipt", "transfer", "count"] as DocumentKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="c-btn"
                  onClick={() => setForm(form === k ? null : k)}
                >
                  {k === "receipt" ? "Lập phiếu nhập" : k === "transfer" ? "Chuyển kho" : "Kiểm kê"}
                </button>
              ))
            : null}
        </PageHead>
        <div className="flex flex-wrap gap-1 px-4 pb-3" role="tablist" aria-label="Mục kho">
          {(
            [
              ["stock", "Tồn kho"],
              ["docs", `Phiếu kho (${state.stockDocs.length})`],
              ["ledger", `Sổ kho (${state.ledger.length})`],
              ["combos", "Combo"],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`c-btn ${tab === k ? "is-brand" : ""}`}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
          {tab === "stock" || tab === "combos" ? (
            <select
              aria-label="Kho"
              value={wh}
              onChange={(e) => setWh(e.target.value)}
              className="ml-auto rounded-control border border-line bg-surface px-2 py-1"
            >
              {WAREHOUSES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      {form ? (
        <DocForm kind={form} defaultWh={wh} onDone={() => setForm(null)} onCreated={() => setTab("docs")} />
      ) : null}

      {tab === "stock" ? (
        <section className="c-card" aria-label="Bảng tồn kho">
          <div className="c-tw">
            <table className="c-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th className="text-right">Có</th>
                  <th className="text-right">Đang giữ</th>
                  <th className="text-right">Khả dụng</th>
                  <th className="text-right">Ngưỡng</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, l, avail, status }) => (
                  <tr key={v.id}>
                    <td>
                      <b>{label(v.id)}</b> <span className="c-lbl tabular">{v.sku}</span>
                    </td>
                    <td className="text-right tabular">{l.onHand}</td>
                    <td className="text-right tabular">{l.reserved}</td>
                    <td className="text-right tabular">
                      <b>{avail}</b>
                    </td>
                    <td className="text-right tabular">{v.lowStock}</td>
                    <td>
                      <span
                        className={`c-pill ${status === "ok" ? "is-ok" : status === "low" ? "is-warn" : "is-err"}`}
                      >
                        {status === "ok" ? "Đủ hàng" : status === "low" ? "Sắp hết" : "Hết hàng"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="c-lbl px-4 py-2">
            Khả dụng = đang có trừ hàng đang giữ cho đơn đã cọc. Hàng trưng bày không tính vào tồn bán được.
          </p>
        </section>
      ) : null}

      {tab === "docs" ? (
        <section className="c-card" aria-label="Phiếu kho">
          {state.stockDocs.length === 0 ? (
            <p className="c-empty">Chưa có phiếu nào. Lập phiếu nhập, chuyển kho hoặc kiểm kê ở trên.</p>
          ) : null}
          <ul className="m-0 list-none p-0">
            {state.stockDocs.map((d) => (
              <li key={d.id} className="border-t border-line-2 px-4 py-2.5 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="tabular">{d.id}</b>
                  <span>{KIND[d.kind]}</span>
                  <span className={`c-pill ${DOC_STATUS[d.status][1]}`}>{DOC_STATUS[d.status][0]}</span>
                  <span className="c-lbl">
                    {whName(d.warehouseId)}
                    {d.toWarehouseId ? ` → ${whName(d.toWarehouseId)}` : ""} · {d.createdBy} · {d.time}
                  </span>
                  {d.status === "draft" && can("inventory.post") ? (
                    <button
                      type="button"
                      className="c-btn is-brand ml-auto"
                      onClick={() =>
                        act(
                          { type: "postStockDoc", id: d.id, actor: me },
                          d.kind === "count" ? "Đã gửi phiếu kiểm kê" : `Đã xử lý phiếu ${d.id}`,
                        )
                      }
                    >
                      {d.kind === "count" ? "Gửi duyệt và ghi sổ" : "Ghi sổ"}
                    </button>
                  ) : null}
                </div>
                <div className="c-lbl mt-1">
                  {d.lines
                    .map((l) => `${label(l.variantId)}: ${d.kind === "count" ? `đếm ${l.counted}` : l.qty}`)
                    .join(" · ")}
                  {d.reason ? ` · ${d.reason}` : ""}
                </div>
                {d.errors.map((e) => (
                  <p key={e} className="mt-1 mb-0 text-err">
                    {e}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "ledger" ? (
        <section className="c-card" aria-label="Sổ kho">
          {state.ledger.length === 0 ? (
            <p className="c-empty">Sổ kho chưa có dòng nào trong phiên này.</p>
          ) : null}
          {state.ledger.length ? (
            <div className="c-tw">
              <table className="c-table">
                <thead>
                  <tr>
                    <th>Giờ</th>
                    <th>Phiếu</th>
                    <th>Loại</th>
                    <th>SKU</th>
                    <th>Kho</th>
                    <th className="text-right">Số lượng</th>
                    <th>Người ghi</th>
                  </tr>
                </thead>
                <tbody>
                  {state.ledger.map((m) => (
                    <tr key={m.id}>
                      <td className="tabular">{m.time}</td>
                      <td className="tabular">{m.ref}</td>
                      <td>{MOVE[m.type]}</td>
                      <td>{label(m.variantId)}</td>
                      <td>{whName(m.warehouseId)}</td>
                      <td className="text-right tabular">
                        {["sale_out", "transfer_out", "adjust_minus"].includes(m.type) ? "−" : "+"}
                        {m.qty}
                      </td>
                      <td>{m.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="c-lbl px-4 py-2">Sổ kho không sửa, không xóa; sai thì lập phiếu điều chỉnh.</p>
        </section>
      ) : null}

      {tab === "combos" ? (
        <section className="c-card" aria-label="Combo">
          <div className="c-tw">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Combo</th>
                  <th>Thành phần</th>
                  <th>Giá</th>
                  <th className="text-right">Lắp được ({whName(wh)})</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(COMBOS).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td className="whitespace-normal c-lbl">
                      {c.items
                        .map((i) => `${label(i.variantId)} × ${i.qty}${i.isGift ? " (tặng)" : ""}`)
                        .join(", ")}
                    </td>
                    <td className="whitespace-normal">
                      {c.pricingMode === "fixed_price"
                        ? `Trọn gói ${new Intl.NumberFormat("vi-VN").format(c.price ?? 0)}đ`
                        : `Tổng giá lẻ trừ ${new Intl.NumberFormat("vi-VN").format(c.discount ?? 0)}đ`}
                    </td>
                    <td className="text-right tabular">
                      <b>{comboAvailability(c.items, state.stock, wh)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="c-lbl px-4 py-2">
            Tồn combo tính từ tồn khả dụng của các thành phần, không lưu riêng.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function DocForm({
  kind,
  defaultWh,
  onDone,
  onCreated,
}: {
  kind: DocumentKind;
  defaultWh: string;
  onDone: () => void;
  onCreated: () => void;
}) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [wh, setWh] = useState(kind === "transfer" ? "wh-dv" : defaultWh);
  const [to, setTo] = useState("wh-q4");
  const [reason, setReason] = useState(
    kind === "receipt" ? "Nhập hàng Đại Việt giao" : kind === "count" ? "Kiểm kê định kỳ" : "",
  );
  const [lines, setLines] = useState<{ key: number; variantId: string; n: string }[]>([
    {
      key: 1,
      variantId: VARIANTS[0].id,
      n: kind === "count" ? String(levelOf(state.stock, VARIANTS[0].id, wh).onHand) : "1",
    },
  ]);
  const field = "rounded-control border border-line bg-surface px-2 py-1.5";

  return (
    <form
      className="c-card c-cb"
      style={{ paddingTop: 14 }}
      aria-label={KIND[kind]}
      onSubmit={(e) => {
        e.preventDefault();
        act(
          {
            type: "createStockDoc",
            kind,
            warehouseId: wh,
            toWarehouseId: kind === "transfer" ? to : undefined,
            reason: reason.trim(),
            lines: lines.map((l) =>
              kind === "count"
                ? { variantId: l.variantId, counted: Number(l.n) }
                : { variantId: l.variantId, qty: Number(l.n) },
            ),
            actor: me,
          },
          `Đã lập ${KIND[kind].toLowerCase()} nháp`,
        );
        onCreated();
        onDone();
      }}
    >
      <b>{KIND[kind]} mới</b>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="c-lbl flex items-center gap-1.5">
          {kind === "transfer" ? "Từ kho" : "Kho"}
          <select
            aria-label={kind === "transfer" ? "Từ kho" : "Kho"}
            value={wh}
            onChange={(e) => setWh(e.target.value)}
            className={field}
          >
            {WAREHOUSES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {kind === "transfer" ? (
          <label className="c-lbl flex items-center gap-1.5">
            Đến kho
            <select aria-label="Đến kho" value={to} onChange={(e) => setTo(e.target.value)} className={field}>
              {WAREHOUSES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <input
          aria-label="Lý do"
          placeholder="Lý do, chứng từ kèm theo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`${field} min-w-0 flex-1`}
        />
      </div>
      <div className="mt-2 space-y-1.5">
        {lines.map((l, i) => {
          const cur = levelOf(state.stock, l.variantId, wh);
          return (
            <div key={l.key} className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`SKU dòng ${i + 1}`}
                value={l.variantId}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x) =>
                      x.key === l.key
                        ? {
                            ...x,
                            variantId: e.target.value,
                            n:
                              kind === "count"
                                ? String(levelOf(state.stock, e.target.value, wh).onHand)
                                : x.n,
                          }
                        : x,
                    ),
                  )
                }
                className={`${field} min-w-0 flex-1`}
              >
                {VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {label(v.id)} ({v.sku})
                  </option>
                ))}
              </select>
              <label className="c-lbl flex items-center gap-1">
                {kind === "count" ? "Số đếm" : "Số lượng"}
                <input
                  aria-label={`${kind === "count" ? "Số đếm" : "Số lượng"} dòng ${i + 1}`}
                  type="number"
                  min={0}
                  value={l.n}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, n: e.target.value } : x)))
                  }
                  className={`${field} w-20 text-text`}
                />
              </label>
              <span className="c-lbl">
                đang có {cur.onHand}, khả dụng {available(cur)}
              </span>
              {lines.length > 1 ? (
                <button
                  type="button"
                  className="c-ib"
                  aria-label={`Xóa dòng ${i + 1}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="c-btn"
          onClick={() =>
            setLines((ls) => [
              ...ls,
              {
                key: (ls.at(-1)?.key ?? 0) + 1,
                variantId: VARIANTS[1].id,
                n: kind === "count" ? String(levelOf(state.stock, VARIANTS[1].id, wh).onHand) : "1",
              },
            ])
          }
        >
          <Plus size={13} className="mr-1 inline" aria-hidden />
          Thêm dòng
        </button>
        <button type="submit" className="c-btn is-brand">
          Lưu nháp
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
      <p className="c-lbl mt-2 mb-0">
        Phiếu nháp chưa đổi tồn.{" "}
        {kind === "count"
          ? "Kiểm kê có chênh lệch cần người có quyền duyệt rồi mới ghi sổ."
          : "Người có quyền ghi sổ bấm Ghi sổ thì tồn mới đổi."}
      </p>
    </form>
  );
}
