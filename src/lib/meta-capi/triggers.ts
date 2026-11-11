// feature 00089 — การกระทำในระบบ → เหตุการณ์ CAPI (FR-006 · FR-008)
import type { CapiEventKey } from "./events";

export type OrderTrigger =
  | "CREATED" | "DRAFT_PROMOTED" | "CONFIRMED" | "FULLY_PAID" | "SLIP"
  | "SHIPPED" | "DELIVERED" | "CANCELED" | "RETURNED";

export type PurchaseAt = "CREATE" | "CONFIRM" | "PAYMENT";

const DIRECT: Partial<Record<OrderTrigger, CapiEventKey>> = {
  SLIP: "ADD_PAYMENT_INFO",
  SHIPPED: "ORDER_SHIPPED",
  DELIVERED: "ORDER_DELIVERED",
  CANCELED: "ORDER_CANCELED",
  RETURNED: "ORDER_RETURNED",
};

/** Purchase อาจถูกขอหลายรอบ (CONFIRM = ยืนยัน หรือ ชำระครบ อันไหนก่อน) — คีย์กันซ้ำทำให้ส่งครั้งเดียว */
export function eventsForTrigger(
  trigger: OrderTrigger,
  s: { purchaseAt: PurchaseAt; countPromotedDraft: boolean },
): CapiEventKey[] {
  switch (trigger) {
    case "DRAFT_PROMOTED":
      if (!s.countPromotedDraft) return [];
    // fallthrough — ยืนยันออเดอร์ร่าง = สร้างคำสั่งซื้อ
    case "CREATED":
      return s.purchaseAt === "CREATE" ? ["ORDER_CREATED", "PURCHASE"] : ["ORDER_CREATED"];
    case "CONFIRMED":
      return s.purchaseAt === "CONFIRM" ? ["PURCHASE"] : [];
    case "FULLY_PAID":
      return s.purchaseAt === "CREATE" ? [] : ["PURCHASE"];
    default:
      return [DIRECT[trigger]!];
  }
}
