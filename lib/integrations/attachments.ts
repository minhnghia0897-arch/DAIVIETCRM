// Tệp khách gửi qua Messenger, Zalo OA: lưu nguyên dạng nhà cung cấp gửi trong messages.attachments. Hàm này đọc ra
// dạng chung để màn Hội thoại hiện ảnh ngay trong khung chat và mở các tệp khác. Chỉ nhận link https (link do Meta,
// Zalo cấp, thường hết hạn sau một thời gian).

export type AttachmentKind = "image" | "video" | "audio" | "file" | "sticker" | "other";

export interface Attachment {
  kind: AttachmentKind;
  url: string | null;
  name: string | null;
}

const KINDS: Record<string, AttachmentKind> = {
  image: "image",
  photo: "image",
  gif: "image",
  video: "video",
  audio: "audio",
  voice: "audio",
  file: "file",
  sticker: "sticker",
};

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const item = (a ?? {}) as { type?: unknown; payload?: Record<string, unknown> | null };
    const p = item.payload ?? {};
    const kind = KINDS[typeof item.type === "string" ? item.type : ""] ?? "other";
    const url = httpsUrl(p.url) ?? httpsUrl(p.thumbnail);
    const name = typeof p.name === "string" ? p.name.slice(0, 200) : null;
    return { kind, url, name };
  });
}
