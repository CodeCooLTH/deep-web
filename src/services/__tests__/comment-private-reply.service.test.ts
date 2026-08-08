import { describe, it, expect } from 'vitest'
import { isWithinPrivateReplyWindow } from '@/services/comment-private-reply.service'

const NOW = new Date('2026-08-08T12:00:00Z')

describe('isWithinPrivateReplyWindow', () => {
  it('คอมเมนต์เมื่อกี้ -> ทักได้', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-08T11:59:00Z'), NOW)).toBe(true)
  })

  it('คอมเมนต์เมื่อ 6 วัน 23 ชม. -> ยังทักได้', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-01T13:00:00Z'), NOW)).toBe(true)
  })

  it('คอมเมนต์เมื่อ 7 วัน 1 นาที -> หมดเวลา', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-01T11:59:00Z'), NOW)).toBe(false)
  })

  it('เวลาคอมเมนต์อยู่ในอนาคต (นาฬิกาเพี้ยน) -> ยังถือว่าทักได้ ไม่ throw', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-09T00:00:00Z'), NOW)).toBe(true)
  })
})

import { vi, beforeEach } from 'vitest'

// Fix round 1 — mock ตัวเองเป็น db เดียวกันทั้ง prisma.xxx และ $transaction(tx): $transaction ของจริง
// ส่ง TransactionClient ที่มี method ชุดเดียวกับ prisma ธรรมดาเข้าไปให้ callback; mock เดิมที่ยิง
// fn({}) เฉย ๆ ทำให้เส้นทาง "ส่งสำเร็จ" ที่เรียก tx.externalContact.upsert(...) พังทันที (tx={}
// ไม่มี property ไหนเลย) — ต้องให้ tx === ตัว mock เดียวกับ prisma
vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    pageComment: { findUnique: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    shopChannel: { findUnique: vi.fn() },
    externalContact: { upsert: vi.fn() },
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    chatMessage: { create: vi.fn() },
  }
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db))
  return { prisma: db }
})
vi.mock('@/lib/facebook/graph', () => ({ sendPrivateReplyToComment: vi.fn() }))
// canAccessShop เดิมเรียก prisma.shop.findUnique จริง (shop-context.ts) ซึ่งไม่ได้อยู่ใน mock ของ
// '@/lib/prisma' ข้างบน (ไม่มี key `shop`) — mock ที่ boundary ของ shop-context ตรง ๆ แทน ชัดเจนกว่า
// การพยายามเติม key `shop` ให้ครบใน mock ของ prisma (ยังต้องคุมค่า userId เทียบ actorUserId เองอยู่ดี)
vi.mock('@/lib/shop-context', () => ({ canAccessShop: vi.fn() }))
// resolveChannelToken (ของจริง) เรียก decryptToken() ซึ่งอ่าน CHANNEL_TOKEN_KEY จาก env — เวิร์กทรีนี้
// ไม่มี .env จึง throw เสมอ (CHANNEL_TOKEN_KEY_MISSING) mock ที่ boundary ของโมดูลแทน เพื่อทดสอบ
// เส้นทาง "ส่งสำเร็จ"/SEND_FAILED ได้จริง โดยไม่ผูกกับสถานะ env ของเครื่องที่รันเทส
vi.mock('@/services/page-comment.service', () => ({ resolveChannelToken: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { resolveChannelToken } from '@/services/page-comment.service'
import { sendPrivateReplyToComment } from '@/lib/facebook/graph'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'

const findComment = vi.mocked(prisma.pageComment.findUnique)
const graphSend = vi.mocked(sendPrivateReplyToComment)

function okComment(over: Record<string, unknown> = {}) {
  return {
    id: 'cmt-1',
    externalCommentId: '123_456',
    createdTime: new Date(Date.now() - 60_000),
    isDeleted: false,
    shopChannelId: 'ch-1',
    postId: 'post-1',
    fromExternalId: 'psid-1',
    post: { id: 'post-1', channel: { id: 'ch-1', shopId: 'shop-1', externalId: 'page-1', status: 'ACTIVE' } },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
  // ค่าเริ่มต้น: ผ่านสิทธิ์เสมอ — เทสที่อยากลอง FORBIDDEN ต้อง override เป็น false เอง
  vi.mocked(canAccessShop).mockResolvedValue(true)
})

describe('sendPrivateReplyToCommentById — เงื่อนไขที่ต้องไม่ส่ง', () => {
  it('ไม่พบคอมเมนต์ -> COMMENT_NOT_FOUND และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(null as never)
    const r = await sendPrivateReplyToCommentById({ commentId: 'x', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'COMMENT_NOT_FOUND' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('คอมเมนต์เกิน 7 วัน -> WINDOW_EXPIRED และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(
      okComment({ createdTime: new Date(Date.now() - 8 * 24 * 3600_000) }) as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'WINDOW_EXPIRED' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('ข้อความว่าง -> EMPTY_TEXT และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(okComment() as never)
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: '   ', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'EMPTY_TEXT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('เพจไม่ ACTIVE -> CHANNEL_INACTIVE และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(
      okComment({
        post: { id: 'post-1', channel: { id: 'ch-1', shopId: 'shop-1', externalId: 'page-1', status: 'TOKEN_INVALID' } },
      }) as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'CHANNEL_INACTIVE' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('เคยทักคอมเมนต์นี้แล้ว -> ALREADY_SENT และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-1', privateReplyStatus: 'SENT', conversationId: 'conv-1' } as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'MANUAL', actorUserId: 'u1' })
    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  // Fix round 1 — coordinator สั่งเพิ่ม: พิสูจน์ว่า FORBIDDEN ต้องมาก่อน ALREADY_SENT เสมอ
  // ไม่งั้นคนนอกร้านเดา commentId แล้วอ่านจาก reason ได้ว่าคอมเมนต์ของร้านอื่นถูกทักไปแล้วหรือยัง
  // (SRS §7.14 — 403 ต้องไม่ยืนยันว่าทรัพยากรนั้นมีสถานะอะไร)
  it('ไม่มีสิทธิ์ + เคยทักแล้ว -> FORBIDDEN ไม่ใช่ ALREADY_SENT (ห้ามรั่วสถานะให้คนนอกร้าน)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(canAccessShop).mockResolvedValue(false)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue({ id: 'log-1', privateReplyStatus: 'SENT' } as never)
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'MANUAL', actorUserId: 'outsider' })
    expect(r).toMatchObject({ sent: false, reason: 'FORBIDDEN' })
    expect(graphSend).not.toHaveBeenCalled()
    // ยืนยันเพิ่มว่าไม่มีการ query สถานะ "เคยส่งแล้วหรือยัง" เลยด้วยซ้ำ — ตัดที่ด่านสิทธิ์ก่อนถึง
    // ด่านที่จะเปิดเผยสถานะได้
    expect(prisma.commentReplyLog.findFirst).not.toHaveBeenCalled()
  })
})

describe('sendPrivateReplyToCommentById — เส้นทางที่ยิง Graph จริง', () => {
  it('ส่งสำเร็จ -> คืน sent:true พร้อม conversationId/messageId, เรียก Graph ด้วย (token, externalCommentId, text) ไม่มี pageId, ChatMessage ได้ senderRole=SHOP/externalMessageId ตรง, และไม่ตั้ง lastInboundAt', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(resolveChannelToken).mockResolvedValue({ token: 'page-token-xyz', pageId: 'page-1' })
    graphSend.mockResolvedValue({ recipientId: 'psid-real-1', messageId: 'mid-999' })
    vi.mocked(prisma.externalContact.upsert).mockResolvedValue({ id: 'contact-1' } as never)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.conversation.create).mockResolvedValue({ id: 'conv-1' } as never)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({ id: 'msg-1' } as never)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ id: 'conv-1' } as never)

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'สวัสดีครับ', trigger: 'MANUAL', actorUserId: 'u1' })

    expect(r).toMatchObject({ sent: true, conversationId: 'conv-1', messageId: 'mid-999' })

    // เรียก Graph ด้วย signature (pageToken, commentExternalId, text) เท่านั้น — ไม่มี pageId
    expect(graphSend).toHaveBeenCalledWith('page-token-xyz', '123_456', 'สวัสดีครับ')
    expect(graphSend.mock.calls[0]).toHaveLength(3)

    // ExternalContact upsert ใช้ recipientId จาก Graph ไม่ใช่ comment.fromExternalId
    expect(prisma.externalContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopChannelId_externalUserId: { shopChannelId: 'ch-1', externalUserId: 'psid-real-1' } },
      }),
    )

    // ChatMessage: senderRole SHOP + externalMessageId = message_id ที่ Meta คืน
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv-1',
        senderRole: 'SHOP',
        type: 'TEXT',
        body: 'สวัสดีครับ',
        externalMessageId: 'mid-999',
      }),
    })

    // 🛑 ต้องไม่มีคีย์ lastInboundAt ใน conversation.update เลย — ถ้าใครเผลอเติมทีหลังจะไม่มี
    // อะไรฟ้อง ยกเว้น assertion นี้ (ห้องเป็นฝ่ายเราเริ่ม ไม่ใช่ลูกค้า ตั้งเองเท่ากับโกหกว่าลูกค้าตอบแล้ว)
    const updateArg = vi.mocked(prisma.conversation.update).mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(updateArg.data).not.toHaveProperty('lastInboundAt')
    expect(updateArg.data).toMatchObject({ lastSenderRole: 'SHOP' })

    // log สำเร็จถูกบันทึกเป็น SENT ผูก conversationId
    expect(prisma.commentReplyLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ privateReplyStatus: 'SENT', conversationId: 'conv-1', trigger: 'MANUAL' }),
    })
  })

  it('Graph โยน error -> คืน SEND_FAILED พร้อม error และไม่สร้าง Conversation/ChatMessage ค้างไว้', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(resolveChannelToken).mockResolvedValue({ token: 'page-token-xyz', pageId: 'page-1' })
    graphSend.mockRejectedValue(new Error('upstream 400: something failed'))

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'SEND_FAILED', error: 'upstream 400: something failed' })
    expect(prisma.externalContact.upsert).not.toHaveBeenCalled()
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()

    // ยัง log ความล้มเหลวไว้เป็น FAILED (ไม่ throw ทิ้งเงียบ ๆ)
    expect(prisma.commentReplyLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ privateReplyStatus: 'FAILED', errorMessage: 'upstream 400: something failed' }),
    })
  })
})
