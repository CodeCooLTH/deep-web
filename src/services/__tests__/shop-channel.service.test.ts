import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  shopChannel: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
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
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop-other', shop: { shopName: 'ร้านอื่น' } })

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(0)
    // skipped พก occupiedBy = ชื่อร้านที่ยึดอยู่ ให้ UI แจ้ง user ได้ว่าติดร้านไหน
    expect(result.skipped).toEqual([{ pageName: 'ร้านทดสอบ', occupiedBy: 'ร้านอื่น' }])
    expect(subscribePageToApp).not.toHaveBeenCalled()
    // ต้องกรอง status <> DISCONNECTED เสมอ — ให้ตรงขอบเขตของ partial unique index จริง
    // (ไม่งั้นอาจไปเจอแถว DISCONNECTED เก่าที่ไม่ใช่ตัวชน constraint แล้วสรุปผิด)
    expect(db.shopChannel.findFirst.mock.calls[0]![0].where.status).toEqual({ not: 'DISCONNECTED' })
  })

  // fix: เดิม unique constraint คลุมทั้งตาราง (รวม DISCONNECTED) ทำให้ย้ายเพจไปร้านอื่นไม่ได้เลย
  // ตอนนี้เป็น partial unique index (เฉพาะแถว active) — แถว DISCONNECTED เก่าไม่กันการ insert แถวใหม่
  // อีกต่อไป ดังนั้น create() ควรผ่านตรง ๆ โดยไม่ชน P2002 เลย (ไม่ใช่แค่ catch แล้วจัดการถูก)
  it('เพจที่เคย DISCONNECTED กับร้านเดิม → เชื่อมเข้าร้านใหม่สำเร็จ (สร้างแถวใหม่ ไม่ชน P2002)', async () => {
    db.shopChannel.create.mockResolvedValue({ id: 'ch-new' })

    const result = await connectPages('shop-b', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    expect(db.shopChannel.findFirst).not.toHaveBeenCalled() // ไม่มี P2002 ก็ไม่ต้องไปหาว่าใครยึด
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // I-4: ร้านเดียวกันเชื่อมซ้ำ (เช่น retry หลัง subscribe รอบก่อนล้มเหลว) ต้องไม่ใช่ error —
  // ให้นับว่าสำเร็จและ subscribe ใหม่อีกครั้ง (ฝั่ง Meta idempotent)
  it('Page เดิมของร้านเดียวกันเชื่อมซ้ำ (P2002, shopId ตรงกัน) → นับเป็น connected และ subscribe อีกครั้ง', async () => {
    db.shopChannel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop1', shop: { shopName: 'ร้านทดสอบ' } })

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // force move: user ยืนยันย้ายเพจที่ติดร้านอื่น → ตัดร้านเดิม (DISCONNECTED) แล้วสร้างใหม่ให้ร้านนี้
  // ในทรานแซกชันเดียว นับเป็น connected (ไม่ใช่ skipped) และ subscribe ต่อ
  it('force=true + เพจติดร้านอื่น → ตัดร้านเดิมแล้วย้ายมาร้านนี้ นับ connected', async () => {
    // create แรกชน P2002 (มีร้านอื่นถืออยู่) → เข้า force branch: transaction updateMany+create
    db.shopChannel.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop-other', shop: { shopName: 'ร้านอื่น' } })
    db.$transaction.mockResolvedValue([{ count: 1 }, { id: 'ch-moved' }])
    // IG upsert (force เหมือนกัน) — ให้ผ่านตรง ๆ
    db.shopChannel.create.mockResolvedValue({ id: 'ch-ig' })

    const result = await connectPages('shop1', 'user1', [page], { force: true })

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    // ต้องตัดแถว active ของเพจนี้ทั้งหมด (ไม่ผูก shopId — ครอบร้านอื่น) แล้วค่อยสร้างใหม่
    const txArg = db.$transaction.mock.calls[0]![0]
    expect(Array.isArray(txArg)).toBe(true)
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // I-4: IG สร้างไม่สำเร็จ (ถูกร้านอื่นยึด externalId ไปแล้ว) ต้องไม่ทำให้ Messenger ที่สร้างสำเร็จ
  // แล้วพลอย throw ออกจาก loop ก่อนถึง subscribePageToApp
  it('IG สร้างไม่สำเร็จ (P2002 ร้านอื่นยึดแล้ว) → ไม่บล็อก subscribe ของ Messenger', async () => {
    db.shopChannel.create
      .mockResolvedValueOnce({ id: 'ch-messenger' }) // MESSENGER สร้างสำเร็จ
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' })) // IG ชน
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop-other' })

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
    db.shopChannel.findFirst.mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER',
      accessTokenEnc: encryptToken('page_token_plain'), status: 'ACTIVE',
    })
    const ch = await getChannelByExternalId('MESSENGER', 'PAGE1')
    expect(ch!.accessToken).toBe('page_token_plain')
    // ต้อง findFirst + กรอง status ที่ระดับ query — ตรงกับขอบเขต partial unique index จริง
    // (findUnique ใช้ไม่ได้แล้วเพราะไม่มี @@unique เต็มตารางบน provider+externalId อีกต่อไป)
    expect(db.shopChannel.findFirst.mock.calls[0]![0].where).toEqual({
      provider: 'MESSENGER', externalId: 'PAGE1', status: { not: 'DISCONNECTED' },
    })
  })

  // เดิมมีได้แค่แถวเดียวต่อ (provider, externalId) เพราะ @@unique เต็มตาราง ตอนนี้เพจเดียวย้าย
  // ร้านได้แล้ว → อาจมีทั้งแถว DISCONNECTED เก่า (ร้าน A) และแถว active ใหม่ (ร้าน B) พร้อมกัน
  // ฝั่ง DB (Postgres WHERE status <> 'DISCONNECTED') กรองแถว DISCONNECTED ออกให้เองอยู่แล้ว จำลอง
  // ด้วยการคืน null ตรง ๆ แทนการ mock แถว DISCONNECTED แล้วให้ service กรองเอง (mock ผิดชั้น)
  it('channel ที่เหลืออยู่มีแต่แถว DISCONNECTED (ไม่มีแถว active) → getChannelByExternalId คืน null', async () => {
    db.shopChannel.findFirst.mockResolvedValue(null)
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
