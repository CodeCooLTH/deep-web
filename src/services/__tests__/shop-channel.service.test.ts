import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  shopChannel: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', () => ({ subscribePageToApp: vi.fn().mockResolvedValue(undefined) }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'b'.repeat(64)
})

import { connectPages, listChannels, getChannelByExternalId, disconnectChannel } from '@/services/shop-channel.service'
import { encryptToken } from '@/lib/token-crypto'
import { subscribePageToApp } from '@/lib/facebook/graph'

const page = {
  id: 'PAGE1', name: 'ร้านทดสอบ', accessToken: 'page_token_plain',
  tasks: ['MESSAGING', 'MODERATE'], instagramBusinessAccountId: null,
}

describe('shop-channel.service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('connectPages เก็บ token แบบเข้ารหัส ไม่เก็บ plaintext', async () => {
    db.shopChannel.create.mockResolvedValue({ id: 'ch1' })
    await connectPages('shop1', 'user1', [page])

    const created = db.shopChannel.create.mock.calls[0]![0].data
    expect(created.accessTokenEnc).not.toBe('page_token_plain')
    expect(created.accessTokenEnc).not.toContain('page_token_plain')
    expect(created.provider).toBe('MESSENGER')
  })

  it('Page ที่มี IG ผูกอยู่ → สร้าง channel เพิ่มอีกแถวเป็น INSTAGRAM', async () => {
    db.shopChannel.create.mockResolvedValue({ id: 'ch' })
    await connectPages('shop1', 'user1', [{ ...page, instagramBusinessAccountId: 'IG9' }])

    const providers = db.shopChannel.create.mock.calls.map((c) => c[0].data.provider)
    expect(providers).toEqual(['MESSENGER', 'INSTAGRAM'])
    const ig = db.shopChannel.create.mock.calls[1]![0].data
    expect(ig.externalId).toBe('IG9')
  })

  it('Page ที่ร้านอื่นเชื่อมไปแล้ว (P2002, shopId ต่างกัน) → นับเป็น skipped ไม่ throw และไม่ subscribe', async () => {
    db.shopChannel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.shopChannel.findUnique.mockResolvedValue({ shopId: 'shop-other' })

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(0)
    expect(result.skipped).toEqual(['ร้านทดสอบ'])
    expect(subscribePageToApp).not.toHaveBeenCalled()
  })

  // I-4: ร้านเดียวกันเชื่อมซ้ำ (เช่น retry หลัง subscribe รอบก่อนล้มเหลว) ต้องไม่ใช่ error —
  // ให้นับว่าสำเร็จและ subscribe ใหม่อีกครั้ง (ฝั่ง Meta idempotent)
  it('Page เดิมของร้านเดียวกันเชื่อมซ้ำ (P2002, shopId ตรงกัน) → นับเป็น connected และ subscribe อีกครั้ง', async () => {
    db.shopChannel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.shopChannel.findUnique.mockResolvedValue({ shopId: 'shop1' })

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // I-4: IG สร้างไม่สำเร็จ (ถูกร้านอื่นยึด externalId ไปแล้ว) ต้องไม่ทำให้ Messenger ที่สร้างสำเร็จ
  // แล้วพลอย throw ออกจาก loop ก่อนถึง subscribePageToApp
  it('IG สร้างไม่สำเร็จ (P2002 ร้านอื่นยึดแล้ว) → ไม่บล็อก subscribe ของ Messenger', async () => {
    db.shopChannel.create
      .mockResolvedValueOnce({ id: 'ch-messenger' }) // MESSENGER สร้างสำเร็จ
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' })) // IG ชน
    db.shopChannel.findUnique.mockResolvedValue({ shopId: 'shop-other' })

    const result = await connectPages('shop1', 'user1', [{ ...page, instagramBusinessAccountId: 'IG9' }])

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // I-4: subscribePageToApp ล้มเหลว (เช่น Graph 5xx) ต้องไม่ throw ออกจาก loop — เพจถัดไปต้องยังเชื่อมได้
  // และผลลัพธ์ต้องรายงาน subscribeFailed กลับไป ไม่เงียบ
  it('subscribePageToApp ล้มเหลว → ไม่ throw, รายงานใน subscribeFailed, connected ยังนับ', async () => {
    db.shopChannel.create.mockResolvedValue({ id: 'ch1' })
    vi.mocked(subscribePageToApp).mockRejectedValueOnce(new Error('graph 500'))

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(result.subscribeFailed).toEqual(['ร้านทดสอบ'])
  })

  it('listChannels ไม่คืน accessTokenEnc ออกไปเด็ดขาด', async () => {
    db.shopChannel.findMany.mockResolvedValue([
      { id: 'ch1', provider: 'MESSENGER', externalId: 'PAGE1', name: 'ร้าน', avatarUrl: null, status: 'ACTIVE' },
    ])
    const rows = await listChannels('shop1')
    expect(Object.keys(rows[0]!)).not.toContain('accessTokenEnc')
    // ยืนยันว่า query เลือก field แบบ allow-list ไม่ใช่ดึงทั้งแถวแล้วค่อยตัด
    expect(db.shopChannel.findMany.mock.calls[0]![0].select.accessTokenEnc).toBeUndefined()
  })

  it('getChannelByExternalId คืน token ที่ถอดรหัสแล้ว', async () => {
    db.shopChannel.findUnique.mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER',
      accessTokenEnc: encryptToken('page_token_plain'), status: 'ACTIVE',
    })
    const ch = await getChannelByExternalId('MESSENGER', 'PAGE1')
    expect(ch!.accessToken).toBe('page_token_plain')
  })

  it('channel ที่ DISCONNECTED → getChannelByExternalId คืน null', async () => {
    db.shopChannel.findUnique.mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER',
      accessTokenEnc: encryptToken('x'), status: 'DISCONNECTED',
    })
    expect(await getChannelByExternalId('MESSENGER', 'PAGE1')).toBeNull()
  })

  // Minor-10: disconnectChannel ต้อง verify ownership (shopId ตรงกัน) ก่อนตั้ง DISCONNECTED เสมอ
  describe('disconnectChannel', () => {
    it('channel เป็นของ shopId นั้นจริง → ตั้ง status DISCONNECTED', async () => {
      db.shopChannel.updateMany.mockResolvedValue({ count: 1 })
      await expect(disconnectChannel('ch1', 'shop1')).resolves.toBeUndefined()
      expect(db.shopChannel.updateMany).toHaveBeenCalledWith({
        where: { id: 'ch1', shopId: 'shop1' },
        data: { status: 'DISCONNECTED' },
      })
    })

    it('channel ไม่ใช่ของ shopId นั้น (ownership guard) → throw ไม่แตะแถว', async () => {
      db.shopChannel.updateMany.mockResolvedValue({ count: 0 })
      await expect(disconnectChannel('ch1', 'shop-other')).rejects.toThrow('CHANNEL_NOT_FOUND_OR_FORBIDDEN')
    })
  })
})
