"use client";

import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { STAFF } from "@/lib/demo/data";
import { formatMoneyShort } from "@/lib/format";
import { KOC_MANAGE } from "@/lib/koc/actions";
import { KOC_TODAY } from "@/lib/koc/data";
import {
  AUDIENCE_LABEL,
  KIND_LABEL,
  PLATFORM_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  creatorStats,
  formatFollowers,
  formatRoas,
  maxFollowers,
  suggestCode,
  tierOf,
} from "@/lib/koc/logic";
import type { AudienceMarket, CreatorKind, PartnerStatus, Platform } from "@/lib/koc/types";

import { PageHead } from "../parts";
import { useKoc } from "./provider";

// Danh sách KOL, KOC: ai đang hợp tác, khán giả ở đâu, kênh nào, mang về bao nhiêu lead, đơn, doanh thu.

const input = "rounded-control border border-line bg-surface px-2 py-1";
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
};

export function KocList() {
  const { data, who } = useKoc();
  const [kind, setKind] = useState<CreatorKind | "all">("all");
  const [audience, setAudience] = useState<AudienceMarket | "all">("all");
  const [status, setStatus] = useState<PartnerStatus | "all">("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const total = useMemo(() => creatorStats(data, null), [data]);
  const since30 = addDays(KOC_TODAY, -30).slice(0, 10);
  const recent = useMemo(() => creatorStats(data, null, since30), [data, since30]);
  const soon = data.bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.postAt >= addDays(KOC_TODAY, 0) &&
      b.postAt < addDays(KOC_TODAY, 8) &&
      !b.posts.length,
  ).length;

  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  const rows = data.creators.filter(
    (c) =>
      (kind === "all" || c.kind === kind) &&
      (audience === "all" || c.audience === audience) &&
      (status === "all" || c.status === status) &&
      (!q.trim() ||
        fold(
          `${c.name} ${c.realName} ${c.trackingCode} ${c.channels.map((ch) => ch.handle).join(" ")}`,
        ).includes(fold(q.trim()))),
  );
  const canAdd = !who.readOnly && who.perms.has(KOC_MANAGE);

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Clapperboard} color="var(--obj-lead)" kicker="Đối tác nội dung" title="KOL, KOC">
          {canAdd ? (
            <button type="button" className="c-btn is-blue" onClick={() => setAdding((v) => !v)}>
              Thêm KOL, KOC
            </button>
          ) : null}
        </PageHead>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Đang hợp tác</span>
            <strong>{data.creators.filter((c) => c.status === "active").length}</strong>
          </div>
          <div>
            <span className="c-lbl">Bài sắp đăng 7 ngày tới</span>
            <strong>{soon}</strong>
          </div>
          <div>
            <span className="c-lbl">Lead 30 ngày qua</span>
            <strong>{recent.leads}</strong>
          </div>
          <div>
            <span className="c-lbl">Còn phải trả</span>
            <strong>{formatMoneyShort(total.owed)}</strong>
          </div>
        </div>
      </section>

      {adding ? <AddCreator onDone={() => setAdding(false)} /> : null}

      <section className="c-card" aria-label="Danh sách KOL, KOC">
        <div className="c-cb flex flex-wrap items-center gap-2">
          <input
            className={`${input} min-w-48 flex-1`}
            placeholder="Tìm theo tên, tài khoản, mã giới thiệu"
            aria-label="Tìm KOL, KOC"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            aria-label="Loại"
            className={input}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="all">Mọi loại</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Khán giả"
            className={input}
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
          >
            <option value="all">Mọi khán giả</option>
            {Object.entries(AUDIENCE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Trạng thái"
            className={input}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">Mọi trạng thái</option>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <p className="c-lbl mx-4 mb-1 mt-0">
          {rows.length} người, chỉ số tính trên lead và đơn có mã giới thiệu của từng người
        </p>
        {rows.length ? (
          <div className="c-tw">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Loại</th>
                  <th>Khán giả</th>
                  <th>Kênh</th>
                  <th>Trạng thái</th>
                  <th>Phụ trách</th>
                  <th className="text-right">Lead</th>
                  <th className="text-right">Đơn</th>
                  <th className="text-right">Doanh thu</th>
                  <th className="text-right">Hoàn vốn</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = creatorStats(data, c.id);
                  const top = [...c.channels].sort((a, b) => b.followers - a.followers)[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/kol/${c.id}`} className="c-link font-semibold">
                          {c.name}
                        </Link>
                        <span className="c-lbl block">Mã {c.trackingCode}</span>
                      </td>
                      <td>{KIND_LABEL[c.kind]}</td>
                      <td>
                        <span className={`c-loc ${c.audience === "KR" ? "is-kr" : "is-vn"}`}>
                          {AUDIENCE_LABEL[c.audience]}
                        </span>
                      </td>
                      <td>
                        {top
                          ? `${PLATFORM_LABEL[top.platform]} ${formatFollowers(top.followers)}`
                          : "Chưa có kênh"}
                        <span className="c-lbl block">{tierOf(maxFollowers(c)).split(" (")[0]}</span>
                      </td>
                      <td>
                        <span className={`c-pill ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td>{STAFF.find((st) => st.id === c.ownerId)?.fullName ?? "Chưa giao"}</td>
                      <td className="text-right tabular">{s.leads}</td>
                      <td className="text-right tabular">{s.orders}</td>
                      <td className="text-right tabular">{s.revenue ? formatMoneyShort(s.revenue) : "0"}</td>
                      <td className="text-right tabular">{formatRoas(s.roas)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-empty">Không có KOL, KOC nào khớp bộ lọc. Bỏ bớt điều kiện lọc để xem thêm.</p>
        )}
      </section>
    </div>
  );
}

function AddCreator({ onDone }: { onDone: () => void }) {
  const { data, act } = useKoc();
  const router = useRouter();
  const taken = useMemo(() => new Set(data.creators.map((c) => c.trackingCode)), [data.creators]);
  const [f, setF] = useState({
    name: "",
    realName: "",
    kind: "koc" as CreatorKind,
    audience: "VN" as AudienceMarket,
    livesIn: "",
    niches: "",
    platform: "tiktok" as Platform,
    handle: "",
    followers: "",
    videoPrice: "",
    phone: "",
    code: "",
    ownerId: STAFF[1]?.id ?? "",
    note: "",
  });
  const code = f.code || (f.name.trim() ? suggestCode(f.name, taken) : "");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = f.phone.replace(/\D/g, "");
    const ok = act(
      {
        type: "addCreator",
        creator: {
          name: f.name.trim(),
          realName: f.realName.trim(),
          kind: f.kind,
          status: "prospect",
          ownerId: f.ownerId,
          audience: f.audience,
          livesIn: f.livesIn.trim(),
          niches: f.niches
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          channels: [
            {
              platform: f.platform,
              handle: f.handle.trim(),
              url: "",
              followers: Number(f.followers) || 0,
              avgViews: 0,
              engagementRate: 0,
              updatedAt: KOC_TODAY,
            },
          ],
          rates: Number(f.videoPrice)
            ? [{ format: "short_video", price: Number(f.videoPrice) * 1_000_000 }]
            : [],
          contract: null,
          trackingCode: code,
          phoneMasked: digits.length >= 6 ? `${digits.slice(0, 3)}•••${digits.slice(-3)}` : "Chưa có",
          phoneFull: f.phone.trim(),
          zalo: false,
          agency: null,
          tags: [],
          note: f.note.trim(),
        },
      },
      `Đã thêm ${f.name.trim()}`,
    );
    if (ok) {
      onDone();
      router.push(`/kol/kc-${data.creators.length + 1}`);
    }
  }

  return (
    <form className="c-card c-cb" aria-label="Thêm KOL, KOC" onSubmit={submit}>
      <b>Thêm KOL, KOC</b>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tên hiển thị">
          <input className={input} value={f.name} onChange={set("name")} required maxLength={80} />
        </Field>
        <Field label="Tên thật">
          <input className={input} value={f.realName} onChange={set("realName")} maxLength={80} />
        </Field>
        <Field label="Loại">
          <select className={input} value={f.kind} onChange={set("kind")}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Khán giả chính">
          <select className={input} value={f.audience} onChange={set("audience")}>
            {Object.entries(AUDIENCE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nền tảng chính">
          <select className={input} value={f.platform} onChange={set("platform")}>
            {Object.entries(PLATFORM_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tài khoản">
          <input className={input} value={f.handle} onChange={set("handle")} placeholder="@ten.tai.khoan" />
        </Field>
        <Field label="Người theo dõi">
          <input className={input} inputMode="numeric" value={f.followers} onChange={set("followers")} />
        </Field>
        <Field label="Giá video ngắn (triệu)">
          <input className={input} inputMode="decimal" value={f.videoPrice} onChange={set("videoPrice")} />
        </Field>
        <Field label="Đang sống ở">
          <input
            className={input}
            value={f.livesIn}
            onChange={set("livesIn")}
            placeholder="Ví dụ: Ansan, Hàn Quốc"
          />
        </Field>
        <Field label="Chủ đề (cách nhau dấu phẩy)">
          <input className={input} value={f.niches} onChange={set("niches")} />
        </Field>
        <Field label="Số điện thoại">
          <input className={input} value={f.phone} onChange={set("phone")} inputMode="tel" />
        </Field>
        <Field label="Mã giới thiệu">
          <input
            className={input}
            value={code}
            onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
            maxLength={12}
          />
        </Field>
        <Field label="Người phụ trách">
          <select className={input} value={f.ownerId} onChange={set("ownerId")}>
            {STAFF.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ghi chú" wide>
          <input className={input} value={f.note} onChange={set("note")} maxLength={500} />
        </Field>
      </div>
      <p className="c-lbl mb-0 mt-2">
        Khách nhắc mã giới thiệu khi gọi, điền vào form, hoặc bấm link có mã thì lead được ghi về người này.
      </p>
      <div className="mt-3 flex gap-1.5">
        <button type="submit" className="c-btn is-go">
          Lưu KOL, KOC
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}

export function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="c-lbl">{label}</span>
      {children}
    </label>
  );
}
