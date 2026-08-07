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
