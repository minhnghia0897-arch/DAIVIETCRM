"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";

// Cài đặt, Bán hàng bản thật: mức cọc, giữ hàng, hạn báo giá, thông tin chuyển khoản, giới hạn giảm theo vai trò.

type Result = { ok: boolean; message: string };

export interface SalesSettingsValue {
  depositMinAmount: number;
  depositMinPct: number;
  holdDays: number;
  quoteValidDays: number;
  postDeliveryCallDays: number;
  bankInfo: string;
}

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

export function SalesSettingsLive({
  settings,
  roles,
  readOnly,
  actions,
}: {
  settings: SalesSettingsValue;
  roles: { id: string; name: string; maxPct: number | null }[];
  readOnly: boolean;
  actions: {
    saveSalesSettings(i: SalesSettingsValue): Promise<Result>;
    saveDiscountLimit(i: { roleId: string; maxPct: number | null }): Promise<Result>;
  };
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(settings);
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(roles.map((r) => [r.id, r.maxPct === null ? "" : String(r.maxPct)])),
  );
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) router.refresh();
    });
  const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

  return (
    <div className="space-y-4">
      <section className="c-card">
        <div className="c-ch">
          <h2>Cọc, giữ hàng, báo giá</h2>
        </div>
        <form
          className="c-cb grid gap-2 sm:grid-cols-2"
          aria-label="Cài đặt bán hàng"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => actions.saveSalesSettings(v));
          }}
        >
          <label className="c-lbl">
            Cọc tối thiểu (đồng)
            <input
              aria-label="Cọc tối thiểu (đồng)"
              inputMode="numeric"
              disabled={readOnly}
              value={new Intl.NumberFormat("vi-VN").format(v.depositMinAmount)}
              onChange={(e) => setV({ ...v, depositMinAmount: num(e.target.value.replace(/\./g, "")) })}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Hoặc phần trăm tổng đơn (lấy mức cao hơn)
            <input
              aria-label="Cọc tối thiểu (%)"
              inputMode="decimal"
              disabled={readOnly}
              value={v.depositMinPct}
              onChange={(e) => setV({ ...v, depositMinPct: num(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Số ngày giữ hàng sau khi cọc
            <input
              aria-label="Số ngày giữ hàng"
              type="number"
              min={1}
              max={90}
              disabled={readOnly}
              value={v.holdDays}
              onChange={(e) => setV({ ...v, holdDays: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Hạn báo giá (ngày)
            <input
              aria-label="Hạn báo giá (ngày)"
              type="number"
              min={1}
              max={90}
              disabled={readOnly}
              value={v.quoteValidDays}
              onChange={(e) => setV({ ...v, quoteValidDays: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="c-lbl">
            Gọi hỏi thăm sau giao (số ngày sau hoàn tất)
            <input
              aria-label="Gọi hỏi thăm sau giao (ngày)"
              type="number"
              min={0}
              max={60}
              disabled={readOnly}
              value={v.postDeliveryCallDays}
              onChange={(e) => setV({ ...v, postDeliveryCallDays: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="c-lbl sm:col-span-2">
            Thông tin chuyển khoản hiện cho khách (trên báo giá)
            <textarea
              aria-label="Thông tin chuyển khoản"
              rows={3}
              maxLength={1000}
              disabled={readOnly}
              placeholder="Ngân hàng, số tài khoản, tên tài khoản công ty, cú pháp nội dung chuyển khoản"
              value={v.bankInfo}
              onChange={(e) => setV({ ...v, bankInfo: e.target.value })}
              className={FIELD}
            />
          </label>
          {readOnly ? null : (
            <div className="sm:col-span-2">
              <button type="submit" className="c-btn is-brand" disabled={pending}>
                Lưu
              </button>
            </div>
          )}
          <p className="c-lbl m-0 sm:col-span-2">
            Cọc tối thiểu của đơn = mức cao hơn giữa số tiền và phần trăm, không quá tổng đơn; chụp vào đơn
            lúc tạo nên đơn cũ không đổi.
          </p>
        </form>
      </section>

      <section className="c-card" aria-label="Giới hạn giảm theo vai trò">
        <div className="c-ch">
          <h2>Giới hạn giảm tay theo vai trò</h2>
        </div>
        <div className="c-cb space-y-2">
          {roles.map((r) => (
            <form
              key={r.id}
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const raw = limits[r.id].trim();
                run(() => actions.saveDiscountLimit({ roleId: r.id, maxPct: raw === "" ? null : num(raw) }));
              }}
            >
              <span className="min-w-32">{r.name}</span>
              <input
                aria-label={`Giảm tối đa ${r.name} (%)`}
                inputMode="decimal"
                placeholder="Không giới hạn"
                disabled={readOnly}
                value={limits[r.id]}
                onChange={(e) => setLimits((x) => ({ ...x, [r.id]: e.target.value }))}
                className="w-32 rounded-control border border-line bg-surface px-2 py-1"
              />
              <span className="c-lbl">%</span>
              {readOnly ? null : (
                <button type="submit" className="c-btn" disabled={pending}>
                  Lưu
                </button>
              )}
            </form>
          ))}
          <p className="c-lbl m-0">
            Giảm vượt mức thì đơn vào hàng chờ duyệt, Owner duyệt ở Việc cần làm. Để trống là không giới hạn.
            Owner luôn không giới hạn.
          </p>
        </div>
      </section>
    </div>
  );
}
