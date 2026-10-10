/**
 * expense-access.service.ts — จุดตัดสินสิทธิ์เดียวของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.1 (copy เป๊ะ)
 */
import { can, rolesFromMembership } from '@/lib/shop-permissions'
import { requireActiveShop, type ActiveShop } from '@/lib/shop-context'

/**
 * [00071 · BR-RP-08/09/10] การเงินเต็ม = capability F1 = เจ้าของ (รวมเจ้าของร่วม) เท่านั้น
 * ยกเลิกสวิตช์ `Shop.staffCanViewFinance` แล้ว — ไม่อ่านธงนี้อีก (ผู้ดูแลเปิดธงก็ไม่ได้ผล)
 * คอลัมน์ยังอยู่ใน schema แต่ไม่มีใครตัดสินด้วยมัน
 *
 * [D-EXT-1 · 2026-08-07] ถอด Business Package gate ออกทั้งชุด — `active.locked` ไม่ใช่เรื่องสิทธิ์
 * 🛑 ห้ามคืน GRANTED ให้ผู้ที่ไม่มี F1 — ถ้า `FORBIDDEN_ROLE` หายไปจากฟังก์ชันนี้ แปลว่าถอดเลยเส้น
 */
export type ExpenseAccessDecision =
  | { kind: 'GRANTED'; shop: ActiveShop['shop']; role: 'OWNER' | 'ADMIN' }
  | { kind: 'NO_SHOP' }
  | { kind: 'FORBIDDEN_ROLE' }

export async function resolveExpenseAccess(
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null,
): Promise<ExpenseAccessDecision> {
  const active = await requireActiveShop(session)
  if (!active) return { kind: 'NO_SHOP' }

  if (!can(rolesFromMembership(active.role), 'F1')) return { kind: 'FORBIDDEN_ROLE' }
  return { kind: 'GRANTED', shop: active.shop, role: active.role }
}
