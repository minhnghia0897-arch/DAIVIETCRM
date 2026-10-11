import { CHANNEL_COLOR, type Conversation } from "@/lib/demo/crm-data";

// Avatar khách trong Hội thoại: chữ cái đầu trên nền màu cố định theo tên, chấm màu kênh (Zalo, Facebook…) ở góc.

const PALETTE = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];
const colorOf = (name: string) =>
  PALETTE[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % PALETTE.length];
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export function ConvAvatar({ c, size = 46 }: { c: Pick<Conversation, "name" | "channel">; size?: number }) {
  return (
    <span className="cv-av-wrap" style={{ width: size, height: size }} aria-hidden>
      <span
        className="tg-av"
        style={{ width: size, height: size, fontSize: size * 0.38, background: colorOf(c.name) }}
      >
        {initials(c.name)}
      </span>
      {/* Chấm màu kênh (Zalo, Facebook…) ở góc avatar. */}
      <span className="cv-chan" style={{ background: CHANNEL_COLOR[c.channel] }} />
    </span>
  );
}
