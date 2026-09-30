/**
 * cost-coverage.service.ts — "ตั้งราคาทุนไปแล้วกี่รายการจากที่ขายจริง" (feature 00067 TFR-002)
 *
 * แยกจาก `pnl.service.ts` โดยตั้งใจ: ที่นั่นตอบว่า "กำไรเท่าไร" ส่วนที่นี่ตอบว่า "ตัวเลขนั้น
 * เชื่อได้แค่ไหน และเหลืออีกกี่รายการที่ต้องไปตั้ง" — คนละคำถาม และ `pnl.service` เป็นสัญญาที่
 * หน้า /expenses ใช้อยู่ ห้ามเปลี่ยนรูป
 */
import { prisma } from '@/lib/prisma'
import { revenueOrderWhere } from '@/lib/order-revenue'
import type { ResolvedDateRange } from '@/lib/date-range'

export interface CostCoverage {
  /** จำนวนสินค้า/บริการที่ต่างกันซึ่งถูกขายในช่วงนี้ (นับเฉพาะรายการที่ผูก Product จริง) */
  soldItemCount: number
  /** จำนวนในนั้นที่ยังไม่ได้ตั้งราคาทุน */
  uncostedItemCount: number
}

/**
 * 🛑 นับ **รายการที่ต่างกัน (distinct productId)** ไม่ใช่จำนวนชิ้น — ข้อความบนหน้าจอคือ
 * "ยังไม่ได้ตั้ง n จาก m รายการ" ซึ่งหมายถึงจำนวนสินค้า/บริการ ไม่ใช่จำนวนที่ขายได้
 *
 * 🛑 `productId === null` (รายการที่ร้านพิมพ์เองในแชท) **ถูกตัดออกทั้งสองตัวนับ** — มันมี
 * `cost = null` เสมอตาม 00016 และไม่มีหน้าไหนให้ไปตั้งราคาทุน ถ้านับรวมจะได้ปุ่มที่กดแล้ว
 * เจอหน้าว่าง (ธง `hasMissingCost` ของ pnl.service ยังเป็น true อยู่ ป้ายเตือนจึงยังขึ้นถูก)
 *
 * ใช้ `revenueOrderWhere` ชุดเดียวกับ `pnl.service` — ตัวหารต้องเป็นแถวชุดเดียวกับที่ใช้คิดกำไร
 * ไม่งั้นจะบอกว่า "ยังไม่ได้ตั้ง 12 จาก 14" โดยที่ 14 นั้นมาจากออเดอร์คนละชุดกับตัวเลขกำไร
 */
export async function getCostCoverage(shopId: string, range: ResolvedDateRange): Promise<CostCoverage> {
  const items = await prisma.orderItem.findMany({
    where: {
      productId: { not: null },
      order: {
        shopId,
        ...revenueOrderWhere,
        createdAt: { gte: range.orderRange.gte, lt: range.orderRange.lt },
      },
    },
    select: { productId: true, cost: true },
  })

  const sold = new Set<string>()
  const uncosted = new Set<string>()
  for (const it of items) {
    if (!it.productId) continue
    sold.add(it.productId)
    // cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ "ต้นทุน 0" — นิยามเดียวกับ isMissingCost()
    if (it.cost == null) uncosted.add(it.productId)
  }

  return { soldItemCount: sold.size, uncostedItemCount: uncosted.size }
}
