"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";

import { PageHead } from "../parts";

// Tồn kho bản thật (route /inventory): bố cục bám bản mô phỏng inventory.tsx. Tồn chỉ đổi khi phiếu kho được ghi sổ
// (database ghi sổ kho bất biến và cập nhật tồn trong cùng giao dịch); kiểm kê lệch chờ Owner duyệt ở Việc cần làm.

type Result = { ok: boolean; message: string };
type Kind = "receipt" | "issue" | "transfer" | "count";

export interface LiveInventory {
  tab: string;
  warehouses: { id: string; name: string; display: boolean }[];
  variants: { id: string; sku: string; name: string; trackSerial: boolean }[];
  levels: {
    variantId: string;
    warehouseId: string;
    onHand: number;
    reserved: number;
    available: number;
    low: number | null;
  }[];
  docs: {
    id: string;
    code: string;
    kind: string;
    warehouseId: string;
    toWarehouseId: string | null;
    reason: string | null;
    status: string;
    by: string;
    at: string;
    lines: {
      variantId: string;
      qty: number | null;
      counted: number | null;
      expected: number | null;
      serials: string[];
    }[];
  }[];
  moves: {
    id: number;
    type: string;
    variantId: string;
    warehouseId: string;
    qty: number;
    ref: string;
    reason: string | null;
    by: string;
    at: string;
  }[];
  serials: { serial: string; variantId: string; warehouseId: string | null; status: string }[];
  perms: { document: boolean; post: boolean; threshold: boolean };
}

export interface InventoryLiveActions {
  createStockDocument(i: {
    kind: Kind;
    warehouseId: string;
    toWarehouseId?: string;
    reason: string;
    lines: { variantId: string; n: number; serials?: string[] }[];
  }): Promise<Result>;
  postStockDocument(id: string): Promise<Result>;
  cancelStockDocument(id: string): Promise<Result>;
  setLowThreshold(i: { variantId: string; warehouseId: string; threshold: number | null }): Promise<Result>;
}

const KIND: Record<string, string> = {
  receipt: "Phiếu nhập",
  issue: "Phiếu xuất",
  transfer: "Phiếu chuyển kho",
  count: "Phiếu kiểm kê",
};
const DOC_STATUS: Record<string, [string, string]> = {
  draft: ["Nháp", "is-n"],
  pending_approval: ["Chờ duyệt", "is-warn"],
  posted: ["Đã ghi sổ", "is-ok"],
  cancelled: ["Đã hủy", "is-err"],
};
const MOVE: Record<string, string> = {
  receipt: "Nhập",
  sale_out: "Xuất bán",
  transfer_out: "Chuyển đi",
  transfer_in: "Chuyển đến",
  return_in: "Khách trả",
  adjust_plus: "Điều chỉnh tăng",
  adjust_minus: "Điều chỉnh giảm",
  demo_in: "Nhập trưng bày",
  demo_out: "Xuất trưng bày",
};
const OUT = ["sale_out", "transfer_out", "adjust_minus", "demo_out"];
const SERIAL_STATUS: Record<string, string> = {
  in_stock: "Trong kho",
  reserved: "Đang giữ",
  sold: "Đã bán",
  demo: "Trưng bày",
  returned: "Khách trả",
  defective: "Lỗi",
};

function useRun() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { run, pending };
}

export function InventoryLive({ data, actions }: { data: LiveInventory; actions: InventoryLiveActions }) {
  const { run, pending } = useRun();
  const [tab, setTab] = useState(data.tab);
  const [wh, setWh] = useState(data.warehouses[0]?.id ?? "");
  const [form, setForm] = useState<Kind | null>(null);
  const whName = (id: string | null) => data.warehouses.find((w) => w.id === id)?.name ?? "—";
  const vName = (id: string) => data.variants.find((v) => v.id === id)?.name ?? "SKU";
  const level = (v: string, w: string) =>
    data.levels.find((l) => l.variantId === v && l.warehouseId === w) ?? {
      onHand: 0,
      reserved: 0,
      available: 0,
      low: null,
    };

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Package}
          color="var(--warn)"
          kicker="Tồn chỉ đổi qua phiếu kho đã ghi sổ"
          title="Tồn kho"
        >
          {data.perms.document
            ? (["receipt", "transfer", "issue", "count"] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="c-btn"
                  onClick={() => setForm(form === k ? null : k)}
                >
                  {k === "receipt"
                    ? "Lập phiếu nhập"
                    : k === "transfer"
                      ? "Chuyển kho"
                      : k === "issue"
                        ? "Phiếu xuất"
                        : "Kiểm kê"}
                </button>
              ))
            : null}
        </PageHead>
        <div className="c-ftabs mx-4" role="tablist" aria-label="Mục kho">
          {(
            [
              ["stock", "Tồn kho"],
              ["docs", `Phiếu kho (${data.docs.length})`],
              ["ledger", "Sổ kho"],
              ["serials", `Serial (${data.serials.length})`],
            ] as [string, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className="c-ftab"
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
          {tab === "stock" ? (
            <select
              aria-label="Kho"
              value={wh}
              onChange={(e) => setWh(e.target.value)}
              className="ml-auto rounded-control border border-line bg-surface px-2 py-1"
            >
              {data.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      {form ? (
        <DocForm
          key={form}
          kind={form}
          data={data}
          defaultWh={wh}
          actions={actions}
          onDone={() => setForm(null)}
          onCreated={() => setTab("docs")}
        />
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
                {data.variants.map((v) => {
                  const l = level(v.id, wh);
                  const low = l.low ?? 0;
                  const status = l.available <= 0 ? "out" : l.available <= low ? "low" : "ok";
                  return (
                    <tr key={v.id}>
                      <td>
                        <b>{v.name}</b> <span className="c-lbl tabular">{v.sku}</span>
                      </td>
                      <td className="text-right tabular">{l.onHand}</td>
                      <td className="text-right tabular">{l.reserved}</td>
                      <td className="text-right tabular">
                        <b>{l.available}</b>
                      </td>
                      <td className="text-right tabular">
                        {data.perms.threshold ? (
                          <input
                            aria-label={`Ngưỡng tồn thấp ${v.sku}`}
                            type="number"
                            min={0}
                            defaultValue={l.low ?? ""}
                            disabled={pending}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const n = raw === "" ? null : Number(raw);
                              if (n === l.low) return;
                              run(() =>
                                actions.setLowThreshold({ variantId: v.id, warehouseId: wh, threshold: n }),
                              );
                            }}
                            className="w-16 rounded-control border border-line bg-surface px-1.5 py-0.5 text-right"
                          />
                        ) : (
                          (l.low ?? "—")
                        )}
                      </td>
                      <td>
                        <span
                          className={`c-pill ${status === "ok" ? "is-ok" : status === "low" ? "is-warn" : "is-err"}`}
                        >
                          {status === "ok" ? "Đủ hàng" : status === "low" ? "Sắp hết" : "Hết hàng"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.variants.length === 0 ? (
            <p className="c-empty">Chưa có sản phẩm nào. Thêm ở màn Sản phẩm.</p>
          ) : null}
          <p className="c-lbl px-4 py-2">
            Khả dụng = đang có trừ hàng đang giữ cho đơn đã cọc. Hàng trưng bày không bán từ kho này.
          </p>
        </section>
      ) : null}

      {tab === "docs" ? (
        <section className="c-card" aria-label="Phiếu kho">
          {data.docs.length === 0 ? (
            <p className="c-empty">Chưa có phiếu nào. Lập phiếu nhập, chuyển kho hoặc kiểm kê ở trên.</p>
          ) : null}
          <ul className="m-0 list-none p-0">
            {data.docs.map((d) => (
              <li key={d.id} className="border-t border-line-2 px-4 py-2.5 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="tabular">{d.code}</b>
                  <span>{KIND[d.kind]}</span>
                  <span className={`c-pill ${DOC_STATUS[d.status]?.[1] ?? "is-n"}`}>
                    {DOC_STATUS[d.status]?.[0] ?? d.status}
                  </span>
                  <span className="c-lbl">
                    {whName(d.warehouseId)}
                    {d.toWarehouseId ? ` → ${whName(d.toWarehouseId)}` : ""} · {d.by} · {d.at}
                  </span>
                  {d.status === "draft" ? (
                    <span className="ml-auto flex gap-1.5">
                      {data.perms.post ? (
                        <button
                          type="button"
                          className="c-btn is-brand"
                          disabled={pending}
                          onClick={() => run(() => actions.postStockDocument(d.id))}
                        >
                          {d.kind === "count" ? "Gửi duyệt và ghi sổ" : "Ghi sổ"}
                        </button>
                      ) : null}
                      {data.perms.document ? (
                        <button
                          type="button"
                          className="c-btn"
                          disabled={pending}
                          onClick={() => run(() => actions.cancelStockDocument(d.id))}
                        >
                          Hủy phiếu
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                <div className="c-lbl mt-1">
                  {d.lines
                    .map((l) =>
                      d.kind === "count"
                        ? `${vName(l.variantId)}: đếm ${l.counted}${l.expected !== null ? ` (sổ ${l.expected})` : ""}`
                        : `${vName(l.variantId)}: ${l.qty}${l.serials.length ? ` [${l.serials.join(", ")}]` : ""}`,
                    )
                    .join(" · ")}
                  {d.reason ? ` · ${d.reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "ledger" ? (
        <section className="c-card" aria-label="Sổ kho">
          {data.moves.length === 0 ? <p className="c-empty">Sổ kho chưa có dòng nào.</p> : null}
          {data.moves.length ? (
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
                  {data.moves.map((m) => (
                    <tr key={m.id}>
                      <td className="tabular">{m.at}</td>
                      <td className="tabular">{m.ref}</td>
                      <td>{MOVE[m.type] ?? m.type}</td>
                      <td>{vName(m.variantId)}</td>
                      <td>{whName(m.warehouseId)}</td>
                      <td className="text-right tabular">
                        {OUT.includes(m.type) ? "−" : "+"}
                        {m.qty}
                      </td>
                      <td>{m.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="c-lbl px-4 py-2">Sổ kho không sửa, không xóa; sai thì lập phiếu điều chỉnh.</p>
        </section>
      ) : null}

      {tab === "serials" ? (
        <section className="c-card" aria-label="Serial">
          {data.serials.length === 0 ? (
            <p className="c-empty">Chưa có serial nào. Nhập serial khi lập phiếu nhập ghế, máy lọc.</p>
          ) : (
            <div className="c-tw">
              <table className="c-table">
                <thead>
                  <tr>
                    <th>Serial</th>
                    <th>SKU</th>
                    <th>Kho</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.serials.map((s) => (
                    <tr key={s.serial}>
                      <td className="tabular">
                        <b>{s.serial}</b>
                      </td>
                      <td>{vName(s.variantId)}</td>
                      <td>{whName(s.warehouseId)}</td>
                      <td>{SERIAL_STATUS[s.status] ?? s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function DocForm({
  kind,
  data,
  defaultWh,
  actions,
  onDone,
  onCreated,
}: {
  kind: Kind;
  data: LiveInventory;
  defaultWh: string;
  actions: InventoryLiveActions;
  onDone: () => void;
  onCreated: () => void;
}) {
  const { run, pending } = useRun();
  const firstOther = data.warehouses.find((w) => w.id !== defaultWh)?.id ?? "";
  const [wh, setWh] = useState(defaultWh);
  const [to, setTo] = useState(firstOther);
  const [reason, setReason] = useState(
    kind === "receipt" ? "Nhập hàng Đại Việt giao" : kind === "count" ? "Kiểm kê định kỳ" : "",
  );
  const onHand = (v: string, w: string) =>
    data.levels.find((l) => l.variantId === v && l.warehouseId === w)?.onHand ?? 0;
  const first = data.variants[0]?.id ?? "";
  const [lines, setLines] = useState<{ key: number; variantId: string; n: string; serials: string }[]>([
    { key: 1, variantId: first, n: kind === "count" ? String(onHand(first, defaultWh)) : "1", serials: "" },
  ]);
  const field = "rounded-control border border-line bg-surface px-2 py-1.5";
  const tracked = (v: string) => data.variants.find((x) => x.id === v)?.trackSerial ?? false;

  return (
    <form
      className="c-card c-cb"
      style={{ paddingTop: 14 }}
      aria-label={KIND[kind]}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            actions.createStockDocument({
              kind,
              warehouseId: wh,
              toWarehouseId: kind === "transfer" ? to : undefined,
              reason: reason.trim(),
              lines: lines.map((l) => ({
                variantId: l.variantId,
                n: Number(l.n),
                serials: l.serials
                  .split(/[\s,;]+/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              })),
            }),
          () => {
            onCreated();
            onDone();
          },
        );
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
            {data.warehouses.map((w) => (
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
              {data.warehouses
                .filter((w) => w.id !== wh)
                .map((w) => (
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
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          className={`${field} min-w-0 flex-1`}
        />
      </div>
      <div className="mt-2 space-y-1.5">
        {lines.map((l, i) => (
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
                          n: kind === "count" ? String(onHand(e.target.value, wh)) : x.n,
                        }
                      : x,
                  ),
                )
              }
              className={`${field} min-w-0 flex-1`}
            >
              {data.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.sku})
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
            <span className="c-lbl">đang có {onHand(l.variantId, wh)}</span>
            {kind === "receipt" && tracked(l.variantId) ? (
              <input
                aria-label={`Serial dòng ${i + 1}`}
                placeholder="Serial, cách nhau bằng dấu phẩy (không bắt buộc)"
                value={l.serials}
                onChange={(e) =>
                  setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, serials: e.target.value } : x)))
                }
                className={`${field} min-w-0 basis-full`}
              />
            ) : null}
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
        ))}
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
                variantId: first,
                n: kind === "count" ? String(onHand(first, wh)) : "1",
                serials: "",
              },
            ])
          }
        >
          <Plus size={13} className="mr-1 inline" aria-hidden />
          Thêm dòng
        </button>
        <button type="submit" className="c-btn is-brand" disabled={pending || !data.variants.length}>
          Lưu nháp
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
      <p className="c-lbl mt-2 mb-0">
        Phiếu nháp chưa đổi tồn.{" "}
        {kind === "count"
          ? "Kiểm kê có chênh lệch cần Owner duyệt rồi mới ghi sổ."
          : "Người có quyền ghi sổ bấm Ghi sổ thì tồn mới đổi."}
      </p>
    </form>
  );
}
