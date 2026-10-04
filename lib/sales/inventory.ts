// Tồn kho (CLAUDE.md 8.3): tồn chỉ đổi qua phiếu kho đã ghi sổ; mỗi thay đổi là một dòng sổ kho bất biến.
// Hàm thuần: nhận số tồn hiện tại, trả về các dòng sổ kho sẽ sinh và số tồn mới; không sửa dữ liệu đầu vào.

export type MovementType =
  "receipt" | "sale_out" | "transfer_out" | "transfer_in" | "return_in" | "adjust_plus" | "adjust_minus";

export interface StockLevel {
  variantId: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
}

export interface Movement {
  type: MovementType;
  variantId: string;
  warehouseId: string;
  /** Luôn dương; chiều tăng giảm theo `type`. */
  qty: number;
  ref: string;
  reason: string;
}

export type DocumentKind = "receipt" | "issue" | "transfer" | "count";

export interface StockDocumentInput {
  id: string;
  kind: DocumentKind;
  warehouseId: string;
  toWarehouseId?: string;
  reason: string;
  lines: { variantId: string; qty?: number; counted?: number }[];
}

export interface PlannedDocument {
  movements: Movement[];
  errors: string[];
  /** Kiểm kê có chênh lệch phải được người có `inventory.count_approve` duyệt mới ghi sổ. */
  needsApproval: boolean;
}

const SIGN: Record<MovementType, 1 | -1> = {
  receipt: 1,
  transfer_in: 1,
  return_in: 1,
  adjust_plus: 1,
  sale_out: -1,
  transfer_out: -1,
  adjust_minus: -1,
};

export function levelOf(levels: StockLevel[], variantId: string, warehouseId: string): StockLevel {
  return (
    levels.find((l) => l.variantId === variantId && l.warehouseId === warehouseId) ?? {
      variantId,
      warehouseId,
      onHand: 0,
      reserved: 0,
    }
  );
}

export const available = (l: StockLevel) => l.onHand - l.reserved;

const isQty = (n: number | undefined): n is number => n !== undefined && Number.isInteger(n) && n > 0;

export function planDocument(levels: StockLevel[], doc: StockDocumentInput): PlannedDocument {
  const errors: string[] = [];
  const movements: Movement[] = [];
  if (!doc.lines.length) errors.push("Phiếu chưa có dòng nào");
  const base = { ref: doc.id, reason: doc.reason };

  // Gộp dòng trùng SKU để kiểm đủ hàng trên tổng.
  const need = new Map<string, number>();
  for (const l of doc.lines) {
    if (doc.kind === "count") {
      if (l.counted === undefined || !Number.isInteger(l.counted) || l.counted < 0)
        errors.push(`Số đếm của ${l.variantId} phải là số nguyên không âm`);
      continue;
    }
    if (!isQty(l.qty)) {
      errors.push(`Số lượng của ${l.variantId} phải là số nguyên dương`);
      continue;
    }
    need.set(l.variantId, (need.get(l.variantId) ?? 0) + l.qty);
  }

  if (doc.kind === "receipt") {
    for (const [variantId, qty] of need)
      movements.push({ ...base, type: "receipt", variantId, warehouseId: doc.warehouseId, qty });
  }

  if (doc.kind === "issue" || doc.kind === "transfer") {
    if (doc.kind === "transfer" && (!doc.toWarehouseId || doc.toWarehouseId === doc.warehouseId))
      errors.push("Kho nhận phải khác kho xuất");
    for (const [variantId, qty] of need) {
      const have = available(levelOf(levels, variantId, doc.warehouseId));
      if (have < qty) errors.push(`Không đủ hàng khả dụng ${variantId}: cần ${qty}, còn ${have}`);
      if (doc.kind === "issue")
        movements.push({ ...base, type: "sale_out", variantId, warehouseId: doc.warehouseId, qty });
      else {
        movements.push({ ...base, type: "transfer_out", variantId, warehouseId: doc.warehouseId, qty });
        if (doc.toWarehouseId)
          movements.push({ ...base, type: "transfer_in", variantId, warehouseId: doc.toWarehouseId, qty });
      }
    }
  }

  if (doc.kind === "count") {
    for (const l of doc.lines) {
      if (l.counted === undefined || !Number.isInteger(l.counted) || l.counted < 0) continue;
      const cur = levelOf(levels, l.variantId, doc.warehouseId);
      const diff = l.counted - cur.onHand;
      if (l.counted < cur.reserved)
        errors.push(`Số đếm ${l.variantId} (${l.counted}) nhỏ hơn hàng đang giữ cho đơn (${cur.reserved})`);
      if (diff > 0)
        movements.push({
          ...base,
          type: "adjust_plus",
          variantId: l.variantId,
          warehouseId: doc.warehouseId,
          qty: diff,
        });
      if (diff < 0)
        movements.push({
          ...base,
          type: "adjust_minus",
          variantId: l.variantId,
          warehouseId: doc.warehouseId,
          qty: -diff,
        });
    }
  }

  return {
    movements: errors.length ? [] : movements,
    errors,
    needsApproval: doc.kind === "count" && movements.length > 0,
  };
}

/** Áp các dòng sổ kho vào số tồn; trả mảng mới. Không bao giờ cho tồn âm. */
export function applyMovements(levels: StockLevel[], movements: Movement[]): StockLevel[] {
  const next = levels.map((l) => ({ ...l }));
  for (const m of movements) {
    let l = next.find((x) => x.variantId === m.variantId && x.warehouseId === m.warehouseId);
    if (!l) {
      l = { variantId: m.variantId, warehouseId: m.warehouseId, onHand: 0, reserved: 0 };
      next.push(l);
    }
    l.onHand += SIGN[m.type] * m.qty;
    if (l.onHand < 0) throw new Error(`Tồn âm ${m.variantId} tại ${m.warehouseId}`);
  }
  return next;
}

/** Giữ hàng cho đơn đã cọc; `qty` âm để nhả. Không giữ quá số khả dụng. */
export function reserve(
  levels: StockLevel[],
  variantId: string,
  warehouseId: string,
  qty: number,
): StockLevel[] {
  const cur = levelOf(levels, variantId, warehouseId);
  if (qty > 0 && available(cur) < qty) throw new Error(`Không đủ hàng để giữ ${variantId}`);
  const reserved = Math.max(0, cur.reserved + qty);
  const exists = levels.some((l) => l.variantId === variantId && l.warehouseId === warehouseId);
  return exists
    ? levels.map((l) => (l.variantId === variantId && l.warehouseId === warehouseId ? { ...l, reserved } : l))
    : [...levels, { ...cur, reserved }];
}

/** Tồn của combo = số bộ lắp được từ tồn khả dụng của các thành phần trong kho chọn (hiển thị, không lưu). */
export function comboAvailability(
  items: { variantId: string; qty: number }[],
  levels: StockLevel[],
  warehouseId: string,
): number {
  if (!items.length) return 0;
  return Math.min(
    ...items.map((i) =>
      Math.floor(Math.max(0, available(levelOf(levels, i.variantId, warehouseId))) / i.qty),
    ),
  );
}
