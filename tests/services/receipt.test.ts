/**
 * feature 00065 — ออกเลขใบเสร็จ (DB จริงบนเครื่อง · ล้างเฉพาะ id ที่เทสสร้าง ตาม Hard Rule 13)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, deleteTestData } from '../setup'
import { issueOrReadReceipt, ReceiptError } from '@/services/receipt.service'
import { receiptPeriodTH } from '@/lib/format-date'

describe('[blocker] issueOrReadReceipt', () => {
  let userIds: string[] = []
  let shopIds: string[] = []
  let userId: string
  let shopId: string

  const makeOrder = (status = 'PENDING', sid = shopId) =>
    prisma.order.create({ data: { shopId: sid, totalAmount: 3500, status } })

  const makeOtherShop = async (vertical: string) => {
    const u = await prisma.user.create({
      data: { displayName: 'Other', username: `rcp-o-${Math.random().toString(36).slice(2, 10)}`, isShop: true },
    })
    userIds.push(u.id)
    const s = await prisma.shop.create({ data: { userId: u.id, shopName: 'Other', vertical } })
    shopIds.push(s.id)
    return s
  }

  beforeEach(async () => {
    userIds = []
    shopIds = []
    const tag = Math.random().toString(36).slice(2, 10)
    const user = await prisma.user.create({
      data: { displayName: 'Receipt Seller', username: `rcp-${tag}`, isShop: true },
    })
    userIds.push(user.id)
    userId = user.id
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: 'Receipt Shop', vertical: 'SERVICE_QUEUE' },
    })
    shopIds.push(shop.id)
    shopId = shop.id
  })

  afterEach(async () => {
    await deleteTestData({ userIds, shopIds })
  })

  it('ออกเลขเรียงต่อกัน ไม่ข้าม และพิมพ์ซ้ำได้เลขเดิม', async () => {
    const period = receiptPeriodTH(new Date())
    const a = await makeOrder()
    const b = await makeOrder()
    const ra = await issueOrReadReceipt({ shopId, orderToken: a.publicToken, userId })
    const rb = await issueOrReadReceipt({ shopId, orderToken: b.publicToken, userId })
    expect(ra.receiptNo).toBe(`CA${period}0001`)
    expect(rb.receiptNo).toBe(`CA${period}0002`)
    const again = await issueOrReadReceipt({ shopId, orderToken: a.publicToken, userId })
    expect(again.receiptNo).toBe(ra.receiptNo)
    expect(again.issuedAt.getTime()).toBe(ra.issuedAt.getTime())
  })

  it('กดพร้อมกันหลายครั้งบนออเดอร์เดียว = เลขเดียว และใบถัดไปไม่ข้ามเลข (AC-RCP-14)', async () => {
    const period = receiptPeriodTH(new Date())
    const a = await makeOrder()
    const results = await Promise.all(
      Array.from({ length: 5 }, () => issueOrReadReceipt({ shopId, orderToken: a.publicToken, userId })),
    )
    expect(new Set(results.map((r) => r.receiptNo)).size).toBe(1)
    const b = await makeOrder()
    const rb = await issueOrReadReceipt({ shopId, orderToken: b.publicToken, userId })
    expect(rb.receiptNo).toBe(`CA${period}0002`)
  })

  it('ยกเลิกก่อนออก = ออกไม่ได้ · ยกเลิกหลังออก = ยังได้เลขเดิม (BR-RCP-08/09)', async () => {
    const cancelled = await makeOrder('CANCELLED')
    await expect(
      issueOrReadReceipt({ shopId, orderToken: cancelled.publicToken, userId }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_ISSUABLE' })

    const a = await makeOrder()
    const ra = await issueOrReadReceipt({ shopId, orderToken: a.publicToken, userId })
    await prisma.order.update({ where: { id: a.id }, data: { status: 'CANCELLED' } })
    const again = await issueOrReadReceipt({ shopId, orderToken: a.publicToken, userId })
    expect(again.receiptNo).toBe(ra.receiptNo)
  })

  it('ร้านที่ไม่ใช่บริการถูกปฏิเสธที่ service (BR-RCP-17)', async () => {
    const other = await makeOtherShop('ONLINE_SALES')
    const o = await makeOrder('PENDING', other.id)
    await expect(
      issueOrReadReceipt({ shopId: other.id, orderToken: o.publicToken, userId }),
    ).rejects.toBeInstanceOf(ReceiptError)
  })

  it('ออเดอร์ของร้านอื่น = ไม่พบ (scope ใน WHERE)', async () => {
    const a = await makeOrder()
    const other = await makeOtherShop('SERVICE_QUEUE')
    await expect(
      issueOrReadReceipt({ shopId: other.id, orderToken: a.publicToken, userId }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})
