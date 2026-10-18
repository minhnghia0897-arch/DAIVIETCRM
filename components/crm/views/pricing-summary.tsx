import { formatMoney } from "@/lib/format";
import type { QuoteResult } from "@/lib/sales/pricing";

// Kết quả của hàm định giá (lib/sales/pricing.ts) trên bản thật: dòng hàng (combo đã tách, quà tặng), chính sách đã
// áp, phí, tổng, cọc tối thiểu, điều cần duyệt và cảnh báo. Dùng chung cho Lên đơn và Thử chính sách.

export function PricingSummary({ result, label = "Tạm tính" }: { result: QuoteResult; label?: string }) {
  return (
    <div className="mt-2" aria-label={label} role="group">
      <table className="c-rl">
        <tbody>
          {result.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.name} × {l.qty}
                {l.isGift ? <span className="c-pill is-ok ml-1">Tặng</span> : null}
                {l.discount && !l.isGift ? <div className="c-lbl">Giảm {formatMoney(l.discount)}</div> : null}
              </td>
              <td className="tabular">{formatMoney(l.isGift ? 0 : l.total)}</td>
            </tr>
          ))}
          <tr>
            <td className="c-lbl">Tạm tính (giá lẻ)</td>
            <td className="tabular">{formatMoney(result.totals.subtotal)}</td>
          </tr>
          {result.totals.discount ? (
            <tr>
              <td className="c-lbl">Giảm</td>
              <td className="tabular">−{formatMoney(result.totals.discount)}</td>
            </tr>
          ) : null}
          {result.totals.fees ? (
            <tr>
              <td className="c-lbl">
                Phí giao {formatMoney(result.fees.delivery)}, lắp {formatMoney(result.fees.installation)}
              </td>
              <td className="tabular">{formatMoney(result.totals.fees)}</td>
            </tr>
          ) : null}
          <tr>
            <td>
              <b>Tổng</b>
            </td>
            <td className="tabular">
              <b>{formatMoney(result.totals.total)}</b>
            </td>
          </tr>
          <tr>
            <td className="c-lbl">Cọc tối thiểu</td>
            <td className="tabular">{formatMoney(result.deposit.minimum)}</td>
          </tr>
        </tbody>
      </table>
      {result.appliedPolicies.length ? (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Chính sách đã áp">
          {result.appliedPolicies.map((p) => (
            <span key={p.id} className="c-pill is-ai whitespace-normal">
              {p.name}
              {p.benefit ? `: ${p.benefit}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {result.approvalsNeeded.map((a) => (
        <p
          key={a.reason}
          role="note"
          className="mt-2 mb-0 rounded-control bg-warn-soft px-2.5 py-1.5 text-warn"
        >
          Cần Owner duyệt: {a.reason}
        </p>
      ))}
      {result.warnings.map((w) => (
        <p key={w} className="mt-2 mb-0 rounded-control bg-err-soft px-2.5 py-1.5 text-err">
          {w}
        </p>
      ))}
    </div>
  );
}
