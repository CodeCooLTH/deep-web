import { describe, it, expect, vi, beforeEach } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn() }))

import { listConversationsForShops, listConversationsForBuyer } from '@/services/chat.service'

/** feature 00037 — เทสชุดนี้เขียนไว้ตอนที่ service รับ shopId เดี่ยว; ตอนนี้รับ array แล้ว
 *  ห่อไว้เพื่อให้เคสเดิมทั้งหมดยังพิสูจน์ "โหมดร้านเดียวต้องได้ where เหมือนเดิมเป๊ะ" ต่อไป
 *  (นั่นคือคุณค่าหลักของเทสชุดนี้หลังฟีเจอร์รวมร้าน — กัน regression ของผู้ใช้ส่วนใหญ่) */
const listConversationsForShop = (
  shopId: string,
  opts?: Parameters<typeof listConversationsForShops>[1],
) => listConversationsForShops([shopId], opts)

describe('listConversationsForShop — T1 filter/ค้นหา (feature 00018) + S-7 status/hidden/pinned', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.conversation.findMany.mockResolvedValue([])
  })

  // S-7: default status='open' (resolvedAt:null) + hidden=false (isHidden:false) — ต้องกรองเสมอ
  // แม้ไม่ส่ง opts อะไรมาเลย ไม่งั้นเธรดปิดงาน/ซ่อนจะโผล่ในรายการปกติ
  it('ไม่ใส่ filter เพิ่ม → where มี shopId + default status=open (resolvedAt:null) + hidden=false', async () => {
    await listConversationsForShop('shop1')

    const where = db.conversation.findMany.mock.calls[0]![0].where
    // isSpam:false เป็นค่าตั้งต้นของ `listConversationsForShop` (chat.service.ts:336) — รายการปกติ
    // ไม่โชว์เธรดสแปม; แท็บสแปมส่ง opts.spam=true แล้วได้ isSpam:true แทน (เทสแยกด้านล่าง)
    expect(where).toEqual({ shopId: 'shop1', resolvedAt: null, isHidden: false, isSpam: false })
  })

  it('filter ตาม channel → where มี shopId + channel (+ default status/hidden)', async () => {
    await listConversationsForShop('shop1', { channel: 'MESSENGER' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ shopId: 'shop1', channel: 'MESSENGER', resolvedAt: null, isHidden: false, isSpam: false })
  })

  it('filter ตาม shopChannelId → where มี shopId + shopChannelId (+ default status/hidden)', async () => {
    await listConversationsForShop('shop1', { shopChannelId: 'ch1' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ shopId: 'shop1', shopChannelId: 'ch1', resolvedAt: null, isHidden: false, isSpam: false })
  })

  it('ค้นหา q → OR ของ lastMessagePreview/externalContact.name ห่อใน AND (กันชนกับ OR อื่น)', async () => {
    await listConversationsForShop('shop1', { q: 'สมชาย' })

    const where = db.conversation.findMany.mock.calls[0]![0].where
    expect(where.shopId).toBe('shop1')
    expect(where.AND).toHaveLength(1)
    expect(where.AND[0].OR).toEqual([
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
    expect(where.AND[0].OR).toHaveLength(2)
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

  describe('S-7 — status filter', () => {
    it("status ไม่ส่ง (default) → resolvedAt: null (เห็นเฉพาะที่ยังเปิดอยู่)", async () => {
      await listConversationsForShop('shop1')
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.resolvedAt).toBeNull()
    })

    it("status='open' → resolvedAt: null เหมือน default", async () => {
      await listConversationsForShop('shop1', { status: 'open' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.resolvedAt).toBeNull()
    })

    it("status='resolved' → resolvedAt: {not: null} (เฉพาะที่ปิดงานแล้ว)", async () => {
      await listConversationsForShop('shop1', { status: 'resolved' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.resolvedAt).toEqual({ not: null })
    })

    it("status='all' → ไม่มี resolvedAt ใน where เลย (ไม่กรอง)", async () => {
      await listConversationsForShop('shop1', { status: 'all' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where).not.toHaveProperty('resolvedAt')
    })
  })

  describe('S-7 — hidden filter', () => {
    it('hidden ไม่ส่ง (default) → isHidden: false (ไม่โชว์เธรดที่ซ่อนในรายการปกติ)', async () => {
      await listConversationsForShop('shop1')
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.isHidden).toBe(false)
    })

    it('hidden=true → isHidden: true (ดูเฉพาะที่ซ่อน)', async () => {
      await listConversationsForShop('shop1', { hidden: true })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.isHidden).toBe(true)
    })
  })

  describe('S-7 — customerLinked filter', () => {
    it("customerLinked ไม่ส่ง/'all' → ไม่มี AND ของ customerLinked", async () => {
      await listConversationsForShop('shop1', { customerLinked: 'all' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.AND).toBeUndefined()
    })

    it("customerLinked='linked' → AND มี OR ของ buyer.customer/externalContact.customerId ไม่ null", async () => {
      await listConversationsForShop('shop1', { customerLinked: 'linked' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.AND).toContainEqual({
        OR: [
          { buyerUserId: { not: null }, buyer: { customer: { isNot: null } } },
          { externalContactId: { not: null }, externalContact: { customerId: { not: null } } },
        ],
      })
    })

    it("customerLinked='unlinked' → AND มี OR ของ buyer.customer/externalContact.customerId เป็น null", async () => {
      await listConversationsForShop('shop1', { customerLinked: 'unlinked' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.AND).toContainEqual({
        OR: [
          { buyerUserId: { not: null }, buyer: { customer: null } },
          { externalContactId: { not: null }, externalContact: { customerId: null } },
        ],
      })
    })

    it('customerLinked + q พร้อมกัน → ทั้งคู่อยู่ใน AND array ไม่ทับกัน (กัน OR key ชนกัน)', async () => {
      await listConversationsForShop('shop1', { customerLinked: 'linked', q: 'test' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.AND).toHaveLength(2)
    })
  })

  describe('S-7 — pinned เรียงขึ้นก่อนเสมอ', () => {
    it('orderBy = [{isPinned:desc}, {lastMessageAt:desc}] เสมอสำหรับ shop listing', async () => {
      await listConversationsForShop('shop1')
      const orderBy = db.conversation.findMany.mock.calls[0]![0].orderBy
      expect(orderBy).toEqual([{ isPinned: 'desc' }, { lastMessageAt: 'desc' }])
    })

    it('มี cursor ธรรมดา (ไม่ได้เข้ารหัส isPinned) → ตีความเป็น cursorPinned=false', async () => {
      await listConversationsForShop('shop1', { cursor: '2026-07-01T00:00:00.000Z' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      // cursorCond spread ตรงกับ where เลย (ไม่มี q/customerLinked active รอบนี้ = ไม่มี AND)
      expect(where.isPinned).toBe(false)
      expect(where.lastMessageAt).toEqual({ lt: new Date('2026-07-01T00:00:00.000Z') })
    })

    it('cursor encode "1|<ISO>" (แถวสุดท้ายของหน้าก่อนปักหมุดอยู่) → หน้าถัดไปยังเห็นเธรดไม่ปักหมุดทั้งหมด + ปักหมุดที่เหลือที่เก่ากว่า', async () => {
      await listConversationsForShop('shop1', { cursor: '1|2026-07-01T00:00:00.000Z' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.OR).toEqual([
        { isPinned: false },
        { isPinned: true, lastMessageAt: { lt: new Date('2026-07-01T00:00:00.000Z') } },
      ])
    })

    it('customerLinked + cursor encode "1|<ISO>" พร้อมกัน → cursor OR (top-level) ไม่ชนกับ customerLinked OR (ห่อใน AND แล้ว)', async () => {
      await listConversationsForShop('shop1', { customerLinked: 'linked', cursor: '1|2026-07-01T00:00:00.000Z' })
      const where = db.conversation.findMany.mock.calls[0]![0].where
      expect(where.AND).toHaveLength(1) // customerLinked OR ยังอยู่ครบ ไม่หาย
      expect(where.OR).toEqual([
        { isPinned: false },
        { isPinned: true, lastMessageAt: { lt: new Date('2026-07-01T00:00:00.000Z') } },
      ])
    })

    it('nextCursor เข้ารหัส isPinned ของแถวสุดท้ายที่เห็น (hasMore=true)', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `c${i}`,
        shopId: 'shop1',
        isPinned: i === 20, // แถวสุดท้ายที่ตัดออก (index 20) ปักหมุดอยู่ — ไม่ควรถูกใช้เป็น cursor
        lastMessageAt: new Date(`2026-07-${String(21 - i).padStart(2, '0')}T00:00:00.000Z`),
      }))
      db.conversation.findMany.mockResolvedValue(rows)

      const result = await listConversationsForShop('shop1', { take: 20 })
      // page[19] (index 19, item แถวที่ 20 ที่โชว์จริง) ต้องเป็นตัวกำหนด cursor ไม่ใช่ rows[20] ที่ถูกตัดทิ้ง
      expect(result.nextCursor).toBe(`${rows[19]!.isPinned ? '1' : '0'}|${rows[19]!.lastMessageAt.toISOString()}`)
    })
  })
})

describe('listConversationsForBuyer — ไม่มี filter ใหม่ (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.conversation.findMany.mockResolvedValue([])
  })

  it('where มีแค่ buyerUserId — ไม่มี field ของ seller filter หลุดเข้ามา', async () => {
    await listConversationsForBuyer('buyer1')

    const call = db.conversation.findMany.mock.calls[0]![0]
    expect(call.where).toEqual({ buyerUserId: 'buyer1' })
    // buyer listing ไม่ pin-sort — orderBy ยังเป็น object เดี่ยวเหมือนเดิม ไม่ใช่ array
    expect(call.orderBy).toEqual({ lastMessageAt: 'desc' })
  })
})
