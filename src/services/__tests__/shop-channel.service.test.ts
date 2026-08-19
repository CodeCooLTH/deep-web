import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  shopChannel: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}))
// client ภายในทรานแซกชัน — upsertChannel เขียนผ่าน tx เท่านั้น (prisma.$transaction(async (tx) => ...))
// จึงต้องแยก mock คนละตัวกับ db ไม่งั้นจะ assert การเขียนไม่เจอเลย
const tx = vi.hoisted(() => ({
  shopChannel: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', () => ({
  subscribePageToApp: vi.fn().mockResolvedValue(undefined),
  unsubscribePageFromApp: vi.fn().mockResolvedValue(undefined),
  getPageIdFromToken: vi.fn().mockResolvedValue(null),
  getInstagramAccountIdForPage: vi.fn().mockResolvedValue(null),
  // คืน null = "ดึงยอดผู้ติดตามไม่ได้" ซึ่งเป็นเส้นทางที่ต้องไม่ทำให้การเชื่อมเพจพัง
  fetchInstagramFollowerCount: vi.fn().mockResolvedValue(null),
}))
// feature 00051 (S-3, TC-SHOPID-01): mock mirrorRemoteImage เพื่อจับ arg ที่ mirrorInstagramAvatar
// ส่งเข้าไปตรง ๆ โดยไม่ต้องพึ่งเครือข่าย/storage จริง — ทุกเทสเดิมในไฟล์นี้ใช้ page.instagramProfilePictureUrl
// = null (ไม่เคยเรียกฟังก์ชันนี้อยู่แล้ว) จึง mock ระดับไฟล์ได้โดยไม่กระทบเทสเดิม
vi.mock('@/services/channel-chat.service', () => ({ mirrorRemoteImage: vi.fn().mockResolvedValue(null) }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'b'.repeat(64)
})

import {
  connectPages,
  listChannels,
  getChannelByExternalId,
  disconnectChannel,
  describePageStates,
} from '@/services/shop-channel.service'
import { encryptToken } from '@/lib/token-crypto'
import {
  subscribePageToApp,
  unsubscribePageFromApp,
  getPageIdFromToken,
  getInstagramAccountIdForPage,
} from '@/lib/facebook/graph'
import { mirrorRemoteImage } from '@/services/channel-chat.service'

const page = {
  id: 'PAGE1', name: 'ร้านทดสอบ', accessToken: 'page_token_plain',
  tasks: ['MESSAGING', 'MODERATE'], instagramBusinessAccountId: null, instagramProfilePictureUrl: null, followerCount: null,
}

describe('shop-channel.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // ค่าเริ่มต้น = เพจว่าง ไม่มีใครถือ และร้านนี้ยังไม่เคยมีแถวของเพจนี้
    db.shopChannel.findFirst.mockResolvedValue(null)
    db.shopChannel.findMany.mockResolvedValue([])
    // ค่าเริ่มต้น = ไม่มีแถวให้ถอน subscription ต่อ (เทสที่สนใจเรื่องนี้ override เอง)
    db.shopChannel.findUnique.mockResolvedValue(null)
    db.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
  })

  it('connectPages เก็บ token แบบเข้ารหัส ไม่เก็บ plaintext', async () => {
    await connectPages('shop1', 'user1', [page])

    const created = tx.shopChannel.create.mock.calls[0]![0].data
    expect(created.accessTokenEnc).not.toBe('page_token_plain')
    expect(created.accessTokenEnc).not.toContain('page_token_plain')
    expect(created.provider).toBe('MESSENGER')
  })

  it('Page ที่มี IG ผูกอยู่ → สร้าง channel เพิ่มอีกแถวเป็น INSTAGRAM', async () => {
    await connectPages('shop1', 'user1', [{ ...page, instagramBusinessAccountId: 'IG9' }])

    const providers = tx.shopChannel.create.mock.calls.map((c) => c[0].data.provider)
    expect(providers).toEqual(['MESSENGER', 'INSTAGRAM'])
    expect(tx.shopChannel.create.mock.calls[1]![0].data.externalId).toBe('IG9')
  })

  it('Page ที่ร้านอื่นเชื่อม active อยู่ → นับเป็น skipped ไม่แตะ DB และไม่ subscribe', async () => {
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop-other', shop: { shopName: 'ร้านอื่น' } })

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(0)
    // skipped พก occupiedBy = ชื่อร้านที่ยึดอยู่ ให้ UI แจ้ง user ได้ว่าติดร้านไหน
    expect(result.skipped).toEqual([{ pageName: 'ร้านทดสอบ', occupiedBy: 'ร้านอื่น' }])
    expect(subscribePageToApp).not.toHaveBeenCalled()
    expect(tx.shopChannel.create).not.toHaveBeenCalled()
    // ต้องกรอง status <> DISCONNECTED + shopId ต่างร้าน — ให้ตรงขอบเขตของ partial unique index จริง
    const where = db.shopChannel.findFirst.mock.calls[0]![0].where
    expect(where.status).toEqual({ not: 'DISCONNECTED' })
    expect(where.shopId).toEqual({ not: 'shop1' })
  })

  // partial unique index คลุมเฉพาะแถว active — แถว DISCONNECTED ของร้านเดิมต้องไม่กันร้านใหม่
  it('เพจที่ร้านอื่นเคยเชื่อมแล้วถอดไป (เหลือแต่แถว DISCONNECTED) → ร้านใหม่เชื่อมได้', async () => {
    const result = await connectPages('shop-b', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    expect(tx.shopChannel.create).toHaveBeenCalledTimes(1)
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // บั๊ก prod 2026-07-23: reconnect เคยสร้างแถวใหม่เสมอ ทำให้ Conversation เก่าที่ชี้ shopChannelId เดิม
  // กลายเป็น orphan (เธรดเด้ง banner "เชื่อมต่อมีปัญหา" ทั้งที่หน้า settings บอกว่าเชื่อมแล้ว)
  it('เชื่อมเพจเดิมของร้านเดิมซ้ำ → reuse แถวเดิม (id เดิม) ไม่สร้างใหม่ เธรดเก่าไม่ orphan', async () => {
    db.shopChannel.findMany.mockResolvedValue([{ id: 'ch-old', _count: { contacts: 12 } }])

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(tx.shopChannel.create).not.toHaveBeenCalled()
    const update = tx.shopChannel.update.mock.calls[0]![0]
    expect(update.where).toEqual({ id: 'ch-old' })
    expect(update.data.status).toBe('ACTIVE')
    expect(update.data.connectedByUserId).toBe('user1') // audit = คนที่กดเชื่อมล่าสุด (อาจเป็นคนละแอดมิน)
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain') // Meta idempotent ยิงซ้ำได้
  })

  it('ร้านนี้มีหลายแถวของเพจเดียวกัน (ตกค้างจากบั๊กเดิม) → reactivate แถวที่มี contact มากสุด', async () => {
    db.shopChannel.findMany.mockResolvedValue([
      { id: 'ch-empty', _count: { contacts: 0 } },
      { id: 'ch-real', _count: { contacts: 30 } },
    ])

    await connectPages('shop1', 'user1', [page])

    expect(tx.shopChannel.update.mock.calls[0]![0].where).toEqual({ id: 'ch-real' })
    // แถวอื่นที่ยัง active ต้องถูกตัดให้เหลือ canonical ตัวเดียว (กันชน partial unique)
    expect(tx.shopChannel.updateMany.mock.calls[0]![0].where.id).toEqual({ not: 'ch-real' })
  })

  // force move: user ยืนยันย้ายเพจที่ติดร้านอื่น → ตัดร้านเดิม (DISCONNECTED) แล้วผูกร้านนี้ในทรานแซกชันเดียว
  it('force=true + เพจติดร้านอื่น → ตัดร้านเดิมแล้วย้ายมาร้านนี้ นับ connected', async () => {
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop-other', shop: { shopName: 'ร้านอื่น' } })

    const result = await connectPages('shop1', 'user1', [page], { force: true })

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([])
    // ตัดแถว active ของร้านอื่นก่อน แล้วค่อยสร้างของร้านนี้
    expect(tx.shopChannel.updateMany.mock.calls[0]![0].where.shopId).toEqual({ not: 'shop1' })
    expect(tx.shopChannel.create).toHaveBeenCalledTimes(1)
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // หัวใจของหน้า "เลือกเพจ": user ยืนยันย้ายทีละเพจ — เพจที่ไม่ได้ยืนยันต้องไม่โดนถอนตามไปด้วย
  // (เดิม force เป็นสวิตช์ทั้งชุด → กดยืนยันเพจเดียว เพจอื่นของ user ที่ติดร้านอื่นโดนย้ายหมด)
  it('forceIds รายเพจ → ย้ายเฉพาะเพจที่ยืนยัน เพจที่ไม่ได้ยืนยันยัง skipped', async () => {
    db.shopChannel.findFirst.mockResolvedValue({ shopId: 'shop-other', shop: { shopName: 'ร้านอื่น' } })
    const page2 = { ...page, id: 'PAGE2', name: 'เพจส่วนตัว' }

    const result = await connectPages('shop1', 'user1', [page, page2], { forceIds: ['PAGE1'] })

    expect(result.connected).toBe(1)
    expect(result.skipped).toEqual([{ pageName: 'เพจส่วนตัว', occupiedBy: 'ร้านอื่น' }])
    expect(tx.shopChannel.create).toHaveBeenCalledTimes(1)
    expect(tx.shopChannel.create.mock.calls[0]![0].data.externalId).toBe('PAGE1')
    expect(subscribePageToApp).toHaveBeenCalledTimes(1)
  })

  // I-4: IG ถูกร้านอื่นยึดไปแล้ว ต้องไม่ทำให้ Messenger ที่ผูกสำเร็จแล้วพลาด subscribe
  it('IG ถูกร้านอื่นยึด → ไม่บล็อก subscribe ของ Messenger', async () => {
    db.shopChannel.findFirst
      .mockResolvedValueOnce(null) // MESSENGER ว่าง
      .mockResolvedValueOnce({ shopId: 'shop-other', shop: { shopName: 'ร้านอื่น' } }) // IG ไม่ว่าง

    const result = await connectPages('shop1', 'user1', [{ ...page, instagramBusinessAccountId: 'IG9' }])

    expect(result.connected).toBe(1)
    expect(subscribePageToApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
  })

  // TC-SHOPID-01 (feature 00051, blocker): mirrorInstagramAvatar ต้องใช้ shopId จาก
  // connectPages(shopId) จริง ไม่ใช่ 'ig-avatar' — จุดที่เคยเป็นบั๊กจริงตาม TD-01 (เดิม
  // mirrorRemoteImage(pictureUrl, 'ig-avatar') เป็น positional ตัวที่ 2 ซึ่ง 'ig-avatar' คือ
  // filenamePrefix ไม่ใช่ shopId — ถ้า signature กลับไปเป็น positional ค่านี้จะไหลเข้า shopId
  // เงียบ ๆ แบบ compile ผ่าน เพราะทั้งคู่เป็น string)
  it('TC-SHOPID-01 (blocker): connectPages ส่ง shopId จริงเข้า mirrorRemoteImage สำหรับ IG avatar ไม่ใช่ "ig-avatar"', async () => {
    await connectPages('shop-real', 'user1', [
      { ...page, instagramBusinessAccountId: 'IG9', instagramProfilePictureUrl: 'https://scontent.cdninstagram.com/avatar.jpg' },
    ])

    expect(mirrorRemoteImage).toHaveBeenCalledTimes(1)
    const [url, opts] = vi.mocked(mirrorRemoteImage).mock.calls[0]!
    expect(url).toBe('https://scontent.cdninstagram.com/avatar.jpg')
    expect(opts.shopId).toBe('shop-real') // 🛑 ห้ามเป็น 'ig-avatar'
    expect(opts.shopId).not.toBe('ig-avatar')
  })

  // I-4: subscribePageToApp ล้มเหลว (เช่น Graph 5xx) ต้องไม่ throw ออกจาก loop — เพจถัดไปต้องยังเชื่อมได้
  // และผลลัพธ์ต้องรายงาน subscribeFailed กลับไป ไม่เงียบ
  it('subscribePageToApp ล้มเหลว → ไม่ throw, รายงานใน subscribeFailed, connected ยังนับ', async () => {
    vi.mocked(subscribePageToApp).mockRejectedValueOnce(new Error('graph 500'))

    const result = await connectPages('shop1', 'user1', [page])

    expect(result.connected).toBe(1)
    expect(result.subscribeFailed).toEqual(['ร้านทดสอบ'])
  })

  // หน้า /settings/channels/select ใช้ตัวนี้บอก user ว่าเพจไหนติดร้านไหนอยู่ ก่อนกดเลือก
  describe('describePageStates', () => {
    it('แยก available / connected-here / other-shop และพกชื่อร้านที่ยึดอยู่', async () => {
      db.shopChannel.findMany.mockResolvedValue([
        { externalId: 'PAGE_HERE', shopId: 'shop1', shop: { shopName: 'ร้านนี้' } },
        { externalId: 'PAGE_OTHER', shopId: 'shop-other', shop: { shopName: 'ร้านธนภัทร' } },
      ])

      const states = await describePageStates('shop1', ['PAGE_HERE', 'PAGE_OTHER', 'PAGE_FREE'])

      expect(states.PAGE_HERE).toEqual({ state: 'connected-here', occupiedBy: null })
      expect(states.PAGE_OTHER).toEqual({ state: 'other-shop', occupiedBy: 'ร้านธนภัทร' })
      expect(states.PAGE_FREE).toEqual({ state: 'available', occupiedBy: null })
      // นับเฉพาะแถว active + ระดับ Page เท่านั้น (IG เป็นผลพลอยได้ของเพจเดียวกัน จะนับซ้ำ)
      const where = db.shopChannel.findMany.mock.calls[0]![0].where
      expect(where.status).toEqual({ not: 'DISCONNECTED' })
      expect(where.provider).toBe('MESSENGER')
    })

    it('ไม่มีเพจให้ตรวจ → ไม่ยิง query', async () => {
      expect(await describePageStates('shop1', [])).toEqual({})
      expect(db.shopChannel.findMany).not.toHaveBeenCalled()
    })
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

    // App Review (pages_manage_metadata): ถอดช่องทางแล้วต้องคืน state ให้เพจจริง ไม่ใช่ปล่อยให้
    // Meta ส่งข้อความลูกค้ามาที่ webhook เราต่อแล้วเราทิ้งเอง
    describe('ถอน webhook subscription ฝั่ง Meta', () => {
      // encryptToken ต้องเรียกใน beforeEach ไม่ใช่ตัว describe body — body ถูก evaluate ตอน collect
      // ซึ่งเกิดก่อน beforeAll ที่ตั้ง CHANNEL_TOKEN_KEY
      beforeEach(() => {
        db.shopChannel.updateMany.mockResolvedValue({ count: 1 })
        db.shopChannel.findUnique.mockResolvedValue({
          provider: 'MESSENGER',
          externalId: 'PAGE1',
          accessTokenEnc: encryptToken('page_token_plain'),
        })
      })

      it('ไม่เหลือช่องทางไหนใช้เพจนี้แล้ว → ยิง DELETE subscribed_apps ด้วย page token ที่ถอดรหัสแล้ว', async () => {
        db.shopChannel.findFirst.mockResolvedValue(null) // ไม่มีแถว active เหลือ
        vi.mocked(getInstagramAccountIdForPage).mockResolvedValue(null) // เพจไม่ได้ผูก IG

        await disconnectChannel('ch1', 'shop1')

        expect(unsubscribePageFromApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
      })

      it('ยังมีแถว IG ของเพจเดียวกัน active อยู่ → ห้ามถอน (ไม่งั้นข้อความ IG หยุดเข้าเงียบ ๆ)', async () => {
        vi.mocked(getInstagramAccountIdForPage).mockResolvedValue('IG1')
        db.shopChannel.findFirst.mockImplementation(async ({ where }: any) =>
          where.provider === 'INSTAGRAM' && where.externalId === 'IG1' ? { id: 'ch2' } : null,
        )

        await disconnectChannel('ch1', 'shop1')

        expect(unsubscribePageFromApp).not.toHaveBeenCalled()
      })

      it('ยังมีแถว MESSENGER ของเพจนี้ active อยู่ (ร้านอื่นถือ) → ห้ามถอน', async () => {
        db.shopChannel.findFirst.mockResolvedValue({ id: 'ch-other-shop' })

        await disconnectChannel('ch1', 'shop1')

        expect(unsubscribePageFromApp).not.toHaveBeenCalled()
        // ไม่ต้องถาม Graph เรื่อง IG เลยเมื่อรู้แล้วว่ายังมีคนใช้ — ประหยัด call
        expect(getInstagramAccountIdForPage).not.toHaveBeenCalled()
      })

      it('ถอดแถว INSTAGRAM → resolve page id จาก token ก่อน (externalId เป็น IG account id ไม่ใช่ page id)', async () => {
        db.shopChannel.findUnique.mockResolvedValue({
          provider: 'INSTAGRAM',
          externalId: 'IG1',
          accessTokenEnc: encryptToken('page_token_plain'),
        })
        vi.mocked(getPageIdFromToken).mockResolvedValue('PAGE1')
        db.shopChannel.findFirst.mockResolvedValue(null)
        vi.mocked(getInstagramAccountIdForPage).mockResolvedValue(null)

        await disconnectChannel('ch1', 'shop1')

        expect(getPageIdFromToken).toHaveBeenCalledWith('page_token_plain')
        expect(unsubscribePageFromApp).toHaveBeenCalledWith('PAGE1', 'page_token_plain')
      })

      it('Graph ล้มเหลว (token หมดอายุ) → การถอดช่องทางยังสำเร็จ ไม่ throw ออกไปหา user', async () => {
        db.shopChannel.findFirst.mockResolvedValue(null)
        vi.mocked(getInstagramAccountIdForPage).mockResolvedValue(null)
        vi.mocked(unsubscribePageFromApp).mockRejectedValueOnce(new Error('token expired'))

        await expect(disconnectChannel('ch1', 'shop1')).resolves.toBeUndefined()
        expect(db.shopChannel.updateMany).toHaveBeenCalledWith({
          where: { id: 'ch1', shopId: 'shop1' },
          data: { status: 'DISCONNECTED' },
        })
      })
    })
  })
})
