import { cn } from "@/lib/utils";

// Tag thị trường (DESIGN.md 5.6): chữ tên thị trường, màu theo color_token cấu hình trong bảng markets.
const TOKEN_CLASS: Record<string, string> = {
  "loc-vn": "bg-loc-vn-soft text-loc-vn",
  "loc-kr": "bg-loc-kr-soft text-loc-kr",
  "loc-other": "bg-loc-other-soft text-loc-other",
};

export interface MarketInfo {
  country_code: string;
  name: string;
  color_token: string;
}

export function MarketTag({ code, markets }: { code: string; markets: readonly MarketInfo[] }) {
  const m = markets.find((x) => x.country_code === code);
  const label = m?.name ?? (code === "unknown" ? "Chưa rõ nơi ở" : code);
  const cls = m ? (TOKEN_CLASS[m.color_token] ?? TOKEN_CLASS["loc-other"]) : "bg-surface-2 text-text-weak";
  return <span className={cn("rounded-control px-1.5 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>;
}
