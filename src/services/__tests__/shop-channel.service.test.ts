import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  shopChannel: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', () => ({ subscribePageToApp: vi.fn().mockResolvedValue(undefined) }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'b'.repeat(64)
})

import { connectPages, listChannels, getChannelByExternalId } from '@/services/shop-channel.service'
import { encryptToken } from '@/lib/token-crypto'

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

  it('Page ที่ร้านอื่นเชื่อมไปแล้ว (P2002) → นับเป็น skipped ไม่ throw', async () => {
    db.shopChannel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const result = await connectPages('shop1', 'user1', [page])
    expect(result.connected).toBe(0)
    expect(result.skipped).toEqual(['ร้านทดสอบ'])
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
})
