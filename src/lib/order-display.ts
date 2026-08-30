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
 * แพตเทิร์นที่แปลว่า "เก็บเงินปลายทาง" — **แหล่งเดียวทั้งระบบ**
 *
 * 🛑 export เพราะ SQL ต้องใช้ตัวเดียวกัน (CR 2026-08-25 — ตัวกรองกองพัสดุย้ายไปทำที่ฐาน)
 * Postgres `~*` เป็น POSIX regex case-insensitive ซึ่งให้ผลเหมือน `/…/i` ของ JS สำหรับ
 * แพตเทิร์นชุดนี้ (alternation ล้วน ไม่มี lookahead/backreference) — มีเทสเทียบสองฝั่งปักหมุดไว้
 */

import { isAppointmentPast } from "./appointments";
export const COD_PAYMENT_PATTERN = 'COD|ปลายทาง|เก็บเงิน'

/**
 * คอมไพล์ครั้งเดียวตอนโหลดโมดูล — **ห้ามย้ายไปสร้างในฟังก์ชัน**
 * `isCODPayment` ถูกเรียกต่อออเดอร์หนึ่งใบใน `deriveShippingStage()` ⇒ การสร้าง RegExp ใหม่
 * ทุกครั้งคือการจ่ายค่าคอมไพล์เท่าจำนวนแถวทั้งหน้าโดยไม่ได้อะไรกลับมา
 */
const COD_PAYMENT_RE = new RegExp(COD_PAYMENT_PATTERN, 'i')

/**
 * isCODPayment — ตรวจว่า paymentMethod เป็นการชำระเงินปลายทาง (COD) หรือไม่
 *
 * ทำไม: logic นี้เคยอยู่ใน OrderDetailMobile.tsx เป็น local fn แต่ S-13 ต้องการ
 * export canonical เพื่อ test + reuse ใน showSlipZone และ UI task (S-8/S-9) สามารถ
 * import จากที่เดียวแทนการ duplicate — UI task จะลบ local fn ออกเมื่อ import ตัวนี้
 */
export function isCODPayment(paymentMethod: string | null | undefined): boolean {
  return COD_PAYMENT_RE.test(paymentMethod ?? '')
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
 *
 * 🛑 `tone` เพิ่มเข้ามา (feature 00062, SDS TD-003) — breaking change ที่ตั้งใจ: `cls` เป็น
 * Tailwind/Paces class string ใช้กับฝั่งผู้ซื้อ (Vuexy/MUI) ตรง ๆ ไม่ได้ ต้องมี `tone` เป็น
 * สะพานผ่าน `ORDER_STATUS_TONE_TO_MUI[tone]` (นิยามอยู่ท้ายไฟล์นี้) เพื่อให้ทั้งสองสกินอ่าน
 * คำเดียวกันจาก SSOT เดียวกัน (Hard Rule 16) — ทุก branch ของ getPaymentBadge ต้องคืน tone
 * คู่กับ cls เสมอ ห้ามลืมแม้แต่ branch เดียว
 */
export type PaymentBadge = { label: string; cls: string; tone: OrderStatusTone } | null

/**
 * canSellerConfirmPayment — "ออเดอร์ใบนี้ร้านกดยืนยันรับเงินเองได้ไหม" (feature 00062)
 *
 * 🛑 **นิยามคือ "ไม่ใช่ COD" ไม่ใช่ allow-list 3 ค่า** — เหตุผล 2 ชั้น:
 *
 * 1. **ข้อมูลจริงบน prod เป็น free text** — `paymentMethod` ไม่ใช่ enum ร้านพิมพ์เองได้
 *    (เช่น "พร้อมเพย์ 081-234-5678" ซึ่งมีจริง ดูคอมเมนต์ T14 P4 ท้ายฟังก์ชัน getPaymentBadge)
 *    ถ้าใช้ equality กับ 3 ค่า ออเดอร์พวกนี้จะ "ยืนยันได้ที่ฝั่ง service แต่ป้ายบนจอไม่เปลี่ยน"
 *    = ร้านกดแล้วไม่เกิดอะไรขึ้นบนหน้าจอ ตลอดไป
 * 2. **สิ่งเดียวที่ต้องห้ามจริง ๆ คือ COD** เพราะ `Order.codReceivedAt` เป็นเจ้าของคำถามนั้นอยู่แล้ว
 *    และ DB มี CHECK `Order_payment_confirm_exclusive_check` กันสองช่องมีค่าพร้อมกัน
 *
 * 🛑 ตัวนี้ต้องเป็นเกณฑ์เดียวกับที่ `setPaymentConfirmed()` (order.service.ts) ใช้ตัดสินตอนเขียน
 * (Hard Rule 16) — เคยแตกกันมาแล้วในรอบเดียวกันที่สร้างมันขึ้นมา: ฝั่งเขียนใช้ `!isCODPayment`
 * ส่วนฝั่งป้ายใช้ equality 3 ค่า ⇒ ออเดอร์ `CARD`/free-text ยืนยันได้แต่ป้ายค้างที่
 * "ยังไม่ยืนยันการชำระ" ตลอดไปโดยไม่มี gate ไหนฟ้อง
 *
 * ทำไม: SSOT เดียวของ "นี่คือการชำระที่ร้านกด 'ได้รับเงินแล้ว' เองได้ไหม" (feature 00062,
 * FR-PAY-01/FR-PAY-02) — ใช้ equality ตรง ๆ กับ 3 ค่า enum ที่ระบบควบคุมเอง (ตรงกับที่
 * `getPaymentBadge` เดิมใช้ equality ตัดสิน TRANSFER/PROMPTPAY อยู่แล้ว) ไม่ใช่ regex บน
 * free text — SRS FR-PAY-02 ห้ามสร้าง criteria ที่สามของ "นี่คือการโอนไหม" (มีอยู่แล้ว 2 ชุด:
 * `isCODPayment`/`COD_PAYMENT_PATTERN` ที่ match free text กับเกณฑ์ equality ตรงนี้)
 */
export function canSellerConfirmPayment(paymentMethod: string | null | undefined): boolean {
  return !isCODPayment(paymentMethod)
}

/** @deprecated ใช้ `canSellerConfirmPayment` — ชื่อเดิมชวนเข้าใจว่าเป็น allow-list 3 ค่า */
export const isTransferLikePayment = canSellerConfirmPayment

/**
 * getPaymentBadge — derive badge การชำระเงินจากสถานะออเดอร์ + วิธีชำระ + สลิป + การยืนยันของร้าน
 *
 * ทำไม: ยกมาจาก local fn ใน PaymentCard.tsx (T5, contract กลางให้ task อื่น import ร่วม)
 * ต่างจาก ORDER_STATUS_META (badge สถานะออเดอร์ 4 ค่า PENDING/SHIPPED/CONFIRMED/CANCELLED)
 * ตัวนี้คือ badge ของ "การชำระเงิน" โดยเฉพาะ — ใบเดียวกันอาจมี badge สถานะออเดอร์ = SHIPPED
 * แต่ badge การชำระเงิน = "ชำระแล้ว" คนละแกนกัน
 *
 * Verified-Means-Green: เขียว (bg-success) สงวนไว้เฉพาะ "ชำระแล้ว" จริง (status=CONFIRMED)
 * เท่านั้น — "รอตรวจสอบสลิป"/"รอชำระ"/"รอเก็บปลายทาง"/"ร้านยืนยันรับเงินแล้ว" ต้องเป็น
 * info/warning ห้ามเขียว
 *
 * 🛑 feature 00062 (UX-Design-Spec §B8, SDS TD-003): `paymentConfirmedAt` มีค่า = ร้านกด
 * "ได้รับเงินแล้ว" เอง (self-report ไม่มีบุคคลที่สามยืนยัน) ⇒ ต้อง **เช็คก่อน `slipFileId`
 * เสมอ** — ร้านยืนยันแล้วชนะ "รอตรวจสอบสลิป" (สัญญาณจากร้านแน่นอนกว่าสลิปที่ยังไม่ตรวจ)
 * และ **ห้ามใช้ tone success/เขียว** — เขียวสงวนให้ status===CONFIRMED เท่านั้น
 */
export function getPaymentBadge(
  status: string,
  paymentMethod: string | null | undefined,
  slipFileId: string | null | undefined,
  paymentConfirmedAt: Date | string | null | undefined,
): PaymentBadge {
  // T14 P1: text-{semantic} บน bg-{semantic}/15 ตกคอนทราสต์ AA (วัดจริง: warning 1.54:1 ฯลฯ)
  // → ใช้ token "หมึก" คู่กัน (text-{semantic}-ink, src/assets/css/config/_root.css) ผ่าน ≥4.5:1
  if (status === 'CONFIRMED') {
    return { label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success-ink', tone: 'success' }
  }
  if (status === 'CANCELLED') {
    // default-400 บน default-100 = 2.3:1 (ไม่ผ่าน) → default-800 (~10.7:1)
    /**
     * 🛑 tone ต้องเป็น 'neutral' ให้ตรงกับ cls สีเทา — ไม่ใช่ 'warning'
     *
     * cls (Paces) กับ tone (สะพานไป MUI ฝั่งผู้ซื้อ) ต้องพูดสีเดียวกันเสมอ ไม่งั้นออเดอร์ใบเดียวกัน
     * จะขึ้นเทาบนจอผู้ขายแต่ส้มบนจอผู้ซื้อ — และ "ยกเลิก" ในบริบท *การชำระเงิน* ไม่ใช่เรื่องที่ต้อง
     * แย่งความสนใจ (งานจบไปแล้ว ไม่มีอะไรให้ทำต่อ) ต่างจาก ORDER_STATUS_META.CANCELLED ที่เป็น
     * ป้าย *สถานะออเดอร์* ซึ่งใช้ danger เพราะเป็นข้อมูลหลักของใบนั้น
     */
    return { label: 'ยกเลิก', cls: 'badge bg-default-100 text-default-800', tone: 'neutral' }
  }
  if (isCODPayment(paymentMethod)) {
    return { label: 'รอเก็บปลายทาง', cls: 'badge bg-info/15 text-info-ink', tone: 'info' }
  }
  // feature 00062 — ต้องมาก่อนกิ่ง slipFileId เสมอ (ดูคอมเมนต์หัวฟังก์ชัน) ห้ามสลับลำดับ
  if (canSellerConfirmPayment(paymentMethod) && paymentConfirmedAt) {
    return { label: 'ร้านยืนยันรับเงินแล้ว', cls: 'badge bg-info/15 text-info-ink', tone: 'info' }
  }
  // TRANSFER / PROMPTPAY
  if (paymentMethod === 'TRANSFER' || paymentMethod === 'PROMPTPAY') {
    if (slipFileId) return { label: 'รอตรวจสอบสลิป', cls: 'badge bg-info/15 text-info-ink', tone: 'info' }
    // "รอชำระ" เป็นสถานะปกติของออเดอร์ที่เพิ่งสร้าง ไม่ใช่ความผิดพลาด — ห้ามใช้ danger (แดง)
    // ทำให้ออเดอร์ใหม่ทุกใบขึ้นแดงตั้งแต่วินาทีแรก แดงเลยไม่เหลือความหมาย
    return { label: 'รอชำระ', cls: 'badge bg-warning/15 text-warning-ink', tone: 'warning' }
  }
  // T14 P4 fix: เดิม return null ตรงนี้ทำให้ badge หายทั้งหน้าเมื่อ paymentMethod เป็น free text
  // จริงในฐาน (เช่น "พร้อมเพย์ 081-234-5678" ที่ seller กรอกเอง ไม่ตรง enum TRANSFER/PROMPTPAY/COD
  // เป๊ะ ๆ) — คำถาม "ได้เงินหรือยัง" ต้องตอบได้เสมอ ใช้ warning (ไม่ใช่เขียว, Verified-Means-Green
  // สงวนไว้ให้ status===CONFIRMED เท่านั้น) แทนการซ่อนข้อมูลไปเงียบ ๆ
  return { label: 'ยังไม่ยืนยันการชำระ', cls: 'badge bg-warning/15 text-warning-ink', tone: 'warning' }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🛑 `RETURNED` เพิ่มเข้ามา 2026-08-25 — feature 00056 เพิ่มค่านี้ลง DB ตั้งแต่ 2026-08-24
 * แต่ **ไม่ได้ขยาย type ตาม** ⇒ `switch (status)` ใน `getOrderTimeline` ดู "ครบถ้วนตามชนิด"
 * ในสายตา TypeScript ทั้งที่ขาดเคสจริง ⇒ ส่ง 'RETURNED' เข้าไปได้ `undefined`
 * แล้ว `<HorizontalTimeline steps={undefined}>` ทำ `.map()` = **หน้าออเดอร์ของผู้ซื้อพังทั้งหน้า**
 *
 * ยังไม่มีใครเจอเพราะ prod มีออเดอร์ RETURNED 0 ใบ (ตรวจ 2026-08-25) — มันรออยู่เฉย ๆ
 * คลาสเดียวกับ `docs/conventions/enum-value-removal.md` แค่กลับทิศ (เพิ่มค่า ไม่ใช่ลบ)
 *
 * **ห้ามแคบกว่าค่าที่ DB ผลิตได้จริง** — type ที่แคบกว่าความจริงไม่ได้ป้องกันอะไร
 * มันแค่ปิดตา `tsc` ไม่ให้เห็นเคสที่ขาด
 */
export type OrderStatus = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED' | 'RETURNED'
export type TimelineState = 'done' | 'cur' | 'fin' | 'up' | 'cx' | 'mute'
export type TimelineStep = {
  label: string
  state: TimelineState
  /**
   * บรรทัดอธิบายใต้ป้าย — **optional** ผู้ผลิตรางที่ไม่มีอะไรจะอธิบายไม่ต้องส่ง
   *
   * มีไว้รับสถานะที่ **ไม่คู่ควรกับขั้นของตัวเอง แต่ทิ้งไปก็ไม่ได้**:
   * `RESCHEDULE_REQUESTED` (ลูกค้าขอเลื่อน) · `NO_SHOW` (ไม่มาตามนัด) · งานที่ไม่ได้นัดล่วงหน้า
   *
   * 🛑 ถ้ายัดสถานะพวกนี้เป็น "ขั้น" เพิ่ม จำนวนขั้นจะผันตามข้อมูล ⇒ ลูกค้าที่เปิดสองครั้ง
   * เห็นจอคนละรูปแล้วอ่านว่าระบบเพี้ยน — ราง = โครงคงที่ · note = สิ่งที่เกิดกับใบนี้
   */
  note?: string
}

/**
 * ORDER_STATUS_META — badge สถานะออเดอร์แบบ Paces token (bg-{semantic}/15 text-{semantic}) + icon
 * เป็น SSOT เดียวสำหรับ badge สถานะฝั่ง seller: หน้า order detail (StatusHero) และชิปเลขออเดอร์ใน
 * inbox list ใช้ชุดนี้ร่วมกัน → label/สีตรงกันข้ามหน้า (กด #เลข จาก inbox ไป detail เห็นสถานะเดียวกัน)
 *
 * ตั้งแต่ feature 00041 (HR16) ฝั่ง buyer ก็อ่านชุดนี้ผ่าน resolveOrderStatusBadge() เช่นกัน
 * — เดิมมี getStatusPill (hex ดิบ) เป็นชุดที่สอง ถูกถอดทิ้งแล้วเพราะไม่มีผู้เรียกจริง
 */
export type OrderStatusTone = 'warning' | 'info' | 'success' | 'danger' | 'neutral'

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
  /**
   * feature 00056 — ลูกค้ารับของแล้วส่งคืน (คนละเรื่องกับ "ยกเลิก" ซึ่งแปลว่าไม่เคยส่ง)
   * warning ไม่ใช่ danger: ของกลับมาถึงร้านเรียบร้อย ไม่ใช่เหตุที่ต้องรีบทำอะไร —
   * ต่างจาก "พัสดุมีปัญหา" ที่ยังไม่รู้ผล · ไอคอนลูกศรย้อนกลับชุดเดียวกับกอง "ตีกลับ"
   */
  RETURNED: { label: 'คืนของแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'arrow-back-up', tone: 'warning' },
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
  /**
   * feature 00062 — "ไม่มีอะไรต้องทำแล้ว" (เช่นป้ายการชำระเงินของใบที่ยกเลิก) ไม่ใช่สถานะ
   * ที่ควรแย่งความสนใจ ⇒ เทา ไม่ใช่ส้ม/แดง
   */
  neutral: 'border-default-300',
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
  // MUI ไม่มี 'neutral' — 'secondary' คือสีเทาของ Vuexy ซึ่งตรงกับ bg-default-100 ฝั่ง Paces
  neutral: 'secondary',
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

    /**
     * feature 00056 — ของเดินครบเส้นทางแล้วจริง (ผู้ซื้อได้รับ → ส่งคืน → ร้านรับคืน)
     * จึงเป็น `done → done → fin` **ไม่ใช่ `cx`** แบบยกเลิก ซึ่งแปลว่า "ไม่เคยส่ง"
     * (ความต่างนี้เขียนแยกไว้แล้วที่ `ORDER_STATUS_META.RETURNED` — ต้องพูดตรงกัน HR16)
     */
    case 'RETURNED':
      return [
        { label: 'สั่งซื้อแล้ว',  state: 'done' },
        { label: 'ได้รับสินค้า', state: 'done' },
        { label: 'คืนของแล้ว',   state: 'fin'  },
      ]
  }

  /**
   * 🛑 ด่านกันเคสที่ขาดกลับมาเงียบอีก — ห้ามลบ
   *
   * `switch` ที่ไม่มีทางออกท้ายฟังก์ชันจะคืน `undefined` เมื่อมีค่าใหม่โผล่มา แล้วปลายทาง
   * (`steps.map()`) พังทั้งหน้า · คืนไทม์ไลน์กลาง ๆ ที่ยังอ่านได้แทน — จอที่บอกไม่ละเอียด
   * ดีกว่าจอที่ขาว และ `never` บังคับให้ `tsc` แดงทันทีถ้ามีใครเติมค่าใน type แล้วลืมเคส
   */
  const _exhaustive: never = status
  void _exhaustive
  return [
    { label: 'สั่งซื้อแล้ว', state: 'done' },
    { label: 'ดำเนินการ',   state: 'cur'  },
    { label: 'เสร็จสิ้น',    state: 'up'   },
  ]
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

/**
 * คำเรียกสถานะการชำระเงิน — **ที่เดียวทั้งระบบ** (Hard Rule 16)
 *
 * 🛑 ข้อเท็จจริงเดียวกัน (`outstanding <= 0`) เคยถูกเรียกด้วยคำต่างกัน **บนจอเดียวกัน**:
 *   ป้ายสถานะบนสุด (ร้านบริการ) → "ชำระเงินแล้ว" / "รอชำระ"
 *   ป้ายบนการ์ดเงิน            → "ชำระครบแล้ว" / "ยังค้างชำระ"
 *
 * ผู้ซื้อที่กวาดตาเห็นสองคำนี้พร้อมกันต้องหยุดคิดว่ามันคนละเรื่องกันหรือเปล่า —
 * บนหน้าที่เขากำลังตัดสินใจโอนเงิน · และไม่มี `tsc`/build/เทสตัวไหนฟ้อง เพราะ
 * ทั้งสองคำ "ถูก" ในตัวเอง (HR16 เขียนไว้เองว่าจับได้ด้วย critique เท่านั้น)
 *
 * "จอง" ไม่อยู่ในนี้ เพราะเป็นสถานะของ **การนัด** ไม่ใช่ของเงิน (คนละคำถาม)
 */
export const PAYMENT_STATE_LABEL = {
  /** รับเงินครบตามยอดบิลแล้ว */
  paid: "ชำระเงินแล้ว",
  /** ยังมียอดค้าง */
  outstanding: "รอชำระ",
} as const;

/**
 * ป้ายสถานะของ **งานร้านบริการ** — แทนคำว่า "รอดำเนินการ" ที่ไม่ได้บอกอะไรเลย
 *
 * ## ทำไมต้องมี
 *
 * หัวหน้าเขียนไว้ 2 บรรทัดติดกัน (2026-08-15):
 *   *"เมนูรอยืนยัน คือจอง"* · *"ถ้าเข้ามาหน้าร้านจ่ายเลย ถึงจะเป็นชำระเงินแล้ว"*
 * ⇒ เขากำลังอธิบาย **วงจรของงาน** ไม่ได้ขอเปลี่ยนคำเฉย ๆ
 *
 * ป้ายเดิม `PENDING = "รอดำเนินการ"` ทำให้ **งานที่ลูกค้าจองไว้เดือนหน้า** กับ
 * **งานที่ลูกค้ายืนอยู่หน้าร้านแล้วยังไม่จ่าย** ขึ้นคำเดียวกันเป๊ะ — ร้านบริการไม่มีแกนขนส่ง
 * ป้ายสถานะจึงว่างเปล่ามาตลอด ทั้งที่คำถามเดียวที่ร้านถามจริงคือ *"จ่ายหรือยัง"*
 *
 * ## 🛑 derive ไม่ใช่เปลี่ยนชื่อสถานะ
 *
 * เปลี่ยน `ORDER_STATUS_META.PENDING.label` เป็น "จอง" ตรง ๆ จะ **โกหกงาน walk-in**
 * (21 ใบบน prod ที่ลูกค้าเดินเข้ามาเอง ไม่ได้จองอะไร) — ป้ายต้องมาจากข้อเท็จจริงที่ระบบรู้
 * ซึ่งเพิ่งรู้ได้ตั้งแต่มีตาราง `OrderPayment`
 *
 * 🛑 ป้ายนี้ **ผสม 2 แกน** (สถานะออเดอร์ + สถานะเงิน) ซึ่งปกติเป็นสิ่งที่ต้องเลี่ยง (HR16)
 * ที่ยอมตรงนี้เพราะร้านบริการไม่มีแกนขนส่งให้ผสมด้วย และ "จ่ายหรือยัง" คือแกนเดียวที่มีความหมาย
 * — ห้ามยกแพตเทิร์นนี้ไปใช้กับ `ONLINE_SALES` ซึ่งมีทั้งพัสดุและ COD อยู่แล้ว
 */
export function resolveServiceOrderBadge(input: {
  /** `Order.status` — CANCELLED เป็น terminal ห้ามถูกทับด้วยเรื่องเงิน */
  status: string;
  /** ผลจาก `computeOrderMoney()` — ห้ามคำนวณเองที่ผู้เรียก */
  money: { totalAmount: number; totalReceived: number; outstanding: number };
  /** ใบนี้มีนัดผูกอยู่ไหม — walk-in ไม่ได้ "จอง" จึงต้องได้คนละคำ */
  hasAppointment: boolean;
}): { label: string; cls: string; icon: string; tone: OrderStatusTone } {
  // ยกเลิกแล้วคือจบ — เรื่องเงินไม่เปลี่ยนข้อเท็จจริงนั้น
  if (input.status === "CANCELLED") return ORDER_STATUS_META.CANCELLED;

  const { totalAmount, totalReceived, outstanding } = input.money;

  /**
   * บิลยอด 0 (ยังไม่ได้ใส่รายการ) — ไม่มีอะไรให้เก็บ จึงห้ามขึ้นว่า "ชำระเงินแล้ว"
   * ซึ่งเป็นคำที่อ้างว่ามีธุรกรรมเกิดขึ้นทั้งที่ไม่มี · ตกกลับไปใช้ป้ายเดิม
   */
  if (totalAmount <= 0) return ORDER_STATUS_META[input.status] ?? ORDER_STATUS_META.PENDING;

  if (outstanding <= 0) {
    return {
      label: PAYMENT_STATE_LABEL.paid,
      cls: "bg-success/15 text-success-ink",
      icon: "circle-check",
      tone: "success",
    };
  }

  /**
   * "จอง" = มีนัดไว้ **และยังไม่ได้จ่ายสักบาท** — ตรงกับที่หัวหน้าอธิบาย
   * จ่ายมัดจำมาแล้วแต่ยังค้าง ต้องเป็น "รอชำระ" ไม่ใช่ "จอง" เพราะขั้นตอนเดินหน้าไปแล้ว
   */
  if (input.hasAppointment && totalReceived === 0) {
    return { label: "จอง", cls: "bg-warning/15 text-warning-ink", icon: "calendar-event", tone: "warning" };
  }

  return { label: PAYMENT_STATE_LABEL.outstanding, cls: "bg-warning/15 text-warning-ink", icon: "cash-banknote", tone: "warning" };
}

/**
 * เส้นทางของ **งานร้านบริการ** ที่ลูกค้าเห็นบนหน้า `/o/{token}`
 *
 * ## 🛑 บั๊กที่ฟังก์ชันนี้แก้ — timeline เดิมโกหก
 *
 * `getOrderTimeline()` สำหรับ `NO_SHIPPING + PENDING` คืน
 *   สั่งซื้อแล้ว(done) → **ส่งมอบแล้ว(cur)** → ยืนยันรับ(up)
 *
 * ลูกค้าที่จองล้างแอร์ไว้วันนี้ 09:00 และ **ยังไม่ได้รับบริการ** เปิดหน้านี้แล้วเห็นคำว่า
 * "ส่งมอบแล้ว" เป็นขั้นปัจจุบัน — คำที่อ้างสิ่งที่ยังไม่เกิด บนหน้าที่เขาใช้ตัดสินใจว่าจะโอนเงินไหม
 * (หัวหน้า 2026-08-15: *"order detail ดูไม่รู้เรื่อง"*)
 *
 * เดิมทำอย่างอื่นไม่ได้เพราะระบบไม่รู้อะไรเลยนอกจาก `Order.status` — ตอนนี้รู้ทั้ง
 * **เวลานัด** และ **เงินที่รับจริง** จึงบอกความจริงได้
 *
 * ## ขั้นตอน
 *
 * | ขั้น | done เมื่อ |
 * |---|---|
 * | จองแล้ว | เสมอ (มีบิลแล้ว) |
 * | เข้ารับบริการ | ปิดผลนัดแล้ว (`COMPLETED`) · กำลังถึงคิวเมื่อเลยเวลานัดมาแล้ว |
 * | ยืนยันแล้ว | `Order.status === 'CONFIRMED'` |
 */
/**
 * ถึงเวลาที่ผู้ซื้อ *ควร* กดปิดงานแล้วหรือยัง — ขั้นสุดท้ายของรางต้องเป็น `cur`
 *
 * 🛑 ปุ่มปิดงาน **ย้อนกลับไม่ได้** และทำให้คะแนนร้านขยับ — แต่เดิมมันเป็นปุ่มทึบเต็มความกว้าง
 * ตั้งแต่วินาทีแรกที่เปิดหน้า **ก่อนร้านจะเริ่มให้บริการด้วยซ้ำ** ⇒ เป็นปุ่มที่เด่นที่สุดในจอ
 * ในตอนที่ยังไม่ควรกดที่สุด ซึ่งเป็นรูปแบบเดียวกับช่องทางสแกมที่หน้านี้พยายามกันอยู่
 *
 * ไม่ใช้การ **ปิดปุ่ม** เพราะรางอิงเวลานัดกับสถานะที่ร้านกด — ร้านที่ลืมกดปิดผลนัด
 * จะทำให้ลูกค้าที่ได้รับบริการจริงแล้วกดปิดงานไม่ได้เลย (กติกาเดียวกับ BR-RSV-18:
 * "เต็มแล้ว" เป็นคำเตือนที่ยังกดได้ ไม่ใช่ตัวบล็อก) — ลดแค่ *น้ำหนักสายตา*
 *
 * อ่านจากรางที่เรนเดอร์อยู่จริง ไม่ใช่คำนวณเงื่อนไขใหม่ ⇒ ปุ่มกับรางพูดตรงกันเสมอ
 */
export function isFinalStepReady(steps: TimelineStep[]): boolean {
  return steps[steps.length - 1]?.state === "cur";
}

/**
 * ป้ายของรางงานบริการ — **คงลำดับนี้เสมอ ห้ามสลับ**
 *
 * 🛑 จำนวนขั้นไม่คงที่: ขั้น `"ลูกค้ายืนยันนัด"` มีเฉพาะใบที่มีนัดจริง
 * ใบ walk-in จึงได้ราง 3 ขั้น (ดูเหตุผลที่ `getServiceTimeline`)
 * ⇒ ห้าม index ตายตัวจากค่าคงที่นี้ไปหาขั้นบนราง ให้ค้นด้วย `label`
 */
export const SERVICE_TIMELINE_LABELS = [
  "จองบริการ",
  "ลูกค้ายืนยันนัด",
  "ร้านให้บริการ",
  "ยืนยันเสร็จสิ้น",
] as const;

export function getServiceTimeline(input: {
  status: OrderStatus;
  /** ISO/Date ของเวลานัด — null = ยังไม่ระบุเวลา (walk-in ที่ร้านยังไม่กดเริ่ม) */
  serviceStart: string | Date | null | undefined;
  /**
   * ISO/Date ของเวลา**สิ้นสุด**นัด — ใช้ตัดสินว่าเลยหน้าต่างเวลาไปแล้วหรือยัง
   * (เส้นเดียวกับด่านของ backend · ดู `isAppointmentPast`)
   * ไม่ส่งมา = ถือว่ายังไม่เลย ⇒ ผู้เรียกเดิมได้พฤติกรรมเดิมทุกประการ
   */
  serviceEnd?: string | Date | null;
  appointmentStatus: string | null | undefined;
  /**
   * ใบนี้มีนัดผูกอยู่ไหม — **ไม่ใช่** `serviceStart != null`
   *
   * แยกกันเพราะนัดที่ยังไม่ระบุเวลาก็เป็นนัด และ walk-in ที่ร้านกด "เริ่มงานเลย" ก็ได้เวลา
   * ทั้งที่ไม่เคยมีการนัดหมาย — ขั้น "ลูกค้ายืนยันนัด" ต้องผูกกับ *การมีนัด* ไม่ใช่ *การมีเวลา*
   */
  hasAppointment?: boolean;
  /**
   * เวลาที่ลูกค้ากดยืนยัน**นัด** (`Order.buyerConfirmedAt`) — null = ยังไม่กด
   *
   * ใช้ตัดสิน *สถานะ* ของขั้น 2 อย่างเดียว **ไม่ได้เอาไปแสดงเป็นเวลาบนราง** —
   * เวลานั้นแสดงอยู่ในการ์ดนัดหมายแล้ว ("คุณยืนยันนัดนี้แล้ว เมื่อ …")
   * ใส่บนรางด้วยคือค่าเดียวกันสองที่บนจอเดียว (`sibling-surface-parity.md`)
   */
  buyerConfirmedAt?: string | Date | null;
  now?: Date;
}): TimelineStep[] {
  const confirmed = input.status === "CONFIRMED";
  const served = input.appointmentStatus === "COMPLETED";
  const noShow = input.appointmentStatus === "NO_SHOW";
  /**
   * มีนัดไหม — ผู้เรียกที่ยังไม่ส่ง `hasAppointment` ถอยไปเดาจากสัญญาณของนัดที่มี
   * (ค่าใด ๆ ใน `appointmentStatus` แปลว่ามีนัดเสมอ เพราะคอลัมน์นี้ NULL เมื่อไม่มีนัด)
   */
  const hasAppt = input.hasAppointment ?? input.appointmentStatus != null;

  const startMs = input.serviceStart ? new Date(input.serviceStart).getTime() : NaN;
  const nowMs = (input.now ?? new Date()).getTime();
  /**
   * "ถึงคิวแล้ว" ตัดสินจากเวลาที่ผ่านไป ไม่ใช่จากสถานะที่ร้านกด — ร้านที่ยุ่งจะกดปิดผลทีหลัง
   * ถ้ารอให้ร้านกดก่อน ลูกค้าที่นั่งอยู่ในร้านจะเห็นว่า "ยังไม่ถึงคิว" ซึ่งขัดกับสิ่งที่เขาเห็นด้วยตา
   */
  const arrived = Number.isFinite(startMs) && nowMs >= startMs;

  const buyerConfirmed = input.buyerConfirmedAt != null || input.appointmentStatus === "CONFIRMED_BY_BUYER";

  /* ── ขั้น 3: ร้านให้บริการ ────────────────────────────────────────────
     `confirmed` นับเป็น done ด้วย — ลูกค้ากดปิดงานได้ก็ต่อเมื่อได้รับบริการแล้ว
     (ร้านที่ลืมกดปิดผลนัดไม่ควรทำให้ไทม์ไลน์ของลูกค้าค้างย้อนหลัง)

     🛑 **ขั้นนี้เดินไม่ได้จนกว่าลูกค้าจะยืนยันนัด** — เดิมใช้แค่ "เลยเวลานัดหรือยัง"
     ⇒ ใบที่ลูกค้ายังไม่กดยืนยันแต่เลยเวลาแล้ว ได้ขั้นปัจจุบัน **สองขั้นพร้อมกัน**
     (หัวหน้าเห็นบนจอจริง 2026-08-29: "2 สถานะ อันนี้สื่อถึงอันไหนอยู่หรือยังไง")

     ตอนแรกผมแก้ด้วยการ *ข้ามขั้น 2 ทิ้ง* แต่หัวหน้าทักว่ากลับด้าน — ของจริงคือ
     **ร้านให้บริการไม่ได้เพราะยังรอลูกค้ายืนยันอยู่** ⇒ ขั้น 3 ต้องยัง "ไม่ถึง"
     และขั้น 2 ยังเป็นขั้นปัจจุบัน เพราะคนที่ต้องขยับคือลูกค้า

     walk-in ไม่มีขั้น 2 ให้รอ ⇒ เข้า `cur` ได้ทันทีเหมือนเดิม */
  const servedState: TimelineState =
    served || confirmed
      ? "done"
      : noShow
        ? "cx"
        : !hasAppt || (buyerConfirmed && arrived)
          ? "cur"
          : "up";
  const step3Done = servedState === "done";

  /* ── ขั้น 2: ลูกค้ายืนยันนัด — **มีเฉพาะใบที่มีนัดจริง** ────────────────
     🛑 ใบ walk-in ไม่มีนัดให้ยืนยัน ⇒ **ตัดขั้นนี้ทิ้งทั้งขั้น** ไม่ใช่แสดงจาง ๆ

     เดิมแสดงเป็น `mute` พร้อมคำอธิบาย "งานนี้ไม่ได้นัดล่วงหน้า" — หัวหน้าเห็นบนจอจริง
     แล้วสั่งให้ตัดออก (2026-08-29): มันกินหนึ่งช่องบนรางเพื่อบอกว่า "ช่องนี้ไม่เกี่ยวกับคุณ"
     ซึ่งทำให้อีก 3 ขั้นที่เป็นเรื่องจริงแคบลงโดยไม่ได้อะไรกลับมา
     รางควรเล่าเฉพาะสิ่งที่จะเกิดกับใบนี้ ไม่ใช่ลิสต์ขั้นที่ระบบรองรับ

     เหลือ 2 กรณีที่ต้องแยก (คำนวณเมื่อมีนัดเท่านั้น):
     · กดแล้ว             → `done`
     · ไม่เคยกด แต่ขั้น 3 จบไปแล้ว → `mute` = **ข้ามไป** ห้ามค้างเป็น "รออยู่"
       ไทม์ไลน์ที่ขั้นก่อนหน้ายังรอ ขณะที่ขั้นถัดไปเสร็จแล้ว คือไทม์ไลน์ที่โกหก
       และเกิดบ่อยมาก (ลูกค้าส่วนใหญ่ไม่เคยกดยืนยันนัด แต่ก็มาตามนัด) */
  /**
   * 🛑 **รางต้องมีขั้นปัจจุบันได้ขั้นเดียว** — บังคับที่ขั้น 3 (ดูด้านบน) ไม่ใช่ที่นี่
   *
   * เดิมกฎนี้กันเฉพาะตอนขั้น 3 **จบแล้ว** ⇒ เคสที่พบบ่อยมากหลุดไป:
   * ลูกค้าไม่เคยกดยืนยันนัด แล้ว **เลยเวลานัดมาแล้ว** (ร้านยังไม่กดปิดผล)
   * ⇒ ขั้น 2 เป็น `cur` เพราะยังรอลูกค้า · ขั้น 3 เป็น `cur` เพราะถึงเวลาแล้ว
   * ได้จุดวงแหวนหน้าตาเหมือนกันสองจุดติดกัน **แล้วรางตอบไม่ได้ว่าตอนนี้อยู่ไหน**
   * ซึ่งเป็นคำถามเดียวที่รางมีไว้ตอบ (หัวหน้าเห็นบนจอจริง 2026-08-29:
   * "2 สถานะ อันนี้สื่อถึงอันไหนอยู่หรือยังไง")
   *
   * พอเวลานัดมาถึง การกดยืนยัน "จะมาตามนัด" หมดความหมายไปแล้ว —
   * ขั้น 2 จึงเป็นขั้นที่ **ถูกข้าม** ไม่ใช่ขั้นที่ยังรออยู่ (กติกาเดียวกับตอนขั้น 3 จบ)
   */
  const confirmState: TimelineState = buyerConfirmed ? "done" : step3Done || noShow ? "mute" : "cur";

  /* ── ขั้น 4: ยืนยันเสร็จสิ้น ────────────────────────────────────────── */
  const finishState: TimelineState = confirmed ? "fin" : noShow ? "mute" : step3Done ? "cur" : "up";

  /**
   * ── บรรทัดอธิบายใต้ป้าย ─────────────────────────────────────────────
   *
   * 🛑 นี่คือที่ที่สถานะซึ่ง "ไม่คู่ควรกับขั้นของตัวเอง" ไปอยู่ — ตรวจ prod 2026-08-28:
   * `RESCHEDULE_REQUESTED` และ `NO_SHOW` ยังเป็น 0 ใบทั้งคู่ **แต่โค้ดผลิตได้ทั้งสองค่า**
   * ปล่อยให้ตกลงมาเป็น `cur`/`cx` เฉย ๆ = จอบอกแค่ "รออยู่/ไม่สำเร็จ" โดยไม่บอกว่าเพราะอะไร
   *
   * `undefined` แปลว่า "ไม่มีอะไรต้องอธิบาย" — ห้ามใส่สตริงว่างหรือขีด (ตัวเรนเดอร์กันที่ว่างเอง)
   */
  const confirmNote =
    input.appointmentStatus === "RESCHEDULE_REQUESTED"
      ? "ลูกค้าขอเลื่อนนัด"
      : confirmState === "mute"
        ? "ไม่ได้ยืนยัน"
        : confirmState === "cur"
          ? /* 🛑 เลยหน้าต่างเวลานัดไปแล้ว คำว่า "รอยืนยันว่าจะมาตามนัด" กลายเป็นคำที่ไม่จริง —
               มันบอกให้รอสิ่งที่ผ่านไปแล้ว · รางเล่าแค่ข้อเท็จจริงว่า "ยังไม่ได้ยืนยัน"
               ส่วนคำอธิบายว่าเกิดอะไรขึ้นและทำอะไรต่อได้ อยู่ที่การ์ดนัดหมายที่เดียว
               (ไม่พูดซ้ำสองที่ — คลาสที่ไล่ปิดมาทั้งหน้า) */
            /* 🛑 ต้องส่ง `now` ของฟังก์ชันเข้าไปด้วย — ไม่งั้นตัวช่วยจะใช้ **เวลาจริง**
               ขณะที่ส่วนอื่นของรางใช้ `input.now` ⇒ รางเดียวกันตัดสินเวลาด้วยนาฬิกาคนละเรือน
               (เทสจับได้ทันที เพราะเทสฉีดเวลาเข้ามา — แต่บน prod จะเงียบสนิท) */
            isAppointmentPast(input.serviceEnd, input.now ?? new Date())
            ? "ยังไม่ได้ยืนยัน"
            : "รอยืนยันว่าจะมาตามนัด"
          : undefined;

  /**
   * 🛑 `"ถึงเวลานัดแล้ว"` พูดถึง**นัด** จึงใส่ได้เฉพาะใบที่มีนัดจริง
   *
   * ใบ walk-in เข้า `cur` ผ่านกิ่ง `!hasAppt` (ไม่ใช่ `arrived`) — เดิมจึงได้คำนี้ไปด้วย
   * แล้วจอเดียวกันขึ้นสองบรรทัดที่ขัดกันเอง: ขั้น 2 "งานนี้ไม่ได้นัดล่วงหน้า" +
   * ขั้น 3 "ถึงเวลานัดแล้ว" (หัวหน้าส่งภาพหน้าจอมา 2026-08-29 — เห็นทั้งคู่พร้อมกัน)
   *
   * ใบ walk-in ไม่มีคำอธิบาย เพราะไม่มีอะไรต้องอธิบายจริง ๆ: สถานะ `cur` บนจุดบอกครบแล้วว่า
   * "อยู่ขั้นนี้" ส่วนเวลาที่ร้านเริ่มงานเป็นสิ่งที่ระบบไม่รู้ — เดาให้คือแต่งเรื่อง
   */
  const servedNote = noShow ? "ไม่มาตามนัด" : servedState === "cur" && hasAppt ? "ถึงเวลานัดแล้ว" : undefined;

  const finishNote =
    finishState === "cur" ? "กดยืนยันเมื่อได้รับบริการแล้ว" : finishState === "mute" ? "ไม่มีการปิดงาน" : undefined;

  const steps: TimelineStep[] = [
    { label: SERVICE_TIMELINE_LABELS[0], state: "done" },
    /* ขั้น 2 โผล่เฉพาะใบที่มีนัด — ใบ walk-in ข้ามไปขั้น "ร้านให้บริการ" เลย */
    ...(hasAppt
      ? [
          {
            label: SERVICE_TIMELINE_LABELS[1],
            state: confirmState,
            ...(confirmNote ? { note: confirmNote } : {}),
          } satisfies TimelineStep,
        ]
      : []),
    {
      label: SERVICE_TIMELINE_LABELS[2],
      state: servedState,
      ...(servedNote ? { note: servedNote } : {}),
    },
    {
      label: SERVICE_TIMELINE_LABELS[3],
      state: finishState,
      ...(finishNote ? { note: finishNote } : {}),
    },
  ];

  /**
   * ── คืนของแล้ว (feature 00056) ───────────────────────────────────────
   *
   * 🛑 **เคสนี้เคยไม่มีอยู่เลยในฟังก์ชันนี้** ⇒ ตกลงมาเป็น "ยังเดินอยู่" — ใบที่จบไปแล้ว
   * ขึ้นรางว่ากำลังรอร้านให้บริการ ซึ่งเป็นคำโกหกบนหน้าที่ผู้ซื้อใช้ตัดสินใจ
   * (`getOrderTimeline` ราง 3 ขั้นจัดการค่านี้ครบตั้งแต่ 2026-08-25 พร้อมด่าน `never`
   * แต่ฟังก์ชันนี้ไม่มีทั้งเคสและด่าน — และถูกปิดตาซ้ำด้วย cast ที่ `page.tsx`
   * ซึ่งประกาศ `status` ไว้แค่ 4 ค่า)
   *
   * ต่างจาก `CANCELLED` ตรง **ไม่มีอะไรล้มเหลว** — ของเดินครบเส้นทางแล้วจึงถูกคืน
   * ⇒ ขั้นที่ยังไม่ผ่านเป็น `mute` ("จะไม่เกิดขึ้นอีก") ทั้งหมด **ไม่มี `cx`**
   * ส่วนคำว่าเกิดอะไรขึ้นอยู่ที่ป้ายสถานะ (`ORDER_STATUS_META.RETURNED` = "คืนของแล้ว")
   * รางไม่ต้องพูดซ้ำ (HR16)
   *
   * ในทางปฏิบัติร้านบริการแทบไม่มีทางไปถึงค่านี้ (การคืนของผูกกับพัสดุ) — แต่คอลัมน์
   * `Order.status` เป็น `String` ไม่มี enum กั้น ค่านี้จึงมาถึงได้จริงเสมอ
   */
  if (input.status === "RETURNED") {
    return steps.map((s) =>
      s.state === "done" ? s : { label: s.label, state: "mute" as const },
    );
  }

  /**
   * ── ยกเลิก: ทับทับ "ขั้นที่หยุด" ไม่ใช่ทับทั้งเส้น ────────────────────
   *
   * ขั้นที่เดินผ่านไปแล้วยังเป็นความจริง (บิลถูกสร้างจริง · ลูกค้ายืนยันนัดจริง)
   * ตัวแรกที่ยังไม่ผ่าน = จุดที่มันหยุด → `cx` · ที่เหลือ `mute` เพราะจะไม่เกิดอีกแล้ว
   *
   * ทำแบบนี้ไทม์ไลน์ยัง**บอกได้ว่ายกเลิกตอนไหน** ซึ่งเป็นสิ่งที่ลูกค้าอยากรู้จริง
   * ต่างจากการทาแดงทั้งเส้นซึ่งบอกแค่ว่า "จบแล้ว" (คำอธิบายว่าใครยกเลิกอยู่ในแบนเนอร์แยก)
   */
  if (input.status === "CANCELLED") {
    let stopped = false;
    return steps.map((s) => {
      if (s.state === "done") return s;
      /* 🛑 ทิ้ง `note` ของขั้นที่เปลี่ยนสถานะ — คำอย่าง "รอยืนยันว่าจะมาตามนัด" เขียนไว้ตอนที่
         ใบยังเดินอยู่ ปล่อยติดมากับใบที่ยกเลิกแล้วคือบอกให้ผู้ใช้รอสิ่งที่จะไม่เกิดขึ้นอีก
         (`note` ที่เหลืออยู่บนขั้น `done` ยังจริง เพราะมันเล่าสิ่งที่เกิดไปแล้ว) */
      const { note: _dropped, ...rest } = s;
      void _dropped;
      if (!stopped) {
        stopped = true;
        return { ...rest, state: "cx" as const };
      }
      return { ...rest, state: "mute" as const };
    });
  }

  return steps;
}

/**
 * แถว "จากการคุยที่ …" บนหน้าออเดอร์ผู้ซื้อ ควรขึ้นไหม
 *
 * 🛑 บล็อกหลักฐานร้าน (`ShopEvidence`) ลิสต์ **ทุกเพจของร้าน** อยู่เหนือแถวนี้พอดี ⇒
 * ร้านที่มีเพจเดียวได้ชื่อเพจเดียวกัน **สองบรรทัดติดกัน** (หัวหน้าเห็นบนจอจริง 2026-08-29:
 * "BT Premium Auto Xenon คลอง4 ธนบุรี" แล้วตามด้วย "จากการคุยที่ BT Premium Auto Xenon คลอง4 ธนบุรี")
 *
 * 🛑 **2026-08-30 แถวนี้กลายเป็น *ทางสำรอง*** — คำตอบหลักย้ายไปเป็นป้าย "คุยกันที่นี่"
 * บน **แถวเพจนั้นเอง** ในแถบช่องทาง (ที่ที่กดเข้าไปตรวจเพจต่อได้ทันที) บรรทัดนี้เหลือไว้
 * สำหรับเพจที่แถบแสดงไม่ได้ — LINE · เพจที่ถอดออกแล้ว · เพจที่ไม่รู้ชื่อ — ถ้าลบทิ้ง
 * ที่มาของออเดอร์กลุ่มนั้นจะหายเงียบ ๆ
 *
 * 🛑 **เกณฑ์คือ "ป้ายไปเกาะแถวไหนได้ไหม" ไม่ใช่ "มีเพจกี่ใบ"** — ของเดิมเขียน
 * `channelNames.length === 1 && …` ซึ่งปล่อยผ่านทันทีที่ร้านมี 2 เพจ **แม้ทั้งสองใบชื่อเดียวกัน**
 * (เคสจริงบนจอ: IG + Facebook ตั้งชื่อเหมือนกันเป๊ะ ⇒ ชื่อร้านโผล่ 4 รอบในการ์ดเดียว)
 * เกณฑ์ที่ผูกกับ *จำนวน* พังทุกครั้งที่จำนวนเปลี่ยนโดยความหมายไม่เปลี่ยน
 *
 * 🛑 **เทียบด้วย (ช่องทาง, ชื่อ) ไม่ใช่ชื่อเปล่า** — ร้านตั้งชื่อเพจ IG กับ Facebook เหมือนกันได้
 * เทียบแค่ชื่อแล้วป้ายจะไปเกาะ **ทั้งสองแถว** ซึ่งบอกความจริงผิด (ออเดอร์เกิดที่เพจเดียว)
 * ⇒ ตัวกันนี้กับตัวติดป้ายต้องใช้เกณฑ์เดียวกันเป๊ะ ไม่งั้นได้ทั้งคู่พร้อมกันหรือไม่ได้สักอย่าง
 *
 * @param origin ช่องทาง+ชื่อเพจต้นทาง — `name` เป็น `null` เมื่อไม่รู้ชื่อ (ตัวเรนเดอร์ขึ้นชื่อ
 *   *ช่องทาง* แทน ซึ่งจับคู่กับแถวไหนไม่ได้ ⇒ ต้องมีบรรทัดนี้เสมอ)
 * @param channels ช่องทางทั้งหมดที่ **แถบช่องทางวาดออกมาได้จริง** (กรอง `isRenderableChannel` แล้ว)
 */
export function shouldShowOrderOrigin(
  origin: { provider: string; name: string | null } | null | undefined,
  channels: readonly { provider: string; name: string }[],
): boolean {
  if (origin?.name == null) return true;
  return !channels.some((c) => c.provider === origin.provider && c.name === origin.name);
}
