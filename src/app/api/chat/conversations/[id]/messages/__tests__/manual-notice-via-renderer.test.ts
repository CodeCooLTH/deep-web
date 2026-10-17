/**
 * 00078 T14 — ปุ่มมือ (TRACKING / ORDER) ใช้ composeNotice ตัวเดียวกับส่งอัตโนมัติ
 * ข้อความที่ส่ง = composeNotice.text เป๊ะ · ส่งในนามผู้ใช้ (ไม่ติด autoReplyKind) · ด่านสิทธิ์ H2 ยังอยู่
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const enqueueOutbound = vi.fn(async (..._a: unknown[]) => ({ id: 'm1', senderUserId: 'user-1', rawMessage: null }))
const compose = vi.hoisted(() => vi.fn())
vi.mock('@/services/auto-notify-message.service', () => ({
  composeNotice: (...a: unknown[]) => compose(...a),
  externalCardParts: () => ({}),
}))
const deliverRoom = vi.fn(async (..._a: unknown[]) => 0)

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (p: unknown) => p,
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'user-1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/subdomain', () => ({ getSubdomain: vi.fn(() => 'seller') }))
vi.mock('@/lib/api-rate-limit', () => ({ checkApiRateLimit: () => true }))
vi.mock('@/services/chat-outbox.service', () => ({
  enqueueOutbound: (a: unknown) => enqueueOutbound(a),
  deliverRoom: (...a: unknown[]) => deliverRoom(...a),
}))
vi.mock('@/services/chat.service', () => ({ getMessages: vi.fn(), sendMessage: vi.fn() }))
vi.mock('@/services/channel-chat.service', () => ({
  syncMissingMessagesFromMeta: vi.fn(),
  resolveLineFlexImageUrl: vi.fn(),
  resolveMetaCardImageUrl: vi.fn(),
}))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn(), getProductsByIds: vi.fn(async () => []) }))
vi.mock('@/services/seller-push.service', () => ({ pushNewChatMessage: vi.fn() }))

/** แถวสมาชิกของผู้ใช้ในร้าน — เปลี่ยนกลางเทสได้ (อ่านสดทุก query) */
const member = vi.hoisted(() => ({ roles: ['CHAT'] as string[] }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(async () => ({ channel: 'LINE', shopId: 'shop-1' })) },
    shop: {
      findUnique: vi.fn(async () => ({
        userId: 'owner', kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', deletedAt: null,
        members: [{ role: 'ADMIN', roles: member.roles }],
      })),
    },
    user: { findUnique: vi.fn(async () => ({ displayName: 'ร้านทดสอบ', avatar: null })) },
    chatMessage: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    order: { findFirst: vi.fn(async () => ({ id: 'order-1' })) },
  },
}))

const { POST } = await import('../route')

const TOKEN = '11111111-1111-4111-8111-111111111111'
const req = (b: object) =>
  ({ headers: new Headers({ host: 'seller.deepth.local' }), json: async () => b }) as unknown as Parameters<typeof POST>[0]
const params = { params: Promise.resolve({ id: 'conv-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  member.roles = ['CHAT']
})

describe('manual send via composeNotice (00078 T14)', () => {
  it('TRACKING: ข้อความที่เข้าคิว = composeNotice เป๊ะ · ไม่ส่ง trackingKey · ไม่ติด AUTO_NOTICE', async () => {
    compose.mockResolvedValue({ ok: true, text: 'เลขติดตามพัสดุ: TH1', isCustom: false, orderToken: TOKEN, card: null })
    const res = await POST(req({ type: 'TRACKING', orderRefToken: TOKEN }), params)
    expect(res.status).toBe(202)
    expect(compose).toHaveBeenCalledWith('TRACKING', { shopId: 'shop-1', orderId: 'order-1', channel: 'LINE' })
    const arg = enqueueOutbound.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.text).toBe('เลขติดตามพัสดุ: TH1')
    expect(arg.actorUserId).toBe('user-1')
    expect(arg).not.toHaveProperty('autoReplyKind')
  })

  it('TRACKING: ยังไม่มีเลข → 409 NO_TRACKING ไม่เข้าคิว', async () => {
    compose.mockResolvedValue({ ok: false, reason: 'STALE_VALUE' })
    const res = await POST(req({ type: 'TRACKING', orderRefToken: TOKEN }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('NO_TRACKING')
    expect(enqueueOutbound).not.toHaveBeenCalled()
  })

  it('TRACKING: ออเดอร์ไม่ใช่ของร้านนี้ → 400 และไม่ประกอบข้อความ', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null)
    const res = await POST(req({ type: 'TRACKING', orderRefToken: TOKEN }), params)
    expect(res.status).toBe(400)
    expect(compose).not.toHaveBeenCalled()
  })

  it('TRACKING: ฝั่งผู้ซื้อ (โดเมนหลัก) → 403 ก่อนค้นออเดอร์', async () => {
    const { getSubdomain } = await import('@/lib/subdomain')
    vi.mocked(getSubdomain).mockReturnValueOnce('main' as never)
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.order.findFirst).mockClear()
    const res = await POST(req({ type: 'TRACKING', orderRefToken: TOKEN }), params)
    expect(res.status).toBe(403)
    expect(prisma.order.findFirst).not.toHaveBeenCalled()
    expect(compose).not.toHaveBeenCalled()
  })

  it('TRACKING: ไม่มี H2 → 403 ก่อนประกอบข้อความ', async () => {
    member.roles = ['BILLING']
    const res = await POST(req({ type: 'TRACKING', orderRefToken: TOKEN }), params)
    expect(res.status).toBe(403)
    expect(compose).not.toHaveBeenCalled()
    expect(enqueueOutbound).not.toHaveBeenCalled()
  })

  it('ORDER (ช่องทางนอก): ข้อความ = composeNotice("ORDER_SUMMARY")', async () => {
    compose.mockResolvedValue({ ok: true, text: 'คำสั่งซื้อ: เสื้อ\nยอดสุทธิ ฿100\nhttps://x/o/t', isCustom: false, orderToken: TOKEN, card: null })
    const res = await POST(req({ type: 'ORDER', orderRefToken: TOKEN }), params)
    expect(res.status).toBe(202)
    expect(compose).toHaveBeenCalledWith('ORDER_SUMMARY', { shopId: 'shop-1', orderId: 'order-1', channel: 'LINE' })
    expect((enqueueOutbound.mock.calls[0]![0] as Record<string, unknown>).text).toContain('ยอดสุทธิ ฿100')
  })
})
