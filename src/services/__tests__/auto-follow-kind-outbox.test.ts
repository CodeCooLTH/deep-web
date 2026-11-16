// 00095 S-5 #10 — ข้อความ AUTO_FOLLOW ส่งไม่ออก ไม่ push "ส่งไม่ออก" (ทั้งสองเส้นที่แถวกลายเป็น FAILED)
import { describe, expect, it, vi, beforeEach } from 'vitest'

const transmitOutbound = vi.fn()
const resolveOutboundContext = vi.fn()
vi.mock('@/services/channel-chat.service', () => ({
  transmitOutbound: (...a: unknown[]) => transmitOutbound(...a),
  resolveOutboundContext: (...a: unknown[]) => resolveOutboundContext(...a),
  mirrorRemoteImage: vi.fn(),
  toRawMessage: () => ({}),
  stickerMirrorFailedText: () => '',
  buildLineStickerImageUrl: () => '',
  isUniqueViolationOn: () => false,
}))
const pauseForHumanTakeover = vi.fn()
vi.mock('@/services/auto-reply-takeover.service', () => ({ pauseForHumanTakeover: (...a: unknown[]) => pauseForHumanTakeover(...a) }))
const pushChatSendFailed = vi.fn()
vi.mock('@/services/seller-push.service', () => ({ pushChatSendFailed: (...a: unknown[]) => pushChatSendFailed(...a) }))

const updateMany = vi.fn()
const findMany = vi.fn()
const conversationFindMany = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMessage: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    conversation: { findMany: (...a: unknown[]) => conversationFindMany(...a) },
  },
}))

const { deliverRoom, sweepOutbox } = await import('../chat-outbox.service')

const queued = (o: Record<string, unknown> = {}) => ({
  id: 'm1', conversationId: 'c1', createdAt: new Date('2026-08-23T10:00:00Z'),
  deliveryStatus: 'QUEUED', sendLockedAt: null, sendPayload: {}, autoReplyKind: null, ...o,
})

beforeEach(() => {
  for (const f of [transmitOutbound, resolveOutboundContext, pushChatSendFailed, updateMany, findMany, conversationFindMany, pauseForHumanTakeover]) f.mockReset()
  pushChatSendFailed.mockResolvedValue(undefined)
  updateMany.mockResolvedValue({ count: 1 })
  findMany.mockResolvedValue([])
  conversationFindMany.mockResolvedValue([{ id: 'c1', shopId: 's1' }])
  resolveOutboundContext.mockResolvedValue({ id: 'c1', channel: 'MESSENGER', shopId: 's1', shopChannel: { status: 'ACTIVE' }, externalContact: { isBlocked: false } })
  transmitOutbound.mockResolvedValue({ externalMessageId: null, outboundResponse: {}, failureReason: 'rejected', sendMethod: null, sendBatchId: null })
})

describe('#10 notifySendFailed ข้าม AUTO_FOLLOW', () => {
  it('ปลายทางปฏิเสธ: AUTO_FOLLOW ไม่ push · ควบคุม: ข้อความคนปกติ push', async () => {
    findMany.mockResolvedValueOnce([queued({ autoReplyKind: 'AUTO_FOLLOW' })])
    await deliverRoom('c1', 'after')
    expect(pushChatSendFailed).not.toHaveBeenCalled()

    findMany.mockResolvedValueOnce([queued()])
    await deliverRoom('c1', 'after')
    expect(pushChatSendFailed).toHaveBeenCalledTimes(1)
  })

  it('sendPayload เสีย (ไม่มี params): AUTO_FOLLOW ไม่ push', async () => {
    findMany.mockResolvedValueOnce([queued({ autoReplyKind: 'AUTO_FOLLOW', sendPayload: null })])
    await deliverRoom('c1', 'cron')
    expect(pushChatSendFailed).not.toHaveBeenCalled()
  })

  it('claim ค้าง (stale-close): AUTO_FOLLOW ไม่ push · ควบคุม: คนปกติ push', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    findMany.mockResolvedValueOnce([queued({ autoReplyKind: 'AUTO_FOLLOW', sendLockedAt: old })])
    await sweepOutbox({ owner: 'cron' })
    expect(pushChatSendFailed).not.toHaveBeenCalled()

    findMany.mockResolvedValueOnce([queued({ id: 'm2', sendLockedAt: old })])
    await sweepOutbox({ owner: 'cron' })
    expect(pushChatSendFailed).toHaveBeenCalledTimes(1)
  })
})

describe('#3 ส่งสำเร็จ: AUTO_FOLLOW ไม่หยุดบอท 00023 (pauseForHumanTakeover)', () => {
  it('payload autoReplyKind=AUTO_FOLLOW ไม่เรียก · ควบคุม: คนส่งเรียก', async () => {
    transmitOutbound.mockResolvedValue({ externalMessageId: 'mid1', outboundResponse: {}, failureReason: null, sendMethod: null, sendBatchId: null })
    findMany.mockResolvedValueOnce([queued({ autoReplyKind: 'AUTO_FOLLOW', sendPayload: { autoReplyKind: 'AUTO_FOLLOW' } })])
    await deliverRoom('c1', 'after')
    expect(pauseForHumanTakeover).not.toHaveBeenCalled()

    findMany.mockResolvedValueOnce([queued()])
    await deliverRoom('c1', 'after')
    expect(pauseForHumanTakeover).toHaveBeenCalledTimes(1)
  })
})
