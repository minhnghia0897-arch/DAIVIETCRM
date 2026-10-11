"use client";

import { FileUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { IMPORT_TEMPLATE, validateImport, type ImportRow } from "@/lib/leads/import";

// Nhập file CSV dữ liệu thủ công cũ trên bản thật (CLAUDE.md mục 6): chọn tệp, xem trước dòng lỗi, dòng trùng trong
// tệp và dòng đã có trong CRM, chọn cách xử lý trùng và cách giao, rồi nhập. Kiểm tra lần cuối làm ở server.

type DupMode = "skip" | "update" | "activity";
type AssignMode = "hold" | "previous" | "auto";

export interface ImportActions {
  checkImportPhones(
    phones: string[],
  ): Promise<{ ok: true; existing: { e164: string; open: boolean }[] } | { ok: false; message: string }>;
  importLeads(i: {
    rows: {
      line: number;
      name: string;
      phone: string;
      country: string;
      province: string;
      product: string;
      lastContact: string;
      note: string;
      previousOwner: string;
    }[];
    duplicateMode: DupMode;
    assignMode: AssignMode;
  }): Promise<
    | {
        ok: true;
        created: number;
        attached: number;
        skipped: number;
        assigned: number;
        held: number;
        errors: { line: number; message: string }[];
      }
    | { ok: false; message: string }
  >;
}

const STATUS: Record<ImportRow["status"], [string, string]> = {
  ok: ["Hợp lệ", "is-ok"],
  error: ["Lỗi", "is-err"],
  duplicate_file: ["Trùng trong tệp", "is-warn"],
  duplicate_existing: ["Đã có trong CRM", "is-warn"],
};

const SHOW = 200;

export function LeadImport({
  markets,
  canAssign,
  actions,
  onClose,
}: {
  markets: string[];
  canAssign: boolean;
  actions: ImportActions;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(false);
  const [dup, setDup] = useState<DupMode>("activity");
  const [assign, setAssign] = useState<AssignMode>("hold");
  const [done, setDone] = useState<Extract<
    Awaited<ReturnType<ImportActions["importLeads"]>>,
    { ok: true }
  > | null>(null);

  const result = useMemo(
    () => (text.trim() ? validateImport(text, existing, markets) : null),
    [text, existing, markets],
  );
  const count = (st: ImportRow["status"]) => result?.rows.filter((r) => r.status === st).length ?? 0;
  const importable = count("ok") + (dup === "skip" ? 0 : count("duplicate_existing"));

  function load(t: string, name: string) {
    setText(t);
    setFileName(name);
    setDone(null);
    setChecked(false);
    setExisting(new Set());
    // Hỏi server số nào đã có trong CRM để xem trước (chỉ trạng thái, không tên khách).
    const phones = validateImport(t, new Set(), markets).rows.flatMap((r) => (r.e164 ? [r.e164] : []));
    if (!phones.length) return;
    start(async () => {
      const r = await actions.checkImportPhones(phones);
      if (r.ok) {
        setExisting(new Set(r.existing.map((e) => e.e164)));
        setChecked(true);
      } else toast(r.message, "err");
    });
  }

  function run() {
    if (!result) return;
    const rows = result.rows
      .filter((r) => r.status === "ok" || r.status === "duplicate_existing")
      .map((r) => ({
        line: r.line,
        name: r.name,
        phone: r.phoneRaw,
        country: r.country,
        province: r.province,
        product: r.product,
        lastContact: r.lastContact,
        note: r.note,
        previousOwner: r.previousOwner,
      }));
    start(async () => {
      try {
        const r = await actions.importLeads({ rows, duplicateMode: dup, assignMode: assign });
        if (!r.ok) {
          toast(r.message, "err");
          return;
        }
        setDone(r);
        toast(`Đã nhập ${r.created} lead mới`, "ok");
        router.refresh();
      } catch {
        toast("Chưa nhập được, thử lại sau ít phút.", "err");
      }
    });
  }

  return (
    <section className="c-card c-cb" aria-label="Nhập file lead">
      <div className="flex flex-wrap items-center gap-2">
        <b className="flex-1">Nhập dữ liệu cũ từ file CSV</b>
        <a
          className="c-btn"
          download="mau-nhap-lead.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${IMPORT_TEMPLATE}`)}`}
        >
          Tải file mẫu
        </a>
        <label className="c-btn is-blue cursor-pointer">
          <FileUp size={15} aria-hidden /> Chọn tệp CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Chọn tệp CSV"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(await f.text(), f.name);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="c-lbl mb-0 mt-1">
        Cột: họ tên, số điện thoại (bắt buộc), quốc gia, tỉnh người nhận, sản phẩm, ngày liên hệ gần nhất
        (YYYY-MM-DD), ghi chú, người phụ trách cũ. Xuất từ Excel, Google Sheets bằng “Tải xuống, CSV”.
      </p>

      {result?.headerError ? <p className="mb-0 mt-2 text-err">{result.headerError}</p> : null}

      {result && !result.headerError && !done ? (
        <>
          <p className="mb-1 mt-3" role="status">
            <b>{fileName || "Tệp"}</b>: {result.rows.length} dòng ·{" "}
            <b className="text-ok">{count("ok")} hợp lệ</b> · <b className="text-err">{count("error")} lỗi</b>{" "}
            · {count("duplicate_file")} trùng trong tệp · {count("duplicate_existing")} đã có trong CRM
            {pending && !checked ? " · đang kiểm tra trùng với CRM…" : ""}
          </p>
          <div className="c-tw max-h-72 overflow-y-auto">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Họ tên</th>
                  <th>Số</th>
                  <th>Ở</th>
                  <th>Tỉnh nhận</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, SHOW).map((r) => (
                  <tr key={r.line}>
                    <td className="tabular">{r.line}</td>
                    <td>{r.name || "—"}</td>
                    <td className="tabular">{r.e164 ?? r.phoneRaw}</td>
                    <td>{r.country === "unknown" ? "Chưa rõ" : r.country}</td>
                    <td>{r.province}</td>
                    <td className="whitespace-normal">
                      <span className={`c-pill ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>{" "}
                      <span className="c-lbl">{r.errors.join("; ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > SHOW ? (
            <p className="c-lbl mb-0 mt-1">Đang hiện {SHOW} dòng đầu; khi nhập sẽ xử lý cả tệp.</p>
          ) : null}

          <fieldset className="m-0 mt-3 border-0 p-0">
            <legend className="mb-1 font-semibold">Dòng có số đã có trong CRM</legend>
            <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Xử lý dòng đã có trong CRM">
              {(
                [
                  ["activity", "Ghi thành hoạt động trên lead cũ"],
                  ["update", "Cập nhật ô còn trống của lead cũ"],
                  ["skip", "Bỏ qua"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input type="radio" name="dup" checked={dup === k} onChange={() => setDup(k)} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 block">
            <span className="font-semibold">Lead mới nhập vào</span>
            <select
              aria-label="Lead mới nhập vào"
              value={assign}
              onChange={(e) => setAssign(e.target.value as AssignMode)}
              className="ml-2 rounded-control border border-line bg-surface px-2 py-1"
            >
              <option value="hold">Để ở hàng Chưa phân, sale admin chia sau (khuyên dùng)</option>
              {canAssign ? <option value="previous">Giao lại người phụ trách cũ nếu còn làm</option> : null}
              <option value="auto">Phân tự động ngay (tính SLA 5 phút)</option>
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" className="c-btn is-go" disabled={!importable || pending} onClick={run}>
              {pending && checked ? "Đang nhập…" : `Nhập ${importable} dòng`}
            </button>
            <button type="button" className="c-btn" onClick={onClose}>
              Hủy
            </button>
          </div>
        </>
      ) : null}

      {done ? (
        <div className="mt-3" role="status" aria-label="Kết quả nhập">
          <p className="m-0 rounded-control bg-ok-soft px-3 py-2 text-ok">
            Đã nhập <b>{done.created}</b> lead mới
            {done.attached ? `, ghi ${done.attached} dòng vào lead cũ` : ""}
            {done.skipped ? `, bỏ qua ${done.skipped} dòng trùng` : ""}.{" "}
            {done.assigned ? `Giao lại ${done.assigned} lead cho người phụ trách cũ. ` : ""}
            {done.held ? `${done.held} lead đang ở hàng Chưa phân.` : ""}
          </p>
          {done.errors.length ? (
            <ul className="mb-0 mt-2 text-err">
              {done.errors.map((e) => (
                <li key={e.line}>
                  Dòng {e.line}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex gap-1.5">
            {done.held ? (
              <Link href="/leads?view=unassigned" className="c-btn is-blue" onClick={onClose}>
                Xem lead chưa phân
              </Link>
            ) : null}
            <button type="button" className="c-btn" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
