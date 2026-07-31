// order-display.ts — Pure display helpers สำหรับ Order Detail V1 UI
//
// ทำไม: helper เหล่านี้ derive display state จาก (status, fulfillmentMode, paymentMethod)
// แยกออกมาจาก component เพื่อ unit-test ได้ชัดเจน และ reuse ใน T4 (OrderDetailMobile.tsx)
//
// หมายเหตุ: digital/service orders มี fulfillmentMode=NO_SHIPPING → ไม่มี SHIPPED state
// จริงใน schema ดังนั้น PENDING ของ order กลุ่มนี้ = "ส่งมอบแล้ว/รอ buyer ยืนยัน"
// ตาม mockup scenario 8. cancelReason ไม่มีใน schema → timeline ใช้ cancelInitiator
// ที่ฝั่ง UI (S-13) แทน — helper นี้ไม่รับ cancelReason เข้ามา
//
// Phase 2 additions (S-3, S-13):
//   isCODPayment — canonical export (logic เดิมอยู่ใน OrderDetailMobile.tsx เป็น local fn)
//   isHttpUrl    — URL scheme guard กัน stored-XSS ผ่าน javascript:/data:
//   showSlipZone — derive slip upload zone visibility จาก status + paymentMethod

// ─── Phase 2: URL + slip-zone helpers ────────────────────────────────────────

/**
 * isCODPayment — ตรวจว่า paymentMethod เป็นการชำระเงินปลายทาง (COD) หรือไม่
 *
 * ทำไม: logic นี้เคยอยู่ใน OrderDetailMobile.tsx เป็น local fn แต่ S-13 ต้องการ
 * export canonical เพื่อ test + reuse ใน showSlipZone และ UI task (S-8/S-9) สามารถ
 * import จากที่เดียวแทนการ duplicate — UI task จะลบ local fn ออกเมื่อ import ตัวนี้
 */
export function isCODPayment(paymentMethod: string | null | undefined): boolean {
  return /COD|ปลายทาง|เก็บเงิน/i.test(paymentMethod ?? '')
}

/**
 * isHttpUrl — ตรวจว่า string เป็น URL ที่มี scheme http: หรือ https: เท่านั้น
 *
 * ทำไม: accessUrl ที่ seller set อาจถูก inject เป็น javascript: หรือ data:
 * ซึ่งทำให้เกิด stored-XSS เมื่อ buyer คลิก "เปิด" — reject ทุก scheme ที่ไม่ใช่ http/https
 * ทั้งที่ Valibot layer (SetAccessUrlSchema) และที่ render layer (S-10)
 */
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * showSlipZone — true เมื่อควรแสดง slip upload zone ให้ buyer
 *
 * ทำไม: zone ต้องปรากฏเฉพาะ PENDING + ไม่ใช่ COD (กรณีโอนเงิน/พร้อมเพย์ etc.)
 * COD ไม่มีการโอนเงินล่วงหน้า = ไม่ต้องแนบสลิป
 * สถานะอื่น (SHIPPED/CONFIRMED/CANCELLED) = order เดินหน้าแล้วหรือเสร็จสิ้น = ซ่อน
 */
export function showSlipZone(
  status: string,
  paymentMethod: string | null | undefined,
): boolean {
  return status === 'PENDING' && !isCODPayment(paymentMethod)
}

/**
 * PaymentBadge — badge สถานะการชำระเงิน (แยกจาก ORDER_STATUS_META ที่เป็น badge สถานะออเดอร์)
 * null = ไม่แสดง badge (วิธีชำระที่ไม่รู้จัก เช่น CASH/CARD/OTHER หรือ paymentMethod ว่าง)
 */
export type PaymentBadge = { label: string; cls: string } | null

/**
 * getPaymentBadge — derive badge การชำระเงินจากสถานะออเดอร์ + วิธีชำระ + สลิป
 *
 * ทำไม: ยกมาจาก local fn ใน PaymentCard.tsx (T5, contract กลางให้ task อื่น import ร่วม)
 * ต่างจาก ORDER_STATUS_META (badge สถานะออเดอร์ 4 ค่า PENDING/SHIPPED/CONFIRMED/CANCELLED)
 * ตัวนี้คือ badge ของ "การชำระเงิน" โดยเฉพาะ — ใบเดียวกันอาจมี badge สถานะออเดอร์ = SHIPPED
 * แต่ badge การชำระเงิน = "ชำระแล้ว" คนละแกนกัน
 *
 * Verified-Means-Green: เขียว (bg-success) สงวนไว้เฉพาะ "ชำระแล้ว" จริง (status=CONFIRMED)
 * เท่านั้น — "รอตรวจสอบสลิป"/"รอชำระ"/"รอเก็บปลายทาง" ต้องเป็น info/warning ห้ามเขียว
 */
export function getPaymentBadge(
  status: string,
  paymentMethod: string | null | undefined,
  slipFileId: string | null | undefined,
): PaymentBadge {
  if (status === 'CONFIRMED') {
    return { label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success' }
  }
  if (status === 'CANCELLED') {
    return { label: 'ยกเลิก', cls: 'badge bg-default-100 text-default-400' }
  }
  if (isCODPayment(paymentMethod)) {
    return { label: 'รอเก็บปลายทาง', cls: 'badge bg-info/15 text-info' }
  }
  // TRANSFER / PROMPTPAY
  if (paymentMethod === 'TRANSFER' || paymentMethod === 'PROMPTPAY') {
    if (slipFileId) return { label: 'รอตรวจสอบสลิป', cls: 'badge bg-info/15 text-info' }
    // "รอชำระ" เป็นสถานะปกติของออเดอร์ที่เพิ่งสร้าง ไม่ใช่ความผิดพลาด — ห้ามใช้ danger (แดง)
    // ทำให้ออเดอร์ใหม่ทุกใบขึ้นแดงตั้งแต่วินาทีแรก แดงเลยไม่เหลือความหมาย
    return { label: 'รอชำระ', cls: 'badge bg-warning/15 text-warning' }
  }
  // วิธีอื่น (CASH/CARD/OTHER) หรือ paymentMethod null — ไม่แสดง badge
  return null
}

// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
export type TimelineState = 'done' | 'cur' | 'fin' | 'up' | 'cx' | 'mute'
export type TimelineStep = { label: string; state: TimelineState }
export type StatusPill = { label: string; bg: string; text: string; dot: string }

/**
 * ORDER_STATUS_META — badge สถานะออเดอร์แบบ Paces token (bg-{semantic}/15 text-{semantic}) + icon
 * เป็น SSOT เดียวสำหรับ badge สถานะฝั่ง seller: หน้า order detail (StatusHero) และชิปเลขออเดอร์ใน
 * inbox list ใช้ชุดนี้ร่วมกัน → label/สีตรงกันข้ามหน้า (กด #เลข จาก inbox ไป detail เห็นสถานะเดียวกัน)
 *
 * ต่างจาก getStatusPill (hex, buyer-facing pill ใน /o/[token]) — อันนั้นแยก PENDING ตาม
 * fulfillment/payment เป็น 3 label ส่วนอันนี้ยึด status ตรง ๆ 4 ค่า ตาม UI หลังบ้าน
 */
export type OrderStatusTone = 'warning' | 'info' | 'success' | 'danger'

export const ORDER_STATUS_META: Record<
  string,
  { label: string; cls: string; icon: string; tone: OrderStatusTone }
> = {
  PENDING: { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning', icon: 'clock', tone: 'warning' },
  SHIPPED: { label: 'จัดส่งแล้ว', cls: 'bg-info/15 text-info', icon: 'truck', tone: 'info' },
  CONFIRMED: { label: 'สำเร็จ', cls: 'bg-success/15 text-success', icon: 'circle-check-filled', tone: 'success' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-danger/15 text-danger', icon: 'circle-x', tone: 'danger' },
}

// Palette tokens ตาม spec §2 — ห้ามแก้ค่าสีที่นี่โดยไม่ sync กับ mockup
const PALETTE = {
  pend: { bg: '#FEF3E2', text: '#92400E', dot: '#D97706' },
  ship: { bg: '#E7F1FE', text: '#1E40AF', dot: '#2563EB' },
  succ: { bg: '#E7F6F0', text: '#065F46', dot: '#059669' },
  canc: { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' },
} as const

/**
 * getStatusPill — คืน label + palette สีสำหรับ status pill
 *
 * ทำไม PENDING แยก 3 case:
 *   - !isShipping (digital/service/subscription): เสมือน "ส่งมอบแล้ว" แต่รอ buyer confirm
 *   - isCOD: เก็บเงินปลายทาง ยังไม่ชำระ = "รอดำเนินการ"
 *   - else (โอนเงิน): ยังไม่จ่าย = "รอชำระเงิน"
 */
export function getStatusPill(
  status: OrderStatus,
  fulfillmentMode: string,
  paymentMethod: string | null | undefined,
): StatusPill {
  const isShipping = fulfillmentMode === 'SHIPPED'
  const isCOD = /COD|ปลายทาง|เก็บเงิน/i.test(paymentMethod ?? '')

  switch (status) {
    case 'CANCELLED':
      return { label: 'ยกเลิกแล้ว', ...PALETTE.canc }
    case 'CONFIRMED':
      return { label: 'สำเร็จแล้ว', ...PALETTE.succ }
    case 'SHIPPED':
      return { label: 'กำลังจัดส่ง', ...PALETTE.ship }
    case 'PENDING':
      if (!isShipping) return { label: 'ส่งมอบแล้ว', ...PALETTE.ship }
      if (isCOD)       return { label: 'รอดำเนินการ', ...PALETTE.pend }
      return           { label: 'รอชำระเงิน',  ...PALETTE.pend }
  }
}

/**
 * getOrderTimeline — คืน array 3 TimelineStep เสมอ (windowed prev/cur/next)
 *
 * TimelineState semantics:
 *   done  = ผ่านแล้ว (filled circle + solid line)
 *   cur   = สถานะปัจจุบัน (animated ring)
 *   fin   = สถานะสุดท้าย/สำเร็จ (filled ✓)
 *   up    = upcoming (empty circle)
 *   cx    = cancelled dot (แดง)
 *   mute  = ขั้นตอนที่ไม่ relevant หลัง cancel (เทาจาง)
 */
export function getOrderTimeline(
  status: OrderStatus,
  fulfillmentMode: string,
  paymentMethod: string | null | undefined,
): TimelineStep[] {
  const isShipping = fulfillmentMode === 'SHIPPED'
  const isCOD = /COD|ปลายทาง|เก็บเงิน/i.test(paymentMethod ?? '')

  switch (status) {
    case 'CANCELLED':
      return [
        { label: 'สั่งซื้อแล้ว', state: 'done' },
        { label: 'ยกเลิก',       state: 'cx'   },
        { label: isShipping ? 'จัดส่ง' : 'ยืนยันรับ', state: 'mute' },
      ]

    case 'CONFIRMED':
      if (isShipping) {
        return [
          { label: 'ยืนยันแล้ว',  state: 'done' },
          { label: 'จัดส่งแล้ว',  state: 'done' },
          { label: 'ได้รับแล้ว',  state: 'fin'  },
        ]
      }
      return [
        { label: 'สั่งซื้อแล้ว',  state: 'done' },
        { label: 'ส่งมอบแล้ว',   state: 'done' },
        { label: 'ได้รับแล้ว',    state: 'fin'  },
      ]

    case 'SHIPPED':
      return [
        { label: 'ยืนยันแล้ว',    state: 'done' },
        { label: 'กำลังจัดส่ง',   state: 'cur'  },
        { label: 'ได้รับสินค้า',   state: 'up'   },
      ]

    case 'PENDING':
      if (isShipping) {
        return [
          { label: 'สั่งซื้อแล้ว',                     state: 'done' },
          { label: isCOD ? 'รอยืนยัน' : 'รอชำระเงิน', state: 'cur'  },
          { label: 'จัดส่ง',                            state: 'up'   },
        ]
      }
      // digital/service/subscription: fulfillmentMode=NO_SHIPPING
      return [
        { label: 'สั่งซื้อแล้ว', state: 'done' },
        { label: 'ส่งมอบแล้ว',  state: 'cur'  },
        { label: 'ยืนยันรับ',    state: 'up'   },
      ]
  }
}
