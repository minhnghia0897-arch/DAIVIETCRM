import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Progress } from "@/components/progress";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import {
  type KpiRow,
  monthLabel,
  monthParam,
  monthShort,
  salesProgress,
  shiftMonth,
  teamTotals,
} from "@/lib/sales/credits";
import { ORDER_STATUS_LIVE } from "@/lib/sales/order-labels";

// Doanh số từng sale trên bản thật (Owner chốt 15/10/2026, CLAUDE.md mục 9.3, 9.4): đọc sổ doanh số sales_credits và
// chỉ tiêu targets qua hàm sales_kpi_month. Doanh số = tiền hàng sau giảm của đơn đã cọc xong, ghi cho người bán vào
// tháng cọc; đơn hủy, trả hàng trừ vào tháng hủy. Thành phần chỉ hiển thị, không gọi database.

/** Chuyển tháng: giữ đường dẫn hiện tại, đổi ?thang=. */
export function MonthNav({ month, basePath, current }: { month: string; basePath: string; current: string }) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const href = (m: string) => `${basePath}?thang=${monthParam(m)}`;
  return (
    <nav aria-label="Chọn tháng" className="ml-auto flex items-center gap-1">
      <Link href={href(prev)} className="c-btn" aria-label={`Xem ${monthLabel(prev)}`}>
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <b className="tabular px-1">{monthLabel(month)}</b>
      {next <= current ? (
        <Link href={href(next)} className="c-btn" aria-label={`Xem ${monthLabel(next)}`}>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}

const RULE =
  "Doanh số tính khi khách cọc xong, bằng tiền hàng sau giảm giá (không gồm phí giao, phí lắp). Đơn đã tính mà bị hủy hoặc trả hàng thì trừ vào tháng hủy.";

export function SalesTeamView({
  month,
  current,
  rows,
  meId,
  showNames,
}: {
  month: string;
  current: string;
  rows: KpiRow[];
  meId: string;
  showNames: boolean;
}) {
  const total = teamTotals(rows);
  const p = salesProgress(total.net, total.target);
  return (
    <div className="c-stack">
      <h1 className="sr-only">Đội ngũ</h1>
      <section className="c-card" aria-labelledby="team-sum">
        <div className="c-ch">
          <h2 id="team-sum">Doanh số đã cọc</h2>
          <MonthNav month={month} basePath="/team" current={current} />
        </div>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Doanh số {monthShort(month)}</span>
            <strong>{formatMoneyShort(total.net)}</strong>
          </div>
          <div>
            <span className="c-lbl">Chỉ tiêu cộng lại</span>
            <strong>{total.target ? formatMoneyShort(total.target) : "Chưa đặt"}</strong>
            {p.ratio !== null ? <span className="c-lbl">Đạt {Math.round(p.ratio * 100)}%</span> : null}
          </div>
          <div>
            <span className="c-lbl">Đơn đã cọc</span>
            <strong>{total.orders}</strong>
          </div>
          <div>
            <span className="c-lbl">Trừ do hủy, trả hàng</span>
            <strong className={total.reversed ? "text-err" : undefined}>
              {total.reversed ? formatMoneyShort(total.reversed) : "0"}
            </strong>
          </div>
        </div>
      </section>

      <section className="c-card" aria-labelledby="team-people">
        <div className="c-ch">
          <h2 id="team-people">Từng người</h2>
          <span className="c-lbl ml-auto">Tô màu theo chỉ tiêu, không theo thứ hạng</span>
        </div>
        {rows.length === 0 ? (
          <p className="c-cb m-0 text-text-weak">
            Chưa có ai bán hàng trong {monthLabel(month).toLowerCase()}.
          </p>
        ) : (
          <div className="c-tw">
            <table className="c-table" aria-label={`Doanh số từng người ${monthLabel(month)}`}>
              <thead>
                <tr>
                  <th>Người</th>
                  <th className="text-right">Doanh số đã cọc</th>
                  <th>So với chỉ tiêu</th>
                  <th className="text-right">Chỉ tiêu</th>
                  <th className="text-right">Còn thiếu</th>
                  <th className="text-right">Số đơn</th>
                  <th className="text-right">Trừ do hủy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const pr = salesProgress(r.net, r.target);
                  const self = r.user_id === meId;
                  return (
                    <tr key={r.user_id}>
                      <td>
                        {/* Bảng xếp hạng tắt thì không có tên, cũng không có link sang trang hiện tên. */}
                        {showNames || self ? (
                          <Link
                            href={`/team/people/${r.user_id}?thang=${monthParam(month)}`}
                            className="c-link font-bold"
                          >
                            {showNames ? r.full_name : "Tôi"}
                          </Link>
                        ) : (
                          <b>{`Nhân viên ${i + 1}`}</b>
                        )}
                      </td>
                      <td className="text-right tabular">
                        <b>{formatMoney(r.net)}</b>
                      </td>
                      <td>
                        {pr.ratio !== null ? (
                          <Progress ratio={pr.ratio} label="Doanh số so với chỉ tiêu" />
                        ) : (
                          <span className="c-lbl">Chưa đặt chỉ tiêu</span>
                        )}
                      </td>
                      <td className="text-right tabular">{r.target ? formatMoneyShort(r.target) : "—"}</td>
                      <td className="text-right tabular">
                        {pr.ratio === null ? "—" : pr.remaining ? formatMoneyShort(pr.remaining) : "Đã đạt"}
                      </td>
                      <td className="text-right tabular">{r.orders}</td>
                      <td className={`text-right tabular ${r.reversed ? "text-err" : ""}`}>
                        {r.reversed ? formatMoneyShort(r.reversed) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="c-lbl c-cb m-0">{RULE}</p>
      </section>
    </div>
  );
}

export interface PersonCredit {
  id: string;
  orderId: string;
  code: string | null;
  customer: string | null;
  status: string | null;
  kind: "sale" | "reversal";
  amount: number;
  reason: string | null;
  at: string;
}

export function SalesPersonView({
  month,
  current,
  self,
  name,
  row,
  credits,
  history,
  canSetTarget,
}: {
  month: string;
  current: string;
  self: boolean;
  name: string;
  row: KpiRow;
  credits: PersonCredit[];
  history: { month: string; net: number; target: number | null }[];
  canSetTarget: boolean;
}) {
  const p = salesProgress(row.net, row.target);
  return (
    <div className="c-stack">
      <section className="c-card">
        <div className="c-ch">
          <div className="min-w-0">
            <span className="c-lbl">{self ? "Hiệu suất của tôi" : "Hiệu suất cá nhân"}</span>
            <h1 className="m-0 text-page-title font-extrabold">{name}</h1>
          </div>
          <MonthNav month={month} basePath={`/team/people/${row.user_id}`} current={current} />
        </div>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Doanh số đã cọc {monthShort(month)}</span>
            <strong>{formatMoney(row.net)}</strong>
          </div>
          <div>
            <span className="c-lbl">Chỉ tiêu tháng</span>
            <strong>{row.target ? formatMoney(row.target) : "Chưa đặt"}</strong>
            {p.ratio !== null ? (
              <Progress ratio={p.ratio} label="Doanh số so với chỉ tiêu" />
            ) : canSetTarget ? (
              <Link href={`/team/targets?thang=${monthParam(month)}`} className="c-link text-[13px]">
                Đặt chỉ tiêu
              </Link>
            ) : null}
          </div>
          <div>
            <span className="c-lbl">Còn thiếu</span>
            <strong>{p.ratio === null ? "—" : p.remaining ? formatMoney(p.remaining) : "Đã đạt"}</strong>
          </div>
          <div>
            <span className="c-lbl">Đơn đã cọc</span>
            <strong>{row.orders}</strong>
            {row.reversed ? (
              <span className="c-lbl text-err">Trừ {formatMoney(-row.reversed)} do hủy, trả</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="c-card" aria-labelledby="person-orders">
        <div className="c-ch">
          <h2 id="person-orders">Doanh số từng đơn, {monthLabel(month).toLowerCase()}</h2>
        </div>
        {credits.length === 0 ? (
          <p className="c-cb m-0 text-text-weak">
            Chưa có đơn nào cọc xong trong tháng này. Đơn được tính ngay khi khách cọc xong.
          </p>
        ) : (
          <div className="c-tw">
            <table className="c-table" aria-label="Doanh số từng đơn">
              <thead>
                <tr>
                  <th>Đơn</th>
                  <th>Khách</th>
                  <th>Ghi nhận</th>
                  <th>Trạng thái đơn</th>
                  <th className="text-right">Doanh số</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => {
                  const st = c.status ? ORDER_STATUS_LIVE[c.status] : null;
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.code ? (
                          <Link href={`/orders/${c.orderId}`} className="c-link font-bold">
                            {c.code}
                          </Link>
                        ) : (
                          <span className="c-lbl">Đơn không có quyền xem</span>
                        )}
                      </td>
                      <td>{c.customer ?? "—"}</td>
                      <td className="tabular">
                        {c.at}
                        {c.kind === "reversal" ? (
                          <span className="c-lbl block text-err">{c.reason ?? "Trừ doanh số"}</span>
                        ) : (
                          <span className="c-lbl block">Khách cọc xong</span>
                        )}
                      </td>
                      <td>{st ? st.label : "—"}</td>
                      <td className={`text-right tabular ${c.kind === "reversal" ? "text-err" : ""}`}>
                        <b>
                          {c.kind === "reversal" ? "−" : ""}
                          {formatMoney(Math.abs(c.amount))}
                        </b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    <b>Cộng tháng</b>
                  </td>
                  <td className="text-right tabular">
                    <b>{formatMoney(row.net)}</b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="c-lbl c-cb m-0">{RULE}</p>
      </section>

      {history.length ? (
        <section className="c-card" aria-labelledby="person-history">
          <div className="c-ch">
            <h2 id="person-history">6 tháng gần nhất</h2>
          </div>
          <div className="c-tw">
            <table className="c-table" aria-label="Doanh số 6 tháng gần nhất">
              <thead>
                <tr>
                  <th>Tháng</th>
                  <th className="text-right">Doanh số</th>
                  <th className="text-right">Chỉ tiêu</th>
                  <th>Đạt</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const hp = salesProgress(h.net, h.target);
                  return (
                    <tr key={h.month}>
                      <td>
                        <Link
                          href={`/team/people/${row.user_id}?thang=${monthParam(h.month)}`}
                          className="c-link"
                        >
                          {monthLabel(h.month)}
                        </Link>
                      </td>
                      <td className="text-right tabular">{formatMoney(h.net)}</td>
                      <td className="text-right tabular">{h.target ? formatMoney(h.target) : "—"}</td>
                      <td>{hp.ratio !== null ? <Progress ratio={hp.ratio} label="Đạt chỉ tiêu" /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
