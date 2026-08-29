/**
 * data.ts — ชนิดข้อมูลและตัวช่วยฝั่งหน้าจอของรายงาน "ยอดขายรายสินค้า" (feature 00063)
 *
 * ไฟล์นี้ไม่มี React และไม่มี prisma — เป็นตัวกลางระหว่าง service กับ component
 * (แพตเทิร์นเดียวกับ `sales/components/data.ts` และ `reports/agents/components/data.ts`)
 */
import {
  type SalesPattern,
  classifySalesPattern,
  toDense,
} from '@/lib/product-sales-month'
import type { ProductSalesRow } from '@/services/product-sales-series.service'

export type { ProductSalesRow }

/** หน่วยที่กำลังแสดง — ค่าตั้งต้นคือจำนวนชิ้น ("ขายช่วงไหน" เป็นคำถามเรื่องความถี่ ไม่ใช่เรื่องเงิน) */
export type SalesUnit = 'qty' | 'baht'

export const UNIT_LABELS: Record<SalesUnit, string> = {
  qty: 'จำนวน (ชิ้น)',
  baht: 'ยอดขาย (บาท)',
}

/** หัวคอลัมน์ตัวเลขผันตามหน่วย — คำเดียวกันสองหน่วยคือสิ่งที่ทำให้ตัวเลขอ่านผิด */
export const UNIT_COLUMN_LABELS: Record<SalesUnit, string> = {
  qty: 'จำนวนที่ขาย',
  baht: 'ยอดขาย',
}

/** แถวที่ผ่านการคำนวณสำหรับแสดงผลแล้ว — dense array + ป้ายสรุป */
export type ProductSalesViewRow = ProductSalesRow & {
  /** ยอดรายวันแบบเต็ม (ความยาว = จำนวนวันในเดือน) */
  denseQty: number[]
  denseAmount: number[]
  pattern: SalesPattern
}

/**
 * buildViewRows — คลาย sparse + คำนวณป้ายสรุป ครั้งเดียวสำหรับทั้งหน้า
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะป้ายสรุปคือ "โค้ดที่ตีความข้อมูลแทนผู้ขาย" — ต้องมี
 * ที่ให้เทสจับ ไม่ใช่ซ่อนอยู่ใน useMemo กลาง component
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */
export function buildViewRows(
  rows: readonly ProductSalesRow[],
  days: number,
  refDayIndex: number,
  /** false = เดือนที่ผ่านไปแล้ว ⇒ ป้าย "เงียบ" ต้องพูดว่านับถึงสิ้นเดือน ไม่ใช่ถึงวันนี้ */
  isCurrentMonth: boolean,
): ProductSalesViewRow[] {
  return rows.map((r) => {
    const denseQty = toDense(r.qty, days)
    return {
      ...r,
      denseQty,
      denseAmount: toDense(r.amount, days),
      pattern: classifySalesPattern(denseQty, r.saleEvents, refDayIndex, !isCurrentMonth),
    }
  })
}

/** ค่าที่ใช้แสดงตามหน่วยที่เลือก — ที่เดียวที่ตัดสินว่า "ตัวเลขของแถวนี้คืออะไร" */
export function rowTotal(r: ProductSalesViewRow, unit: SalesUnit): number {
  return unit === 'qty' ? r.totalQty : r.totalAmount
}

export function rowSeries(r: ProductSalesViewRow, unit: SalesUnit): number[] {
  return unit === 'qty' ? r.denseQty : r.denseAmount
}

/**
 * defaultSelectedKeys — สินค้าที่ถูกติ๊กขึ้นกราฟตั้งแต่เปิดหน้า
 *
 * 🛑 ยึด **จำนวนชิ้น** เสมอ ไม่ผันตามหน่วยที่เลือก (user เคาะ 2026-08-29) — ถ้าเส้นบนกราฟ
 * สลับตัวเองตอนกดปุ่มเปลี่ยนหน่วย ผู้ใช้จะเสียที่อ้างอิงทั้งหมดในทันที โดยที่ปุ่มนั้น
 * ดูเหมือนแค่ "เปลี่ยนหน่วย"
 *
 * `rows` ถูกเรียงจากขายดี→น้อยมาแล้วจาก service จึงหยิบจากหัวแถวได้ตรง ๆ
 *
 * ⚠️ ความสัมพันธ์ "5 แถวแรกของตาราง = 5 เส้นบนกราฟ" **จริงเฉพาะโหมดจำนวนชิ้น** — ตาราง
 * เรียงตามหน่วยที่เลือกอยู่ (`rowTotal(r, unit)`) ส่วนเส้นบนกราฟยึดจำนวนชิ้นเสมอ ⇒ ในโหมดบาท
 * ห้าแถวแรกอาจไม่ใช่ห้าเส้นนั้น (ตั้งใจ — สลับเส้นตอนกดปุ่มหน่วยจะทำให้ผู้ใช้เสียที่อ้างอิง)
 */
export function defaultSelectedKeys(rows: readonly ProductSalesRow[], take: number): string[] {
  return rows.filter((r) => r.totalQty > 0).slice(0, take).map((r) => r.key)
}
