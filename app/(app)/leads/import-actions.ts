"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/types";
import { fold } from "@/lib/inbox/extract";
import { buildIngestPayload } from "@/lib/leads/intake";

// Nhập file CSV dữ liệu thủ công cũ (CLAUDE.md mục 6, nguồn import). Trình duyệt đọc tệp và báo lỗi từng dòng để xem
// trước; ở đây kiểm lại từng dòng rồi gọi cùng hàm database ingest_lead như nhập tay (chống trùng, quyền
// lead.import, nhật ký), nên không có đường nào tạo lead mà bỏ qua luật.

const MAX_ROWS = 1000;
const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

/** Xem trước: số nào trong tệp đã có trong CRM (chỉ trạng thái, không tên khách). */
export async function checkImportPhones(
  phones: string[],
): Promise<{ ok: true; existing: { e164: string; open: boolean }[] } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("lead.import"))
    return { ok: false, message: "Anh chị chưa được cấp quyền nhập file." };
  const list = z
    .array(z.string().regex(/^\+[1-9]\d{6,14}$/))
    .max(2000)
    .parse([...new Set(phones)]);
  if (!list.length) return { ok: true, existing: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_check_phones", { p_phones: list });
  if (error) return { ok: false, message: "Chưa kiểm tra được số trùng, thử lại sau ít phút." };
  return { ok: true, existing: (data ?? []).map((r) => ({ e164: r.e164, open: r.has_open_lead })) };
}

const rowSchema = z.object({
  line: z.number().int().min(1),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(40),
  country: z.string().max(16),
  province: z.string().max(100),
  product: z.string().max(200),
  lastContact: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  note: z.string().max(2000),
  previousOwner: z.string().max(100),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_ROWS),
  /** Dòng có số đã có trong CRM: bỏ qua, cập nhật ô còn trống của lead cũ, hoặc ghi thành hoạt động trên lead cũ. */
  duplicateMode: z.enum(["skip", "update", "activity"]),
  /** Sau khi nhập: để ở hàng Chưa phân, giao lại người phụ trách cũ (nếu còn làm), hoặc phân tự động. */
  assignMode: z.enum(["hold", "previous", "auto"]),
});

export interface ImportSummary {
  ok: true;
  created: number;
  attached: number;
  skipped: number;
  assigned: number;
  held: number;
  errors: { line: number; message: string }[];
}

const vnDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function importLeads(
  input: z.infer<typeof importSchema>,
): Promise<ImportSummary | { ok: false; message: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("lead.import"))
    return { ok: false, message: "Anh chị chưa được cấp quyền nhập file." };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: `Tệp có tối đa ${MAX_ROWS} dòng, mỗi dòng cần họ tên và số.` };
  const { rows, duplicateMode, assignMode } = parsed.data;

  const supabase = await createClient();
  const { data: marketRows } = await supabase.from("markets").select("country_code").eq("is_active", true);
  const markets = (marketRows ?? []).map((m) => m.country_code);

  // Chuẩn hóa lại ở server (không tin kết quả xem trước của trình duyệt).
  const prepared = rows.map((r) => {
    const noteParts = [
      r.note.trim(),
      r.lastContact ? `Liên hệ gần nhất: ${vnDate(r.lastContact)}` : "",
      r.previousOwner.trim() ? `Người phụ trách cũ: ${r.previousOwner.trim()}` : "",
    ].filter(Boolean);
    const payload = buildIngestPayload(
      {
        fullName: r.name,
        phone: r.phone,
        country: r.country,
        sourceKey: "import",
        productInterest: r.product,
        recipientProvince: r.province,
        note: noteParts.join(" · ") || undefined,
      },
      markets,
    );
    if (r.lastContact) payload.source_detail.last_contact = r.lastContact;
    return { row: r, payload };
  });

  const existing = new Set<string>();
  if (duplicateMode === "skip") {
    const phones = prepared.flatMap((p) => (p.payload.phone.e164 ? [p.payload.phone.e164] : []));
    const check = await checkImportPhones(phones);
    if (!check.ok) return check;
    for (const e of check.existing) existing.add(e.e164);
  }

  // Người phụ trách cũ: khớp theo họ tên đầy đủ hoặc tên gọi (chữ cuối), không dấu, chỉ người đang làm và nhận lead được.
  const owners = new Map<string, string>();
  if (assignMode === "previous" && user.permissions.has("lead.assign")) {
    const { data: people } = await supabase.rpc("lead_assignees");
    for (const p of people ?? []) {
      owners.set(fold(p.full_name), p.id);
      const short = fold(p.full_name.trim().split(/\s+/).pop() ?? "");
      if (short && !owners.has(short)) owners.set(short, p.id);
    }
  }

  const summary: ImportSummary = {
    ok: true,
    created: 0,
    attached: 0,
    skipped: 0,
    assigned: 0,
    held: 0,
    errors: [],
  };
  const seen = new Set<string>();
  const toAssign = new Map<string, string[]>();

  for (const { row, payload } of prepared) {
    if (!payload.phone.valid || !payload.phone.e164) {
      summary.errors.push({ line: row.line, message: "Số điện thoại không hợp lệ" });
      continue;
    }
    if (seen.has(payload.phone.e164) || existing.has(payload.phone.e164)) {
      summary.skipped++;
      continue;
    }
    seen.add(payload.phone.e164);
    const { data, error } = await supabase.rpc("ingest_lead", {
      p: {
        ...payload,
        route: assignMode === "auto",
        fill_empty: duplicateMode === "update",
      } as unknown as Json,
    });
    if (error || !data) {
      summary.errors.push({
        line: row.line,
        message: error?.code === "42501" ? "Không có quyền nhập file" : "Chưa lưu được dòng này",
      });
      continue;
    }
    const r = data as { action: string; lead_id: string; route?: string };
    if (r.action === "attached") {
      summary.attached++;
      continue;
    }
    summary.created++;
    const owner = owners.get(fold(row.previousOwner.trim()));
    if (assignMode === "previous" && owner) toAssign.set(owner, [...(toAssign.get(owner) ?? []), r.lead_id]);
    else if (r.route !== "assigned") summary.held++;
  }

  for (const [assignee, ids] of toAssign) {
    const { data, error } = await supabase.rpc("assign_leads", {
      p_lead_ids: ids,
      p_assignee: assignee,
      p_reason: "Nhập file: giao lại người phụ trách cũ",
    });
    if (error) summary.held += ids.length;
    else {
      summary.assigned += data ?? 0;
      summary.held += ids.length - (data ?? 0);
    }
  }

  revalidatePath("/leads");
  revalidatePath("/home");
  return summary;
}
