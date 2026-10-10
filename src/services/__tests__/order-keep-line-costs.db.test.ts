/**
 * order-keep-line-costs.db.test.ts — Postgres จริง (00071 P1-T7 · D-4)
 * ผู้ไม่ใช่เจ้าของแก้ออเดอร์ (ราคา/จำนวน) ต้องไม่ทำให้ OrderItem.cost เดิมถูกแทนด้วย Product.cost ล่าสุด
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import { createOrder, updateOrder } from '@/services/order.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', shop: '', prod: '' }
const orderIds: string[] = []

const costsOf = async (orderId: string) =>
  (await prisma.orderItem.findMany({ where: { orderId }, select: { cost: true } })).map((i) => Number(i.cost))

describe.skipIf(!isLocal)('updateOrder keepLineCosts (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `klc-${run}`, username: `klc_${run}` }, select: { id: true } })
    const s = await prisma.shop.create({ data: { userId: u.id, shopName: `klc-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    const p = await prisma.product.create({
      data: { shopId: s.id, name: `สินค้า-${run}`, price: 100, cost: 50, fulfillmentMode: 'NO_SHIPPING' } as never,
      select: { id: true },
    })
    Object.assign(S, { user: u.id, shop: s.id, prod: p.id })
  })

  afterAll(async () => {
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.product.deleteMany({ where: { id: S.prod } })
    await prisma.shop.deleteMany({ where: { id: S.shop } })
    await prisma.user.deleteMany({ where: { id: S.user } })
    await prisma.$disconnect()
  })

  const make = async () => {
    await prisma.product.update({ where: { id: S.prod }, data: { cost: 50 } })
    const o = await createOrder(S.shop, {
      type: 'PHYSICAL', fulfillmentMode: 'PICKUP', items: [{ productId: S.prod, name: `สินค้า-${run}`, qty: 1, price: 100 }],
    } as never)
    orderIds.push(o.id)
    await prisma.product.update({ where: { id: S.prod }, data: { cost: 80 } }) // ต้นทุนสินค้าขยับหลังเปิดบิล
    return o as { id: string; publicToken: string }
  }
  const edit = (token: string, keep: boolean) =>
    updateOrder(S.shop, token, {
      type: 'PHYSICAL', fulfillmentMode: 'PICKUP', items: [{ productId: S.prod, name: `สินค้า-${run}`, qty: 3, price: 120 }],
    } as never, S.user, { keepLineCosts: keep })

  it('keepLineCosts=true → cost เดิม (50) อยู่ แม้ราคา/จำนวนเปลี่ยนและ Product.cost เป็น 80', async () => {
    const o = await make()
    expect(await costsOf(o.id)).toEqual([50])
    await edit(o.publicToken, true)
    expect(await costsOf(o.id)).toEqual([50])
  })

  it('ควบคุม: ไม่ส่ง option → ใช้ Product.cost ล่าสุด (80) ตามพฤติกรรมเดิมของเจ้าของ', async () => {
    const o = await make()
    await edit(o.publicToken, false)
    expect(await costsOf(o.id)).toEqual([80])
  })
})
