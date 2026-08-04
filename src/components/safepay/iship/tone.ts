/**
 * ชุดสีตาม tone ที่แผง iShip ใช้ร่วมกัน — SSOT ตัวเดียว
 *
 * ทำไมต้องรวม: เดิม `TONE_BADGE` ถูกประกาศซ้ำ 2 ที่ (ShipmentLinkPanel กับ ShipmentStatusView)
 * และ **สองชุดนั้นไม่ตรงกัน** — ตัวหนึ่งใช้ `-ink` ถูกแล้ว อีกตัวใช้ `text-{semantic}` ดิบ
 * ผลที่ผู้ใช้เห็นคือ badge สถานะขนส่งของพัสดุใบเดียวกันขึ้นคนละสี ขึ้นกับว่าเปิดมาจากแผงไหน
 * (Impeccable critique 2026-08-04)
 *
 * ── ทำไมต้องเป็น `-ink` ไม่ใช่ `text-{semantic}` ────────────────────────────
 * `_root.css` มี token ตระกูล `-ink` ไว้เพื่อการนี้โดยเฉพาะ วัดจริงบนพื้น `{semantic}/15`:
 *
 *   token     text-{semantic}   text-{semantic}-ink
 *   primary        4.17               8.44
 *   info           1.83               7.87
 *   success        2.11               6.68
 *   warning        1.54               6.56
 *   danger         2.68               8.47
 *
 * เกณฑ์ AA ของ body text คือ 4.5:1 — **ตกทั้งห้าตัว รวมถึง primary** ที่ดูเหมือนจะพอผ่าน
 * ตัวที่หนักสุดคือ warning 1.54:1 ซึ่งเป็นสีของกล่อง "ยังตั้งที่อยู่ผู้ส่งไม่ครบ" อันเป็นทางตัน
 * เดียวของ flow นี้ — หน้าจอเดียวที่ร้าน *ต้อง* อ่านให้ออก กลับเป็นหน้าจอที่อ่านไม่ออกที่สุด
 * และ PRODUCT.md ระบุกลุ่มผู้ใช้ digital-literacy ต่ำ/ผู้สูงวัยไว้ตรง ๆ
 *
 * เขียนเต็มคำทุก class โดยเจตนา — Tailwind สแกนซอร์สเป็นข้อความ ถ้าประกอบชื่อ class
 * แบบ dynamic (`bg-${tone}/15`) มันจะไม่ถูก generate แล้ว badge จะไม่มีสีโดยไม่มี error ให้เห็น
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
