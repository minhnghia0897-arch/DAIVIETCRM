"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { useShell } from "../shell-context";
import { useCrm, type Settings } from "../store";

// Các mục Cài đặt chạy bằng dữ liệu mô phỏng (CLAUDE.md 11.2). Mỗi thay đổi ghi nhật ký kiểm toán.

function useSave() {
  const { act } = useCrm();
  const { me } = useShell();
  return (patch: Partial<Settings>, label: string, detail = "") =>
    act(
      { type: "setSettings", patch, actor: me, label, detail },
      `Đã lưu: ${label}${detail ? `, ${detail}` : ""}`,
    );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="c-card" aria-label={title}>
      <div className="c-ch">
        <h2>{title}</h2>
        {note ? <span className="c-r c-lbl">{note}</span> : null}
      </div>
      <div className="c-cb">{children}</div>
    </section>
  );
}

const input = "rounded-control border border-line bg-surface px-2 py-1";

// ---------------------------------------------------------------------------
// Phân lead và SLA
// ---------------------------------------------------------------------------

export function AssignmentSettings() {
  const { state } = useCrm();
  const save = useSave();
  const [sla, setSla] = useState(state.settings.slaMinutes);
  const [max, setMax] = useState(state.settings.maxUncontacted);
  return (
    <Card title="Phân lead" note="Chế độ tháng 1: vòng tròn">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            { slaMinutes: sla, maxUncontacted: max },
            "Sửa luật phân lead",
            `SLA ${sla} phút, tối đa ${max} lead chưa gọi`,
          );
        }}
      >
        <p className="m-0">
          Lead mới chia vòng tròn cho người có quyền <b>Được phân lead</b>, đang trực và không nghỉ. Lead đến
          ngoài khung gọi của thị trường khách thì chờ tới đầu khung mới giao; lead đang chờ không tính vào
          giới hạn.
        </p>
        <label className="flex flex-wrap items-center gap-2">
          SLA liên hệ đầu tiên
          <input
            aria-label="SLA phút"
            type="number"
            min={1}
            max={120}
            value={sla}
            onChange={(e) => setSla(Math.max(1, Number(e.target.value) || 1))}
            className={`${input} w-20`}
          />
          phút trong giờ làm việc
        </label>
        <label className="flex flex-wrap items-center gap-2">
          Bỏ qua người đang có quá
          <input
            aria-label="Giới hạn lead chưa gọi"
            type="number"
            min={1}
            max={50}
            value={max}
            onChange={(e) => setMax(Math.max(1, Number(e.target.value) || 1))}
            className={`${input} w-20`}
          />
          lead chưa liên hệ
        </label>
        <button type="submit" className="c-btn is-brand">
          Lưu
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Thị trường
// ---------------------------------------------------------------------------

export function MarketSettings() {
  const { state } = useCrm();
  const save = useSave();
  const markets = state.settings.markets;
  const setMarket = (code: string, patch: Partial<Settings["markets"][number]>, detail: string) =>
    save(
      { markets: markets.map((m) => (m.code === code ? { ...m, ...patch } : m)) },
      "Sửa thị trường",
      detail,
    );
  return (
    <Card title="Thị trường" note="Khung gọi theo giờ địa phương của khách">
      <div className="c-tw">
        <table className="c-table">
          <thead>
            <tr>
              <th>Thị trường</th>
              <th>Múi giờ</th>
              <th>Ngày thường</th>
              <th>Cuối tuần</th>
              <th>Kênh được phép</th>
              <th>Bật</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.code}>
                <td>
                  <b>{m.name}</b> <span className="c-lbl">{m.code}</span>
                </td>
                <td className="c-lbl">{m.timezone}</td>
                {(["weekday", "weekend"] as const).map((k) => (
                  <td key={k}>
                    <span className="flex items-center gap-1">
                      {[0, 1].map((i) => (
                        <input
                          key={i}
                          aria-label={`${m.name} ${k === "weekday" ? "ngày thường" : "cuối tuần"} ${i ? "kết thúc" : "bắt đầu"}`}
                          type="time"
                          value={m[k][i]}
                          onChange={(e) => {
                            const v: [string, string] = [...m[k]] as [string, string];
                            v[i] = e.target.value;
                            setMarket(
                              m.code,
                              { [k]: v },
                              `${m.name}: khung ${k === "weekday" ? "ngày thường" : "cuối tuần"} ${v[0]}–${v[1]}`,
                            );
                          }}
                          className={input}
                        />
                      ))}
                    </span>
                  </td>
                ))}
                <td className="whitespace-normal c-lbl">{m.channels.join(", ")}</td>
                <td>
                  <Switch
                    label={`Bật thị trường ${m.name}`}
                    checked={m.active}
                    disabled={m.code === "VN"}
                    onCheckedChange={(v) =>
                      setMarket(m.code, { active: v }, `${v ? "Bật" : "Tắt"} ${m.name}`)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="c-lbl mt-2 mb-0">
        Thêm thị trường mới không cần sửa code: thêm một dòng với múi giờ và khung gọi. ZNS chỉ dùng cho số
        Việt Nam.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ca trực
// ---------------------------------------------------------------------------

export function ShiftSettings() {
  const { state } = useCrm();
  const save = useSave();
  const shifts = state.settings.shifts;
  return (
    <Card title="Ca trực" note="Giờ Việt Nam">
      <div className="c-tw">
        <table className="c-table">
          <thead>
            <tr>
              <th>Ca</th>
              <th>Ngày</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
              <th>Người trong ca</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((sh) => (
              <tr key={sh.id}>
                <td>
                  <b>{sh.name}</b>
                </td>
                <td>{sh.days}</td>
                {(["start", "end"] as const).map((k) => (
                  <td key={k}>
                    <input
                      aria-label={`${sh.name} ${k === "start" ? "bắt đầu" : "kết thúc"}`}
                      type="time"
                      value={sh[k]}
                      onChange={(e) =>
                        save(
                          { shifts: shifts.map((x) => (x.id === sh.id ? { ...x, [k]: e.target.value } : x)) },
                          "Sửa ca trực",
                          `${sh.name} ${k === "start" ? "bắt đầu" : "kết thúc"} ${e.target.value}`,
                        )
                      }
                      className={input}
                    />
                  </td>
                ))}
                <td>
                  <span className="flex flex-wrap gap-1">
                    {["Thảo", "An", "My"].map((p) => {
                      const on = sh.members.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={on}
                          className={`c-btn ${on ? "is-brand" : ""}`}
                          onClick={() =>
                            save(
                              {
                                shifts: shifts.map((x) =>
                                  x.id === sh.id
                                    ? {
                                        ...x,
                                        members: on ? x.members.filter((m) => m !== p) : [...x.members, p],
                                      }
                                    : x,
                                ),
                              },
                              "Sửa người trong ca",
                              `${on ? "Bỏ" : "Thêm"} ${p} ${on ? "khỏi" : "vào"} ${sh.name}`,
                            )
                          }
                        >
                          {p}
                        </button>
                      );
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="c-lbl mt-2 mb-0">
        Ca tối 16:30–21:00 phủ khung gọi tốt của khách ở Hàn (19:00–22:30 giờ Hàn). Ngoài mọi ca, SLA tính từ
        đầu ca kế tiếp.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Luật sinh việc
// ---------------------------------------------------------------------------

export function TaskRuleSettings() {
  const { state } = useCrm();
  const save = useSave();
  const rules = state.settings.taskRules;
  return (
    <Card title="Luật sinh việc" note="Việc tự sinh vào Việc cần làm">
      <div className="c-tw">
        <table className="c-table">
          <thead>
            <tr>
              <th>Luật</th>
              <th>Khi</th>
              <th>Hạn</th>
              <th>Giao cho</th>
              <th>Bật</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.key}>
                <td>
                  <b>{r.label}</b>
                </td>
                <td>{r.trigger}</td>
                <td>{r.due}</td>
                <td>{r.assignee}</td>
                <td>
                  <Switch
                    label={r.label}
                    checked={r.active}
                    onCheckedChange={(v) =>
                      save(
                        { taskRules: rules.map((x) => (x.key === r.key ? { ...x, active: v } : x)) },
                        v ? "Bật luật sinh việc" : "Tắt luật sinh việc",
                        r.label,
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chế độ gọi
// ---------------------------------------------------------------------------

export function CallModeSettings() {
  const { state } = useCrm();
  const save = useSave();
  const mode = state.settings.callMode;
  return (
    <Card title="Chế độ gọi">
      <div className="space-y-2" role="radiogroup" aria-label="Chế độ gọi">
        {(
          [
            [
              "external",
              "Gọi ngoài hệ thống",
              "Chưa có tổng đài. Người giữ lead bấm Gọi thì thấy số đầy đủ của đúng lead đó, mỗi lần xem số đều ghi nhật ký.",
            ],
            [
              "provider",
              "Qua tổng đài",
              "Nút Gọi gọi qua tổng đài, nhân viên không cần thấy số. Có ghi âm khi nhà cung cấp hỗ trợ.",
            ],
          ] as const
        ).map(([k, label, note]) => (
          <label key={k} className="flex items-start gap-2 rounded-control border border-line p-2.5">
            <input
              type="radio"
              name="call-mode"
              checked={mode === k}
              onChange={() => save({ callMode: k }, "Đổi chế độ gọi", label)}
              className="mt-1"
            />
            <span>
              <b>{label}</b>
              <span className="c-lbl block">{note}</span>
            </span>
          </label>
        ))}
      </div>
      {mode === "provider" ? (
        <p className="mt-2 mb-0 rounded-control bg-warn-soft px-2.5 py-2 text-warn">
          Nhắc: vào Phân quyền tắt quyền <b>Xem số của lead được giao</b> của vai trò Telesale, vì gọi qua
          tổng đài không cần thấy số.
        </p>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Danh mục
// ---------------------------------------------------------------------------

export function CatalogSettings() {
  const { state } = useCrm();
  const { can } = useShell();
  const save = useSave();
  const catalogs = state.settings.catalogs;
  const [tab, setTab] = useState(Object.keys(catalogs)[0]);
  const [label, setLabel] = useState("");
  const manage = can("catalog.manage");
  const cat = catalogs[tab];
  const setItems = (items: typeof cat.items, action: string, detail: string) =>
    save({ catalogs: { ...catalogs, [tab]: { ...cat, items } } }, action, `${cat.title}: ${detail}`);

  return (
    <Card title="Danh mục tra cứu" note="Ẩn mục cũ thay vì xóa để giữ lịch sử">
      <div className="c-ftabs mb-3" role="tablist">
        {Object.entries(catalogs).map(([k, c]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="c-ftab"
            onClick={() => setTab(k)}
          >
            {c.title}
          </button>
        ))}
      </div>
      <ul className="m-0 list-none p-0">
        {cat.items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 border-t border-line-2 py-1.5 first:border-t-0">
            <span className={`flex-1 ${it.active ? "" : "text-text-weak line-through"}`}>{it.label}</span>
            {manage ? (
              <Switch
                label={`Dùng ${it.label}`}
                checked={it.active}
                onCheckedChange={(v) =>
                  setItems(
                    cat.items.map((x) => (x.id === it.id ? { ...x, active: v } : x)),
                    v ? "Bật mục danh mục" : "Ẩn mục danh mục",
                    it.label,
                  )
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      {manage ? (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = label.trim();
            if (!v || cat.items.some((x) => x.label === v)) return;
            setItems(
              [...cat.items, { id: `${tab}-${cat.items.length + 1}`, label: v, active: true }],
              "Thêm mục danh mục",
              v,
            );
            setLabel("");
          }}
        >
          <input
            aria-label={`Thêm vào ${cat.title}`}
            placeholder={`Thêm vào ${cat.title.toLowerCase()}…`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${input} min-w-0 flex-1`}
          />
          <button type="submit" className="c-btn">
            Thêm
          </button>
        </form>
      ) : null}
    </Card>
  );
}

export { IntegrationSettings } from "./integrations";

// ---------------------------------------------------------------------------
// Nhật ký kiểm toán
// ---------------------------------------------------------------------------

export function AuditLogView() {
  const { state } = useCrm();
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const actors = [...new Set(state.audit.map((a) => a.actor))];
  const rows = state.audit.filter(
    (a) =>
      (!who || a.actor === who) &&
      (!q || `${a.action} ${a.entity} ${a.detail}`.toLowerCase().includes(q.toLowerCase())),
  );
  const reveals = state.audit.filter((a) => a.action === "Xem số điện thoại");
  return (
    <Card title="Nhật ký kiểm toán" note="Không sửa, không xóa được">
      <div className="mb-2 flex flex-wrap gap-2">
        <select
          aria-label="Người thao tác"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className={input}
        >
          <option value="">Mọi người</option>
          {actors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <input
          aria-label="Lọc hành động"
          placeholder="Lọc theo hành động, đối tượng…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${input} min-w-0 flex-1`}
        />
        <span className="c-pill is-n self-center">Lượt xem số hôm nay: {reveals.length}</span>
      </div>
      <div className="c-tw">
        <table className="c-table">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Người</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="tabular">{a.time}</td>
                <td>{a.actor}</td>
                <td>{a.action}</td>
                <td>{a.entity}</td>
                <td className="whitespace-normal c-lbl">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="c-lbl mt-2 mb-0">Nhật ký không chứa số điện thoại đầy đủ hay nội dung tin nhắn.</p>
    </Card>
  );
}
