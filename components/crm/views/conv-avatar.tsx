"use client";

import { useState } from "react";

import { CHANNEL_COLOR, type Conversation } from "@/lib/demo/crm-data";

// Avatar khách trong Hội thoại: ảnh đại diện kênh gửi về (Messenger) nếu có, không thì chữ cái đầu trên nền màu cố
// định theo tên; chấm màu kênh (Zalo, Facebook…) ở góc. Link ảnh của Meta hết hạn: ảnh không tải được thì về chữ.

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

export function ConvAvatar({
  c,
  size = 46,
}: {
  c: Pick<Conversation, "name" | "channel"> & { avatar?: string | null };
  size?: number;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = c.avatar?.startsWith("https://") && broken !== c.avatar ? c.avatar : null;
  return (
    <span className="cv-av-wrap" style={{ width: size, height: size }} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ máy chủ Meta, không qua bộ tối ưu ảnh
        <img
          className="tg-av"
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(src)}
          style={{ width: size, height: size, objectFit: "cover" }}
        />
      ) : (
        <span
          className="tg-av"
          style={{ width: size, height: size, fontSize: size * 0.38, background: colorOf(c.name) }}
        >
          {initials(c.name)}
        </span>
      )}
      {/* Chấm màu kênh (Zalo, Facebook…) ở góc avatar. */}
      <span className="cv-chan" style={{ background: CHANNEL_COLOR[c.channel] }} />
    </span>
  );
}
