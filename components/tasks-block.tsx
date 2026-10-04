import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

export interface TaskItem {
  id: string;
  title: string;
  dueLabel: string;
  overdue: boolean;
  priority: 1 | 2 | 3;
  source: "user" | "rule";
  action: string;
  sub?: string;
}

/** Khối "Việc tiếp theo" (DESIGN.md 5.15). Nút hành động chỉ hiện khi không ở chế độ chỉ đọc. */
export function TasksBlock({
  items,
  readOnly,
  empty,
}: {
  items: TaskItem[];
  readOnly?: boolean;
  empty: string;
}) {
  if (items.length === 0) return <p className="px-[14px] py-3 text-text-weak">{empty}</p>;
  return (
    <ul>
      {items.slice(0, 5).map((t) => (
        <li
          key={t.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 px-[14px] py-2 last:border-0"
        >
          <span
            aria-label={t.priority === 1 ? "Ưu tiên cao" : "Ưu tiên thường"}
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              t.priority === 1 ? "bg-brand-strong" : "border border-text-weak",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.title}</p>
            {t.sub ? <p className="text-label text-text-weak">{t.sub}</p> : null}
          </div>
          {t.source === "rule" ? <span className="text-label text-text-weak">Tự động</span> : null}
          <Pill tone={t.overdue ? "err" : "neutral"}>{t.dueLabel}</Pill>
          {!readOnly ? (
            <span className="flex gap-1">
              <span className="rounded-control border border-line px-2 py-1 text-label font-semibold text-brand">
                {t.action}
              </span>
              <span className="rounded-control border border-line px-2 py-1 text-label font-semibold text-brand">
                Xong
              </span>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
