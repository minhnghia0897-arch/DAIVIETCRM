import { cn } from "@/lib/utils";

/** Thanh tiến độ so với chỉ tiêu: tô theo chỉ tiêu, không theo thứ hạng (DESIGN.md 6.14). */
export function Progress({ ratio, label }: { ratio: number; label: string }) {
  const tone = ratio >= 1 ? "bg-ok" : ratio >= 0.8 ? "bg-brand" : ratio >= 0.5 ? "bg-warn" : "bg-err";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-28 overflow-hidden rounded-pill bg-surface-2"
        role="meter"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn("h-full", tone)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <span className="tabular text-label">{Math.round(ratio * 100)}%</span>
    </div>
  );
}
