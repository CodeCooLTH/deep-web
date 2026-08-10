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
  // T14 P1: text-{semantic} บน bg-{semantic}/15 ตกคอนทราสต์ AA (วัดจริง: warning 1.54:1 ฯลฯ)
  // → ใช้ token "หมึก" คู่กัน (text-{semantic}-ink, src/assets/css/config/_root.css) ผ่าน ≥4.5:1
  if (status === 'CONFIRMED') {
    return { label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success-ink' }
  }
  if (status === 'CANCELLED') {
    // default-400 บน default-100 = 2.3:1 (ไม่ผ่าน) → default-800 (~10.7:1)
    return { label: 'ยกเลิก', cls: 'badge bg-default-100 text-default-800' }
  }
  if (isCODPayment(paymentMethod)) {
    return { label: 'รอเก็บปลายทาง', cls: 'badge bg-info/15 text-info-ink' }
  }
  // TRANSFER / PROMPTPAY
  if (paymentMethod === 'TRANSFER' || paymentMethod === 'PROMPTPAY') {
    if (slipFileId) return { label: 'รอตรวจสอบสลิป', cls: 'badge bg-info/15 text-info-ink' }
    // "รอชำระ" เป็นสถานะปกติของออเดอร์ที่เพิ่งสร้าง ไม่ใช่ความผิดพลาด — ห้ามใช้ danger (แดง)
    // ทำให้ออเดอร์ใหม่ทุกใบขึ้นแดงตั้งแต่วินาทีแรก แดงเลยไม่เหลือความหมาย
    return { label: 'รอชำระ', cls: 'badge bg-warning/15 text-warning-ink' }
  }
  // T14 P4 fix: เดิม return null ตรงนี้ทำให้ badge หายทั้งหน้าเมื่อ paymentMethod เป็น free text
  // จริงในฐาน (เช่น "พร้อมเพย์ 081-234-5678" ที่ seller กรอกเอง ไม่ตรง enum TRANSFER/PROMPTPAY/COD
  // เป๊ะ ๆ) — คำถาม "ได้เงินหรือยัง" ต้องตอบได้เสมอ ใช้ warning (ไม่ใช่เขียว, Verified-Means-Green
  // สงวนไว้ให้ status===CONFIRMED เท่านั้น) แทนการซ่อนข้อมูลไปเงียบ ๆ
  return { label: 'ยังไม่ยืนยันการชำระ', cls: 'badge bg-warning/15 text-warning-ink' }
}

// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
export type TimelineState = 'done' | 'cur' | 'fin' | 'up' | 'cx' | 'mute'
export type TimelineStep = { label: string; state: TimelineState }

/**
 * ORDER_STATUS_META — badge สถานะออเดอร์แบบ Paces token (bg-{semantic}/15 text-{semantic}) + icon
 * เป็น SSOT เดียวสำหรับ badge สถานะฝั่ง seller: หน้า order detail (StatusHero) และชิปเลขออเดอร์ใน
 * inbox list ใช้ชุดนี้ร่วมกัน → label/สีตรงกันข้ามหน้า (กด #เลข จาก inbox ไป detail เห็นสถานะเดียวกัน)
 *
 * ตั้งแต่ feature 00041 (HR16) ฝั่ง buyer ก็อ่านชุดนี้ผ่าน resolveOrderStatusBadge() เช่นกัน
 * — เดิมมี getStatusPill (hex ดิบ) เป็นชุดที่สอง ถูกถอดทิ้งแล้วเพราะไม่มีผู้เรียกจริง
 */
export type OrderStatusTone = 'warning' | 'info' | 'success' | 'danger'

export const ORDER_STATUS_META: Record<
  string,
  { label: string; cls: string; icon: string; tone: OrderStatusTone }
> = {
  // T14 P1: text-{semantic} บน bg-{semantic}/15 ตกคอนทราสต์ AA จริง (วัด: PENDING 1.54:1,
  // SHIPPED 1.83:1, CONFIRMED 2.11:1, CANCELLED 2.68:1) → text-{semantic}-ink (≥4.5:1 ทุกตัว)
  PENDING: { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning-ink', icon: 'clock', tone: 'warning' },
  // "กำลังจัดส่ง" ไม่ใช่ "จัดส่งแล้ว" (user เลือก 2026-08-05) — SHIPPED แปลว่าของออกจากร้านแล้วแต่
  // ยังไม่ถึงมือผู้ซื้อ ซึ่งเป็นสถานะ "ระหว่างทาง" ไม่ใช่สถานะจบ. คำนี้ตรงกับที่ระบบใช้อยู่แล้วทุกที่
  // (ORDER_STAGE_META.SHIPPING, SHIPPING_STAGE_LABEL.SHIPPING) — เดิมมีแต่ badge
  // ฝั่งรายการออเดอร์ที่พูดคนละคำ ทำให้จอเดียวกันขึ้น "จัดส่งแล้ว" บนตารางแต่ "กำลังจัดส่ง" บนการ์ด
  SHIPPED: { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info-ink', icon: 'truck', tone: 'info' },
  CONFIRMED: { label: 'สำเร็จ', cls: 'bg-success/15 text-success-ink', icon: 'circle-check-filled', tone: 'success' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-danger/15 text-danger-ink', icon: 'circle-x', tone: 'danger' },
}

/**
 * แถบสีซ้ายการ์ดออเดอร์บนมือถือ — คีย์เป็น "tone" ไม่ใช่ "status"
 *
 * เดิม OrderCard ทำ map ของตัวเองที่คีย์ตาม status ตรง ๆ ซึ่งพังทันทีที่ป้ายเริ่ม derive
 * จากสถานะพัสดุด้วย (resolveOrderStatusBadge): ใบ COD ที่ส่งถึงแล้วจะได้ป้ายเหลือง
 * "รอเงิน COD" แต่แถบซ้ายยังฟ้าตาม status=SHIPPED = การ์ดใบเดียวมีสองสีที่ขัดกันเอง
 */
export const ORDER_STATUS_TONE_BORDER: Record<OrderStatusTone, string> = {
  warning: 'border-warning',
  info: 'border-info',
  success: 'border-success',
  danger: 'border-danger',
}

/**
 * ORDER_STATUS_TONE_TO_MUI — สะพานจาก tone ของ SSOT (`ORDER_STATUS_META`) ไปเป็นสีของ MUI
 *
 * ทำไมต้องมี: `ORDER_STATUS_META.cls` เป็น Tailwind/Paces token ใช้กับฝั่ง buyer (Vuexy/MUI) ไม่ได้
 * แต่ `label`/`tone` ใช้ร่วมกันได้ — ตัวนี้จึงเป็นจุดเดียวที่แปลง tone → ThemeColor เพื่อให้ทั้ง
 * สองสกินอ่าน **คำเดียวกัน** จาก SSOT เดียวกัน (Hard Rule 16)
 *
 * ชื่อ tone ตรงกับ MUI ทุกตัวยกเว้น danger → error (MUI ไม่มี 'danger')
 */
export const ORDER_STATUS_TONE_TO_MUI = {
  warning: 'warning',
  info: 'info',
  success: 'success',
  danger: 'error',
} as const satisfies Record<OrderStatusTone, string>

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

/**
 * ชื่อผู้ซื้อที่จะโชว์บนหน้าจอ — SSOT ตัวเดียวของหน้ารายละเอียดคำสั่งซื้อ
 *
 * ลำดับ: ชื่อบัญชีที่สมัครไว้ (displayName > username) > ชื่อที่ร้านบันทึกเองตอนสร้างออเดอร์
 * (logic เดิมยกมาจาก OrderFactsCard/CustomerDetails ที่ derive อยู่ก่อนแล้ว)
 *
 * ทำไมต้องมีฟังก์ชันนี้แทนที่จะให้แต่ละการ์ด derive เอง: StatusHero (หัวหน้า) กับ OrderFactsCard
 * (การ์ดผู้ซื้อ) อยู่หน้าเดียวกันและพูดถึงคนคนเดียวกัน ถ้าต่างคนต่าง derive จะได้คำต่างกัน
 * เมื่อข้อมูลไม่ครบ — ผู้ใช้เห็นสองการ์ดในหน้าเดียวเรียกสถานะเดียวกันคนละชื่อ
 *
 * **คืนสตริงที่พร้อมแสดง ไม่ใช่ raw field** โดยเจตนา: หน้า (paces) อยู่ใต้ client layout ทำให้
 * Next serialize ทุก prop ลง flight payload — การส่งสตริงเดียวที่ resolve แล้วจึงไม่ขยายพื้นที่
 * PII ของ client boundary เกินจำเป็น (บทเรียน S-C1 neutralize-at-source)
 */
export function resolveBuyerDisplayName(input: {
  buyerDisplayName?: string | null
  buyerUsername?: string | null
  buyerName?: string | null
  /** มีช่องทางติดต่อ (เบอร์/อีเมล) ไหม — แยก "ยังไม่มีผู้ซื้อ" ออกจาก "มีผู้ซื้อแต่ไม่รู้ชื่อ" */
  hasContact?: boolean
}): string {
  const registered = input.buyerDisplayName || input.buyerUsername || null
  const name = registered || input.buyerName || null
  if (name) return name
  // คำสองคำนี้ต้องตรงกับที่ OrderFactsCard ใช้อยู่แล้ว — คนละคำ = ผู้ใช้คิดว่าคนละเรื่อง
  return input.hasContact ? 'ไม่ระบุชื่อ' : 'ยังไม่มีผู้ซื้อยืนยัน'
}
