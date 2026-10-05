/**
 * cancelled-order-count.service.ts — นับใบที่ยกเลิก "ที่เปิดในช่วงนี้" (00070 · TFR-LGS-13)
 *
 * 🛑 SSOT ของคำว่า "ยกเลิก" ในรายงานกลุ่ม LINE — ต้องเท่ากับ `jobStatusCounts.cancelled` ของ
 * `getSalesSeries` (dashboard.service.ts: `status === 'CANCELLED'`, แกนเวลา `createdAt`)
 * - แกนเวลาคือวันที่เปิดใบ ไม่ใช่วันที่กดยกเลิก (ใบเปิดเมื่อวานยกเลิกวันนี้ → นับเมื่อวาน)
 * - DRAFTED ไม่ใช่ CANCELLED จึงไม่ถูกนับโดยธรรมชาติ
 * ช่วง `[startIso, endIso]` เป็นวันไทย inclusive → [เที่ยงคืนไทยของ start, เที่ยงคืนไทยของ end+1)
 */
import { prisma } from '@/lib/prisma'
import { shiftIsoDate, thaiMidnightUtc } from '@/lib/date-range'

const midnightOf = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return thaiMidnightUtc(y, m - 1, d)
}

export async function countCancelledOrders(shopId: string, startIso: string, endIso: string): Promise<number> {
  return prisma.order.count({
    where: {
      shopId,
      status: 'CANCELLED',
      createdAt: { gte: midnightOf(startIso), lt: midnightOf(shiftIsoDate(endIso, 1)) },
    },
  })
}
