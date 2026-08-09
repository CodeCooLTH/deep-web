/**
 * expense-access.service.ts — จุดตัดสินสิทธิ์เดียวของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.1 (copy เป๊ะ)
 */
import { requireActiveShop, type ActiveShop } from '@/lib/shop-context'

/**
 * [D-EXT-1 · 2026-08-07] ถอด Business Package gate ออกทั้งชุด — ต้นทุน/กำไร-ขาดทุน
 * เปิดฟรีทุกร้าน ไม่มีเงื่อนไข "จ่ายเงินแล้วหรือยัง" อีกต่อไป
 *
 * สิ่งที่ถอดคือ **billing** เท่านั้น — `getSubscriptionStatus()` และ `active.locked`
 * (ซึ่งมาจาก Shop.packageLockedAt ล้วน ๆ = quota/ต่ออายุไม่ผ่าน ไม่ใช่เรื่องความปลอดภัย)
 *
 * สิ่งที่ **ห้ามถอด** และยังทำงานเหมือนเดิมทุกบรรทัดข้างล่างนี้: owner เห็นเสมอ ·
 * staff เห็นเมื่อ `staffCanViewFinance = true` — ถ้าวันใดวันหนึ่ง
 * `STAFF_NOT_ALLOWED` หายไปจากฟังก์ชันนี้ แปลว่าถอดเลยเส้นไปแล้ว ไม่ใช่ทำต่อจากงานนี้
 *
 * [2026-08-08] `staffCanViewFinance` เปลี่ยน **default เป็น true** (user สั่ง "เปิดหมด" —
 * migration `20260808220000_finance_visible_to_staff_by_default` เปลี่ยนทั้ง DEFAULT และแถวเดิม)
 * เปลี่ยนแค่ "ค่าตั้งต้น" ไม่ได้เปลี่ยน "กลไก": ด่านข้างล่างยังอ่านธงตัวเดิมและยัง fail-closed
 * เมื่อ owner ปิดเอง — ห้ามลัดด้วยการ return GRANTED ตรง ๆ เพราะสวิตช์บนหน้าจอจะกลายเป็นของหลอก
 */
export type ExpenseAccessDecision =
  | { kind: 'GRANTED'; shop: ActiveShop['shop']; role: 'OWNER' | 'ADMIN' }
  | { kind: 'NO_SHOP' }
  | { kind: 'STAFF_NOT_ALLOWED' }

export async function resolveExpenseAccess(
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null,
): Promise<ExpenseAccessDecision> {
  const active = await requireActiveShop(session)
  if (!active) return { kind: 'NO_SHOP' }

  if (active.role === 'OWNER') return { kind: 'GRANTED', shop: active.shop, role: 'OWNER' }

  if (!active.shop.staffCanViewFinance) return { kind: 'STAFF_NOT_ALLOWED' }
  return { kind: 'GRANTED', shop: active.shop, role: 'ADMIN' }
}
