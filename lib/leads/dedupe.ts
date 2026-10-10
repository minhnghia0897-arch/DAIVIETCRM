// Chống trùng khi lead vào (CLAUDE.md mục 6). Hàm thuần, nhận dữ liệu đã nạp sẵn.
// 1. Tìm khách qua định danh: số điện thoại, rồi Zalo, rồi Facebook.
// 2. Khách đang có lead mở: không tạo lead mới, nối vào lead cũ và báo người giữ.
// 3. Lead gần nhất đã thất bại hơn 30 ngày hoặc đã thành công: tạo lead mới cho cùng khách.
// Lead thất bại trong 30 ngày: chưa có quy định; tạm nối vào lead đó để người giữ quyết (docs/open-questions.md).

export type IdentityType = "phone" | "zalo_user_id" | "fb_psid" | "email" | "tiktok";

export interface Identity {
  type: IdentityType;
  value: string;
}

export interface KnownContact {
  id: string;
  identities: Identity[];
}

export interface KnownLead {
  id: string;
  contactId: string;
  stage: "new" | "contacted" | "demo" | "quoted" | "deposit" | "won" | "lost";
  /** Thời điểm thất bại hoặc thành công. */
  closedAt?: Date;
}

export type IntakeDecision =
  | { action: "new_contact" }
  | { action: "attach_open"; contactId: string; leadId: string; matchedBy: IdentityType }
  | { action: "attach_recent_lost"; contactId: string; leadId: string; matchedBy: IdentityType }
  | {
      action: "new_lead";
      contactId: string;
      matchedBy: IdentityType;
      previousLeadId?: string;
      newIdentities: Identity[];
    };

const ORDER: IdentityType[] = ["phone", "zalo_user_id", "fb_psid", "email", "tiktok"];
const DAY = 86_400_000;

export function decideIntake(
  incoming: Identity[],
  now: Date,
  contacts: KnownContact[],
  leads: KnownLead[],
): IntakeDecision {
  let contact: KnownContact | undefined;
  let matchedBy: IdentityType | undefined;
  for (const type of ORDER) {
    for (const id of incoming.filter((i) => i.type === type)) {
      contact = contacts.find((c) => c.identities.some((x) => x.type === type && x.value === id.value));
      if (contact) {
        matchedBy = type;
        break;
      }
    }
    if (contact) break;
  }
  if (!contact || !matchedBy) return { action: "new_contact" };

  const mine = leads.filter((l) => l.contactId === contact.id);
  const open = mine.find((l) => l.stage !== "won" && l.stage !== "lost");
  if (open) return { action: "attach_open", contactId: contact.id, leadId: open.id, matchedBy };

  const last = [...mine].sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))[0];
  if (last && last.stage === "lost" && last.closedAt && now.getTime() - last.closedAt.getTime() <= 30 * DAY) {
    return { action: "attach_recent_lost", contactId: contact.id, leadId: last.id, matchedBy };
  }
  // Định danh mới của cùng khách được thêm vào khách đó, không tạo khách mới.
  const newIdentities = incoming.filter(
    (i) => !contact.identities.some((x) => x.type === i.type && x.value === i.value),
  );
  return { action: "new_lead", contactId: contact.id, matchedBy, previousLeadId: last?.id, newIdentities };
}
