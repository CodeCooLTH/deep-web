// order-profit.ts — กำไรของออเดอร์ "ใบเดียว" และมาร์จิ้นของสินค้า "ชิ้นเดียว"
//
// แยกเป็นฟังก์ชันบริสุทธิ์ (ไม่แตะ prisma/session) ด้วยเหตุผลเดียวกับที่ 00016 เดิมแยก
// calculation core ออกจาก access core: สูตรคิดเงินต้องเขียนเทสตรง ๆ ได้โดยไม่ต้อง mock DB
// ส่วนการตัดสินว่า "ใครมีสิทธิ์เห็นตัวเลขนี้" เป็นงานของ resolveExpenseAccess() ที่ page layer
//
// [สำคัญ] หน้าที่เรียกไฟล์นี้ต้องบังคับสิทธิ์ "ก่อน" เรียก ไม่ใช่หลังเรียก — หน้า order detail
// อยู่ใต้ client layout ทุกค่าที่ข้ามเส้น RSC ถูก serialize ลง HTML เสมอ การ "คำนวณแล้วให้
// component เลือกไม่ render" คือการปล่อยตัวเลขกำไรไว้ให้เปิด view-source อ่านได้

import { round2 } from './round2'

/** รายการในออเดอร์เท่าที่สูตรกำไรต้องใช้ — `cost` เป็น Decimal|null จาก Prisma จึงรับเป็น unknown */
export type ProfitLineItem = { cost: unknown; qty: number }

export type OrderProfit = {
  /** กำไร = ยอดที่ลูกค้าจ่าย − ต้นทุนรวมของรายการที่ "ตั้งต้นทุนไว้แล้ว" */
  amount: number
  /**
   * true = มีรายการที่ยังไม่ตั้งต้นทุน → `amount` ที่ได้เป็น **เพดานบน ไม่ใช่กำไรจริง**
   *
   * ห้ามเอาไปปนกับ `PnlReport.hasMissingCost` ซึ่งเป็นธงของ "ทั้งช่วงเวลา" ในรายงานรวม —
   * คนละขอบเขตกัน ตั้งชื่อต่างกันโดยตั้งใจเพื่อไม่ให้หยิบผิดตัว
   */
  hasMissingCost: boolean
}

/**
 * กำไรของออเดอร์ใบเดียว
 *
 * [สำคัญ] รายการที่ `cost == null` ถูก **ข้าม** ไม่ใช่ "นับต้นทุนเป็น 0" — พฤติกรรมเดียวกับ
 * `sumOrders()` ใน pnl.service.ts เป๊ะ (ถ้าสองที่นี้ไม่ตรงกัน ตัวเลขบนหน้าออเดอร์กับตัวเลข
 * ในรายงานกำไร-ขาดทุนจะขัดกันเองโดยไม่มีอะไรฟ้อง) ผลของการข้ามคือ COGS ต่ำกว่าจริง
 * กำไรจึงสูงกว่าจริง — นี่คือเหตุผลที่ `hasMissingCost` ต้องถูกแสดงบนหน้าจอเสมอ
 * ไม่ใช่ข้อมูลเสริมที่ตัดทิ้งได้ตอนที่ว่างไม่พอ
 */
export function computeOrderProfit(order: {
  totalAmount: unknown
  items: ProfitLineItem[]
}): OrderProfit {
  let cogs = 0
  let hasMissingCost = false
  for (const item of order.items) {
    if (item.cost == null) {
      hasMissingCost = true
      continue
    }
    cogs += Number(item.cost) * item.qty
  }
  return { amount: round2(Number(order.totalAmount) - cogs), hasMissingCost }
}

/**
 * มาร์จิ้นเป็น % ของสินค้าหนึ่งชิ้น — `null` = คำนวณไม่ได้ (UI ต้องแสดง "—")
 *
 * คืน `null` 2 กรณี ซึ่งต้องแยกจาก "มาร์จิ้น 0%" ให้ขาด:
 * - ยังไม่ตั้งต้นทุน (`cost == null`) — คือ "ไม่รู้" ไม่ใช่ "ไม่มีกำไร"
 * - `price <= 0` — หารศูนย์ไม่ได้ และของแจกฟรีไม่มีมาร์จิ้นที่แปลความหมายได้
 *
 * ค่าติดลบ (ขายต่ำกว่าทุน) คืนออกไปตรง ๆ ไม่ clamp — การกลบให้เป็น 0 คือการซ่อน
 * ข้อมูลชิ้นเดียวที่ร้านต้องรีบรู้ที่สุด
 */
export function productMargin(input: { price: unknown; cost: unknown }): number | null {
  if (input.cost == null) return null
  const price = Number(input.price)
  const cost = Number(input.cost)
  if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0) return null
  return round2(((price - cost) / price) * 100)
}
