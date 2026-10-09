// Khung tin tư vấn Zalo OA (docs/integrations/zalo_oa.md): miễn phí 48 giờ sau tương tác cuối của khách, ngoài đó
// tính phí theo hạn mức gói OA. CRM không khóa ô soạn ngoài 48 giờ (CLAUDE.md 10.4), chỉ bắt xác nhận tin tính phí.

const H = 3_600_000;

export type ZaloWindow = { mode: "free"; endsAt: Date } | { mode: "paid" } | { mode: "closed" };

export function zaloWindow(lastInboundAt: string | Date | null | undefined, now: Date): ZaloWindow {
  if (!lastInboundAt) return { mode: "closed" };
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return { mode: "closed" };
  return now.getTime() < last + 48 * H ? { mode: "free", endsAt: new Date(last + 48 * H) } : { mode: "paid" };
}

/** Đầu tháng hiện tại theo giờ Việt Nam (UTC+7, không đổi giờ theo mùa), để đếm tin tính phí trong tháng. */
export function vnMonthStart(now: Date): Date {
  const vn = new Date(now.getTime() + 7 * H);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * H);
}
