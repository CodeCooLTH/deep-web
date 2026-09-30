// finance-tabs.ts — นิยามของหน้า "การเงินร้าน" (feature 00067)
//
// ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน ไม่แตะ prisma ไม่แตะ window — RSC และ client เรียกตัวเดียวกันได้
//
// [สำคัญ] เหตุผลที่ตรรกะ 2 ก้อนนี้ต้องอยู่นอก JSX: ทั้งคู่เป็น boolean/union ที่ตัดสินว่า
// หน้าจอจะ "พูดว่าอะไร" ถ้าเขียนกลับด้านแล้วไม่มี gate ไหนจับได้เลย (tsc/build/eslint ผ่านหมด
// เพราะชนิดถูกทุกตัวอักษร สิ่งที่ผิดคือความหมาย) — ดู docs/conventions/ui-boolean-needs-a-testable-home.md

/** แท็บของหน้าการเงินร้าน เรียงตามลำดับที่แสดงบนจอ (ซ้าย→ขวา) */
export const FINANCE_TABS = ['pnl', 'collect', 'expense'] as const

export type FinanceTab = (typeof FINANCE_TABS)[number]

/**
 * แท็บเริ่มต้น = กำไรขาดทุน
 * เป็นคำตอบของคำถามที่ผู้ขายถามเป็นข้อแรก ("เดือนนี้เหลือเท่าไหร่")
 */
export const DEFAULT_FINANCE_TAB: FinanceTab = 'pnl'

/** ชื่อพารามิเตอร์ใน query string — เขียนที่เดียว ผู้เรียกห้ามพิมพ์ 'tab' เอง */
export const FINANCE_TAB_PARAM = 'tab'

/**
 * แปลงค่าดิบจาก query string เป็นแท็บที่รู้จัก — **fail-closed** ทุกกรณี
 *
 * 🛑 ห้าม throw และห้ามคืน null: ค่านี้มาจาก URL ที่ผู้ใช้พิมพ์เองได้ ถ้า throw = หน้าทั้งหน้า 500
 * จากการพิมพ์ผิดตัวเดียว ส่วน null จะผลักภาระไปให้ผู้เรียกทุกรายซึ่งจะลืมกันสักราย
 *
 * ค่าที่ต้องตกไป default: `undefined` · `null` · `''` · ตัวพิมพ์ใหญ่ · path traversal ·
 * และ `string[]` ที่ Next คืนมาเมื่อ query key ซ้ำ (`?tab=pnl&tab=expense`)
 */
export function resolveFinanceTab(raw: string | string[] | null | undefined): FinanceTab {
  // key ซ้ำใน query string → Next คืน array; เอาตัวแรกตามลำดับที่ปรากฏใน URL
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return DEFAULT_FINANCE_TAB
  return (FINANCE_TABS as readonly string[]).includes(value) ? (value as FinanceTab) : DEFAULT_FINANCE_TAB
}

/**
 * ความครบของข้อมูลที่ทำให้คำว่า "กำไร" มีความหมาย
 *
 * 🛑 ทำไมต้องมีสิ่งนี้ — ร้านบริการไม่มีต้นทุนสินค้าโดยธรรมชาติ และถูกล็อกไม่ให้มีค่าส่ง
 * ถ้าไม่มีทั้งราคาทุนและรายการค่าใช้จ่าย **กำไรจะเท่ากับยอดขายเป๊ะทุกบาท** = เรียกยอดขาย
 * ด้วยชื่อที่ผิด ซึ่งเป็นเหตุผลที่ทีมถอดคำว่า "กำไร/ขาดทุน" ออกจากหน้านี้ไปเมื่อ 2026-08-23
 * (ดู SalesChartSheet.tsx หัวไฟล์ v9 ข้อ 1) — เอากลับมาได้ต่อเมื่อจัดการสถานะนี้ให้ครบ
 */
export type DataCompleteness = {
  /** true = ตัวเลขกำไรเป็นค่าจริง · false = เป็นเพดานบน ต้องติดป้ายเสมอ */
  complete: boolean
  /** มีรายการที่ขายในช่วงนี้แล้วยังไม่รู้ต้นทุน */
  missingCost: boolean
  /** ไม่มีรายการค่าใช้จ่ายของร้านเลยในช่วงนี้ */
  missingExpense: boolean
  /**
   * จำนวน "รายการสินค้า/บริการที่ต่างกัน" ที่ขายในช่วงนี้และยังไม่ได้ตั้งราคาทุน
   * 🛑 นับเฉพาะรายการที่ผูกกับ Product จริง — รายการที่ร้านพิมพ์เองในแชท (productId เป็น null)
   * มี cost เป็น null เสมอตาม 00016 และ **ไม่มีที่ให้ไปตั้ง** ถ้านับรวมจะได้ตัวนับที่พาไปหน้าที่
   * แก้อะไรไม่ได้ (ตัวเลขยังทำให้ missingCost เป็น true อยู่ ป้ายเตือนจึงยังขึ้นถูกต้อง)
   */
  uncostedItemCount: number
  /** จำนวนรายการที่ต่างกันทั้งหมดที่ขายในช่วงนี้ (ตัวหารของข้อความ "ยังไม่ได้ตั้ง n จาก m") */
  soldItemCount: number
}

export function resolveDataCompleteness(input: {
  /** มาจาก PnlReport.hasMissingCost — ห้ามคำนวณซ้ำที่นี่ (สูตรเดียวต้องอยู่ที่ pnl.service) */
  hasMissingCost: boolean
  /** จำนวนแถว Expense ในช่วงที่ดู */
  expenseCount: number
  uncostedItemCount: number
  soldItemCount: number
}): DataCompleteness {
  const { hasMissingCost, expenseCount, uncostedItemCount, soldItemCount } = input
  return {
    complete: !hasMissingCost && expenseCount > 0,
    missingCost: hasMissingCost,
    missingExpense: expenseCount === 0,
    uncostedItemCount,
    soldItemCount,
  }
}

/**
 * ควรแสดงปุ่ม "ตั้งราคาทุน" ไหม
 *
 * 🛑 ไม่ใช่ `missingCost` ตรง ๆ — ร้านที่ขายแต่รายการพิมพ์เองจะได้ `missingCost = true`
 * ตลอดไปโดยไม่มีรายการให้ไปตั้งสักรายการ ปุ่มที่กดแล้วเจอหน้าว่างแย่กว่าไม่มีปุ่ม
 * (ป้ายเตือนยังขึ้นอยู่ ผู้ใช้จึงไม่ได้ถูกหลอกว่าตัวเลขครบ)
 */
export function shouldOfferCostSetup(c: DataCompleteness): boolean {
  return c.missingCost && c.uncostedItemCount > 0
}

/** ควรแสดงปุ่ม "บันทึกค่าใช้จ่าย" ไหม */
export function shouldOfferExpenseSetup(c: DataCompleteness): boolean {
  return c.missingExpense
}

/**
 * นิยามของ "ยอดค้างรับ" ที่ต้อง render ให้ผู้ใช้เห็น ห้ามเก็บไว้ในคอมเมนต์ (Hard Rule 16)
 * อยู่ที่ lib (ไม่ใช่ receivable.service) เพื่อให้ชีตบนหน้าหลักซึ่งเป็น client component ใช้ข้อความเดียวกันได้
 */
export const RECEIVABLE_BASIS_NOTE =
  'นับทุกบิลที่เปิดจริงและยังไม่ถูกยกเลิก ไม่ต้องรอลูกค้ายืนยัน · ค้างรับ คือยอดที่ยังไม่ได้บันทึกการรับเงิน ไม่ได้แปลว่าลูกค้าไม่จ่าย'
