import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { maskPhonesInText } from "../../phone/index.ts";

// Khách là ai, cho tin Telegram mức "Đầy đủ" (Owner chốt 14/10/2026: sale nắm được ngay khách là ai): tên Facebook,
// tên Zalo (tên hiển thị của hội thoại) và số điện thoại dạng che như trên CRM (`090•••215`). Không bao giờ có số
// đầy đủ hay nội dung tin của khách (CLAUDE.md mục 5, 10.3, 12). Đọc gộp một lần cho cả danh sách.

type Db = SupabaseClient<Database>;

const CHANNEL_NAME: Record<string, string> = { messenger: "Facebook", zalo: "Zalo" };

/** Tên hiển thị trên kênh, bỏ phần trông như số điện thoại. */
const clean = (s: string | null | undefined) => maskPhonesInText(s ?? "").trim();

/**
 * Một dòng định danh cho mỗi khách: "Facebook: Hạnh Võ · Zalo: Hạnh · SĐT 090•••215".
 * `noPhone`: khách không được ghi số (ví dụ người nhận khi người đặt bật Giữ bất ngờ).
 */
export async function contactIdentities(
  db: Db,
  ids: (string | null | undefined)[],
  noPhone: Set<string> = new Set(),
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const [{ data: convs }, { data: phones }] = await Promise.all([
    db
      .from("conversations")
      .select("contact_id, channel, display_name")
      .in("contact_id", uniq)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500),
    db
      .from("contact_identities")
      .select("contact_id, display_masked, is_primary")
      .in("contact_id", uniq)
      .eq("type", "phone")
      .order("is_primary", { ascending: false })
      .limit(500),
  ]);
  const names = new Map<string, Map<string, string>>();
  for (const c of convs ?? []) {
    const label = CHANNEL_NAME[c.channel];
    const name = clean(c.display_name);
    if (!c.contact_id || !label || !name) continue;
    const m = names.get(c.contact_id) ?? new Map<string, string>();
    if (!m.has(label)) m.set(label, name);
    names.set(c.contact_id, m);
  }
  const phoneOf = new Map<string, string>();
  for (const p of phones ?? [])
    // Số dạng che lưu sẵn khi nhập (`090•••215`); phòng khi dữ liệu cũ lỡ lưu số thật thì bỏ hẳn.
    if (p.contact_id && p.display_masked && !/\d{6,}/.test(p.display_masked) && !phoneOf.has(p.contact_id))
      phoneOf.set(p.contact_id, p.display_masked);

  for (const id of uniq) {
    const parts = [...(names.get(id) ?? new Map<string, string>())].map(([k, v]) => `${k}: ${v}`);
    const phone = noPhone.has(id) ? null : phoneOf.get(id);
    if (phone) parts.push(`SĐT ${phone}`);
    if (parts.length) out.set(id, parts.join(" · "));
  }
  return out;
}

/** Tên Facebook, Zalo của một hội thoại chưa gắn khách (khách đang hỏi). */
export const channelName = (channel: string, displayName: string | null) => {
  const label = CHANNEL_NAME[channel];
  const name = clean(displayName);
  return label && name ? `${label}: ${name}` : null;
};
