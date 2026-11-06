"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { PageHead } from "../parts";

// Báo cáo bản thật (route /reports). Owner chốt 06/11/2026 bỏ hết số mô phỏng của bản mẫu để làm lại báo cáo từ đầu
// trên dữ liệu thật; bản demo tĩnh vẫn dùng CrmReports (reports.tsx).
export function ReportsLive({
  team,
  kpi,
  units,
}: {
  team: boolean;
  /** Xem doanh số cả đội (kpi.team) hay chỉ của mình (kpi.own); null khi không có quyền nào. */
  kpi: "team" | "own" | null;
  units: boolean;
}) {
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={BarChart3}
          color="var(--brand)"
          kicker={team ? "Cả showroom" : "Của tôi"}
          title="Báo cáo"
        />
        <p className="c-empty">
          Chưa có báo cáo. Phần này đang làm lại từ đầu trên dữ liệu thật của showroom.
          {kpi || units ? (
            <>
              {" "}
              Trong lúc chờ:{" "}
              {kpi ? (
                <Link href="/team" className="c-link">
                  {kpi === "team" ? "doanh số từng người ở Đội ngũ" : "doanh số của tôi ở Hiệu suất của tôi"}
                </Link>
              ) : null}
              {kpi && units ? ", " : null}
              {units ? (
                <Link href="/inventory" className="c-link">
                  số ghế bán theo tháng ở Số lượng bán
                </Link>
              ) : null}
              .
            </>
          ) : null}
        </p>
      </section>
    </div>
  );
}
