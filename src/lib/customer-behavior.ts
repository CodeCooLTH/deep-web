/**
 * customer-behavior — "ลูกค้าคนนี้เคยมีพฤติกรรมอะไรกับร้านนี้บ้าง" ที่เดียวของระบบ
 * (user สั่ง 2026-08-11: "อยากให้มี label ขึ้น เพื่อเตือน seller ไว้ว่าลูกค้าคนนี้พฤติกรรมเป็นอย่างไร")
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมไม่นับ `status === 'CANCELLED'` ตรง ๆ (ซึ่งเป็นสิ่งที่ป้ายเดิมใน /orders ทำอยู่)
 *
 * ป้าย ⚑ "เคยยกเลิก N ครั้ง" ใน `OrdersTable.tsx` นับ **ทุกใบที่ยกเลิก ไม่สนว่าใครยกเลิก** —
 * ข้อมูลจริงบน prod (2026-08-11): ใบที่ยกเลิกทั้งหมด **8 ใบ `cancelInitiator = 'seller'` ทั้งหมด
 * ไม่มี 'buyer' สักใบ** แปลว่าป้ายนั้นกำลังติดตราลูกค้าด้วยการยกเลิกของ *ร้านเอง*
 * ซึ่งตรงข้ามกับสิ่งที่ป้ายบอก และเป็นข้อมูลที่ทำให้ร้านตัดสินใจผิดกับลูกค้าที่ไม่ได้ทำอะไรผิด
 *
 * เกณฑ์ที่ถูกมีอยู่แล้วในโปรเจกต์: `isRateExcludedCancellation` ใน `lib/order-stats.ts`
 * (feature 00039, BR-OSM-04) — "ใบที่ไม่ใช่ความผิดร้าน" มี 2 เส้นทางเท่านั้น และทั้งคู่
 * **ร้านสร้างขึ้นเองไม่ได้**:
 *   1. ผู้ซื้อกดยกเลิกเองจากลิงก์ของตัวเอง (`cancelInitiator === 'buyer'`)
 *   2. ขนส่งรายงานว่าพัสดุตีกลับ (`carrierStatus ∈ {return, return_success}`)
 * พลิกกลับด้าน เกณฑ์เดียวกันนี้คือ "พฤติกรรมที่เกิดจากฝั่งลูกค้า" พอดี — จึงยืมนิยามนั้นมาทั้งดุ้น
 * แทนการตั้งเกณฑ์ใหม่ (ถ้าตั้งใหม่ วันหนึ่งอัตราความสำเร็จของร้านกับป้ายเตือนบนแชทจะเล่าคนละเรื่อง
 * เกี่ยวกับออเดอร์ใบเดียวกัน โดยไม่มี gate ไหนฟ้อง — HR16)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 หนึ่งใบนับได้ครั้งเดียว
 *
 * ออเดอร์ที่ "ตีกลับแล้วถูกยกเลิกตามด้วยผู้ซื้อ" เป็นเหตุการณ์ **เดียว** ไม่ใช่สอง — ถ้านับแยกทั้ง
 * สองถัง ผู้ขายจะอ่านว่า "ยกเลิก 1 · ตีกลับ 1" แล้วเข้าใจว่าลูกค้ามีปัญหา 2 ครั้งจากใบเดียว
 * จัดลำดับให้ **ตีกลับชนะ** เพราะเป็นผลลัพธ์ทางกายภาพที่เกิดขึ้นจริง (ของเดินทางกลับมาถึงร้าน)
 * ส่วนการกดยกเลิกหลังจากนั้นเป็นแค่การปิดงานตามหลัง
 *
 * ทุกอย่างในไฟล์นี้เป็น pure function — ทดสอบกฎได้โดยไม่ต้อง mock prisma (เหมือน order-stats.ts)
 */

import { isReturnedCarrierStatus } from './iship/status'

/** หลักฐานของออเดอร์หนึ่งใบเท่าที่จำเป็นต่อการตัดสิน — ผู้เรียก select มาให้เท่านี้พอ */
export type CustomerOrderEvidence = {
  status: string
  /** ใครกดยกเลิก — 'buyer' คือเส้นทางเดียวฝั่งลูกค้าที่ระบบเชื่อได้ (derive จาก session ไม่รับจาก body) */
  cancelInitiator: string | null
  /**
   * carrierStatus ของพัสดุ "ที่มีอยู่จริง" ของใบนี้ (`status='CREATED'` และไม่ใช่ dry-run)
   * null = ไม่มีพัสดุที่นับได้ — ผู้เรียกต้องกรองมาให้แล้ว ไม่ใช่ส่งแถวดิบมาทั้งหมด
   * (เกณฑ์เดียวกับ `CancellationEvidence` ใน order-stats.ts — ห้ามนิยามคำว่า "พัสดุของใบนี้" ใหม่)
   */
  activeShipmentCarrierStatus: string | null
}

export type CustomerBehavior = {
  /** ออเดอร์ทั้งหมดที่เคยมีกับร้านนี้ (รวมที่ยกเลิก) */
  orders: number
  /** ใบที่ไม่ได้ยกเลิก — ใช้แยก "ลูกค้าใหม่" ออกจาก "ลูกค้าประจำ" */
  completed: number
  /** ผู้ซื้อกดยกเลิกเอง (ไม่นับใบที่ตีกลับ — ใบนั้นไปอยู่ถัง returnedParcels แล้ว) */
  cancelledByBuyer: number
  /** พัสดุตีกลับ: ผู้รับไม่รับ / ติดต่อไม่ได้ / ที่อยู่ใช้ไม่ได้ */
  returnedParcels: number
  /**
   * จำนวน "ใบ" ที่มีปัญหาจากฝั่งลูกค้า = cancelledByBuyer + returnedParcels
   *
   * มีไว้ให้หน้าจอพูดถึงจำนวนใบได้โดยไม่ต้องบวกเอง — บวกเองที่ปลายทางคือจุดที่การนับซ้ำ
   * จะกลับมาใหม่ในวันที่มีคนเพิ่มถังที่สาม
   */
  problemOrders: number
}

const EMPTY: CustomerBehavior = {
  orders: 0,
  completed: 0,
  cancelledByBuyer: 0,
  returnedParcels: 0,
  problemOrders: 0,
}

export function summarizeCustomerBehavior(orders: CustomerOrderEvidence[]): CustomerBehavior {
  if (orders.length === 0) return EMPTY

  let completed = 0
  let cancelledByBuyer = 0
  let returnedParcels = 0

  for (const o of orders) {
    const returned = isReturnedCarrierStatus(o.activeShipmentCarrierStatus)
    if (returned) {
      // ตีกลับชนะเสมอ — ใบนี้ถูกนับไปแล้ว ห้ามนับซ้ำในถังยกเลิก (ดูหัวไฟล์)
      returnedParcels += 1
      continue
    }
    if (o.status === 'CANCELLED') {
      // ยกเลิกโดยร้าน (หรือใบเก่าที่ไม่มีค่าบันทึกไว้) **ไม่ใช่พฤติกรรมลูกค้า** — ไม่นับ
      // fail-closed ไปทางไม่กล่าวหาลูกค้า: ไม่รู้ว่าใครยกเลิก = ไม่โทษใคร
      if (o.cancelInitiator === 'buyer') cancelledByBuyer += 1
      continue
    }
    completed += 1
  }

  return {
    orders: orders.length,
    completed,
    cancelledByBuyer,
    returnedParcels,
    problemOrders: cancelledByBuyer + returnedParcels,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * ป้ายที่แสดงบนหน้าจอ — นิยามเดียวของ "ป้ายพฤติกรรมลูกค้า" ทั้งระบบ
 *
 * ใช้ร่วมกัน 2 ที่: หัวแผงข้อมูลลูกค้าในแชท (`CustomerPanel`) และท้ายชื่อลูกค้าในตาราง `/orders`
 * ถ้าปล่อยให้สองที่ตัดสินเอง วันหนึ่งจอหนึ่งจะขึ้นป้ายอีกจอไม่ขึ้นสำหรับลูกค้าคนเดียวกัน แล้วผู้ขาย
 * จะไม่รู้ว่าอันไหนเชื่อได้ (`docs/conventions/sibling-surface-parity.md` + HR16)
 * ──────────────────────────────────────────────────────────────────────────── */

/** ป้ายบวก/เป็นกลาง = `info` · ป้ายที่ต้องระวัง = `warning` — **ห้ามใช้ success/เขียว**
 *  "เคยสั่งบ่อย" ไม่ใช่สถานะที่ถูกยืนยัน (Verified-Means-Green) และ **ห้ามใช้ danger/แดง**
 *  เพราะทั้งหมดเป็น "ควรระวัง" ไม่ใช่ "ห้ามขาย" — ร้านยังตัดสินใจเองได้เสมอ */
export type CustomerBadgeTone = 'info' | 'warning'

export type CustomerBadge = {
  key: 'NEW' | 'REGULAR' | 'RETURNED' | 'CANCELLED_BY_BUYER'
  label: string
  icon: string
  tone: CustomerBadgeTone
}

/**
 * เกณฑ์ (user เคาะ 2026-08-11)
 *
 * `CANCELLED_BY_BUYER >= 1` ต่างจากป้ายเดิมใน /orders ที่ใช้ >= 2 โดยตั้งใจ — ฐานนับแคบลงมาก
 * แล้ว (เดิมนับทุกใบที่ยกเลิกรวมของร้านเอง ตอนนี้นับเฉพาะที่ผู้ซื้อกดเอง) การยกเลิกเองแม้ครั้งเดียว
 * จึงเป็นสัญญาณจริง ไม่ใช่ noise แบบเกณฑ์เดิม
 */
export const CUSTOMER_BADGE_THRESHOLDS = {
  /** ผู้ซื้อกดยกเลิกเองกี่ครั้งถึงขึ้นป้าย */
  cancelledByBuyer: 1,
  /** ใบที่สำเร็จกี่ใบถึงเรียกว่า "ลูกค้าเก่า" */
  regularCompleted: 3,
  /** สั่งกี่ใบถึงยังนับว่า "ลูกค้าใหม่" */
  newMaxOrders: 1,
} as const

/**
 * ป้ายทั้งหมดของลูกค้าคนนี้ เรียงตามลำดับที่จะแสดง (บวกก่อน แล้วค่อยของที่ต้องระวัง)
 *
 * 🛑 `hasHistory = false` (ยังไม่ผูกกับลูกค้าในระบบ / ยังไม่เคยมีออเดอร์เลย) → **คืนลิสต์ว่าง**
 * ห้ามคืนป้าย "ลูกค้าใหม่" เพราะนั่นคือการยืนยันสิ่งที่ยังไม่เกิด (ยังไม่มีออเดอร์ใบแรกด้วยซ้ำ)
 * — ต่างจากในตาราง /orders ที่ป้าย "ลูกค้าใหม่" การันตีได้ เพราะกำลังดูออเดอร์ที่มีอยู่จริงอยู่
 *
 * คำนาม (`orderNoun`) ผันตาม vertical ของร้าน — ผู้เรียกส่งมาจาก `ORDER_VOCAB` ห้ามต่อคำเอง
 * (ร้านบ้านพักต้องอ่านว่า "3 การจอง" ไม่ใช่ "3 คำสั่งซื้อ")
 */
export function customerBadges(
  b: CustomerBehavior,
  opts: { hasHistory: boolean; orderNoun: string },
): CustomerBadge[] {
  if (!opts.hasHistory) return []
  const out: CustomerBadge[] = []

  if (b.orders <= CUSTOMER_BADGE_THRESHOLDS.newMaxOrders) {
    out.push({ key: 'NEW', label: 'ลูกค้าใหม่', icon: 'sparkles', tone: 'info' })
  } else if (b.completed >= CUSTOMER_BADGE_THRESHOLDS.regularCompleted) {
    // นับจาก `completed` ไม่ใช่ `orders` ดิบ — ลูกค้าที่สั่ง 5 ครั้งแล้วยกเลิกทั้ง 5 ต้องไม่ได้ป้ายบวก
    // คำว่า "ลูกค้าเก่า" ยืมจาก CustomerQuickBlock.tsx ที่ใช้อยู่ก่อนแล้ว — ห้ามตั้งคำที่สองให้ของเดียวกัน
    out.push({ key: 'REGULAR', label: `ลูกค้าเก่า · ${b.completed} ${opts.orderNoun}`, icon: 'user-check', tone: 'info' })
  }

  if (b.returnedParcels > 0) {
    // คำ + ไอคอน + tone ยกจาก SSOT ของสถานะขนส่ง (`lib/iship/status.ts` → "พัสดุตีกลับ")
    // ห้ามเขียนว่า "คืนของ" — คนละความหมายกับการที่ลูกค้ารับของแล้วขอคืน (ฟีเจอร์ 00044)
    out.push({
      key: 'RETURNED',
      label: `พัสดุตีกลับ ${b.returnedParcels} ครั้ง`,
      icon: 'arrow-back-up',
      tone: 'warning',
    })
  }
  if (b.cancelledByBuyer >= CUSTOMER_BADGE_THRESHOLDS.cancelledByBuyer) {
    out.push({
      key: 'CANCELLED_BY_BUYER',
      label: `ยกเลิกเอง ${b.cancelledByBuyer} ครั้ง`,
      icon: 'flag',
      tone: 'warning',
    })
  }
  return out
}

/** มีป้ายที่ต้องระวังอย่างน้อย 1 ใบไหม — ใช้ตัดสินจุดเตือนบนปุ่ม "ข้อมูลลูกค้า" ของมือถือ */
export function hasBehaviorWarning(badges: CustomerBadge[]): boolean {
  return badges.some((x) => x.tone === 'warning')
}
