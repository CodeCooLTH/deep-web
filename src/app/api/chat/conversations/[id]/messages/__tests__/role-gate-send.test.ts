/**
 * [blocker] POST /messages — ด่านบทบาท H2 (00071 P3 · S-13)
 *
 * "ถอด CHAT ระหว่างใช้งาน แล้วกดส่งต่อ = 403 FORBIDDEN_ROLE" — ต้องอ่านแถวสมาชิกสดทุกครั้ง ไม่เชื่อ JWT/แคช
 * ตัวตัดสินสิทธิ์ (shop-capability) เป็นของจริง · mock เฉพาะ prisma + ตัวส่งคิว
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const enqueueOutbound = vi.fn(async (..._a: unknown[]) => ({ id: 'm1', senderUserId: 'user-1', rawMessage: null }))
const deliverRoom = vi.fn(async (..._a: unknown[]) => 0)

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (p: unknown) => p,
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'user-1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/subdomain', () => ({ getSubdomain: () => 'seller' }))
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
    order: { findFirst: vi.fn(async () => null) },
  },
}))

const { POST } = await import('../route')

const req = () =>
  ({ headers: new Headers({ host: 'seller.deepth.local' }), json: async () => ({ type: 'TEXT', body: 'สวัสดี' }) }) as unknown as Parameters<typeof POST>[0]
const params = { params: Promise.resolve({ id: 'conv-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  member.roles = ['CHAT']
})

describe('[blocker] POST /messages × บทบาท (H2)', () => {
  it('CHAT ส่งได้ (ผ่านด่าน → เข้าคิว)', async () => {
    const res = await POST(req(), params)
    expect(res.status).not.toBe(403)
    expect(enqueueOutbound).toHaveBeenCalledTimes(1)
  })

  it.each([['BILLING'], ['TECHNICIAN']])('%s → 403 FORBIDDEN_ROLE และไม่เข้าคิวเลย', async (role) => {
    member.roles = [role]
    const res = await POST(req(), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(enqueueOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ถอด CHAT ระหว่างใช้งาน → ข้อความถัดไปได้ 403 ทันที (session เดิมไม่เปลี่ยนอะไร)', async () => {
    expect((await POST(req(), params)).status).not.toBe(403)
    expect(enqueueOutbound).toHaveBeenCalledTimes(1)
    member.roles = ['BILLING'] // เจ้าของร้านเปลี่ยนบทบาท
    const res = await POST(req(), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(enqueueOutbound).toHaveBeenCalledTimes(1) // ไม่เพิ่ม
  })

  it('ผู้ดูแลที่ roles ว่าง → 403 (ไม่มีค่าตั้งต้นที่เปิด)', async () => {
    member.roles = []
    expect((await POST(req(), params)).status).toBe(403)
  })
})
