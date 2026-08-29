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
export type TimelineStep = { label: string; state: TimelineState }

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
      label: "ชำระเงินแล้ว",
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

  return { label: "รอชำระ", cls: "bg-warning/15 text-warning-ink", icon: "cash-banknote", tone: "warning" };
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
export function getServiceTimeline(input: {
  status: OrderStatus;
  /** ISO/Date ของเวลานัด — null = ยังไม่ระบุเวลา (walk-in ที่ร้านยังไม่กดเริ่ม) */
  serviceStart: string | Date | null | undefined;
  appointmentStatus: string | null | undefined;
  now?: Date;
}): TimelineStep[] {
  if (input.status === "CANCELLED") {
    return [
      { label: "จองแล้ว", state: "done" },
      { label: "ยกเลิก", state: "cx" },
      { label: "ยืนยัน", state: "mute" },
    ];
  }

  const served = input.appointmentStatus === "COMPLETED" || input.appointmentStatus === "NO_SHOW";
  const startMs = input.serviceStart ? new Date(input.serviceStart).getTime() : NaN;
  const nowMs = (input.now ?? new Date()).getTime();
  /**
   * "ถึงคิวแล้ว" ตัดสินจากเวลาที่ผ่านไป ไม่ใช่จากสถานะที่ร้านกด — ร้านที่ยุ่งจะกดปิดผลทีหลัง
   * ถ้ารอให้ร้านกดก่อน ลูกค้าที่นั่งอยู่ในร้านจะเห็นว่า "ยังไม่ถึงคิว" ซึ่งขัดกับสิ่งที่เขาเห็นด้วยตา
   */
  const arrived = Number.isFinite(startMs) && nowMs >= startMs;

  const confirmed = input.status === "CONFIRMED";

  return [
    { label: "จองแล้ว", state: "done" },
    {
      label: "เข้ารับบริการ",
      state: served || confirmed ? "done" : arrived ? "cur" : "up",
    },
    { label: "ยืนยันแล้ว", state: confirmed ? "fin" : "up" },
  ];
}
