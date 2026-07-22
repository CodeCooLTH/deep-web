import { describe, it, expect, vi, beforeEach } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn() }))

import { listConversationsForShop, listConversationsForBuyer } from '@/services/chat.service'

describe('listConversationsForShop — T1 filter/ค้นหา (feature 00018)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.conversation.findMany.mockResolvedValue([])
  })

  it('ไม่ใส่ filter เพิ่ม → where มีแค่ shopId', async () => {
    await listConversationsForShop('shop1')

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ shopId: 'shop1' })
  })

  it('filter ตาม channel → where มี shopId + channel', async () => {
    await listConversationsForShop('shop1', { channel: 'MESSENGER' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ shopId: 'shop1', channel: 'MESSENGER' })
  })

  it('filter ตาม shopChannelId → where มี shopId + shopChannelId', async () => {
    await listConversationsForShop('shop1', { shopChannelId: 'ch1' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ shopId: 'shop1', shopChannelId: 'ch1' })
  })

  it('ค้นหา q → where มี shopId + OR ของ lastMessagePreview/externalContact.name (case-insensitive)', async () => {
    await listConversationsForShop('shop1', { q: 'สมชาย' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where.shopId).toBe('shop1')
    expect(where.OR).toEqual([
      { lastMessagePreview: { contains: 'สมชาย', mode: 'insensitive' } },
      { externalContact: { name: { contains: 'สมชาย', mode: 'insensitive' } } },
    ])
  })

  it('รวมหลาย filter พร้อมกัน (channel + shopChannelId + q) → shopId ยังอยู่เสมอ (AND กับทุกตัว)', async () => {
    await listConversationsForShop('shop1', { channel: 'INSTAGRAM', shopChannelId: 'ch2', q: 'มล' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where.shopId).toBe('shop1')
    expect(where.channel).toBe('INSTAGRAM')
    expect(where.shopChannelId).toBe('ch2')
    expect(where.OR).toHaveLength(2)
  })

  // เคสสำคัญที่สุด — filter/search ต้องไม่ทำให้เธรดของร้านอื่นหลุดเข้ามา ไม่ว่าจะส่ง filter
  // อะไรมาผสมกันก็ตาม shopId ต้องยังคง scope query อยู่เสมอ (ไม่ถูก filter อื่นเขียนทับ/ลบออก)
  it('ownership isolation: shopId ต้องอยู่ใน where เสมอไม่ว่าจะส่ง filter ใดมา ไม่มีทางให้ค่าอื่นเขียนทับ', async () => {
    const scenarios: Array<{ channel?: string; shopChannelId?: string; q?: string }> = [
      {},
      { channel: 'DEEP' },
      { shopChannelId: 'other-shop-channel-id' },
      { q: 'anything' },
      { channel: 'MESSENGER', shopChannelId: 'x', q: 'y' },
    ]

    for (const opts of scenarios) {
      db.conversation.findMany.mockClear()
      await listConversationsForShop('shop-mine', opts)
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.shopId).toBe('shop-mine')
    }
  })

  it('shopId ของร้านที่เรียก ≠ ร้านอื่น — สอง shop เรียกพร้อมกันได้ where คนละค่า ไม่ปนกัน', async () => {
    await listConversationsForShop('shop-a', { channel: 'MESSENGER' })
    await listConversationsForShop('shop-b', { channel: 'MESSENGER' })

    const whereA = db.conversation.findMany.mock.calls[0]![0].where
    const whereB = db.conversation.findMany.mock.calls[1]![0].where
    expect(whereA.shopId).toBe('shop-a')
    expect(whereB.shopId).toBe('shop-b')
  })

  it('externalContact เป็น null (เธรด DEEP) ไม่ทำให้ query พัง — OR clause เป็น relation filter ที่ safe', async () => {
    // จำลองว่า DB คืนแถวที่ externalContact เป็น null ปกติ (ไม่ error) — service แค่ pass query
    // ไปที่ prisma โดยตรง ความปลอดภัยอยู่ที่รูปแบบ relation filter (contains ผ่าน nested object)
    // ไม่ใช่ optional-chaining บน JS object เอง จึงไม่ throw แม้ conversation.externalContact = null
    db.conversation.findMany.mockResolvedValue([
      { id: 'c1', shopId: 'shop1', channel: 'DEEP', lastMessageAt: new Date(), externalContact: null },
    ])

    await expect(listConversationsForShop('shop1', { q: 'test' })).resolves.toBeDefined()
  })
})

describe('listConversationsForBuyer — ไม่มี filter ใหม่ (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.conversation.findMany.mockResolvedValue([])
  })

  it('where มีแค่ buyerUserId — ไม่มี field ของ seller filter หลุดเข้ามา', async () => {
    await listConversationsForBuyer('buyer1')

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ buyerUserId: 'buyer1' })
  })
})
