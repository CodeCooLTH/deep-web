/**
 * order-role-rules — กฎ "บทบาทไหนทำอะไรกับออเดอร์ได้" ที่ต้องตัดสินต่อใบ/ต่อรายการ (00071 P3 · S-14)
 *
 * ไฟล์บริสุทธิ์ (client import ได้) — ตัวบังคับจริงอยู่ที่ service/route, ฝั่ง UI ใช้ไฟล์นี้ซ่อนปุ่มให้ตรงกัน
 * ถ้า UI กับ server อ่านกฎคนละที่ ปุ่มจะโผล่แล้วกดแล้ว 403 (หรือกลับกัน: ปุ่มหายทั้งที่ทำได้) — จึงมีที่เดียว
 */
import type { OrderActionSet } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set'
import { can, type Capability, type ShopRole } from '@/lib/shop-permissions'

/** ผู้เปิดบิล: สร้างได้เฉพาะบิลบริการ (มี O2s แต่ไม่มี O2) — มติ C-6 */
export function isBillingOnly(roles: readonly ShopRole[]): boolean {
  return can(roles, 'O2s') && !can(roles, 'O2')
}

/**
 * สิทธิ์ที่ได้มา "เพราะ BILLING เท่านั้น" ซึ่งมีเงื่อนไขต่อรายการ (P1 = เฉพาะสินค้าประเภทบริการ · O3 = เฉพาะบิลบริการที่ยังไม่ชำระ)
 * บทบาทอื่นในชุดที่มี cap นี้ = ไม่มีเงื่อนไข
 */
export function isBillingOnlyFor(roles: readonly ShopRole[], cap: Capability): boolean {
  return can(roles, cap) && !can(roles.filter((r) => r !== 'BILLING'), cap)
}

/** แก้ออเดอร์ได้ "เพราะ BILLING เท่านั้น" (O3 มีเงื่อนไขต่อใบ) — บทบาทอื่นที่มี O3 อยู่ในชุด = แก้ได้ไม่มีเงื่อนไข */
export function isBillingOnlyEditor(roles: readonly ShopRole[]): boolean {
  return isBillingOnlyFor(roles, 'O3')
}

/**
 * แก้ออเดอร์ใบนี้ได้ไหม (O3 + เงื่อนไขต่อใบของ BILLING)
 * บทบาทอื่นที่มี O3 (นอกจาก BILLING) = แก้ได้ไม่มีเงื่อนไข · BILLING ล้วน = เฉพาะ SERVICE ที่ยังไม่ชำระ
 */
export function canEditOrderAs(roles: readonly ShopRole[], order: { type: string; unpaid: boolean }): boolean {
  if (!can(roles, 'O3')) return false
  if (!isBillingOnlyEditor(roles)) return true
  return order.type === 'SERVICE' && order.unpaid
}

/** เหตุที่ BILLING แก้บิลไม่ได้ — PAID = รับชำระแล้ว · NOT_SERVICE = ไม่ใช่บิลบริการ (ตรวจประเภทก่อน เพราะบิลสินค้าไม่ควรถูกบอกว่า "รับชำระแล้ว") */
export type OrderEditLockReason = 'PAID' | 'NOT_SERVICE'

/** null = แก้ได้ · ตัดสินจาก canEditOrderAs ตัวเดียวกัน จึงไม่มีทางที่ "ล็อก" กับ "เหตุ" ไม่ตรงกัน */
export function orderEditLockReason(
  roles: readonly ShopRole[],
  order: { type: string; unpaid: boolean },
): OrderEditLockReason | null {
  if (canEditOrderAs(roles, order)) return null
  // ไม่มี O3 เลย (ไม่ใช่เคส BILLING) ก็ตกที่นี่ — หน้าเรียกหลังผ่าน gate O3 แล้วเสมอ จึงเหลือแค่ 2 เหตุ
  return order.type !== 'SERVICE' ? 'NOT_SERVICE' : 'PAID'
}

/** ข้อความต่อเหตุ — {noun} ผันตามประเภทกิจการ (resolveOrderVocab) */
export function orderEditLockMessage(reason: OrderEditLockReason, noun: string): string {
  return reason === 'NOT_SERVICE'
    ? `${noun}นี้ไม่ใช่บิลบริการ บทบาทเปิดบิลแก้ไม่ได้ ขอให้เจ้าของร้าน ผู้ดูแล หรือคนที่มีบทบาทตอบแชทแก้ให้`
    : 'บิลนี้รับชำระแล้ว แก้รายการไม่ได้ ขอให้เจ้าของร้าน ผู้ดูแล หรือคนที่มีบทบาทตอบแชทแก้ให้'
}

/** ปุ่มบนหน้าออเดอร์ → capability ที่ต้องมี (ปุ่มที่ไม่อยู่ในตาราง = ดู/คัดลอก ไม่เปลี่ยนข้อมูล) */
export const ORDER_ACTION_CAP: Readonly<Record<string, Capability>> = {
  'send-sms': 'O7',
  'report-tracking': 'S1',
  'edit-tracking': 'S1',
  'pickup-handed-over': 'S1',
  'pickup-handover-undo': 'S1',
  'edit-order': 'O3',
  'cancel-order': 'O6',
  'cod-received': 'O5',
  'record-payment': 'O5',
  'return-order': 'O6',
  'print-receipt': 'D1',
  'pickup-payment-received': 'O5',
  'fill-draft': 'O2',
  'retry-draft': 'O2',
  'discard-draft': 'O2',
}

/**
 * ตัดปุ่มที่บทบาทนี้ไม่มีสิทธิ์ออกจากชุดปุ่ม (primary/ghosts/menu)
 * editLocked = บิลที่ BILLING แก้ไม่ได้แล้ว (รับเงินแล้ว/ไม่ใช่บริการ) — ซ่อน edit-order แม้บทบาทมี O3
 * "สถานะพัสดุ" ของ iShip ใช้ key report-tracking (S1) — บทบาทที่ไม่มี S1 ไม่เห็นปุ่มนั้น แต่ยังเห็นเลขพัสดุที่คัดลอกได้
 */
export function filterActionSetByRoles(
  set: OrderActionSet,
  roles: readonly ShopRole[],
  opts?: { editLocked?: boolean },
): OrderActionSet {
  const ok = (key: string) => {
    if (key === 'edit-order' && opts?.editLocked) return false
    const cap = ORDER_ACTION_CAP[key]
    return cap === undefined || can(roles, cap)
  }
  return {
    primary: set.primary && ok(set.primary.key) ? set.primary : null,
    ghosts: set.ghosts.filter((a) => ok(a.key)),
    menu: set.menu.filter((a) => ok(a.key)),
  }
}
