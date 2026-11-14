// feature 00092 — "ซื้อแล้ว" = ถึงจังหวะ Purchase เดียวกับ 00089 (BR-CA-02 · HR16 ห้ามนิยามใหม่)
// เทียบกับ eventsForTrigger (src/lib/meta-capi/triggers.ts): CREATE = สร้างแล้ว · CONFIRM = ยืนยันหรือชำระครบ · PAYMENT = ชำระครบ
// ไม่รวมร่าง/ทดสอบ/ยกเลิก/คืนครบ (BR-CA-03)
import type { PurchaseAt } from "@/lib/meta-capi/triggers";

export interface CountedInput {
  status: string;
  isDryRun: boolean;
  /** ชำระครบ = computeOrderMoney.fullyPaid หรือร้านกดยืนยันรับเงิน หรือรับเงินปลายทางแล้ว (ตรงกับจุดที่ยิง FULLY_PAID) */
  fullyPaid: boolean;
}

const NEVER = new Set(["DRAFTED", "CANCELLED", "RETURNED"]);

export function isCountedOrder(o: CountedInput, purchaseAt: PurchaseAt): boolean {
  if (o.isDryRun || NEVER.has(o.status)) return false;
  if (purchaseAt === "CREATE") return true;
  if (purchaseAt === "CONFIRM") return o.status === "CONFIRMED" || o.fullyPaid;
  return o.fullyPaid;
}
