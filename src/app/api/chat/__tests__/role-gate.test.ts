/**
 * [blocker] ด่านบทบาทของแชท/ตั้งค่าแชท/ช่องทาง (00071 P3 · S-13)
 *
 * ตัวแทนของแต่ละกลุ่ม route × บทบาท — เจ้าของ ผู้ดูแล(MANAGER/CHAT/BILLING/TECHNICIAN):
 *   H1 อ่านแชท   · conversations GET, comments/list GET, channels GET
 *   H2 เขียนแชท  · conversations/[id] PATCH
 *   H3 ตั้งค่า    · shops/ai-settings GET, channels POST
 *   X2 เครื่องมือ  · quick-messages GET, follow-ups/board GET
 *
 * ตารางที่ต้องเป็นจริง: เจ้าของ/MANAGER ผ่านหมด · CHAT ผ่าน H1/H2/X2 แต่ไม่ผ่าน H3 · BILLING และ TECHNICIAN ไม่ผ่านสักข้อ
 * (ร้านทดสอบเป็นร้านบริการ — BILLING จึงยัง "มีผล" แล้วถูกปฏิเสธเพราะตารางสิทธิ์ ไม่ใช่เพราะถูกตัดทิ้ง)
 *
 * ไม่ mock ตัวตัดสินสิทธิ์ (chat-scope / shop-capability / shop-context เป็นของจริง) — mock เฉพาะ prisma + service ปลายทาง
 * ทุก request อ่านแถวสมาชิกสดจาก "โลกจำลอง" ⇒ เปลี่ยนบทบาทระหว่างเทสแล้วผลเปลี่ยนทันที (พิสูจน์ว่าไม่เชื่อ JWT/แคช)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/app-shell-server', () => ({ shouldHidePayments: async () => false, shouldOfferIap: async () => false }))

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  shop: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  shopMember: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  conversation: { findFirst: vi.fn(), findUnique: vi.fn() },
  externalContact: { findMany: vi.fn(async () => []) },
  $queryRaw: vi.fn(async () => []),
  order: { groupBy: vi.fn(async () => []) },
  chatMessage: { groupBy: vi.fn(async () => []) },
  sellerChatPreference: { findUnique: vi.fn(async () => null) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))

const svc = vi.hoisted(() => ({
  listConversationsForShops: vi.fn(),
  updateConversationState: vi.fn(async () => undefined),
  listQuickMessages: vi.fn(async () => []),
  listBoard: vi.fn(async () => ({ columns: [] })),
  listComments: vi.fn(async () => ({ comments: [], counts: {}, rawCount: 0 })),
  listChannels: vi.fn(async () => []),
  getAiSetting: vi.fn(async () => ({
    instruction: '', includeProductContext: false, includeCustomerContext: false, includeMediaContext: false, updatedAt: null,
  })),
}))
vi.mock('@/services/chat.service', () => ({
  getOrCreateConversation: vi.fn(),
  listConversationsForShops: svc.listConversationsForShops,
  listConversationsForBuyer: vi.fn(),
  updateConversationState: svc.updateConversationState,
  countUnreadByConversation: vi.fn(async () => new Map()),
}))
vi.mock('@/services/chat-group.service', () => ({ setConversationGroup: vi.fn() }))
vi.mock('@/services/quick-message.service', () => ({
  listQuickMessages: svc.listQuickMessages, createQuickMessage: vi.fn(), reorderQuickMessages: vi.fn(),
}))
vi.mock('@/services/customer-follow-up.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/customer-follow-up.service')>()),
  listBoard: svc.listBoard,
  listCalendarMonth: vi.fn(),
}))
vi.mock('@/services/page-comment.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/page-comment.service')>()),
  listComments: svc.listComments,
}))
vi.mock('@/services/shop-channel.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/shop-channel.service')>()),
  listChannels: svc.listChannels,
  resubscribeShopChannels: vi.fn(async () => ({ ok: 0, failed: 0 })),
}))
vi.mock('@/services/ai-setting.service', () => ({
  getAiSetting: svc.getAiSetting, upsertAiSetting: vi.fn(), CONTEXT_GATE_PAID_PLAN_REQUIRED: 'X',
}))
vi.mock('@/services/ai-suggest-quota.service', () => ({ isOwnerPaidPlan: vi.fn(async () => false) }))
vi.mock('@/services/order-stage.service', () => ({ enrichWithOrderStage: async (i: unknown) => i }))
vi.mock('@/services/auto-order-detect.service', () => ({ countDraftedOrdersByConversation: async () => new Map() }))
vi.mock('@/services/thread-agents.service', () => ({ enrichWithThreadAgents: async (i: unknown) => i }))
vi.mock('@/services/customer-behavior.service', () => ({ enrichWithCustomerBehavior: async (i: unknown) => i }))
vi.mock('@/services/auto-reply.service', () => ({ sweepStuckJobs: vi.fn(), enrichWithAutoReplyBadge: async (i: unknown) => i }))
vi.mock('@/services/iship.service', () => ({ syncShipmentStatuses: vi.fn() }))

import { getServerSession } from 'next-auth'
import { GET as conversationsGET } from '@/app/api/chat/conversations/route'
import { PATCH as conversationPATCH } from '@/app/api/chat/conversations/[id]/route'
import { GET as quickMessagesGET } from '@/app/api/chat/quick-messages/route'
import { GET as boardGET } from '@/app/api/follow-ups/board/route'
import { GET as commentsListGET } from '@/app/api/chat/comments/list/route'
import { GET as channelsGET, POST as channelsPOST } from '@/app/api/channels/route'
import { GET as aiSettingsGET } from '@/app/api/shops/ai-settings/route'

const USER = 'user-1'
const SHOP = 'shop-svc'
// รหัสร้านต้องเป็น uuid — ตัวกรอง ?shopId= ของรายการแชทตรวจรูปแบบก่อนถึงด่านสิทธิ์
const SHOP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SHOP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SHOP_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CONV = '11111111-1111-1111-1111-111111111111'

type Staff = 'OWNER' | 'MANAGER' | 'CHAT' | 'BILLING' | 'TECHNICIAN'

/** โลกจำลอง: ผู้ใช้เป็นสมาชิกของร้านบริการ SHOP ด้วยบทบาท `me` — เปลี่ยนค่าได้กลางเทส (อ่านสดทุก query) */
const world = { me: 'MANAGER' as Staff, other: null as null | { id: string; me: Staff; vertical: string } }
const memberOf = (r: Staff) => (r === 'OWNER' ? { role: 'OWNER', roles: [] as string[] } : { role: 'ADMIN', roles: [r] })

function wireWorld() {
  const shops = () => [
    { id: SHOP, vertical: 'SERVICE_QUEUE', me: world.me },
    ...(world.other ? [{ id: world.other.id, vertical: world.other.vertical, me: world.other.me }] : []),
  ]
  prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: 'SINGLE' })
  prismaMock.shop.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const s = shops().find((x) => x.id === where.id)
    return s
      ? { id: s.id, kind: 'BUSINESS', userId: 'someone-else', vertical: s.vertical, packageLockedAt: null, packageLockReason: null, deletedAt: null }
      : null
  })
  prismaMock.shopMember.findUnique.mockImplementation(async ({ where }: { where: { shopId_userId: { shopId: string } } }) => {
    const s = shops().find((x) => x.id === where.shopId_userId.shopId)
    return s ? memberOf(s.me) : null
  })
  prismaMock.shop.findMany.mockImplementation(async () =>
    shops().map((s) => ({ id: s.id, userId: 'someone-else', kind: 'BUSINESS', vertical: s.vertical, members: [memberOf(s.me)] })),
  )
}

const login = (activeShopId: string = SHOP) =>
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: USER, activeShopId } })

const get = (path: string) => new NextRequest(`https://seller.deepthailand.app${path}`, { headers: { host: 'seller.deepthailand.app' } })
const patch = (body: unknown) =>
  new NextRequest(`https://seller.deepthailand.app/api/chat/conversations/${CONV}`, {
    method: 'PATCH', headers: { host: 'seller.deepthailand.app', 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  world.me = 'MANAGER'
  world.other = null
  wireWorld()
  login()
  prismaMock.conversation.findFirst.mockResolvedValue({ shopId: SHOP })
  prismaMock.conversation.findUnique.mockResolvedValue({ shopId: SHOP })
  svc.listConversationsForShops.mockResolvedValue({ items: [], nextCursor: null })
})

const ROLES: Staff[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']
/** เซลล์ในตาราง: ผ่านหรือไม่ผ่าน (200 vs 403 FORBIDDEN_ROLE) */
const H1_OK: Record<Staff, boolean> = { OWNER: true, MANAGER: true, CHAT: true, BILLING: false, TECHNICIAN: false }
const H3_OK: Record<Staff, boolean> = { OWNER: true, MANAGER: true, CHAT: false, BILLING: false, TECHNICIAN: false }

async function expectGate(res: Response | undefined, ok: boolean) {
  if (!res) throw new Error('handler คืน undefined')
  if (ok) {
    expect(res.status).toBe(200)
  } else {
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' }) // ไม่ใช่ 404/500 — ผู้ใช้เป็นสมาชิก ต้องบอกว่า "บทบาทไม่พอ"
  }
}

describe('H1 — อ่านแชท', () => {
  it.each(ROLES)('GET /api/chat/conversations · %s', async (role) => {
    world.me = role
    await expectGate(await conversationsGET(get('/api/chat/conversations')), H1_OK[role])
    // ไม่ผ่านต้องไม่แตะ service เลย
    if (!H1_OK[role]) expect(svc.listConversationsForShops).not.toHaveBeenCalled()
  })

  it.each(ROLES)('GET /api/chat/comments/list · %s', async (role) => {
    world.me = role
    await expectGate(await commentsListGET(get('/api/chat/comments/list')), H1_OK[role])
    if (!H1_OK[role]) expect(svc.listComments).not.toHaveBeenCalled()
  })

  it.each(ROLES)('GET /api/channels (รายการเพจของตัวกรอง) · %s', async (role) => {
    world.me = role
    await expectGate(await channelsGET(), H1_OK[role])
  })

  it('[blocker] กล่องรวม: CHAT ที่ร้าน A · BILLING ที่ร้าน B · MANAGER ที่ร้าน C → เห็นเธรดแค่ A กับ C แม้ระบุ ?shopId=B ตรง ๆ', async () => {
    // ใช้ SHOP เป็น A (CHAT) · เพิ่ม B (BILLING, บริการ) · C (MANAGER) ผ่านโลกจำลองหลายร้าน
    const multi = [
      { id: SHOP_A, me: 'CHAT' as Staff, vertical: 'ONLINE_SALES' },
      { id: SHOP_B, me: 'BILLING' as Staff, vertical: 'SERVICE_QUEUE' },
      { id: SHOP_C, me: 'MANAGER' as Staff, vertical: 'ONLINE_SALES' },
    ]
    prismaMock.user.findUnique.mockResolvedValue({ chatScopeMode: 'UNIFIED' })
    prismaMock.shop.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const s = multi.find((x) => x.id === where.id)
      return s ? { id: s.id, kind: 'BUSINESS', userId: 'o', vertical: s.vertical, packageLockedAt: null, packageLockReason: null, deletedAt: null } : null
    })
    prismaMock.shopMember.findUnique.mockImplementation(async ({ where }: { where: { shopId_userId: { shopId: string } } }) => {
      const s = multi.find((x) => x.id === where.shopId_userId.shopId)
      return s ? memberOf(s.me) : null
    })
    prismaMock.shop.findMany.mockImplementation(async () =>
      multi.map((s) => ({ id: s.id, userId: 'o', kind: 'BUSINESS', vertical: s.vertical, members: [memberOf(s.me)] })),
    )
    login(SHOP_A)

    const all = await conversationsGET(get('/api/chat/conversations'))
    expect(all.status).toBe(200)
    expect(svc.listConversationsForShops.mock.calls[0][0].slice().sort()).toEqual([SHOP_A, SHOP_C])

    svc.listConversationsForShops.mockClear()
    const viaB = await conversationsGET(get(`/api/chat/conversations?shopId=${SHOP_B}`))
    expect(viaB.status).toBe(200) // ตัวกรองนอกขอบเขต = ผลว่าง (ไม่ใช่ 403 ที่ยืนยันว่าร้านมี) — BR-UNI-02
    expect(svc.listConversationsForShops.mock.calls[0][0]).toEqual([]) // ← ไม่ใช่ [SHOP_B] และไม่ใช่ทั้งก้อน
  })
})

describe('H2 — เขียนแชท', () => {
  it.each(ROLES)('PATCH /api/chat/conversations/[id] (ปักหมุด) · %s', async (role) => {
    world.me = role
    // เธรดอยู่ร้านเดียวกับที่ผู้ใช้เป็นสมาชิก: ผู้ที่ไม่ถือ H2 → miss ใน scope → แยกเป็น 403 (ไม่ใช่ 404)
    if (!H1_OK[role]) prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await conversationPATCH(patch({ action: 'pin' }), { params: Promise.resolve({ id: CONV }) })
    await expectGate(res, H1_OK[role])
    if (!H1_OK[role]) expect(svc.updateConversationState).not.toHaveBeenCalled()
  })

  it('เธรดของร้านที่ไม่ใช่สมาชิก → 404 ไม่ใช่ 403 (ไม่ยืนยันว่ามีอยู่)', async () => {
    world.me = 'BILLING'
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    prismaMock.conversation.findUnique.mockResolvedValue({ shopId: 'shop-of-stranger' })
    const res = await conversationPATCH(patch({ action: 'pin' }), { params: Promise.resolve({ id: CONV }) })
    expect(res.status).toBe(404)
  })

  it('ถอดบทบาท CHAT ระหว่างใช้งาน → คำขอถัดไปได้ 403 ทันที (อ่านแถวสมาชิกสด ไม่เชื่อ JWT)', async () => {
    world.me = 'CHAT'
    const ok = await conversationPATCH(patch({ action: 'pin' }), { params: Promise.resolve({ id: CONV }) })
    expect(ok.status).toBe(200)
    world.me = 'TECHNICIAN' // เจ้าของร้านเปลี่ยนบทบาท — session เดิมยังเหมือนเดิมทุกอย่าง
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const after = await conversationPATCH(patch({ action: 'pin' }), { params: Promise.resolve({ id: CONV }) })
    await expectGate(after, false)
  })
})

describe('X2 — เครื่องมือแชท', () => {
  it.each(ROLES)('GET /api/chat/quick-messages · %s', async (role) => {
    world.me = role
    await expectGate(await quickMessagesGET(get('/api/chat/quick-messages')), H1_OK[role])
    if (!H1_OK[role]) expect(svc.listQuickMessages).not.toHaveBeenCalled()
  })

  it.each(ROLES)('GET /api/follow-ups/board · %s', async (role) => {
    world.me = role
    await expectGate(await boardGET(get('/api/follow-ups/board')), H1_OK[role])
    if (!H1_OK[role]) expect(svc.listBoard).not.toHaveBeenCalled()
  })

  it('[blocker] ?shopId= ของร้านที่เป็นสมาชิกแต่ไม่ถือ X2 → 403 FORBIDDEN_ROLE ไม่ใช่ข้อมูลของร้านนั้น', async () => {
    world.me = 'CHAT'
    world.other = { id: SHOP_B, me: 'BILLING', vertical: 'SERVICE_QUEUE' }
    await expectGate(await quickMessagesGET(get(`/api/chat/quick-messages?shopId=${SHOP_B}`)), false)
    expect(svc.listQuickMessages).not.toHaveBeenCalled()
  })
})

describe('H3 — ตั้งค่า/ช่องทาง', () => {
  it.each(ROLES)('GET /api/shops/ai-settings · %s', async (role) => {
    world.me = role
    await expectGate(await aiSettingsGET(), H3_OK[role])
    if (!H3_OK[role]) expect(svc.getAiSetting).not.toHaveBeenCalled()
  })

  it.each(ROLES)('POST /api/channels (ซิงก์เพจ) · %s', async (role) => {
    world.me = role
    // ผู้ใช้ทุกคนมีร้านส่วนตัวของตัวเองนอกโลกจำลองนี้ — ที่ทดสอบคือ "ร้านที่เป็นสมาชิก" ถือ H3 หรือไม่:
    // ไม่ถือเลย → ว่าง → 403 · ถือ → ผ่าน
    await expectGate(await channelsPOST(), H3_OK[role])
  })
})
