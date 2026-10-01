/**
 * return-adjustment.service.ts — ตัวเดียวที่ดึง "ผลของการคืนบางส่วน" ให้ทุกจอที่รวมเงิน (มติ 2026-10-01)
 *
 * ผู้ใช้: pnl.service · dashboard.service (ชีตหน้าหลัก) · /sales · receivable.service · รายงานรายสินค้า ·
 * สินค้าขายดี · การ์ดหน้าหลัก — ห้ามเขียน query ใบคืนเองที่อื่น (HR16 — ยอดคืนต้องหักแบบเดียวกันทุกจอ)
 *
 * ดึงทีละร้าน (ไม่ใช่ทีละลิสต์ออเดอร์) เพราะใบคืนที่รับของแล้วมีน้อยมากเทียบกับออเดอร์ และหลายผู้เรียก
 * ถือออเดอร์ทั้งร้านอยู่แล้ว (getOrdersByShop) — ส่ง id หลักพันเข้า `IN` แพงกว่าดึงใบคืนทั้งร้าน
 */
import { prisma } from '@/lib/prisma'
import { RETURN_STATUS, type ReturnAdjustment } from '@/lib/order-return'

/** คีย์ = Order.id · เฉพาะใบคืนที่ **รับของแล้ว** (RECEIVED) ของออเดอร์ที่ **ยังไม่ RETURNED ทั้งใบ** */
export async function getReturnAdjustments(shopId: string): Promise<Map<string, ReturnAdjustment>> {
  const rows = await prisma.orderReturn.findMany({
    where: {
      shopId,
      status: RETURN_STATUS.RECEIVED,
      // คืนครบทั้งใบ (RETURNED) ถูกตัดออกจากยอดทั้งใบแล้ว — หักซ้ำที่นี่จะกลายเป็นยอดติดลบ
      order: { status: { not: 'RETURNED' } },
    },
    select: {
      orderId: true,
      refundAmount: true,
      items: { select: { orderItemId: true, qty: true, unitPrice: true, orderItem: { select: { cost: true } } } },
    },
  })

  const out = new Map<string, ReturnAdjustment>()
  for (const r of rows) {
    const adj = out.get(r.orderId) ?? { refund: 0, returnedCost: 0, returnedQtyByItem: {} }
    // refundAmount ถูกแช่แข็งตอนรับคืน — null ไม่ควรเกิดกับ RECEIVED แต่ถ้าเกิดให้คิดจากรายการ (ราคาแช่แข็งเดียวกัน)
    adj.refund +=
      r.refundAmount != null
        ? Number(r.refundAmount)
        : r.items.reduce((s, it) => s + it.qty * Number(it.unitPrice), 0)
    for (const it of r.items) {
      adj.returnedQtyByItem[it.orderItemId] = (adj.returnedQtyByItem[it.orderItemId] ?? 0) + it.qty
      if (it.orderItem.cost != null) adj.returnedCost += it.qty * Number(it.orderItem.cost)
    }
    out.set(r.orderId, adj)
  }
  return out
}

/**
 * จำนวนชิ้นที่ถูกคืน (บางส่วน · รับของแล้ว) ต่อสินค้า — สำหรับตัวเลข "ขายแล้ว N ชิ้น"
 * (สินค้าขายดีหลังร้าน + หน้าร้านสาธารณะ ซึ่งต้องเป็นเลขเดียวกันเสมอ — user สั่ง 2026-08-11)
 * ส่ง `shopId` หรือ `productIds` อย่างใดอย่างหนึ่งเพื่อจำกัดขอบเขต
 */
export async function getReturnedQtyByProduct(scope: {
  shopId?: string
  productIds?: string[]
}): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (scope.productIds && scope.productIds.length === 0) return out
  const rows = await prisma.orderReturnItem.groupBy({
    by: ['orderItemId'],
    where: {
      orderReturn: {
        status: RETURN_STATUS.RECEIVED,
        ...(scope.shopId ? { shopId: scope.shopId } : {}),
        order: { status: { not: 'RETURNED' } },
      },
      ...(scope.productIds ? { orderItem: { productId: { in: scope.productIds } } } : {}),
    },
    _sum: { qty: true },
  })
  if (rows.length === 0) return out
  const items = await prisma.orderItem.findMany({
    where: { id: { in: rows.map((r) => r.orderItemId) } },
    select: { id: true, productId: true },
  })
  const productOf = new Map(items.map((i) => [i.id, i.productId]))
  for (const r of rows) {
    const pid = productOf.get(r.orderItemId)
    if (!pid) continue
    out.set(pid, (out.get(pid) ?? 0) + (r._sum.qty ?? 0))
  }
  return out
}
