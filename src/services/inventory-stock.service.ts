import type { Prisma } from '@prisma/client'

export class OutOfStockError extends Error {
  productNames: string[]
  constructor(productNames: string[]) {
    super('OUT_OF_STOCK')
    this.name = 'OutOfStockError'
    this.productNames = productNames
  }
}

/**
 * deductStockForOrderItems — all-or-nothing atomic deduct ต่อ trackable product
 * คืน Set<productId> ของสินค้าที่ deduct สำเร็จ (ใช้ set OrderItem.stockDeducted = item.qty ต่อ item เอง
 * ไม่ใช่ aggregate — refine จาก SRS TFR-009 pseudocode ที่เสนอ Map<id,qty>: ผลลัพธ์ต่อ item เหมือนกัน
 * เพราะ item ที่ productId อยู่ใน Set = ถูก deduct เต็มจำนวน item.qty เสมอ ผลรวมยังตรงตาม all-or-nothing)
 */
export async function deductStockForOrderItems(
  tx: Prisma.TransactionClient,
  items: { productId?: string; name: string; qty: number }[],
): Promise<Set<string>> {
  // 1) aggregate qty ต่อ productId (item ซ้ำ productId ในใบเดียวกัน)
  const qtyByProductId = new Map<string, number>()
  const nameByProductId = new Map<string, string>()
  for (const item of items) {
    if (!item.productId) continue
    qtyByProductId.set(item.productId, (qtyByProductId.get(item.productId) ?? 0) + item.qty)
    if (!nameByProductId.has(item.productId)) nameByProductId.set(item.productId, item.name)
  }
  if (qtyByProductId.size === 0) return new Set()

  // 2) โหลด product จริง แล้วกรอง trackable (PHYSICAL + stockQty != null) ก่อนเข้า updateMany เสมอ
  //    ⚠️ ห้ามข้าม step นี้ — NULL >= n ประเมิน unknown ใน Postgres ทำให้ untracked product
  //    ถูกเข้าใจผิดว่า "หมดสต็อก" (count=0) ทั้งที่จริงคือ "ไม่ track" (SRS TFR-009 risk)
  const products = await tx.product.findMany({
    where: { id: { in: Array.from(qtyByProductId.keys()) } },
    select: { id: true, type: true, stockQty: true },
  })
  const trackable = products.filter((p) => p.type === 'PHYSICAL' && p.stockQty !== null)

  const deductedIds = new Set<string>()
  const outOfStock: string[] = []

  for (const product of trackable) {
    const needed = qtyByProductId.get(product.id)!
    const res = await tx.product.updateMany({
      where: { id: product.id, stockQty: { gte: needed } },
      data: { stockQty: { decrement: needed } },
    })
    if (res.count === 0) {
      outOfStock.push(nameByProductId.get(product.id) ?? product.id)
      continue // สะสมชื่อสินค้าที่หมดทั้งหมดก่อน throw รวด (UX ดีกว่า throw ตัวแรกที่เจอ)
    }
    deductedIds.add(product.id)
  }

  if (outOfStock.length > 0) {
    // throw = rollback decrement ทั้งหมดที่ทำไปในลูปนี้อัตโนมัติ (all-or-nothing, tx เดียวกับ order.create)
    throw new OutOfStockError(outOfStock)
  }
  return deductedIds
}

/**
 * restockFromCancelledOrder — คืนสต็อกตามประวัติจริงของ order (ไม่สนสถานะ entitlement ปัจจุบัน)
 */
export async function restockFromCancelledOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, stockDeducted: { not: null } },
    select: { productId: true, stockDeducted: true },
  })
  if (items.length === 0) return // ไม่เคยตัดสต็อก — ไม่มีอะไรคืน (short-circuit)

  for (const item of items) {
    if (!item.productId) {
      // product ถูกลบไปแล้ว (OrderItem.productId onDelete: SetNull) — skip + log, ห้าม throw
      // (cancel ต้องสำเร็จเสมอ — accepted data-integrity gap ตาม DATABASE.md §8 risk #3)
      console.warn(`[inventory-stock] orphan restock — orderId=${orderId} product ถูกลบไปแล้ว ข้าม`)
      continue
    }
    // increment ไม่ต้อง conditional WHERE (ไม่มีเงื่อนไข business ที่ปฏิเสธการบวกกลับ)
    // ถ้า product ถูก untrack ไปแล้ว (stockQty=null) → increment บน NULL = NULL, no-op (expected)
    await tx.product.update({
      where: { id: item.productId },
      data: { stockQty: { increment: item.stockDeducted! } },
    })
  }
}
