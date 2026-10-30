/**
 * expense-access.service.ts — จุดตัดสินสิทธิ์เดียวของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.1 (copy เป๊ะ)
 */
import { can, memberCanRecordStaffExpense, rolesFromMembership } from '@/lib/shop-permissions'
import { sessionUserId } from '@/lib/session-user'
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

  if (!can(rolesFromMembership(active.role, active.roles), 'F1')) return { kind: 'FORBIDDEN_ROLE' }
  return { kind: 'GRANTED', shop: active.shop, role: active.role }
}

/**
 * [00086 · FR-018/019] ด่านของ "ค่าใช้จ่ายของฉัน" (พนักงาน) — /api/expenses/mine*
 *
 * GRANTED เฉพาะ: ร้านบริการ ∧ role ADMIN ∧ ธง canRecordExpense (อ่านจากแถว ShopMember สดทุกคำขอ ผ่าน requireActiveShop)
 * 🛑 เจ้าของ (OWNER/เจ้าของร่วม/ร้านส่วนตัว) = FORBIDDEN บนทางนี้โดยตั้งใจ — เจ้าของใช้ /api/expenses (F1/F2) ที่เห็นทั้งร้าน
 *    ถ้าเปิดให้เจ้าของผ่านทางนี้ด้วย จะมีสองทางเขียนค่าใช้จ่ายของเจ้าของที่กติกาไม่ตรงกัน
 * 🛑 ไม่มีค่าตั้งต้นที่เปิด: ธงไม่ใช่ true / ร้านไม่ใช่บริการ / ไม่รู้ตัวตน = ปฏิเสธ (permission-gate-follows-the-row ข้อ 3)
 * ผู้ใช้ที่ได้ GRANTED ไม่ได้สิทธิ์ F1 — ห้ามคืนยอดรวม/รายการของคนอื่นจากทางนี้
 */
export type StaffExpenseAccessDecision =
  | { kind: 'GRANTED'; shopId: string; userId: string }
  | { kind: 'UNAUTH' }
  | { kind: 'NO_SHOP' }
  | { kind: 'FORBIDDEN' }

export async function resolveStaffExpenseAccess(
  // รับ Session ของ NextAuth ตรง ๆ (ไม่ประกาศ user.id) — ตัวตนอ่านผ่าน sessionUserId ไม่ใช่ cast ที่ผู้เรียก
  session: object | null,
): Promise<StaffExpenseAccessDecision> {
  // ตรวจ id จริง ไม่ใช่กล่อง session (session-exists-is-not-identity)
  const userId = sessionUserId(session)
  if (!userId) return { kind: 'UNAUTH' }
  const active = await requireActiveShop(session as Parameters<typeof requireActiveShop>[0])
  if (!active) return { kind: 'NO_SHOP' }
  if (!memberCanRecordStaffExpense(active.shop, active.role, { canRecordExpense: active.canRecordExpense === true })) {
    return { kind: 'FORBIDDEN' }
  }
  return { kind: 'GRANTED', shopId: active.shop.id, userId }
}
