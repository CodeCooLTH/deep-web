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
export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, string> = {
  RENT: 'building-store',
  PACKAGING: 'package',
  ADVERTISING: 'speakerphone',
  SHIPPING: 'truck',
  SALARY: 'users',
  UTILITIES: 'bolt',
  OTHER: 'dots',
}
