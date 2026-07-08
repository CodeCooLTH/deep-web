/**
 * expense-access.service.ts — จุดตัดสินสิทธิ์เดียวของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.1 (copy เป๊ะ)
 */
import { requireActiveShop, type ActiveShop } from '@/lib/shop-context'
import { getSubscriptionStatus } from '@/services/business-package.service'

export type ExpenseAccessDecision =
  | { kind: 'GRANTED'; shop: ActiveShop['shop']; role: 'OWNER' | 'ADMIN' }
  | { kind: 'NO_SHOP' }
  | { kind: 'PACKAGE_LOCKED' }
  | { kind: 'STAFF_NOT_ALLOWED' }

export async function resolveExpenseAccess(
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null,
): Promise<ExpenseAccessDecision> {
  const active = await requireActiveShop(session)
  if (!active) return { kind: 'NO_SHOP' }

  // shop-level lock (quota/renewal-fail) — ต้องเช็คก่อน/คู่กับ subscription status เพราะ shop เดียว
  // อาจถูกล็อกด้วย QUOTA_EXCEEDED_ADMIN_COUNT ได้ทั้งที่ subscription ของ owner ยัง ACTIVE (SRS TFR-011)
  if (active.locked) return { kind: 'PACKAGE_LOCKED' }

  // ownerId ของทั้ง PERSONAL และ BUSINESS shop = Shop.userId เสมอ (SRS TFR-009 — grounded)
  const sub = await getSubscriptionStatus(active.shop.userId)
  if (!sub || sub.status !== 'ACTIVE') return { kind: 'PACKAGE_LOCKED' }

  if (active.role === 'OWNER') return { kind: 'GRANTED', shop: active.shop, role: 'OWNER' }

  if (!active.shop.staffCanViewFinance) return { kind: 'STAFF_NOT_ALLOWED' }
  return { kind: 'GRANTED', shop: active.shop, role: 'ADMIN' }
}

/** isCostEditAllowed — gate field Product.cost (FR-EXP-01-AC-05/D-9)
 *  ไม่เช็ค role/toggle เพราะ authz การแก้ product เป็นของ endpoint เดิมอยู่แล้ว (owner ของ product) —
 *  เช็คแค่ "package ของ owner ร้าน ACTIVE หรือไม่" */
export async function isCostEditAllowed(shop: { userId: string }): Promise<boolean> {
  const sub = await getSubscriptionStatus(shop.userId)
  return sub?.status === 'ACTIVE'
}
