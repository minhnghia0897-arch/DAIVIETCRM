"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { HANDOFF_LABEL } from "@/lib/ai/labels";

// Cài đặt, Trợ lý AI bản thật (Owner chốt 12/10/2026): bật tắt tự trả lời theo kênh, chi phí tháng, hỏi thử, kiến
// thức cho AI, dữ liệu AI đang dùng, nhật ký lượt AI gần đây.

type Result = { ok: boolean; message: string };

export interface AiRunRow {
  id: string;
  at: string;
  customer: string;
  channel: string;
  conversationId: string;
  status: string;
  reason: string | null;
  summary: string | null;
  error: string | null;
  costVnd: number;
}

export interface AiKnowledgeRow {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  sort: number;
}

interface Preview extends Result {
  action?: "reply" | "handoff" | "none";
  reply?: string;
  reason?: string | null;
  createLead?: boolean;
  summary?: string;
}

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const money = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} đ`;
const time = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));

const TOPICS = [
  "Địa chỉ, đường đi, chỗ đậu xe",
  "Giờ mở cửa, ngày nghỉ",
  "Giao hàng, lắp đặt, thời gian giao",
  "Bảo hành, đổi trả",
  "Thanh toán, đặt cọc (AI không gửi số tài khoản)",
  "Khách ở nước ngoài mua tặng người thân",
  "Điểm mạnh từng dòng ghế, cách chọn",
];

export function AiSettingsLive({
  status,
  knowledge,
  dataPreview,
  productCount,
  offerCount,
  runs,
  readOnly,
  actions,
}: {
  status: {
    connected: boolean;
    integrationStatus: string;
    model: string;
    channels: string[];
    channelReady: { messenger: boolean; zalo: boolean };
    budget: number;
    spent: number;
    replied: number;
    handedOff: number;
    failed: number;
  };
  knowledge: AiKnowledgeRow[];
  dataPreview: string;
  productCount: number;
  offerCount: number;
  runs: AiRunRow[];
  readOnly: boolean;
  actions: {
    setAutoReplyChannels(i: { channels: ("messenger" | "zalo")[] }): Promise<Result>;
    saveKnowledge(i: {
      id?: string;
      title: string;
      body: string;
      isActive?: boolean;
      sort?: number;
    }): Promise<Result>;
    deleteKnowledge(i: { id: string }): Promise<Result>;
    previewAi(i: { text: string }): Promise<Preview>;
  };
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sample, setSample] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  // Công tắc đổi ngay khi bấm; lưu lỗi thì quay về giá trị server.
  const serverChannels = status.channels.join(",");
  const [seen, setSeen] = useState(serverChannels);
  const [channels, setChannels] = useState(status.channels);
  if (seen !== serverChannels) {
    setSeen(serverChannels);
    setChannels(status.channels);
  }

  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) router.refresh();
      after?.(r);
    });

  const toggle = (ch: "messenger" | "zalo", on: boolean) => {
    const next = new Set(channels as ("messenger" | "zalo")[]);
    if (on) next.add(ch);
    else next.delete(ch);
    setChannels([...next]);
    run(
      () => actions.setAutoReplyChannels({ channels: [...next] }),
      (r) => !r.ok && setChannels(status.channels),
    );
  };
  const pct = status.budget ? Math.min(100, Math.round((status.spent / status.budget) * 100)) : 0;

  return (
    <div className="space-y-4">
      <section className="c-card" aria-label="Tự trả lời">
        <div className="c-ch">
          <h2 className="flex items-center gap-1.5">
            <Bot size={16} aria-hidden /> Tự trả lời tin nhắn
          </h2>
          <span className={`c-pill ${status.connected ? "is-ok" : "is-n"}`}>
            {status.connected ? "Đã kết nối" : "Chưa kết nối"}
          </span>
        </div>
        <div className="c-cb space-y-3 text-sm">
          {status.connected ? (
            <p className="text-text-weak">
              Mô hình: {status.model}. AI trả lời trước mọi tin của khách trên kênh được bật; chuyển cho nhân
              viên khi khẩn cấp, khách cần gọi, hỏi sức khỏe, xin giảm giá hoặc AI không biết. Khách để số,
              xin gọi, muốn mua thì tự thành lead và tính hạn gọi như lead mới.
            </p>
          ) : (
            <p className="text-text-weak">
              Chưa kết nối Trợ lý AI. Owner dán API key Anthropic ở{" "}
              <Link href="/settings/integrations" className="underline">
                Cài đặt, Tích hợp
              </Link>
              , mục Trợ lý AI, rồi quay lại đây bật từng kênh.
            </p>
          )}
          <fieldset className="flex flex-wrap gap-4" disabled={readOnly || pending || !status.connected}>
            <legend className="sr-only">Kênh AI tự trả lời</legend>
            {(
              [
                ["messenger", "Tin nhắn Facebook (Messenger)"],
                ["zalo", "Zalo OA"],
              ] as const
            ).map(([ch, label]) => (
              <label key={ch} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`AI tự trả lời ${label}`}
                  checked={channels.includes(ch)}
                  onChange={(e) => toggle(ch, e.target.checked)}
                />
                <span>
                  {label}
                  {!status.channelReady[ch] ? (
                    <span className="ml-1 text-text-weak">
                      (kênh chưa kết nối hoặc đang trả lời ở công cụ khác)
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
          <div>
            <div className="flex justify-between text-text-weak">
              <span>
                Chi phí tháng này: <b className="text-text">{money(status.spent)}</b>
                {status.budget ? ` / giới hạn ${money(status.budget)}` : ""}
              </span>
              <span>
                {status.replied} lượt trả lời · {status.handedOff} lượt chuyển người
                {status.failed ? ` · ${status.failed} lỗi` : ""}
              </span>
            </div>
            {status.budget ? (
              <div
                className="mt-1 h-1.5 rounded bg-line"
                role="progressbar"
                aria-label="Chi phí AI tháng này so với giới hạn"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-1.5 rounded"
                  style={{ width: `${pct}%`, background: pct >= 90 ? "var(--err)" : "#7c4dff" }}
                />
              </div>
            ) : null}
            <p className="mt-1 text-xs text-text-weak">
              Chạm giới hạn thì AI tự dừng, tin mới chuyển cho nhân viên. Sửa giới hạn, tỷ giá, mô hình ở Cài
              đặt, Tích hợp.
            </p>
          </div>
        </div>
      </section>

      <section className="c-card" aria-label="Hỏi thử AI">
        <div className="c-ch">
          <h2>Hỏi thử</h2>
        </div>
        <form
          className="c-cb space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sample.trim()) return;
            start(async () => {
              const r = await actions.previewAi({ text: sample });
              setPreview(r);
              if (!r.ok) toast(r.message, "err");
            });
          }}
        >
          <label className="c-lbl">
            Tin của khách (không gửi cho ai, tính chi phí như một lượt thật)
            <textarea
              aria-label="Tin của khách để hỏi thử"
              rows={2}
              maxLength={2000}
              value={sample}
              disabled={readOnly || !status.connected}
              placeholder="Ví dụ: Ghế DV-X9 giá bao nhiêu, giao ra Nghệ An mất mấy ngày?"
              onChange={(e) => setSample(e.target.value)}
              className={FIELD}
            />
          </label>
          <button
            type="submit"
            className="c-btn is-blue"
            disabled={readOnly || pending || !status.connected || !sample.trim()}
          >
            {pending ? "Đang hỏi…" : "Hỏi thử"}
          </button>
          {preview?.ok ? (
            <div
              className="rounded-control border border-line p-2 text-sm"
              role="region"
              aria-label="AI trả lời thử"
            >
              <p className="text-text-weak">{preview.message}</p>
              {preview.action === "none" ? (
                <p>AI thấy tin này không cần trả lời.</p>
              ) : (
                <p className="mt-1 whitespace-pre-wrap">{preview.reply}</p>
              )}
              {preview.action === "handoff" ? (
                <p className="mt-1">
                  <b>Chuyển cho nhân viên:</b> {HANDOFF_LABEL[preview.reason ?? ""] ?? "AI chưa trả lời được"}
                  {preview.createLead ? " · tự thành lead, tính hạn gọi" : ""}
                </p>
              ) : null}
              {preview.summary ? (
                <p className="mt-1 text-text-weak">Tóm tắt cho nhân viên: {preview.summary}</p>
              ) : null}
            </div>
          ) : null}
        </form>
      </section>

      <section className="c-card" aria-label="Kiến thức cho AI">
        <div className="c-ch">
          <h2>Kiến thức cho AI</h2>
        </div>
        <div className="c-cb space-y-3 text-sm">
          <p className="text-text-weak">
            AI chỉ trả lời theo phần này cùng sản phẩm, giá, chính sách đang chạy trong CRM. Nên có:{" "}
            {TOPICS.join("; ")}.
          </p>
          {knowledge.map((k) => (
            <KnowledgeItem
              key={k.id}
              item={k}
              readOnly={readOnly}
              pending={pending}
              run={run}
              actions={actions}
            />
          ))}
          {readOnly ? null : (
            <form
              aria-label="Thêm kiến thức"
              className="space-y-2 rounded-control border border-dashed border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () => actions.saveKnowledge({ ...draft, sort: knowledge.length }),
                  (r) => r.ok && setDraft({ title: "", body: "" }),
                );
              }}
            >
              <label className="c-lbl">
                Tiêu đề
                <input
                  aria-label="Tiêu đề kiến thức mới"
                  maxLength={120}
                  value={draft.title}
                  placeholder="Ví dụ: Địa chỉ và giờ mở cửa"
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className={FIELD}
                />
              </label>
              <label className="c-lbl">
                Nội dung
                <textarea
                  aria-label="Nội dung kiến thức mới"
                  rows={4}
                  maxLength={8000}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  className={FIELD}
                />
              </label>
              <button
                type="submit"
                className="c-btn is-blue"
                disabled={pending || !draft.title.trim() || !draft.body.trim()}
              >
                Thêm kiến thức
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="c-card" aria-label="Dữ liệu AI đang dùng">
        <div className="c-ch">
          <h2>Dữ liệu AI đang dùng</h2>
        </div>
        <div className="c-cb text-sm">
          <p className="text-text-weak">
            {productCount} sản phẩm có giá niêm yết, {offerCount} ưu đãi và chính sách đang áp cho kênh
            online. Sửa ở Sản phẩm, Chính sách; AI dùng ngay từ tin sau.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Xem toàn bộ dữ liệu gửi cho AI</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-control bg-surface-2 p-2 text-xs">
              {dataPreview}
            </pre>
          </details>
        </div>
      </section>

      <section className="c-card" aria-label="Nhật ký AI">
        <div className="c-ch">
          <h2>Nhật ký gần đây</h2>
        </div>
        <div className="c-cb">
          {runs.length ? (
            <ul className="divide-y divide-line text-sm">
              {runs.map((r) => (
                <li key={r.id} className="py-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/inbox?c=${r.conversationId}`} className="font-medium underline">
                      {r.customer}
                    </Link>
                    <span className="text-text-weak">
                      {r.channel} · {time(r.at)} · {money(r.costVnd)}
                    </span>
                  </div>
                  <p>
                    {r.status}
                    {r.reason ? `: ${r.reason}` : ""}
                    {r.error ? <span className="text-text-weak"> ({r.error})</span> : null}
                  </p>
                  {r.summary ? <p className="text-text-weak">{r.summary}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-weak">Chưa có lượt AI nào.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function KnowledgeItem({
  item,
  readOnly,
  pending,
  run,
  actions,
}: {
  item: AiKnowledgeRow;
  readOnly: boolean;
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
  actions: {
    saveKnowledge(i: {
      id?: string;
      title: string;
      body: string;
      isActive?: boolean;
      sort?: number;
    }): Promise<Result>;
    deleteKnowledge(i: { id: string }): Promise<Result>;
  };
}) {
  const [v, setV] = useState({ title: item.title, body: item.body });
  const dirty = v.title !== item.title || v.body !== item.body;
  return (
    <form
      aria-label={`Kiến thức ${item.title}`}
      className={`space-y-2 rounded-control border border-line p-2 ${item.isActive ? "" : "opacity-60"}`}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => actions.saveKnowledge({ id: item.id, ...v, isActive: item.isActive, sort: item.sort }));
      }}
    >
      <input
        aria-label="Tiêu đề"
        maxLength={120}
        disabled={readOnly}
        value={v.title}
        onChange={(e) => setV({ ...v, title: e.target.value })}
        className={`${FIELD} font-medium`}
      />
      <textarea
        aria-label="Nội dung"
        rows={Math.min(10, Math.max(3, v.body.split("\n").length))}
        maxLength={8000}
        disabled={readOnly}
        value={v.body}
        onChange={(e) => setV({ ...v, body: e.target.value })}
        className={FIELD}
      />
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="c-btn is-blue" disabled={pending || !dirty}>
            Lưu
          </button>
          <button
            type="button"
            className="c-btn"
            disabled={pending}
            onClick={() =>
              run(() =>
                actions.saveKnowledge({ id: item.id, ...v, isActive: !item.isActive, sort: item.sort }),
              )
            }
          >
            {item.isActive ? "Tạm ẩn với AI" : "Cho AI dùng lại"}
          </button>
          <button
            type="button"
            className="c-btn"
            style={{ color: "var(--err)" }}
            disabled={pending}
            onClick={() => run(() => actions.deleteKnowledge({ id: item.id }))}
          >
            Xóa
          </button>
        </div>
      )}
    </form>
  );
}
