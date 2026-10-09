/**
 * chat-interested-product.db.test.ts — Postgres จริง (00019-ext-mem T5)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import {
  addInterestedProduct, removeInterestedProduct, listInterestedProducts, listInterestedForPrompt,
} from '@/services/chat-interested-product.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', shopA: '', shopB: '', convA: '', convB: '', convOther: '', customer: '', ch: '', c1: '', c2: '', prod: '', prodB: '' }
const productIds: string[] = []

const mkProduct = async (shopId: string, name: string, attributes: object = {}) => {
  const p = await prisma.product.create({ data: { shopId, name, price: 100, attributes, images: ['img1'] } as never, select: { id: true } })
  productIds.push(p.id)
  return p.id
}

describe.skipIf(!isLocal)('chat-interested-product (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `cip-${run}`, username: `cip_${run}` }, select: { id: true } })
    const mkShop = (n: string) => prisma.shop.create({ data: { userId: u.id, shopName: `cip-${n}-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    const a = await mkShop('a'), b = await mkShop('b')
    const cust = await prisma.customer.create({ data: { phone: `9${String(parseInt(run, 16)).padStart(9, '0').slice(-9)}` }, select: { id: true } })
    const ch = await prisma.shopChannel.create({
      data: { shopId: a.id, provider: 'MESSENGER', externalId: `cip-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id } as never, select: { id: true },
    })
    const mkContact = (ext: string) => prisma.externalContact.create({
      data: { shopChannelId: ch.id, externalUserId: `cip-${run}-${ext}`, customerId: cust.id }, select: { id: true },
    })
    const [c1, c2] = [await mkContact('1'), await mkContact('2')]
    const mkConv = (externalContactId?: string) => prisma.conversation.create({
      data: { shopId: a.id, channel: 'MESSENGER', externalContactId } as never, select: { id: true },
    })
    const [ca, cb, co] = [await mkConv(c1.id), await mkConv(c2.id), await mkConv()]
    Object.assign(S, { user: u.id, shopA: a.id, shopB: b.id, convA: ca.id, convB: cb.id, convOther: co.id, customer: cust.id, ch: ch.id, c1: c1.id, c2: c2.id })
    S.prod = await mkProduct(a.id, `เสื้อ-${run}`, { สี: 'ครีม, ดำ', ขนาด: 'M, L' })
    S.prodB = await mkProduct(b.id, `ร้านอื่น-${run}`)
  })

  afterAll(async () => {
    const convs = [S.convA, S.convB, S.convOther]
    await prisma.chatInterestedProduct.deleteMany({ where: { conversationId: { in: convs } } })
    await prisma.conversation.deleteMany({ where: { id: { in: convs } } })
    await prisma.externalContact.deleteMany({ where: { id: { in: [S.c1, S.c2] } } })
    await prisma.shopChannel.deleteMany({ where: { id: S.ch } })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    await prisma.customer.deleteMany({ where: { id: S.customer } })
    await prisma.shop.deleteMany({ where: { id: { in: [S.shopA, S.shopB] } } })
    await prisma.user.deleteMany({ where: { id: S.user } })
    await prisma.$disconnect()
  })

  const add = (conversationId: string, productId: string, selections?: { key: string; value: string }[]) =>
    addInterestedProduct({ shopId: S.shopA, conversationId, userId: S.user, productId, selections })

  it('label ถูก · ค่านอก INVALID_OPTION · ซ้ำ DUPLICATE · สินค้าร้านอื่น PRODUCT_NOT_FOUND', async () => {
    const r = await add(S.convOther, S.prod, [{ key: 'สี', value: 'ครีม' }, { key: 'ขนาด', value: 'L' }])
    expect(r.ok && r.item.optionLabel).toBe('สี ครีม · ขนาด L')
    expect(await add(S.convOther, S.prod, [{ key: 'สี', value: 'แดง' }])).toEqual({ ok: false, code: 'INVALID_OPTION' })
    expect(await add(S.convOther, S.prod, [{ key: 'สี', value: 'ครีม' }, { key: 'ขนาด', value: 'L' }])).toEqual({ ok: false, code: 'DUPLICATE' })
    expect(await add(S.convOther, S.prodB)).toEqual({ ok: false, code: 'PRODUCT_NOT_FOUND' })
    expect(await removeInterestedProduct({ shopId: S.shopB, conversationId: S.convOther, rowId: r.ok ? r.item.id : '' })).toEqual({ ok: false })
    expect(await removeInterestedProduct({ shopId: S.shopA, conversationId: S.convOther, rowId: r.ok ? r.item.id : '' })).toEqual({ ok: true })
  })

  it('11 → LIMIT_REACHED · cluster เห็นของห้อง A · ตัด 10 · ลบสินค้า → DELETED แถวอยู่', async () => {
    const ids = [S.prod]
    for (let i = 0; i < 9; i++) ids.push(await mkProduct(S.shopA, `x${i}-${run}`))
    for (const id of ids) expect((await add(S.convA, id)).ok).toBe(true)
    expect(await add(S.convA, await mkProduct(S.shopA, `x10-${run}`))).toEqual({ ok: false, code: 'LIMIT_REACHED' })

    // ห้อง B (cluster เดียวกัน) เห็นของห้อง A ; B เพิ่มอีก 1 → union 11 ตัดเหลือ 10 ใหม่สุด
    expect((await listInterestedProducts(S.shopA, S.convB))?.length).toBe(10)
    const extra = await add(S.convB, await mkProduct(S.shopA, `extra-${run}`))
    const list = (await listInterestedProducts(S.shopA, S.convB))!
    expect(list.length).toBe(10)
    expect(list[0].id).toBe(extra.ok ? extra.item.id : '')
    expect((await listInterestedProducts(S.shopA, S.convOther))?.length).toBe(0)
    expect(await listInterestedProducts(S.shopB, S.convA)).toBeNull()

    await prisma.product.deleteMany({ where: { id: ids[1] } })
    const after = (await listInterestedProducts(S.shopA, S.convA))!
    const gone = after.find((x) => x.name === `x0-${run}`)
    expect(gone).toMatchObject({ state: 'DELETED', productId: null, imageFileId: null })
    const pr = await listInterestedForPrompt(S.shopA, S.convA)
    expect(pr.find((x) => x.name === `x0-${run}`)).toMatchObject({ state: 'DELETED', price: null, stockQty: null })
    expect(pr.find((x) => x.name === `x8-${run}`)).toMatchObject({ state: 'ACTIVE', price: '100.00' })
  })
})
