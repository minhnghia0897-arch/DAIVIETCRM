"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { type KpiRow, monthLabel, parseMillions, salesProgress, toMillions } from "@/lib/sales/credits";

import { MonthNav } from "./sales-kpi";

// Đặt chỉ tiêu doanh số tháng cho từng người (CLAUDE.md mục 9.3). Nhập theo triệu đồng cho nhanh; database lưu đồng.

type Result = { ok: boolean; message: string };

export interface TargetActions {
  setSalesTarget(i: { userId: string; month: string; value: number }): Promise<Result>;
  copyPreviousTargets(month: string): Promise<Result>;
}

export function SalesTargetsView({
  month,
  current,
  rows,
  canEdit,
  actions,
}: {
  month: string;
  current: string;
  rows: KpiRow[];
  canEdit: boolean;
  actions: TargetActions;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) router.refresh();
    });
  const missing = rows.some((r) => !r.target);

  return (
    <div className="c-stack">
      <h1 className="sr-only">Đội ngũ: chỉ tiêu</h1>
      <section className="c-card" aria-labelledby="targets-h">
        <div className="c-ch">
          <h2 id="targets-h">Chỉ tiêu doanh số {monthLabel(month).toLowerCase()}</h2>
          <MonthNav month={month} basePath="/team/targets" current={current} />
        </div>
        {canEdit && missing ? (
          <div className="c-cb flex flex-wrap items-center gap-2 pt-0">
            <span className="c-lbl">
              Nhập theo triệu đồng, ví dụ 150 là 150 triệu. Để trống là bỏ chỉ tiêu.
            </span>
            <button
              type="button"
              className="c-btn ml-auto"
              disabled={pending}
              onClick={() => run(() => actions.copyPreviousTargets(month))}
            >
              Chép chỉ tiêu tháng trước
            </button>
          </div>
        ) : null}
        <div className="c-tw">
          <table className="c-table" aria-label={`Chỉ tiêu ${monthLabel(month)}`}>
            <thead>
              <tr>
                <th>Người</th>
                <th className="text-right">Doanh số đã cọc</th>
                <th>Chỉ tiêu doanh số (triệu)</th>
                <th className="text-right">Đạt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = salesProgress(r.net, r.target);
                return (
                  <tr key={r.user_id}>
                    <td>
                      <b>{r.full_name}</b>
                    </td>
                    <td className="text-right tabular">{formatMoney(r.net)}</td>
                    <td>
                      {canEdit ? (
                        <TargetInput
                          key={`${r.user_id}-${month}-${r.target ?? 0}`}
                          name={r.full_name}
                          value={r.target}
                          disabled={pending}
                          onSave={(value) =>
                            run(() => actions.setSalesTarget({ userId: r.user_id, month, value }))
                          }
                        />
                      ) : (
                        <span className="tabular">{r.target ? formatMoney(r.target) : "Chưa đặt"}</span>
                      )}
                    </td>
                    <td className="text-right tabular">
                      {p.ratio === null ? "—" : `${Math.round(p.ratio * 100)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!canEdit ? (
          <p className="c-lbl c-cb m-0">Chỉ người có quyền đặt chỉ tiêu (mặc định Owner) mới sửa được.</p>
        ) : null}
      </section>
    </div>
  );
}

function TargetInput({
  name,
  value,
  disabled,
  onSave,
}: {
  name: string;
  value: number | null;
  disabled: boolean;
  onSave: (v: number) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState(toMillions(value));
  const changed = v !== toMillions(value);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseMillions(v);
        if (parsed === null) {
          toast("Nhập số triệu, ví dụ 150 hoặc 150,5", "err");
          return;
        }
        onSave(parsed);
      }}
    >
      <input
        aria-label={`Chỉ tiêu doanh số ${name}`}
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Chưa đặt"
        className="w-28 rounded-control border border-line bg-surface px-2 py-1 text-right tabular"
      />
      <span className="c-lbl">triệu</span>
      {changed ? (
        <button type="submit" className="c-btn is-brand" disabled={disabled}>
          Lưu
        </button>
      ) : null}
    </form>
  );
}
