import type { SessionUser } from "@/lib/auth/types";

import {
  CUSTOMERS,
  EVENTS,
  HOUSEHOLDS,
  KPIS,
  ORDERS,
  PRODUCTS,
  STAFF,
  STOCK,
  TASKS,
  VARIANTS,
  WAREHOUSES,
  type Order,
  type Variant,
} from "./data";

// Lớp đọc dữ liệu mô phỏng. Lọc theo quyền giống luật RLS sẽ áp khi chuyển sang bảng thật:
// không có quyền thì dữ liệu không được trả về (giá vốn bị bỏ khỏi object, không phải ẩn ở giao diện).

const has = (u: SessionUser, p: string) => u.permissions.has(p);

export type PublicVariant = Omit<Variant, "cost"> & { cost?: number };

function stripCost(u: SessionUser, v: Variant): PublicVariant {
  if (has(u, "product.view_cost")) return v;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cost, ...rest } = v;
  return rest;
}

export function staffName(id: string) {
  return STAFF.find((s) => s.id === id)?.fullName ?? "Chưa phân";
}

export function variantInfo(id: string) {
  const v = VARIANTS.find((x) => x.id === id)!;
  const p = PRODUCTS.find((x) => x.id === v.productId)!;
  return {
    variant: v,
    product: p,
    label: v.name === "Tiêu chuẩn" ? p.name : `${p.name} ${v.name.toLowerCase()}`,
  };
}

// ---------------------------------------------------------------- đơn hàng

export function orderTotals(o: Order) {
  const subtotal = o.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = o.lines.reduce((s, l) => s + l.discount, 0);
  const fees = o.fees.delivery + o.fees.installation;
  const total = subtotal - discount + fees;
  const confirmed = o.payments
    .filter((p) => p.status === "confirmed" && p.type !== "refund")
    .reduce((s, p) => s + p.amount, 0);
  const pending = o.payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
  return { subtotal, discount, fees, total, confirmed, pending, balance: total - confirmed };
}

export function visibleOrders(u: SessionUser) {
  if (has(u, "order.view_all")) return ORDERS;
  if (has(u, "order.view_own")) return ORDERS.filter((o) => o.sellerId === u.id);
  return [];
}

export function getOrder(u: SessionUser, id: string) {
  return visibleOrders(u).find((o) => o.id === id) ?? null;
}

// ---------------------------------------------------------------- khách

export function visibleCustomers(u: SessionUser) {
  if (has(u, "lead.view_all")) return CUSTOMERS;
  if (!has(u, "lead.view_own")) return [];
  const viaOrders = new Set(visibleOrders(u).flatMap((o) => [o.buyerId, o.recipientId]));
  return CUSTOMERS.filter((c) => c.ownerId === u.id || viaOrders.has(c.id));
}

export function getCustomer(u: SessionUser, id: string) {
  const c = visibleCustomers(u).find((x) => x.id === id);
  if (!c) return null;
  const household = HOUSEHOLDS.find((h) => h.id === c.householdId) ?? null;
  const visibleIds = new Set(visibleCustomers(u).map((x) => x.id));
  const members = household
    ? CUSTOMERS.filter((m) => m.householdId === household.id && m.id !== c.id).map((m) => ({
        id: m.id,
        relation: m.relation,
        market: m.market,
        // Thành viên hộ không được xem thì chỉ hiện quan hệ, không hiện tên, số.
        fullName: visibleIds.has(m.id) ? m.fullName : null,
      }))
    : [];
  const orders = visibleOrders(u).filter((o) => o.buyerId === c.id || o.recipientId === c.id);
  const owned = orders
    .filter((o) => o.status === "completed" && o.recipientId === c.id)
    .flatMap((o) =>
      o.lines
        .filter((l) => l.serial)
        .map((l) => {
          const { product } = variantInfo(l.variantId);
          const start = new Date(o.deliveryDate!);
          const end = new Date(start);
          end.setMonth(end.getMonth() + product.warrantyMonths);
          return {
            name: product.name,
            serial: l.serial!,
            delivered: o.deliveryDate!,
            warrantyEnd: end.toISOString(),
          };
        }),
    );
  const events = EVENTS.filter((e) => e.customerId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const tasks = TASKS.filter((t) => t.customerId === c.id).sort((a, b) => a.due.localeCompare(b.due));
  const totalPaid = orders
    .filter((o) => o.buyerId === c.id)
    .reduce((s, o) => s + orderTotals(o).confirmed, 0);
  return { customer: c, household, members, orders, owned, events, tasks, totalPaid };
}

// ---------------------------------------------------------------- sản phẩm, kho

export function stockOf(variantId: string, warehouseId?: string) {
  const rows = STOCK.filter(([v, w]) => v === variantId && (!warehouseId || w === warehouseId));
  const onHand = rows.reduce((s, r) => s + r[2], 0);
  const reserved = rows.reduce((s, r) => s + r[3], 0);
  return { onHand, reserved, available: onHand - reserved };
}

export function listProducts(u: SessionUser) {
  if (!has(u, "product.view")) return [];
  return PRODUCTS.map((p) => {
    const variants = VARIANTS.filter((v) => v.productId === p.id).map((v) => stripCost(u, v));
    return {
      product: p,
      variants,
      priceFrom: Math.min(...variants.map((v) => v.price)),
      available: variants.reduce((s, v) => s + stockOf(v.id).available, 0),
    };
  });
}

export function getProduct(u: SessionUser, id: string) {
  if (!has(u, "product.view")) return null;
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return null;
  const variants = VARIANTS.filter((v) => v.productId === p.id).map((v) => ({
    ...stripCost(u, v),
    stock: WAREHOUSES.map((w) => ({ warehouse: w, ...stockOf(v.id, w.id) })),
  }));
  const reservedBy = ORDERS.filter(
    (o) => o.holdUntil && o.lines.some((l) => variants.some((v) => v.id === l.variantId)),
  );
  return { product: p, variants, reservedBy };
}

export function inventory(u: SessionUser, warehouseId: string) {
  if (!has(u, "inventory.view")) return [];
  return VARIANTS.filter((v) => STOCK.some(([vid, wid]) => vid === v.id && wid === warehouseId)).map((v) => {
    const { label } = variantInfo(v.id);
    const s = stockOf(v.id, warehouseId);
    const status = s.available <= 0 ? "out" : s.available < v.lowStock ? "low" : "ok";
    return { id: v.id, sku: v.sku, label, threshold: v.lowStock, ...s, status } as const;
  });
}

export { WAREHOUSES };

// ---------------------------------------------------------------- đội ngũ

export function visibleStaff(u: SessionUser) {
  if (!has(u, "staff.view")) return STAFF.filter((s) => s.id === u.id);
  return STAFF;
}

/** Chỉ số theo người: kpi.team thấy cả đội (sale admin: người mình quản lý và telesale), kpi.own chỉ thấy mình. */
export function teamKpis(u: SessionUser) {
  const all = KPIS.map((k) => ({ ...k, staff: STAFF.find((s) => s.id === k.staffId)! }));
  if (has(u, "kpi.team")) return all;
  if (has(u, "kpi.own")) return all.filter((k) => k.staffId === u.id);
  return [];
}

export function teamMedian() {
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return {
    slaRate: med(KPIS.map((k) => k.slaRate)),
    infoRate: med(KPIS.map((k) => k.infoRate)),
    closeRate: med(KPIS.map((k) => k.closeRate)),
    callsPerDay: med(KPIS.map((k) => k.callsPerDay)),
  };
}

export function staffTasks(staffId: string) {
  return TASKS.filter((t) => t.assigneeId === staffId).map((t) => ({
    ...t,
    customer: CUSTOMERS.find((c) => c.id === t.customerId)!,
  }));
}
