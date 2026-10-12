// Vòng đời khách (CLAUDE.md 1.1) và đồng ý theo mục đích, kênh cho màn Khách bản thật. Giai đoạn do database tính
// (refresh_customer_lifecycle, migration 20261012000400_customers_live.sql); ở đây chỉ có nhãn và cách đọc.

export type Tone = "ok" | "warn" | "err" | "neutral";

export const LIFECYCLE_STAGES = [
  "stranger",
  "lead",
  "new_customer",
  "active_owner",
  "loyal",
  "dormant",
  "at_risk",
  "do_not_contact",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_LABEL: Record<LifecycleStage, { label: string; tone: Tone; hint: string }> = {
  stranger: { label: "Đang hỏi", tone: "neutral", hint: "Mới nhắn hỏi, chưa thành lead" },
  lead: { label: "Lead", tone: "neutral", hint: "Đang tư vấn" },
  new_customer: { label: "Khách mới", tone: "warn", hint: "Đã cọc, chờ giao" },
  active_owner: { label: "Đang sử dụng", tone: "ok", hint: "Đã giao lắp, trong chăm sóc hậu bán" },
  loyal: { label: "Khách thân", tone: "ok", hint: "Mua lại hoặc mua thêm trong hộ" },
  dormant: { label: "Ngủ đông", tone: "neutral", hint: "Lâu không tương tác" },
  at_risk: { label: "Có rủi ro", tone: "err", hint: "Đang đổi trả hoặc bảo hành" },
  do_not_contact: { label: "Ngừng liên hệ", tone: "err", hint: "Khách yêu cầu ngừng liên hệ" },
};

export function lifecycleOf(stage: string | null | undefined) {
  return LIFECYCLE_LABEL[(stage ?? "stranger") as LifecycleStage] ?? LIFECYCLE_LABEL.stranger;
}

/** Lý do đang ở nhánh rủi ro, ngủ đông, ngừng liên hệ (customer_lifecycle.flags). */
export const FLAG_LABEL: Record<string, string> = {
  return_open: "Có đơn đang đổi trả",
  warranty_open: "Có việc bảo hành đang theo dõi",
  stop_contact: "Khách yêu cầu ngừng mọi liên hệ",
  dormant: "Lâu không tương tác",
};

export const CONSENT_PURPOSES = ["care", "marketing", "ads_measurement"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_CHANNELS = ["call", "zalo_oa", "messenger", "zns", "sms", "email"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const PURPOSE_LABEL: Record<ConsentPurpose, string> = {
  care: "Chăm sóc đơn đang có",
  marketing: "Tin khuyến mãi, làm nóng lại",
  ads_measurement: "Gửi chuyển đổi về quảng cáo",
};

export const CHANNEL_LABEL: Record<ConsentChannel | "all", string> = {
  call: "Gọi điện",
  zalo_oa: "Zalo OA",
  messenger: "Messenger",
  zns: "ZNS",
  sms: "SMS",
  email: "Email",
  all: "Mọi kênh",
};

export interface ConsentRow {
  purpose: string;
  channel: string;
  granted: boolean;
  granted_at: string;
  withdrawn_at: string | null;
  source?: string | null;
}

export type ConsentState = "granted" | "denied" | "default";

const at = (r: ConsentRow) =>
  Math.max(Date.parse(r.granted_at), r.withdrawn_at ? Date.parse(r.withdrawn_at) : 0);

/**
 * Trạng thái đồng ý của một mục đích, kênh: dòng mới nhất của kênh đó hoặc "mọi kênh" quyết định (cùng cách đọc với
 * contact_blocked ở database). Chưa có dòng nào: chăm sóc đơn đang có thì được (không cần đồng ý marketing), mục đích
 * khác thì chưa được.
 */
export function consentState(
  rows: readonly ConsentRow[],
  purpose: ConsentPurpose,
  channel: ConsentChannel | "all",
) {
  const latest = rows
    .filter((r) => r.purpose === purpose && (r.channel === channel || r.channel === "all"))
    .sort((a, b) => at(b) - at(a))[0];
  if (!latest) return { state: "default" as ConsentState, allowed: purpose === "care" };
  const allowed = latest.granted && !latest.withdrawn_at;
  return { state: (allowed ? "granted" : "denied") as ConsentState, allowed, source: latest.source ?? null };
}

/** Khách đã yêu cầu ngừng mọi liên hệ (chăm sóc, mọi kênh bị từ chối). */
export function stoppedContact(rows: readonly ConsentRow[]): boolean {
  const latest = rows
    .filter((r) => r.purpose === "care" && r.channel === "all")
    .sort((a, b) => at(b) - at(a))[0];
  return Boolean(latest && (!latest.granted || latest.withdrawn_at));
}
