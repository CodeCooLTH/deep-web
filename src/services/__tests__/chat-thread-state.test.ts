/**
 * [blocker] สถานะห้องสำหรับแชท Native (feature 00088 · GET /thread-state)
 *
 * สูตรต้องเท่าหน้าเว็บ `inbox/[conversationId]/page.tsx` — ตัวอย่างละกรณีของทุกค่าที่แอปใช้ตัดสินแถบสถานะ/ปิดช่องพิมพ์
 * และ 🛑 ต้องไม่มี replyToken / externalUserId หลุดออกไปในผลลัพธ์
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { findFirst: vi.fn() },
  customer: { findUnique: vi.fn() },
  shop: { findUnique: vi.fn() },
  autoReplyConfig: { findUnique: vi.fn() },
  aiChatbotTestThread: { findUnique: vi.fn() },
  autoReplyKeyword: { count: vi.fn() },
  autoReplyKeywordTestThread: { findFirst: vi.fn() },
  commentReplyLog: { findFirst: vi.fn() },
  order: { count: vi.fn(), aggregate: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('next/server', () => ({ after: vi.fn() }))
const ctx = vi.hoisted(() => ({ resolveActiveShopContext: vi.fn() }))
vi.mock('@/lib/shop-context', () => ctx)
vi.mock('@/services/channel-chat.service', async () => {
  const w = await vi.importActual<typeof import('@/lib/messaging-window')>('@/lib/messaging-window')
  return { getWindowState: w.getWindowState, syncInboundWindowFromMeta: vi.fn(async () => {}), canUseHumanAgent: () => true }
})
const quota = vi.hoisted(() => ({ getLineQuotaByChannelId: vi.fn() }))
vi.mock('@/services/line-quota.service', () => quota)
vi.mock('@/services/page-comment.service', () => ({ resolvePostThumbnail: () => 'thumb-url' }))
vi.mock('@/lib/reply-suggest-provider', () => ({ resolveSuggestProvider: () => 'typhoon' }))
vi.mock('@/services/customer-directory.service', () => ({ getServiceCustomerSpend: vi.fn(async () => ({ toFixed: () => '900.00' })) }))
vi.mock('@/services/customer-behavior.service', () => ({
  behaviorKey: (s: string, c: string) => `${s}:${c}`,
  behaviorByShopCustomer: vi.fn(async () => new Map([['shop-1:cust-1', { counted: 3 }]])),
}))

import { getNativeThreadState } from '../chat-thread-state.service'

const ID = '11111111-1111-4111-8111-111111111111'
function conv(over: Record<string, unknown> = {}) {
  return {
    id: ID, shopId: 'shop-1', channel: 'MESSENGER', lastInboundAt: new Date(),
    autoReplyEnabled: null, autoReplyPausedUntil: null, handoffAt: null, handoffReason: null,
    referralSource: null, referralAdTitle: null, referralAdBody: null, referralAdPermalink: null, referralAdId: null, referralPhotoFileId: null,
    buyerUserId: null,
    externalContact: { customer: null, isBlocked: false, externalUserId: 'PSID-SECRET' },
    shopChannel: { id: 'ch-1', status: 'ACTIVE' },
    replyToken: 'TOKEN-SECRET', replyTokenExpiresAt: null, replyTokenUsedAt: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.shop.findUnique.mockResolvedValue({ vertical: 'ONLINE_SALES' })
  db.autoReplyConfig.findUnique.mockResolvedValue(null)
  db.aiChatbotTestThread.findUnique.mockResolvedValue(null)
  db.autoReplyKeyword.count.mockResolvedValue(0)
  db.autoReplyKeywordTestThread.findFirst.mockResolvedValue(null)
  db.commentReplyLog.findFirst.mockResolvedValue(null)
  db.order.count.mockResolvedValue(2)
  db.order.aggregate.mockResolvedValue({ _sum: { totalAmount: { toFixed: () => '1500.00' } } })
  ctx.resolveActiveShopContext.mockResolvedValue({ role: 'OWNER', roles: [] })
  quota.getLineQuotaByChannelId.mockResolvedValue(null)
})

describe('getNativeThreadState', () => {
  it('ไม่พบเธรดในร้านนี้ = null · WHERE ผูก shopId', async () => {
    db.conversation.findFirst.mockResolvedValue(null)
    expect(await getNativeThreadState(ID, 'shop-1', 'u1')).toBeNull()
    expect(db.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: ID, shopId: 'shop-1' })
  })

  it('[blocker] ไม่มี replyToken / externalUserId ในผลลัพธ์', async () => {
    db.conversation.findFirst.mockResolvedValue(conv())
    const s = JSON.stringify(await getNativeThreadState(ID, 'shop-1', 'u1'))
    expect(s).not.toContain('TOKEN-SECRET')
    expect(s).not.toContain('PSID-SECRET')
  })

  it('[blocker] เพจหลุด: ไม่ใช่ ACTIVE = tokenInvalid (ครอบ DISCONNECTED) · DEEP ไม่มีวัน', async () => {
    db.conversation.findFirst.mockResolvedValue(conv({ shopChannel: { id: 'c', status: 'TOKEN_INVALID' } }))
    expect((await getNativeThreadState(ID, 'shop-1', 'u1'))!.tokenInvalid).toBe(true)
    db.conversation.findFirst.mockResolvedValue(conv({ shopChannel: { id: 'c', status: 'DISCONNECTED' } }))
    expect((await getNativeThreadState(ID, 'shop-1', 'u1'))!.tokenInvalid).toBe(true)
    db.conversation.findFirst.mockResolvedValue(conv({ channel: 'DEEP', shopChannel: null }))
    expect((await getNativeThreadState(ID, 'shop-1', 'u1'))!.tokenInvalid).toBe(false)
  })

  it('[blocker] ลูกค้าปิดรับ = LINE + isBlocked เท่านั้น · โควตา LINE คืนเฉพาะตัวเลข', async () => {
    quota.getLineQuotaByChannelId.mockResolvedValue({ type: 'limited', level: 'EXHAUSTED', remaining: 0, total: 300, stale: false, secret: 'x' })
    db.conversation.findFirst.mockResolvedValue(conv({ channel: 'LINE', externalContact: { customer: null, isBlocked: true, externalUserId: 'U' } }))
    const s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.contactBlocked).toBe(true)
    expect(s.lineQuota).toEqual({ type: 'limited', level: 'EXHAUSTED', remaining: 0, total: 300, stale: false })
    expect(s.humanAgentOpen).toBe(false) // LINE ไม่มี HUMAN_AGENT
    db.conversation.findFirst.mockResolvedValue(conv({ externalContact: { customer: null, isBlocked: true, externalUserId: 'P' } }))
    expect((await getNativeThreadState(ID, 'shop-1', 'u1'))!.contactBlocked).toBe(false)
  })

  it('บอท: LIVE = ตอบได้ · TEST ตอบได้เฉพาะห้องทดสอบ · ไม่มีบอท = ไม่ขึ้น "พัก"', async () => {
    db.conversation.findFirst.mockResolvedValue(conv())
    expect((await getNativeThreadState(ID, 'shop-1', 'u1'))!.botCouldReply).toBe(false)
    db.autoReplyConfig.findUnique.mockResolvedValue({ aiChatbotStatus: 'TEST' })
    expect((await getNativeThreadState(ID, 'shop-1', 'u1'))!.botCouldReply).toBe(false)
    db.aiChatbotTestThread.findUnique.mockResolvedValue({ id: 't' })
    const s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.isChatbotTestThread).toBe(true)
    expect(s.botCouldReply).toBe(true)
  })

  it('ห้องจากคอมเมนต์ + โฆษณา + โหมด AI', async () => {
    db.commentReplyLog.findFirst.mockResolvedValue({
      id: 'l', comment: { message: 'เยี่ยม', attachmentUrl: null, createdTime: new Date('2026-11-01T00:00:00Z'), externalCommentId: '1_2', post: { permalink: 'https://facebook.com/p/1', message: 'โพสต์', thumbnailUrl: null, mirroredFileId: null, mediaType: 'photo' } },
    })
    db.conversation.findFirst.mockResolvedValue(conv({ referralSource: 'ADS', referralAdId: 'ad-9', referralPhotoFileId: 'f-1' }))
    const s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.isCommentReplyThread).toBe(true)
    expect(s.commentOrigin).toMatchObject({ message: 'เยี่ยม', postMessage: 'โพสต์', postThumbnailUrl: 'thumb-url' })
    expect(s.adReferral).toMatchObject({ adId: 'ad-9', photoFileId: 'f-1' })
    expect(s.adReferralId).toBe('ad-9')
    expect(s.aiSuggestMode).toBe('auto')
  })

  it('สถิติลูกค้า: ผูกแล้ว = นับ + วง · ยอดสะสมเฉพาะ F1 · ร้านบริการใช้สูตรหน้าลูกค้า · ยังไม่ผูก = null', async () => {
    const cust = { id: 'cust-1', createdAt: new Date('2026-01-01T00:00:00Z') }
    db.conversation.findFirst.mockResolvedValue(conv({ externalContact: { customer: cust, isBlocked: false, externalUserId: 'P' } }))
    let s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.customerCounted).toBe(3)
    expect(s.customerStats).toEqual({ orderCount: 2, totalSpent: '1500.00', since: '2026-01-01T00:00:00.000Z' })
    expect(s.threadOrderCount).toBe(2)

    db.shop.findUnique.mockResolvedValue({ vertical: 'SERVICE_QUEUE' })
    s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.customerStats!.totalSpent).toBe('900.00')

    ctx.resolveActiveShopContext.mockResolvedValue({ role: 'ADMIN', roles: ['CHAT'] })
    s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.customerStats).not.toHaveProperty('totalSpent')

    db.conversation.findFirst.mockResolvedValue(conv())
    s = (await getNativeThreadState(ID, 'shop-1', 'u1'))!
    expect(s.customerStats).toBeNull()
    expect(s.customerCounted).toBeNull()
  })
})
