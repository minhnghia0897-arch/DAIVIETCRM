import type { CampaignRow, OverviewRow } from "@/components/crm/views/marketing";

// Dữ liệu mô phỏng cho khu Marketing ở bản demo tĩnh. Chỉ số tổng hợp, không có khách thật.

export const DEMO_MARKETS = [
  { code: "VN", name: "Việt Nam" },
  { code: "KR", name: "Hàn Quốc" },
];

export const DEMO_CAMPAIGNS: CampaignRow[] = [
  {
    id: "c-1",
    name: "Ghế massage cho bố mẹ, người Việt tại Hàn",
    platform: "facebook",
    externalId: "120210000000001",
    market: "KR",
    startsOn: "2026-09-20",
    endsOn: "2026-10-20",
    budget: 30_000_000,
    requestedBudget: null,
    status: "active",
    ownerName: "Lan Marketing",
    note: null,
    spend: 14_200_000,
    lastSpendOn: "2026-10-09",
  },
  {
    id: "c-2",
    name: "Quà 20/10 trong nước",
    platform: "facebook",
    externalId: "120210000000002",
    market: "VN",
    startsOn: "2026-10-01",
    endsOn: "2026-10-19",
    budget: 20_000_000,
    requestedBudget: 30_000_000,
    status: "active",
    ownerName: "Lan Marketing",
    note: "Xin tăng ngân sách vì chi phí mỗi lead thấp",
    spend: 9_600_000,
    lastSpendOn: "2026-10-09",
  },
  {
    id: "c-3",
    name: "Máy lọc nước mùa Tết",
    platform: "tiktok",
    externalId: null,
    market: "VN",
    startsOn: "2026-10-15",
    endsOn: "2026-11-15",
    budget: 0,
    requestedBudget: 15_000_000,
    status: "pending_approval",
    ownerName: "Lan Marketing",
    note: null,
    spend: 0,
    lastSpendOn: null,
  },
];

const row = (
  kind: OverviewRow["kind"],
  key: string,
  label: string,
  leads: number,
  contacted: number,
  converted: number,
  lost: number,
  spend = 0,
  budget = 0,
): OverviewRow => ({ kind, key, label, leads, contacted, converted, lost, spend, budget });

export const DEMO_OVERVIEW: OverviewRow[] = [
  row("campaign", "c-1", "Ghế massage cho bố mẹ, người Việt tại Hàn", 96, 81, 9, 22, 14_200_000, 30_000_000),
  row("campaign", "c-2", "Quà 20/10 trong nước", 74, 66, 6, 15, 9_600_000, 20_000_000),
  row("campaign", "c-3", "Máy lọc nước mùa Tết", 0, 0, 0, 0, 0, 0),
  row("source", "meta_lead_ads", "meta_lead_ads", 170, 147, 15, 37),
  row("source", "zalo_oa", "zalo_oa", 58, 55, 8, 9),
  row("source", "meta_messenger", "meta_messenger", 31, 27, 3, 6),
  row("source", "walk_in", "walk_in", 22, 22, 7, 4),
  row("source", "referral", "referral", 12, 12, 5, 1),
  row("market", "VN", "VN", 179, 165, 24, 33),
  row("market", "KR", "KR", 104, 89, 13, 22),
  row("market", "unknown", "unknown", 10, 9, 1, 2),
];
