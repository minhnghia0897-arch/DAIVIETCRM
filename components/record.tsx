import { Box, Building2, ShoppingCart, User, Users, Warehouse } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const ICONS = {
  contact: { icon: User, className: "bg-obj-contact" },
  lead: { icon: User, className: "bg-obj-lead" },
  order: { icon: ShoppingCart, className: "bg-brand" },
  product: { icon: Box, className: "bg-obj-call" },
  inventory: { icon: Warehouse, className: "bg-warn" },
  team: { icon: Users, className: "bg-obj-zalo" },
  household: { icon: Building2, className: "bg-obj-contact" },
} as const;

export type ObjectKind = keyof typeof ICONS;

/** Icon đối tượng: ô vuông bo 4px, glyph trắng (DESIGN.md 5.1). */
export function ObjectIcon({ kind, className }: { kind: ObjectKind; className?: string }) {
  const { icon: Icon, className: bg } = ICONS[kind];
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-control text-white",
        bg,
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

/** Nhãn cho màn hình đang chạy bằng dữ liệu mô phỏng (chưa nối database). */
export function DemoBadge() {
  return (
    <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-pill font-semibold text-text-weak">
      Dữ liệu mô phỏng
    </span>
  );
}

/** Page header (DESIGN.md 5.1): icon, loại đối tượng, tên, tag, nút bên phải, hàng highlights tối đa 6 trường. */
export function PageHeader({
  kind,
  label,
  title,
  tags,
  actions,
  highlights,
  demo,
}: {
  kind: ObjectKind;
  label: string;
  title: string;
  tags?: React.ReactNode;
  actions?: React.ReactNode;
  highlights?: { label: string; value: React.ReactNode }[];
  demo?: boolean;
}) {
  return (
    <section className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-start gap-3 px-[14px] py-3">
        <ObjectIcon kind={kind} />
        <div className="min-w-0 flex-1">
          <p className="text-label text-text-weak">
            {label} {demo ? <DemoBadge /> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-page-title font-bold">{title}</h1>
            {tags}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {highlights?.length ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-line-2 px-[14px] py-3 sm:grid-cols-3 lg:grid-cols-6">
          {highlights.slice(0, 6).map((h) => (
            <div key={h.label} className="min-w-0">
              <dt className="text-label text-text-weak">{h.label}</dt>
              <dd className="tabular truncate">{h.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/** Đầu trang danh sách (DESIGN.md 5.10). */
export function ListHeader({
  kind,
  title,
  summary,
  filters,
  actions,
  demo,
}: {
  kind: ObjectKind;
  title: string;
  summary: string;
  filters?: { href: string; label: string; active: boolean }[];
  actions?: React.ReactNode;
  demo?: boolean;
}) {
  return (
    <div className="space-y-2 px-[14px] py-3">
      <div className="flex flex-wrap items-center gap-3">
        <ObjectIcon kind={kind} />
        <h1 className="text-page-title font-bold">{title}</h1>
        {demo ? <DemoBadge /> : null}
        <div className="flex-1" />
        {actions}
      </div>
      <p className="text-label text-text-weak">{summary}</p>
      {filters?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              aria-current={f.active ? "true" : undefined}
              className={cn(
                "rounded-pill border px-3 py-1 text-pill font-semibold",
                f.active
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-line bg-surface text-text-weak",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Danh sách định nghĩa dạng nhãn, giá trị cho cột phải hồ sơ. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="text-label text-text-weak">{label}</p>
      <div>{children}</div>
    </div>
  );
}
