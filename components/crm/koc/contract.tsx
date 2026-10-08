"use client";

import { FileText, Upload } from "lucide-react";
import { useState } from "react";

import { formatDate } from "@/lib/format";
import { CONTRACT_FILE_TYPES, KOC_MANAGE } from "@/lib/koc/actions";
import { KOC_TODAY } from "@/lib/koc/data";
import type { Contract, ContractFile, Creator } from "@/lib/koc/types";

import { Field } from "./list";
import { useKoc } from "./provider";

// Hợp đồng của một KOL, KOC trên hồ sơ: điều khoản chính (thời hạn, hoa hồng, độc quyền, quyền dùng lại nội dung)
// và tệp đính kèm (hợp đồng chính, phụ lục, biên bản nghiệm thu). Bản demo giữ tệp trong trình duyệt suốt phiên;
// bản thật lưu ở Storage riêng tư, mở bằng link ký ngắn hạn (docs/open-questions.md mục 35).

const input = "rounded-control border border-line bg-surface px-2 py-1";
const STATUS = { draft: "Bản nháp", signed: "Đã ký", expired: "Hết hạn" } as const;
const KIND: Record<ContractFile["kind"], string> = {
  contract: "Hợp đồng chính",
  appendix: "Phụ lục",
  acceptance: "Biên bản nghiệm thu",
};
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx";

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("vi-VN")} KB`;
}

export function ContractBlock({ c }: { c: Creator }) {
  const { who } = useKoc();
  const manage = !who.readOnly && who.perms.has(KOC_MANAGE);
  const [editing, setEditing] = useState(false);
  const k = c.contract;

  if (editing) return <ContractForm c={c} onDone={() => setEditing(false)} />;
  if (!k)
    return (
      <div className="space-y-2">
        <p className="m-0 text-text-weak">Chưa ký hợp đồng.</p>
        {manage ? (
          <button type="button" className="c-btn is-blue" onClick={() => setEditing(true)}>
            Tạo hợp đồng
          </button>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-3">
      <dl className="m-0 space-y-1">
        <div>
          <dt className="c-lbl">Hợp đồng {k.code}</dt>
          <dd className="m-0">
            <span className={`c-pill ${k.status === "signed" ? "is-ok" : "is-warn"}`}>
              {STATUS[k.status]}
            </span>{" "}
            {formatDate(k.startsOn)} đến {formatDate(k.endsOn)}
          </dd>
        </div>
        <div>
          <dt className="c-lbl">Hoa hồng trên đơn hoàn tất</dt>
          <dd className="m-0">{k.commissionRate}%</dd>
        </div>
        <div>
          <dt className="c-lbl">Quyền dùng lại nội dung</dt>
          <dd className="m-0">{k.usageRightsMonths ? `${k.usageRightsMonths} tháng` : "Không có"}</dd>
        </div>
        <div>
          <dt className="c-lbl">Độc quyền</dt>
          <dd className="m-0">{k.exclusivity ?? "Không"}</dd>
        </div>
      </dl>
      {manage ? (
        <button type="button" className="c-btn" onClick={() => setEditing(true)}>
          Sửa hợp đồng
        </button>
      ) : null}
      <ContractFiles creatorId={c.id} contract={k} manage={manage} />
    </div>
  );
}

function ContractFiles({
  creatorId,
  contract,
  manage,
}: {
  creatorId: string;
  contract: Contract;
  manage: boolean;
}) {
  const { act, staffName } = useKoc();
  const [kind, setKind] = useState<ContractFile["kind"]>(contract.files.length ? "appendix" : "contract");
  const [removing, setRemoving] = useState<string | null>(null);

  function upload(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      const url = URL.createObjectURL(file);
      const ok = act(
        {
          type: "addContractFile",
          id: creatorId,
          file: { name: file.name, kind, size: file.size, mime: file.type, url },
        },
        `Đã tải lên ${file.name}`,
      );
      if (!ok) URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="border-t border-line-2 pt-2" role="group" aria-label="Tệp hợp đồng">
      <b>Tệp hợp đồng</b>
      {contract.files.length ? (
        <ul className="m-0 mt-1 list-none p-0">
          {contract.files.map((f) => (
            <li key={f.id} className="flex items-start gap-2 border-t border-line-2 py-2 first:border-t-0">
              <FileText size={18} className="mt-0.5 shrink-0 text-text-weak" aria-hidden />
              <span className="min-w-0 flex-1">
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="c-link break-all">
                    {f.name}
                  </a>
                ) : (
                  <span className="break-all">{f.name}</span>
                )}
                <span className="c-lbl block">
                  {KIND[f.kind]}, {CONTRACT_FILE_TYPES[f.mime] ?? "Tệp"}, {formatSize(f.size)}
                </span>
                <span className="c-lbl block">
                  {staffName(f.uploadedBy)} tải lên {formatDate(f.uploadedAt)}
                  {f.url ? "" : ", tệp mẫu chưa có bản thật"}
                </span>
                {removing === f.id ? (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-err">Gỡ tệp này khỏi hợp đồng?</span>
                    <button
                      type="button"
                      className="c-btn text-err"
                      onClick={() => {
                        if (
                          act({ type: "removeContractFile", id: creatorId, fileId: f.id }, `Đã gỡ ${f.name}`)
                        ) {
                          if (f.url?.startsWith("blob:")) URL.revokeObjectURL(f.url);
                          setRemoving(null);
                        }
                      }}
                    >
                      Gỡ tệp
                    </button>
                    <button type="button" className="c-btn" onClick={() => setRemoving(null)}>
                      Giữ lại
                    </button>
                  </span>
                ) : null}
              </span>
              {f.url ? (
                <a href={f.url} download={f.name} className="c-btn" aria-label={`Tải về ${f.name}`}>
                  Tải về
                </a>
              ) : null}
              {manage && removing !== f.id ? (
                <button
                  type="button"
                  className="c-btn"
                  aria-label={`Gỡ ${f.name}`}
                  onClick={() => setRemoving(f.id)}
                >
                  Gỡ
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-1 text-text-weak">
          Chưa có tệp nào. Tải bản scan hoặc PDF hợp đồng đã ký lên đây.
        </p>
      )}
      {manage ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Loại tệp">
            <select
              className={input}
              value={kind}
              onChange={(e) => setKind(e.target.value as ContractFile["kind"])}
            >
              {Object.entries(KIND).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <label className="c-btn is-blue inline-flex cursor-pointer items-center gap-1">
            <Upload size={15} aria-hidden /> Tải tệp hợp đồng
            <input
              type="file"
              className="sr-only"
              accept={ACCEPT}
              multiple
              aria-label="Chọn tệp hợp đồng"
              onChange={(e) => {
                upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}
      <p className="c-lbl mb-0 mt-2">
        PDF, ảnh JPG, PNG hoặc Word, tối đa 10MB mỗi tệp. Bản demo chỉ giữ tệp trong phiên này; bản thật lưu ở
        kho tệp riêng tư, link xem hết hạn sau vài phút, mỗi lần tải lên, gỡ đều ghi nhật ký.
      </p>
    </div>
  );
}

function ContractForm({ c, onDone }: { c: Creator; onDone: () => void }) {
  const { act } = useKoc();
  const k = c.contract;
  const end = new Date(`${KOC_TODAY}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 6);
  const [f, setF] = useState({
    code: k?.code ?? `HĐ-${c.kind.toUpperCase()}-${KOC_TODAY.slice(2, 4)}${KOC_TODAY.slice(5, 7)}-`,
    status: (k?.status ?? "draft") as Contract["status"],
    startsOn: k?.startsOn ?? KOC_TODAY,
    endsOn: k?.endsOn ?? end.toISOString().slice(0, 10),
    commissionRate: String(k?.commissionRate ?? 3),
    usageRightsMonths: String(k?.usageRightsMonths ?? 6),
    exclusivity: k?.exclusivity ?? "",
  });
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [key]: e.target.value });

  return (
    <form
      aria-label={k ? "Sửa hợp đồng" : "Tạo hợp đồng"}
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = act(
          {
            type: "setContract",
            id: c.id,
            contract: {
              code: f.code,
              status: f.status,
              startsOn: f.startsOn,
              endsOn: f.endsOn,
              commissionRate: Number(f.commissionRate.replace(",", ".")),
              usageRightsMonths: Number(f.usageRightsMonths),
              exclusivity: f.exclusivity.trim() || null,
            },
          },
          k ? "Đã lưu hợp đồng" : "Đã tạo hợp đồng",
        );
        if (ok) onDone();
      }}
    >
      <Field label="Số hợp đồng">
        <input className={input} value={f.code} onChange={set("code")} required maxLength={40} />
      </Field>
      <Field label="Trạng thái">
        <select className={input} value={f.status} onChange={set("status")}>
          {Object.entries(STATUS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Từ ngày">
          <input type="date" className={input} value={f.startsOn} onChange={set("startsOn")} required />
        </Field>
        <Field label="Đến ngày">
          <input type="date" className={input} value={f.endsOn} onChange={set("endsOn")} required />
        </Field>
        <Field label="Hoa hồng (%)">
          <input
            className={input}
            inputMode="decimal"
            value={f.commissionRate}
            onChange={set("commissionRate")}
          />
        </Field>
        <Field label="Dùng lại nội dung (tháng)">
          <input
            className={input}
            inputMode="numeric"
            value={f.usageRightsMonths}
            onChange={set("usageRightsMonths")}
          />
        </Field>
      </div>
      <Field label="Độc quyền (bỏ trống nếu không có)">
        <input className={input} value={f.exclusivity} onChange={set("exclusivity")} maxLength={200} />
      </Field>
      <div className="flex gap-1.5">
        <button type="submit" className="c-btn is-go">
          Lưu hợp đồng
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}
