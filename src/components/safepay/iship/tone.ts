/**
 * ชุดสีตาม tone ที่แผง iShip ใช้ร่วมกัน — SSOT ตัวเดียว
 *
 * เดิม `TONE_BADGE` ถูกประกาศซ้ำ 2 ที่และสองชุดนั้นไม่ตรงกัน ทำให้ badge สถานะขนส่งของพัสดุ
 * ใบเดียวกันขึ้นคนละสี ขึ้นกับว่าเปิดมาจากแผงไหน
 *
 * **ทำไมต้อง `-ink`** — วัดจริงบนพื้น `{semantic}/15` เทียบเกณฑ์ AA ของ body text (4.5:1):
 *
 *   token     text-{semantic}   text-{semantic}-ink
 *   primary        4.17               8.44
 *   info           1.83               7.87
 *   success        2.11               6.68
 *   warning        1.54               6.56
 *   danger         2.68               8.47
 *
 * ตกทั้งห้าตัว รวม primary ที่ดูเหมือนจะพอผ่าน
 *
 * เขียนเต็มคำทุก class — Tailwind สแกนซอร์สเป็นข้อความ ถ้าประกอบชื่อแบบ dynamic (`bg-${tone}/15`)
 * มันจะไม่ถูก generate แล้ว badge จะไม่มีสีโดยไม่มี error ให้เห็น
 */

/** badge สถานะ (มีกรอบ badge) — ใช้กับสถานะพัสดุฝั่งขนส่ง */
export const TONE_BADGE: Record<string, string> = {
  primary: 'badge bg-primary/15 text-primary-ink',
  info: 'badge bg-info/15 text-info-ink',
  success: 'badge bg-success/15 text-success-ink',
  warning: 'badge bg-warning/15 text-warning-ink',
  danger: 'badge bg-danger/15 text-danger-ink',
  secondary: 'badge bg-secondary/15 text-default-700',
}

/** กล่องข้อความแจ้งเตือน (ไม่มีกรอบ badge) — พื้น tint + ตัวหนังสือ ink */
export const NOTICE_BOX: Record<string, string> = {
  primary: 'bg-primary/15 text-primary-ink',
  info: 'bg-info/15 text-info-ink',
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-danger/15 text-danger-ink',
  secondary: 'bg-default-100 text-default-700',
}

/**
 * จุดไอคอนในไทม์ไลน์ — 2 ระดับ ใช้แยก "แถวล่าสุด" ออกจาก "แถวประวัติ"
 *
 * ต่างกันที่ **ความทึบ+ขนาด** ไม่ใช่เฉดสีใหม่ (docs/conventions/contrast-fix-keeps-hue.md):
 * สีของแต่ละจุดยังมาจาก tone ของสถานะนั้นเหมือนเดิมทุกแถว เขียวจึงยังผูกกับ delivered/
 * payment_success เท่านั้นตาม Verified-Means-Green ไม่ใช่ผูกกับคำว่า "ล่าสุด"
 */

/** แถวล่าสุด — พื้นทึบ ตัวหนังสือขาว */
export const TONE_DOT_SOLID: Record<string, string> = {
  primary: 'bg-primary text-white',
  info: 'bg-info text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  /**
   * secondary ของธีมคือ **ม่วง #7b70ef** (`--color-secondary` ใน _root.css) ซึ่งเป็นสีของ
   * buyer/Vuexy ไม่ใช่ Paces — จุดทึบสีนั้นกลางหน้า seller จะอ่านเป็นสีแบรนด์อีกตัว
   * tone นี้หมายถึง "จบแล้วแต่ไม่ใช่ผลที่ต้องการ" (ยกเลิก/หมดอายุ/ตีกลับสำเร็จ/ปิดงาน)
   * เทากลาง ๆ จึงตรงความหมายกว่า และตรงกับ NOTICE_BOX.secondary ที่ก็เลี่ยงม่วงไปแล้ว
   */
  secondary: 'bg-default-500 text-white',
}

/** แถวประวัติ — พื้น tint + ตัวหนังสือ ink (คู่สีที่วัด AA แล้ว ดูตารางบนหัวไฟล์) */
export const TONE_DOT_TINT: Record<string, string> = {
  primary: 'bg-primary/15 text-primary-ink',
  info: 'bg-info/15 text-info-ink',
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-danger/15 text-danger-ink',
  secondary: 'bg-default-100 text-default-700',
}

/**
 * shipmentCurrentDotCls — สีของจุด "ปัจจุบัน" บนแถบพัสดุ 4 ขั้น
 *
 * SSOT ตัวเดียวของ 3 จอที่วาดแถบนี้: แถว/hover ในหน้า `/orders` และการ์ดการจัดส่งในหน้า
 * รายละเอียด — ทั้งสามเคยเขียน `bg-primary` ตายตัวเหมือนกันหมด ⇒ พัสดุที่ **ตีกลับถึงร้าน
 * แล้ว** กับพัสดุที่ **ส่งถึงมือผู้รับ** ได้จุดสีเดียวกันที่ตำแหน่งเดียวกัน ต่างกันแค่คำใต้จุด
 * ซึ่งแถบจิ๋วในตารางไม่มีคำเลย (user เจอบน prod 2026-08-24)
 *
 * ตัวตัดสินคือ `progress.notice` ไม่ใช่ `progress.tone` — เพราะ `issue`/`return`/
 * `cannot_pickup` ล้วนเป็น tone `progress` เหมือนพัสดุปกติ สิ่งเดียวที่แยกมันออกมาได้คือ
 * "มีเรื่องต้องเตือนไหม และเตือนระดับไหน" ซึ่ง `NOTICE_OF` ใน `lib/iship/status.ts`
 * นิยามไว้ครบแล้ว (danger = ต้องไปตามขนส่ง · warning = ของกำลังกลับ/มีเรื่องเงิน ·
 * secondary = จบแล้วแต่ไม่ใช่ผลที่ต้องการ)
 *
 * 🛑 ไม่มี notice = เดินหน้าตามปกติ → primary เหมือนเดิมทุกประการ ห้ามให้ค่าเริ่มต้นเป็น
 * อย่างอื่น ไม่งั้นพัสดุปกติจะเปลี่ยนสีทั้งระบบจากการแก้ที่ตั้งใจแก้แค่เคสผิดปกติ
 */
const CURRENT_DOT: Record<string, string> = {
  danger: TONE_DOT_SOLID.danger,
  warning: TONE_DOT_SOLID.warning,
  info: TONE_DOT_SOLID.info,
  primary: TONE_DOT_SOLID.primary,
  success: TONE_DOT_SOLID.success,
  /**
   * 🛑 เขียว ไม่ใช่เทา — user เคาะเอง 2026-08-24 ("เขียวเหมือนกัน") หลังผมเสนอเทาโดยอ้าง
   * Verified-Means-Green. เคสเดียวที่ไปถึงตรงนี้ได้จริงคือ `return_success` (อีกตัวที่ tone
   * secondary คือ `is_expired` ซึ่ง stage = -1 ไม่ถูกวาด)
   *
   * แลกมาด้วยเงื่อนไข: จุดนี้ต้องเปลี่ยน **ไอคอน** เป็นลูกศรย้อนกลับผ่าน `lastIcon` ของ
   * `describeProgress()` — เพราะพอสี+ตำแหน่งเท่ากับ "จัดส่งสำเร็จ" แล้ว รูปร่างคือสิ่งเดียว
   * ที่เหลือให้แยกสองเคสนี้บนแถบจิ๋วในตารางซึ่งไม่มีคำกำกับ
   */
  secondary: TONE_DOT_SOLID.success,
}

export function shipmentCurrentDotCls(notice?: { tone: string } | null): string {
  return notice ? (CURRENT_DOT[notice.tone] ?? CURRENT_DOT.primary) : CURRENT_DOT.primary
}
