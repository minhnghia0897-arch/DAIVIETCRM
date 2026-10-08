import { BUDGET_LIMIT, FORMAT_LABEL, STATUS_LABEL, nextStatus, stepBlocker } from "./logic";
import type {
  Booking,
  Contract,
  ContractFile,
  Creator,
  KocData,
  PartnerStatus,
  Payout,
  Post,
  Rating,
  Sample,
} from "./types";

// Thao tác trên dữ liệu KOL, KOC: kiểm quyền và điều kiện (kocDenied) rồi mới đổi dữ liệu (kocReducer). Hàm thuần,
// thời điểm truyền từ ngoài. Khi có bảng thật, kocDenied chuyển thành RLS và hàm database, giao diện giữ nguyên.

/**
 * Quyền tạm dùng cho bản demo, chờ duyệt bộ quyền riêng `koc.view`, `koc.manage`, `koc.payout`
 * (docs/open-questions.md). Xem và quản lý: người xem được báo cáo cả đội; duyệt ngân sách vượt mức: Owner;
 * ghi tiền trả cho KOL, KOC: người xác nhận được thanh toán.
 */
export const KOC_VIEW = ["report.team"];
export const KOC_MANAGE = "report.team";
export const KOC_PAYOUT = "payment.confirm";

export interface KocWho {
  perms: ReadonlySet<string>;
  isOwner: boolean;
  readOnly: boolean;
}

type Meta = { actor: string; at: string };

export type CreatorDraft = Omit<Creator, "id" | "createdAt" | "rating" | "contract"> & {
  contract: Creator["contract"];
};
export type BookingDraft = Pick<
  Booking,
  "creatorId" | "campaign" | "products" | "format" | "postAt" | "fee" | "commissionRate" | "note"
>;

export type KocAction =
  | ({ type: "addCreator"; creator: CreatorDraft } & Meta)
  | ({ type: "setStatus"; id: string; status: PartnerStatus } & Meta)
  | ({ type: "addNote"; id: string; text: string } & Meta)
  | ({ type: "rate"; id: string; rating: Omit<Rating, "by" | "at"> } & Meta)
  | ({ type: "addBooking"; booking: BookingDraft } & Meta)
  | ({ type: "advanceBooking"; id: string } & Meta)
  | ({ type: "cancelBooking"; id: string; reason: string } & Meta)
  | ({ type: "addPost"; bookingId: string; post: Post } & Meta)
  | ({ type: "sendSample"; bookingId: string; product: string; serial: string | null } & Meta)
  | ({ type: "sampleStatus"; id: string; status: Sample["status"] } & Meta)
  | ({ type: "recordPayout"; payout: Omit<Payout, "id" | "paidAt" | "recordedBy"> } & Meta)
  | ({ type: "setContract"; id: string; contract: Omit<Contract, "files"> } & Meta)
  | ({
      type: "addContractFile";
      id: string;
      file: Omit<ContractFile, "id" | "uploadedAt" | "uploadedBy">;
    } & Meta)
  | ({ type: "removeContractFile"; id: string; fileId: string } & Meta);

/** Tệp hợp đồng nhận: PDF, ảnh chụp, Word; tối đa 10MB mỗi tệp. */
export const CONTRACT_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "Ảnh JPG",
  "image/png": "Ảnh PNG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
};
export const CONTRACT_FILE_MAX = 10 * 1024 * 1024;

const READ_ONLY = "Đang xem như người dùng khác, chỉ đọc.";

/** Lý do không được làm; null khi được. */
export function kocDenied(data: KocData, a: KocAction, who: KocWho): string | null {
  if (who.readOnly) return READ_ONLY;
  if (!who.perms.has(KOC_MANAGE)) return "Anh chị chưa được cấp quyền quản lý KOL, KOC.";
  const creator = (id: string) => data.creators.find((c) => c.id === id);
  const booking = (id: string) => data.bookings.find((b) => b.id === id);
  switch (a.type) {
    case "addCreator": {
      const c = a.creator;
      if (!c.name.trim()) return "Cần nhập tên hiển thị.";
      if (!c.channels.length || !c.channels.every((ch) => ch.handle.trim()))
        return "Cần ít nhất một kênh có tên tài khoản.";
      const code = c.trackingCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,12}$/.test(code)) return "Mã giới thiệu gồm 3 đến 12 chữ in và số, không dấu.";
      if (data.creators.some((x) => x.trackingCode === code)) return `Mã ${code} đã có người dùng.`;
      return null;
    }
    case "setStatus":
    case "addNote":
    case "rate":
      return creator(a.id) ? null : "Không tìm thấy KOL, KOC này.";
    case "addBooking": {
      const c = creator(a.booking.creatorId);
      if (!c) return "Chọn KOL, KOC cho booking.";
      if (c.status === "paused" || c.status === "ended")
        return `Đang ${STATUS_LABEL[c.status].toLowerCase()} với ${c.name}. Đổi trạng thái trước khi đặt booking mới.`;
      if (!a.booking.campaign.trim()) return "Cần nhập tên chiến dịch.";
      if (a.booking.fee < 0 || a.booking.commissionRate < 0 || a.booking.commissionRate > 30)
        return "Chi phí không âm, hoa hồng từ 0 đến 30%.";
      return null;
    }
    case "advanceBooking": {
      const b = booking(a.id);
      if (!b) return "Không tìm thấy booking.";
      const to = nextStatus(b);
      if (!to) return "Booking đã xong hoặc đã hủy.";
      if (b.status === "budget_pending" && !who.isOwner)
        return `Booking trên ${BUDGET_LIMIT.toLocaleString("vi-VN")}đ cần Owner duyệt ngân sách.`;
      if (to === "paid" && !who.perms.has(KOC_PAYOUT)) return "Cần quyền xác nhận thanh toán để ghi đã trả.";
      return stepBlocker(data, b, to);
    }
    case "cancelBooking": {
      const b = booking(a.id);
      if (!b) return "Không tìm thấy booking.";
      if (["posted", "accepted", "paid", "cancelled"].includes(b.status))
        return "Bài đã đăng thì không hủy được booking.";
      return a.reason.trim() ? null : "Cần ghi lý do hủy.";
    }
    case "addPost": {
      const b = booking(a.bookingId);
      if (!b || b.status === "cancelled") return "Không tìm thấy booking.";
      if (!/^https:\/\/\S+$/.test(a.post.url)) return "Link bài cần bắt đầu bằng https://";
      if ([a.post.views, a.post.likes, a.post.comments, a.post.shares].some((n) => !(n >= 0)))
        return "Lượt xem, tương tác là số không âm.";
      return null;
    }
    case "sendSample":
      return booking(a.bookingId) && a.product.trim() ? null : "Chọn booking và sản phẩm gửi mẫu.";
    case "sampleStatus":
      return data.samples.some((s) => s.id === a.id) ? null : "Không tìm thấy hàng mẫu.";
    case "recordPayout": {
      if (!who.perms.has(KOC_PAYOUT)) return "Cần quyền xác nhận thanh toán để ghi tiền trả cho KOL, KOC.";
      if (!creator(a.payout.creatorId)) return "Không tìm thấy KOL, KOC này.";
      if (!(a.payout.amount > 0)) return "Số tiền phải lớn hơn 0.";
      if (!a.payout.reference.trim()) return "Cần ghi mã giao dịch hoặc nội dung chuyển khoản.";
      return null;
    }
    case "setContract": {
      if (!creator(a.id)) return "Không tìm thấy KOL, KOC này.";
      const k = a.contract;
      if (!k.code.trim()) return "Cần nhập số hợp đồng.";
      if (!k.startsOn || !k.endsOn || k.endsOn < k.startsOn)
        return "Ngày kết thúc phải từ ngày bắt đầu trở đi.";
      if (!(k.commissionRate >= 0 && k.commissionRate <= 30)) return "Hoa hồng từ 0 đến 30%.";
      if (!(k.usageRightsMonths >= 0 && k.usageRightsMonths <= 36))
        return "Quyền dùng lại nội dung từ 0 đến 36 tháng.";
      return null;
    }
    case "addContractFile": {
      const c = creator(a.id);
      if (!c) return "Không tìm thấy KOL, KOC này.";
      if (!c.contract) return "Tạo hợp đồng trước rồi mới tải tệp lên.";
      if (!CONTRACT_FILE_TYPES[a.file.mime]) return "Chỉ nhận tệp PDF, ảnh JPG, PNG hoặc Word.";
      if (a.file.size > CONTRACT_FILE_MAX) return "Tệp lớn hơn 10MB. Nén lại hoặc chụp thành PDF nhỏ hơn.";
      if (!a.file.name.trim()) return "Tệp chưa có tên.";
      return null;
    }
    case "removeContractFile":
      return creator(a.id)?.contract?.files.some((f) => f.id === a.fileId) ? null : "Không tìm thấy tệp này.";
  }
}

function log(data: KocData, creatorId: string, a: Meta, text: string): KocData {
  return { ...data, activity: [{ creatorId, at: a.at, actor: a.actor, text }, ...data.activity] };
}

const nextId = (prefix: string, xs: { id: string }[]) =>
  `${prefix}-${String(xs.length + 1).padStart(2, "0")}`;

/** Đổi dữ liệu theo thao tác. Gọi sau khi kocDenied trả null. */
export function kocReducer(data: KocData, a: KocAction): KocData {
  const withContract = (id: string, f: (k: Contract) => Contract) => ({
    ...data,
    creators: data.creators.map((c) => (c.id === id && c.contract ? { ...c, contract: f(c.contract) } : c)),
  });
  switch (a.type) {
    case "setContract": {
      const prev = data.creators.find((c) => c.id === a.id)?.contract;
      const next = {
        ...data,
        creators: data.creators.map((c) =>
          c.id === a.id
            ? { ...c, contract: { ...a.contract, code: a.contract.code.trim(), files: prev?.files ?? [] } }
            : c,
        ),
      };
      return log(next, a.id, a, `${prev ? "Sửa" : "Tạo"} hợp đồng ${a.contract.code.trim()}`);
    }
    case "addContractFile": {
      const all = data.creators.flatMap((c) => c.contract?.files ?? []);
      const file: ContractFile = {
        ...a.file,
        id: `cf-${String(all.length + 1).padStart(2, "0")}-${a.at.slice(11, 19).replace(/:/g, "")}`,
        uploadedAt: a.at.slice(0, 10),
        uploadedBy: a.actor,
      };
      return log(
        withContract(a.id, (k) => ({ ...k, files: [file, ...k.files] })),
        a.id,
        a,
        `Tải lên tệp hợp đồng ${file.name}`,
      );
    }
    case "removeContractFile": {
      const name = data.creators
        .find((c) => c.id === a.id)
        ?.contract?.files.find((f) => f.id === a.fileId)?.name;
      return log(
        withContract(a.id, (k) => ({ ...k, files: k.files.filter((f) => f.id !== a.fileId) })),
        a.id,
        a,
        `Gỡ tệp hợp đồng ${name ?? ""}`.trim(),
      );
    }
    case "addCreator": {
      const id = `kc-${data.creators.length + 1}`;
      const c: Creator = {
        ...a.creator,
        id,
        trackingCode: a.creator.trackingCode.trim().toUpperCase(),
        rating: null,
        createdAt: a.at.slice(0, 10),
      };
      return log({ ...data, creators: [c, ...data.creators] }, id, a, "Thêm vào danh sách KOL, KOC");
    }
    case "setStatus": {
      const next = {
        ...data,
        creators: data.creators.map((c) => (c.id === a.id ? { ...c, status: a.status } : c)),
      };
      return log(next, a.id, a, `Đổi trạng thái: ${STATUS_LABEL[a.status]}`);
    }
    case "addNote":
      return log(data, a.id, a, `Ghi chú: ${a.text.trim()}`);
    case "rate": {
      const rating: Rating = { ...a.rating, by: a.actor, at: a.at.slice(0, 10) };
      const next = { ...data, creators: data.creators.map((c) => (c.id === a.id ? { ...c, rating } : c)) };
      return log(
        next,
        a.id,
        a,
        `Đánh giá: nội dung ${rating.content}/5, đúng hạn ${rating.punctuality}/5, hiệu quả ${rating.results}/5`,
      );
    }
    case "addBooking": {
      const b: Booking = {
        ...a.booking,
        id: nextId("bk", data.bookings),
        status: "proposed",
        createdBy: a.actor,
        approvedBy: null,
        posts: [],
        cancelReason: null,
      };
      return log(
        { ...data, bookings: [b, ...data.bookings] },
        b.creatorId,
        a,
        `Đề xuất booking: ${b.campaign} (${FORMAT_LABEL[b.format]})`,
      );
    }
    case "advanceBooking": {
      const b = data.bookings.find((x) => x.id === a.id)!;
      const to = nextStatus(b)!;
      const approved = b.status === "budget_pending";
      const next = {
        ...data,
        bookings: data.bookings.map((x) =>
          x.id === a.id ? { ...x, status: to, approvedBy: approved ? a.actor : x.approvedBy } : x,
        ),
      };
      const text = approved
        ? `Duyệt ngân sách và chốt booking: ${b.campaign}`
        : `${b.campaign}: chuyển sang bước tiếp theo`;
      return log(next, b.creatorId, a, text);
    }
    case "cancelBooking": {
      const b = data.bookings.find((x) => x.id === a.id)!;
      const next = {
        ...data,
        bookings: data.bookings.map((x) =>
          x.id === a.id ? { ...x, status: "cancelled" as const, cancelReason: a.reason.trim() } : x,
        ),
      };
      return log(next, b.creatorId, a, `Hủy booking ${b.campaign}: ${a.reason.trim()}`);
    }
    case "addPost": {
      const b = data.bookings.find((x) => x.id === a.bookingId)!;
      const next = {
        ...data,
        bookings: data.bookings.map((x) =>
          x.id === a.bookingId ? { ...x, posts: [...x.posts, a.post] } : x,
        ),
      };
      return log(next, b.creatorId, a, `Ghi bài đã đăng: ${b.campaign}`);
    }
    case "sendSample": {
      const b = data.bookings.find((x) => x.id === a.bookingId)!;
      const s: Sample = {
        id: nextId("sm", data.samples),
        creatorId: b.creatorId,
        bookingId: b.id,
        product: a.product.trim(),
        serial: a.serial?.trim() || null,
        sentAt: a.at.slice(0, 10),
        status: "with_creator",
      };
      return log({ ...data, samples: [s, ...data.samples] }, b.creatorId, a, `Gửi hàng mẫu ${s.product}`);
    }
    case "sampleStatus": {
      const s = data.samples.find((x) => x.id === a.id)!;
      const next = {
        ...data,
        samples: data.samples.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)),
      };
      const label = a.status === "returned" ? "Đã thu hồi" : a.status === "gifted" ? "Tặng luôn" : "Đang giữ";
      return log(next, s.creatorId, a, `Hàng mẫu ${s.product}: ${label}`);
    }
    case "recordPayout": {
      const p: Payout = {
        ...a.payout,
        id: nextId("po", data.payouts),
        reference: a.payout.reference.trim(),
        paidAt: a.at.slice(0, 10),
        recordedBy: a.actor,
      };
      return log(
        { ...data, payouts: [p, ...data.payouts] },
        p.creatorId,
        a,
        `Ghi đã trả ${p.amount.toLocaleString("vi-VN")}đ (${p.kind === "fee" ? "phí booking" : "hoa hồng"})`,
      );
    }
  }
}
