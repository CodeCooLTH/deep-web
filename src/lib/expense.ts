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
  // 'แพ็กเกจ' ถูกจองไว้ให้แพ็กเกจสมาชิก (Business Package) แล้ว — หมวดนี้จึงเรียกบรรจุภัณฑ์อย่างเดียว
  PACKAGING: 'ค่าบรรจุภัณฑ์',
  ADVERTISING: 'ค่าโฆษณา',
  SHIPPING: 'ค่าขนส่ง',
  // ครอบทั้งจ้างรายเดือนและรายวัน — ร้านที่จ้างพาร์ตไทม์ไม่เรียกว่า 'เงินเดือน'
  SALARY: 'ค่าจ้างพนักงาน',
  // 'สาธารณูปโภค' เป็นศัพท์ราชการ ไม่ตรงกลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้
  UTILITIES: 'ค่าน้ำ-ค่าไฟ',
  OTHER: 'อื่นๆ',
}

// icon — bare tabler name (ไม่มี prefix) ตาม convention ของ Paces `@/components/wrappers/Icon`
// ที่ใช้ทั่ว (paces)/** (เช่น ProductsListing.tsx: icon="package"/"pencil"/"trash") — wrapper เติม
// "tabler:" ให้เองถ้ายังไม่มี ":" (safepay-ux ยืนยัน mapping นี้แล้ว)
/**
 * สีของหมวดค่าใช้จ่าย — token + opacity modifier เท่านั้น (Hard Rule 7 ห้าม arbitrary value/hex)
 *
 * avatar ของทุกหมวดใช้ "พื้นกลางสีเดียวกันหมด" โดยตั้งใจ — ตัวแยกหมวดคือ **ไอคอน + ชื่อเต็ม**
 * ที่อยู่ข้างกันในแถวเดียว ไม่ใช่สี. เหตุผล (จาก Impeccable critique 2026-08-02):
 *   1. พาเลตต์ Paces มีสี semantic ไม่พอให้ 7 หมวดต่างกันจริง — รอบแรกลองแล้วได้พื้นซ้ำกัน
 *      2 คู่ (RENT=PACKAGING, ADVERTISING=SHIPPING) ซึ่งแย่กว่าไม่ใส่สีเลย เพราะดูเหมือนตั้งใจ
 *      จัดกลุ่มทั้งที่ไม่ได้จัด
 *   2. รอบแรกใช้ `bg-primary/15` เป็นสีหมวด ซึ่งเป็นสีเดียวกับ "ชิปที่ถูกเลือกอยู่" พอดี →
 *      avatar แถวค่าโฆษณาอ่านเหมือนตัวกรองที่เปิดค้างอยู่ (One Voice Rule: primary สงวนไว้
 *      สำหรับ action + selection เท่านั้น ห้ามใช้เป็น identity ของข้อมูล)
 *
 * `bar` = แถบสัดส่วนในการ์ดแยกหมวด — ใช้ ramp น้ำหนักเดียว (info ไล่ opacity) ซึ่งเป็นการเข้ารหัส
 * ที่ถูกต้องของ part-to-whole ที่เรียงจากมากไปน้อยอยู่แล้ว. ไม่มีข้อมูลไหนพึ่งสีอย่างเดียว —
 * legend มีทั้งไอคอน ชื่อ % และจำนวนเงินกำกับทุกแถว
 */
export const EXPENSE_CATEGORY_AVATAR = 'bg-default-200 text-default-700'

/** ระดับความเข้มของแถบสัดส่วน เรียงตามอันดับ (มากสุด → น้อยสุด) */
export const EXPENSE_BAR_STEPS = [
  'bg-info',
  'bg-info/80',
  'bg-info/60',
  'bg-info/45',
  'bg-info/35',
  'bg-info/25',
  'bg-info/20',
] as const

export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, string> = {
  RENT: 'building-store',
  PACKAGING: 'package',
  ADVERTISING: 'speakerphone',
  SHIPPING: 'truck',
  SALARY: 'users',
  UTILITIES: 'bolt',
  OTHER: 'dots',
}
