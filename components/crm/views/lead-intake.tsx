"use client";

import { useMemo, useState } from "react";

import { localTime } from "@/lib/leads/windows";
import { IMPORT_TEMPLATE, validateImport, type ImportRow } from "@/lib/leads/import";
import { normalizePhone } from "@/lib/phone";
import { useShell } from "../shell-context";
import { fmtDue, intakeDecision, simDate, useCrm, type CrmState } from "../store";

const field = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

const PRODUCTS = [
  "Ghế massage DV-X9",
  "Ghế massage DV-S7",
  "Ghế massage DV-M5",
  "Máy lọc nước ion kiềm",
  "Chưa rõ",
];

/** Nhập nhanh lead tay: khách đến showroom, bình luận live, giới thiệu (CLAUDE.md mục 6). */
export function NewLeadForm({ onDone }: { onDone: () => void }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const sources = state.settings.catalogs.sources.items.filter((i) => i.active).map((i) => i.label);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [market, setMarket] = useState<"KR" | "VN" | "unknown">("unknown");
  const [source, setSource] = useState("Khách đến showroom");
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [note, setNote] = useState("");

  // Xem trước chống trùng ngay khi gõ số, trước khi lưu.
  const preview = useMemo(() => {
    if (phone.replace(/\D/g, "").length < 6) return null;
    const p = normalizePhone(phone, market === "KR" ? "KR" : "VN");
    if (!p.valid)
      return { tone: "warn", text: "Số chưa hợp lệ: vẫn tạo lead, gắn cờ và đưa vào hàng kiểm tra." };
    const d = intakeDecision(state, p.e164);
    const inferred = p.country === "KR" ? "Hàn Quốc" : p.country === "VN" ? "Việt Nam" : p.country;
    if (d.action === "attach_open") {
      const o = state.opps.find((x) => x.id === d.leadId);
      return {
        tone: "err",
        text: `Trùng lead đang mở của ${o?.name} (${o?.owner || "chưa phân"}): sẽ nối vào lead đó, không tạo mới.`,
      };
    }
    if (d.action === "attach_recent_lost") {
      const c = state.closedLeads.find((x) => x.id === d.leadId);
      return {
        tone: "warn",
        text: `Khách ${c?.name} vừa thất bại (${c?.reason}): sẽ báo ${c?.owner} xem xét mở lại, không tạo lead mới.`,
      };
    }
    if (d.action === "new_lead")
      return {
        tone: "ok",
        text: `Khách cũ, lead trước đã đóng hơn 30 ngày: tạo lead mới. Số ${p.e164} (${inferred}).`,
      };
    return { tone: "ok", text: `Số hợp lệ ${p.e164} (${inferred}).` };
  }, [phone, market, state]);

  return (
    <form
      className="c-card c-cb"
      style={{ paddingTop: 14 }}
      aria-label="Tạo lead"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) return;
        act(
          {
            type: "createLead",
            name: name.trim(),
            phoneRaw: phone,
            market,
            source,
            product,
            note: note.trim(),
            actor: me,
          },
          preview?.tone === "err" ? "Trùng lead đang mở, đã nối vào lead cũ" : "Đã tạo lead",
        );
        onDone();
      }}
    >
      <b>Tạo lead</b>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="c-lbl">
          Họ tên
          <input
            aria-label="Họ tên"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        <label className="c-lbl">
          Số điện thoại
          <input
            aria-label="Số điện thoại"
            required
            inputMode="tel"
            placeholder="0912 345 678 hoặc 010-1234-5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={field}
          />
        </label>
        <label className="c-lbl">
          Khách đang sống ở
          <select
            aria-label="Khách đang sống ở"
            value={market}
            onChange={(e) => setMarket(e.target.value as typeof market)}
            className={field}
          >
            <option value="unknown">Chưa rõ (suy từ đầu số)</option>
            {state.settings.markets
              .filter((m) => m.active)
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <label className="c-lbl">
          Nguồn
          <select
            aria-label="Nguồn"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={field}
          >
            {sources.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Sản phẩm quan tâm
          <select
            aria-label="Sản phẩm quan tâm"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className={field}
          >
            {PRODUCTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Ghi chú
          <input
            aria-label="Ghi chú lead"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={field}
          />
        </label>
      </div>
      {preview ? (
        <p
          role="note"
          className={`mt-2 mb-0 rounded-control px-2.5 py-1.5 ${preview.tone === "err" ? "bg-err-soft text-err" : preview.tone === "warn" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}
        >
          {preview.text}
        </p>
      ) : null}
      <div className="mt-3 flex gap-1.5">
        <button type="submit" className="c-btn is-brand">
          Lưu lead
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}

const STATUS_LABEL: Record<ImportRow["status"], [string, string]> = {
  ok: ["Hợp lệ", "is-ok"],
  error: ["Lỗi", "is-err"],
  duplicate_file: ["Trùng trong tệp", "is-warn"],
  duplicate_existing: ["Đã có trong CRM", "is-warn"],
};

/** Nhập CSV dữ liệu cũ: xem trước, báo dòng lỗi và dòng trùng, chọn cách xử lý trùng. */
export function ImportPanel({ onDone }: { onDone: () => void }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"skip" | "update" | "activity">("activity");
  const existing = useMemo(
    () =>
      new Set(
        Object.entries(state.leadMeta)
          .filter(([id, m]) => m.phoneE164 && state.opps.some((o) => o.id === id))
          .map(([, m]) => m.phoneE164!),
      ),
    [state.leadMeta, state.opps],
  );
  const result = useMemo(() => (text.trim() ? validateImport(text, existing) : null), [text, existing]);
  const count = (st: ImportRow["status"]) => result?.rows.filter((r) => r.status === st).length ?? 0;

  return (
    <section className="c-card c-cb" style={{ paddingTop: 14 }} aria-label="Nhập file lead">
      <div className="flex flex-wrap items-center gap-2">
        <b className="flex-1">Nhập dữ liệu cũ từ CSV</b>
        <a
          className="c-btn"
          download="mau-nhap-lead.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${IMPORT_TEMPLATE}`)}`}
        >
          Tải file mẫu
        </a>
        <label className="c-btn cursor-pointer">
          Chọn tệp
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
        </label>
        <button
          type="button"
          className="c-btn"
          onClick={() =>
            setText(
              IMPORT_TEMPLATE +
                "\nLê Văn C,123,VN,,,,\nNguyễn Thị Thu,+82 10 5521 2290,KR,Nghệ An,Ghế DV-X9,,Dữ liệu cũ của chị Thu",
            )
          }
        >
          Dùng dữ liệu thử
        </button>
      </div>
      <textarea
        aria-label="Nội dung CSV"
        placeholder="Dán nội dung CSV hoặc chọn tệp. Cột: ho_ten, so_dien_thoai, quoc_gia, tinh_nguoi_nhan, san_pham, ngay_lien_he_gan_nhat, ghi_chu, nguoi_phu_trach_cu"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${field} mt-2 h-24 font-mono text-[12px]`}
      />
      {result?.headerError ? <p className="mt-2 mb-0 text-err">{result.headerError}</p> : null}
      {result && !result.headerError ? (
        <>
          <p className="c-lbl mt-2 mb-1">
            {result.rows.length} dòng: {count("ok")} hợp lệ, {count("error")} lỗi, {count("duplicate_file")}{" "}
            trùng trong tệp, {count("duplicate_existing")} đã có trong CRM.
          </p>
          <div className="c-tw max-h-64 overflow-y-auto">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Họ tên</th>
                  <th>Số</th>
                  <th>Tỉnh</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.name || "—"}</td>
                    <td className="tabular">{r.e164 ?? r.phoneRaw}</td>
                    <td>{r.province}</td>
                    <td className="whitespace-normal">
                      <span className={`c-pill ${STATUS_LABEL[r.status][1]}`}>
                        {STATUS_LABEL[r.status][0]}
                      </span>{" "}
                      <span className="c-lbl">{r.errors.join("; ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="mt-2 flex flex-wrap items-center gap-3"
            role="radiogroup"
            aria-label="Xử lý dòng đã có trong CRM"
          >
            <span className="c-lbl">Dòng đã có trong CRM:</span>
            {(
              [
                ["skip", "Bỏ qua"],
                ["update", "Cập nhật ô còn trống"],
                ["activity", "Ghi thành hoạt động"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="inline-flex items-center gap-1">
                <input type="radio" name="dup-mode" checked={mode === k} onChange={() => setMode(k)} /> {l}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              className="c-btn is-brand"
              disabled={!count("ok") && !(count("duplicate_existing") && mode !== "skip")}
              onClick={() => {
                act(
                  { type: "importLeads", rows: result.rows, duplicateMode: mode, actor: me },
                  `Đã nhập ${count("ok")} lead mới; bỏ qua ${count("error") + count("duplicate_file")} dòng lỗi, trùng`,
                );
                onDone();
              }}
            >
              Nhập {count("ok")} lead
            </button>
            <button type="button" className="c-btn" onClick={onDone}>
              Hủy
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Nhãn trạng thái phân lead trên thẻ: chờ khung gọi, chưa phân, đồng hồ SLA. */
export function SlaPill({ oppId }: { oppId: string }) {
  const { state } = useCrm();
  const o = state.opps.find((x) => x.id === oppId);
  const m = state.leadMeta[oppId];
  if (!o || !m || o.stage > 0) return null;
  if (m.windowUntil !== undefined) {
    const info = state.leadInfo[oppId];
    const mk = state.settings.markets.find((x) => x.code === info?.market);
    const label =
      mk && mk.offsetHours
        ? `${localTime(simDate(m.windowUntil), mk.timezone)} giờ ${mk.name.replace(" Quốc", "")}`
        : fmtDue(m.windowUntil);
    return <span className="c-pill is-ai">Gọi lúc {label}</span>;
  }
  if (!o.owner) return <span className="c-pill is-warn">Chưa phân</span>;
  if (m.firstContactAt !== undefined || m.slaDue === undefined) return null;
  const left = m.slaDue - state.minutes;
  return left < 0 ? (
    <span className="c-pill is-err">Quá SLA {-left} phút</span>
  ) : (
    <span className="c-pill is-warn">Còn {left} phút</span>
  );
}

/** Số lead quá SLA và chưa phân, dùng cho Trang chủ sale admin và thanh tiện ích. */
export function slaStats(s: CrmState) {
  const overdue = s.opps.filter((o) => {
    const m = s.leadMeta[o.id];
    return (
      o.owner &&
      o.stage === 0 &&
      m &&
      m.firstContactAt === undefined &&
      m.slaDue !== undefined &&
      m.slaDue < s.minutes
    );
  });
  const unassigned = s.opps.filter(
    (o) => !o.owner && s.leadMeta[o.id]?.windowUntil === undefined && o.stage === 0,
  );
  const waiting = s.opps.filter((o) => !o.owner && s.leadMeta[o.id]?.windowUntil !== undefined);
  return { overdue, unassigned, waiting };
}

/** Chọn người giữ lead (cần `lead.assign`). */
export function AssignSelect({ oppId }: { oppId: string }) {
  const { state, act } = useCrm();
  const { me, can } = useShell();
  const o = state.opps.find((x) => x.id === oppId);
  if (!o || !can("lead.assign")) return null;
  const names = [
    ...new Set(
      [...state.receivers.filter((r) => r.active).map((r) => r.name), "My", o.owner].filter(Boolean),
    ),
  ];
  return (
    <label className="inline-flex items-center gap-1.5 c-lbl">
      Giao cho
      <select
        aria-label={`Giao lead ${o.name}`}
        value={o.owner}
        onChange={(e) =>
          act(
            { type: "assignLead", oppId, to: e.target.value, actor: me },
            e.target.value ? `Đã giao ${o.name} cho ${e.target.value}` : "Đã chuyển về hàng Chưa phân",
          )
        }
        className="rounded-control border border-line bg-surface px-1.5 py-1 text-text"
      >
        <option value="">Chưa phân</option>
        {names.map((n) => {
          const r = state.receivers.find((x) => x.name === n);
          return (
            <option key={n} value={n}>
              {n}
              {r ? (r.onDuty ? " · đang trực" : " · không trực") : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}
