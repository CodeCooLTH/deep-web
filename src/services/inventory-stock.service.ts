import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { stringifyCsv } from '@/lib/csv'

export class OutOfStockError extends Error {
  productNames: string[]
  constructor(productNames: string[]) {
    super('OUT_OF_STOCK')
    this.name = 'OutOfStockError'
    this.productNames = productNames
  }
}

// ใช้เมื่อปรับสต็อกด้วยมือ (manualAdjustStock) หรือ CSV import แล้วสต็อกไม่พอ
export class InsufficientStockError extends Error {
  productName: string
  constructor(productName: string) {
    super('INSUFFICIENT_STOCK')
    this.name = 'InsufficientStockError'
    this.productName = productName
  }
}

/**
 * deductStockForOrderItems — all-or-nothing atomic deduct ต่อ trackable product
 *
 * BREAKING (00009 S-3): return type เปลี่ยนจาก Set<productId> → Map<productId, {qty, resultingQty, name}>
 * เหตุผล: order.service ต้องรู้ resultingQty ต่อ product เพื่อ insert StockMovement (record-always)
 * ทันทีหลัง order.create — ไม่ต้อง query แยกอีกรอบหลัง tx commit (จะไม่ authoritative แล้วเพราะ
 * row อาจถูกแก้ต่อโดย request อื่นหลัง commit)
 */
export async function deductStockForOrderItems(
  tx: Prisma.TransactionClient,
  items: { productId?: string; name: string; qty: number }[],
): Promise<Map<string, { qty: number; resultingQty: number; name: string }>> {
  // 1) aggregate qty ต่อ productId (item ซ้ำ productId ในใบเดียวกัน)
  const qtyByProductId = new Map<string, number>()
  const nameByProductId = new Map<string, string>()
  for (const item of items) {
    if (!item.productId) continue
    qtyByProductId.set(item.productId, (qtyByProductId.get(item.productId) ?? 0) + item.qty)
    if (!nameByProductId.has(item.productId)) nameByProductId.set(item.productId, item.name)
  }
  if (qtyByProductId.size === 0) return new Map()

  // 2) โหลด product จริง แล้วกรอง trackable (PHYSICAL + stockQty != null) ก่อนเข้า updateMany เสมอ
  //    ⚠️ ห้ามข้าม step นี้ — NULL >= n ประเมิน unknown ใน Postgres ทำให้ untracked product
  //    ถูกเข้าใจผิดว่า "หมดสต็อก" (count=0) ทั้งที่จริงคือ "ไม่ track" (SRS TFR-009 risk)
  const products = await tx.product.findMany({
    where: { id: { in: Array.from(qtyByProductId.keys()) } },
    select: { id: true, type: true, stockQty: true },
  })
  const trackable = products.filter((p) => p.type === 'PHYSICAL' && p.stockQty !== null)

  const deducted = new Map<string, { qty: number; resultingQty: number; name: string }>()
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
    // re-read resultingQty — row locked จาก updateMany ที่เราเพิ่งทำเอง ถือเป็น authoritative
    const updated = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { stockQty: true } })
    deducted.set(product.id, { qty: needed, resultingQty: updated.stockQty!, name: nameByProductId.get(product.id)! })
  }

  if (outOfStock.length > 0) {
    // throw = rollback decrement ทั้งหมดที่ทำไปในลูปนี้อัตโนมัติ (all-or-nothing, tx เดียวกับ order.create)
    throw new OutOfStockError(outOfStock)
  }
  return deducted
}

/**
 * restockFromCancelledOrder — คืนสต็อกตามประวัติจริงของ order (ไม่สนสถานะ entitlement ปัจจุบัน)
 *
 * BREAKING (00009 S-3): เพิ่ม param shopId (สำหรับ StockMovement.shopId) — caller ต้องส่ง
 * order.shopId/order.id เข้ามาตรง ๆ ไม่ query ซ้ำในนี้
 */
export async function restockFromCancelledOrder(
  tx: Prisma.TransactionClient,
  shopId: string,
  orderId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, stockDeducted: { not: null } },
    select: { productId: true, stockDeducted: true, name: true }, // +name (snapshot — productName)
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
    const updated = await tx.product.update({
      where: { id: item.productId },
      data: { stockQty: { increment: item.stockDeducted! } },
      select: { stockQty: true },
    })
    // increment บน NULL (product ถูก untrack ไปแล้ว) = NULL → no-op, ห้าม insert StockMovement (CHECK delta<>0)
    if (updated.stockQty === null) continue
    await tx.stockMovement.create({
      data: {
        shopId,
        productId: item.productId,
        productName: item.name,
        delta: item.stockDeducted!,
        resultingQty: updated.stockQty,
        source: 'ORDER_RESTOCK',
        refId: orderId,
        note: null,
        actorUserId: null,
      },
    })
  }
}

/**
 * manualAdjustStock — seller ปรับสต็อกด้วยมือ (ACTIVE-gate ที่ caller, ไม่ใช่ PRO-gate)
 * caller ต้องเปิด $transaction เอง (ครอบทั้ง updateMany + stockMovement.create)
 */
export async function manualAdjustStock(
  tx: Prisma.TransactionClient,
  params: { shopId: string; productId: string; delta: number; note: string; actorUserId: string },
): Promise<{ resultingQty: number }> {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
    select: { id: true, shopId: true, type: true, stockQty: true, name: true },
  })
  if (!product || product.shopId !== params.shopId) throw new Error('PRODUCT_NOT_FOUND')
  if (product.type !== 'PHYSICAL' || product.stockQty === null) throw new Error('PRODUCT_NOT_TRACKED')
  if (params.delta === 0) throw new Error('DELTA_ZERO')

  // RC-3: gte: -delta ครอบทั้งกรณี delta ลบ (ตัด — ต้องมีสต็อกพอ) และ delta บวก (เติม — เงื่อนไขผ่านเสมอ)
  const res = await tx.product.updateMany({
    where: { id: params.productId, stockQty: { gte: -params.delta } },
    data: { stockQty: { increment: params.delta } },
  })
  if (res.count === 0) throw new InsufficientStockError(product.name)

  const updated = await tx.product.findUniqueOrThrow({ where: { id: params.productId }, select: { stockQty: true } })
  await tx.stockMovement.create({
    data: {
      shopId: params.shopId,
      productId: params.productId,
      productName: product.name,
      delta: params.delta,
      resultingQty: updated.stockQty!,
      source: 'MANUAL_ADJUST',
      refId: null,
      note: params.note,
      actorUserId: params.actorUserId,
    },
  })
  return { resultingQty: updated.stockQty! }
}

// Movement history query (PRO-gate ที่ caller/route)
export type StockMovementView = {
  id: string
  delta: number
  resultingQty: number
  source: string
  refId: string | null
  note: string | null
  actorUserId: string | null
  createdAt: Date
}

export async function getStockMovementHistory(
  shopId: string,
  productId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: StockMovementView[]; nextCursor: string | null }> {
  const take = opts.take ?? 20
  const rows = await prisma.stockMovement.findMany({
    where: {
      shopId,
      productId,
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1, // +1 เพื่อรู้ว่ามีหน้าต่อไปไหม โดยไม่ต้อง COUNT แยก
    select: {
      id: true, delta: true, resultingQty: true, source: true,
      refId: true, note: true, actorUserId: true, createdAt: true,
    },
  })
  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  }
}

// CSV export (ค่า string, ไม่ gate ในตัว — gate ที่ route)
export async function exportStockToCsv(shopId: string): Promise<string> {
  const products = await prisma.product.findMany({
    where: { shopId, type: 'PHYSICAL', isActive: true },
    select: { id: true, sku: true, name: true, stockQty: true },
    orderBy: { name: 'asc' },
  })
  const rows = [
    ['productId', 'sku', 'name', 'stockQty'],
    ...products.map((p) => [p.id, p.sku ?? '', p.name, p.stockQty === null ? '' : String(p.stockQty)]),
  ]
  return stringifyCsv(rows)
}

// CSV import (per-row isolation — แถวหนึ่ง fail ไม่ rollback แถวอื่น)
export type CsvImportRowResult =
  | { row: number; productId: string; status: 'OK'; resultingQty: number }
  | { row: number; productId: string; status: 'ERROR'; error: string }

export async function importStockFromCsvRows(
  shopId: string,
  actorUserId: string,
  rows: { productId: string; stockQty: number }[],
): Promise<{ totalRows: number; successCount: number; errorCount: number; results: CsvImportRowResult[] }> {
  const results: CsvImportRowResult[] = []
  for (let i = 0; i < rows.length; i++) {
    const { productId, stockQty: newQty } = rows[i]
    try {
      const result = await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, shopId: true, type: true, name: true, stockQty: true },
        })
        if (!product || product.shopId !== shopId) throw new Error('PRODUCT_NOT_FOUND')
        if (product.type !== 'PHYSICAL') throw new Error('PRODUCT_NOT_PHYSICAL')
        const oldQty = product.stockQty
        const delta = newQty - (oldQty ?? 0)
        // compare-and-swap บน snapshot เดิม — กัน concurrent modification (เช่น order deduct ระหว่าง import)
        const updated = await tx.product.updateMany({
          where: { id: productId, stockQty: oldQty },
          data: { stockQty: newQty },
        })
        if (updated.count === 0) throw new Error('CONCURRENT_MODIFICATION')
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: {
              shopId, productId, productName: product.name, delta, resultingQty: newQty,
              source: 'MANUAL_ADJUST', refId: null, note: 'นำเข้าจาก CSV', actorUserId,
            },
          })
        }
        return { resultingQty: newQty }
      })
      results.push({ row: i + 1, productId, status: 'OK', resultingQty: result.resultingQty })
    } catch (e) {
      results.push({ row: i + 1, productId, status: 'ERROR', error: e instanceof Error ? e.message : 'UNKNOWN' })
    }
  }
  return {
    totalRows: rows.length,
    successCount: results.filter((r) => r.status === 'OK').length,
    errorCount: results.filter((r) => r.status === 'ERROR').length,
    results,
  }
}
