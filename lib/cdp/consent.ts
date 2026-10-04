// Căn cứ đồng ý theo mục đích và kênh (CLAUDE.md mục 4, 5). Mọi gọi, nhắn, gửi dữ liệu ra ngoài đều qua hàm này ở server.
// Chăm sóc đơn đang có (`care`) không cần đồng ý tiếp thị, chỉ bị chặn khi khách rút; tiếp thị và gửi dữ liệu
// quảng cáo cần một bản ghi đồng ý còn hiệu lực đúng mục đích và kênh (hoặc kênh `all`).

export type Purpose = "care" | "marketing" | "ads_measurement";
export type Channel = "call" | "zalo_oa" | "zns" | "sms" | "email" | "all";

export interface Consent {
  purpose: Purpose;
  channel: Channel;
  granted: boolean;
  source: string;
  grantedAt?: string;
  withdrawnAt?: string | null;
}

export const PURPOSE_LABEL: Record<Purpose, string> = {
  care: "Chăm sóc đơn đang có",
  marketing: "Tin khuyến mãi, làm nóng lại",
  ads_measurement: "Gửi chuyển đổi về nền tảng quảng cáo",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  call: "Gọi điện",
  zalo_oa: "Zalo OA",
  zns: "ZNS",
  sms: "SMS",
  email: "Email",
  all: "Mọi kênh",
};

const matches = (c: Consent, purpose: Purpose, channel: Channel) =>
  c.purpose === purpose && (c.channel === channel || c.channel === "all");

const active = (c: Consent) => c.granted && !c.withdrawnAt;

export function canContact(
  consents: Consent[],
  purpose: Purpose,
  channel: Channel,
): { allowed: boolean; reason: string } {
  // Khách rút toàn bộ (ngừng liên hệ) thì chặn mọi mục đích.
  if (consents.some((c) => c.purpose === "care" && c.channel === "all" && c.withdrawnAt))
    return { allowed: false, reason: "Khách đã yêu cầu ngừng liên hệ" };
  const relevant = consents.filter((c) => matches(c, purpose, channel));
  if (purpose === "care") {
    const withdrawn = relevant.find((c) => c.withdrawnAt || !c.granted);
    return withdrawn
      ? { allowed: false, reason: `Khách đã rút đồng ý chăm sóc qua ${CHANNEL_LABEL[channel]}` }
      : { allowed: true, reason: "Chăm sóc đơn đang có" };
  }
  return relevant.some(active)
    ? { allowed: true, reason: `Có đồng ý ${PURPOSE_LABEL[purpose].toLowerCase()}` }
    : {
        allowed: false,
        reason: `Chưa có đồng ý ${PURPOSE_LABEL[purpose].toLowerCase()} qua ${CHANNEL_LABEL[channel]}`,
      };
}

/** Chuyển dạng đồng ý cũ của dữ liệu mô phỏng (theo kênh) sang theo mục đích và kênh. */
export function fromChannelList(list: { channel: string; granted: boolean }[], source: string): Consent[] {
  return list.map((x) =>
    x.channel === "marketing"
      ? { purpose: "marketing", channel: "all", granted: x.granted, source }
      : { purpose: "care", channel: x.channel as Channel, granted: x.granted, source },
  );
}
