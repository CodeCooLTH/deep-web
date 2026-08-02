/**
 * expense.ts — constants ของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SRS.md TFR-005
 *
 * Fixed category — เก็บเป็น String (ไม่ใช่ Prisma enum) ตาม convention ของโปรเจกต์
 * (มิเรอร์ Order.status/Shop.kind) เพิ่ม/แก้หมวดในอนาคต = แก้ constant array นี้
 * ไม่ต้อง migration
 */
export const EXPENSE_CATEGORIES = [
  'RENT', 'PACKAGING', 'ADVERTISING', 'SHIPPING', 'SALARY', 'UTILITIES', 'OTHER',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

export const EXPENSE_CATEGORY_LABEL_TH: Record<ExpenseCategory, string> = {
  RENT: 'ค่าเช่า',
  PACKAGING: 'ค่าแพ็คเกจ/บรรจุภัณฑ์',
  ADVERTISING: 'ค่าโฆษณา',
  SHIPPING: 'ค่าขนส่ง',
  SALARY: 'เงินเดือน',
  UTILITIES: 'สาธารณูปโภค',
  OTHER: 'อื่นๆ',
}

// icon — bare tabler name (ไม่มี prefix) ตาม convention ของ Paces `@/components/wrappers/Icon`
// ที่ใช้ทั่ว (paces)/** (เช่น ProductsListing.tsx: icon="package"/"pencil"/"trash") — wrapper เติม
// "tabler:" ให้เองถ้ายังไม่มี ":" (safepay-ux ยืนยัน mapping นี้แล้ว)
/**
 * สีประจำหมวด — token + opacity modifier เท่านั้น (Hard Rule 7 ห้าม arbitrary value/hex)
 *
 * เลือกจาก ramp น้ำเงิน (primary/info) + เทา โดยตั้งใจเลี่ยง:
 *   - `secondary` (#7b70ef) เพราะใกล้ม่วง #7367F0 ของ Vuexy ฝั่ง buyer เกินไป
 *   - `success`/`danger` เพราะถูกจองความหมายไว้แล้วทั้งฟีเจอร์ ("กำไร" / "เงินไหลออก")
 *     ถ้าเอามาใช้เป็นสีหมวด ผู้ใช้จะอ่านว่าหมวดนั้นดี/แย่ ทั้งที่มันเป็นแค่ป้ายชื่อ
 * `wash` = พื้นอ่อน+ตัวหนังสือของ avatar/badge (ใช้ -ink เมื่อ semantic เองจางจนตกคอนทราสต์ AA)
 * `solid` = จุด legend และแถบสัดส่วนในการ์ดแยกหมวด
 */
export const EXPENSE_CATEGORY_COLOR: Record<ExpenseCategory, { wash: string; solid: string }> = {
  RENT:        { wash: 'bg-info/15 text-info-ink',           solid: 'bg-info' },
  PACKAGING:   { wash: 'bg-info/15 text-info-ink',           solid: 'bg-info/60' },
  ADVERTISING: { wash: 'bg-primary/15 text-primary',         solid: 'bg-primary' },
  SHIPPING:    { wash: 'bg-primary/15 text-primary',         solid: 'bg-primary/60' },
  SALARY:      { wash: 'bg-default-200 text-default-700',    solid: 'bg-default-600' },
  UTILITIES:   { wash: 'bg-warning/15 text-warning-ink',     solid: 'bg-warning' },
  OTHER:       { wash: 'bg-default-100 text-default-600',    solid: 'bg-default-400' },
}

export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, string> = {
  RENT: 'building-store',
  PACKAGING: 'package',
  ADVERTISING: 'speakerphone',
  SHIPPING: 'truck',
  SALARY: 'users',
  UTILITIES: 'bolt',
  OTHER: 'dots',
}
