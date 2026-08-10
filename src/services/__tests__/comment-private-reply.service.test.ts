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
// Fix round 2 — เพิ่ม commentReplyLog.updateMany (ใช้ claim แถว MANUAL ที่ FAILED แบบ conditional)
vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    pageComment: { findUnique: vi.fn(), findFirst: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
//
// Fix round 1 — เพิ่ม replyToComment: vi.fn() เพราะ describe block ใหม่ท้ายไฟล์ (integration ของ
// processCommentAutoReply) import comment-auto-reply.service.ts ตัวจริงเข้ามาด้วย ซึ่งไฟล์นั้น import
// replyToComment จากโมดูลนี้ — ถ้าไม่มี key นี้ใน mock จะได้ undefined แล้วเรียกไม่ได้ (TypeError)
vi.mock('@/services/page-comment.service', () => ({ resolveChannelToken: vi.fn(), replyToComment: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { resolveChannelToken } from '@/services/page-comment.service'
import { sendPrivateReplyToComment } from '@/lib/facebook/graph'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'
// Fix round 1 — comment-auto-reply.service.ts ตัวจริง ไม่ mock (นี่คือประเด็นของเทสท้ายไฟล์:
// ปล่อยให้ processCommentAutoReply เรียก sendPrivateReplyToCommentById ตัวจริงข้างบนนี้จริง ๆ)
import { processCommentAutoReply } from '@/services/comment-auto-reply.service'

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

/** ตั้งค่าเริ่มต้นของ mock ที่ทำให้เดินไปถึงเส้นทาง "ยิง Graph สำเร็จ" ได้ครบวงจร — เทสที่อยาก
 *  ทดสอบจุดใดจุดหนึ่งแค่ override ทับตัวที่สนใจ */
function mockFullSuccessChain() {
  vi.mocked(resolveChannelToken).mockResolvedValue({ token: 'page-token-xyz', pageId: 'page-1' })
  graphSend.mockResolvedValue({ recipientId: 'psid-real-1', messageId: 'mid-999' })
  vi.mocked(prisma.externalContact.upsert).mockResolvedValue({ id: 'contact-1' } as never)
  vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null as never)
  vi.mocked(prisma.conversation.create).mockResolvedValue({ id: 'conv-1' } as never)
  vi.mocked(prisma.chatMessage.create).mockResolvedValue({ id: 'msg-1' } as never)
  vi.mocked(prisma.conversation.update).mockResolvedValue({ id: 'conv-1' } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-default' } as never)
  vi.mocked(prisma.commentReplyLog.update).mockResolvedValue({} as never)
  vi.mocked(prisma.commentReplyLog.updateMany).mockResolvedValue({ count: 1 } as never)
  // ค่าเริ่มต้น: ผ่านสิทธิ์เสมอ — เทสที่อยากลอง FORBIDDEN ต้อง override เป็น false เอง
  vi.mocked(canAccessShop).mockResolvedValue(true)
  // pageComment.findFirst ใช้เฉพาะ describe block integration ท้ายไฟล์ (humanReply check ของ
  // processCommentAutoReply) — ตั้ง default ไว้เผื่อไม่มีคนตอบ กันเทสอื่นพังถ้ามีคน mock ผิด key
  vi.mocked(prisma.pageComment.findFirst).mockResolvedValue(null as never)
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
    vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-new' } as never)
    mockFullSuccessChain()

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

    // log ถูกจองก่อน (privateReplyStatus:null) แล้วอัปเดตเป็น SENT ทันทีหลัง Graph สำเร็จ — ก่อน
    // การอัปเดต conversationId รอบสุดท้าย
    expect(prisma.commentReplyLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ privateReplyStatus: null, trigger: 'MANUAL' }),
      select: { id: true },
    })
    const updateCalls = vi.mocked(prisma.commentReplyLog.update).mock.calls
    expect(updateCalls[0]![0]).toMatchObject({ where: { id: 'log-new' }, data: { privateReplyStatus: 'SENT' } })
    expect(updateCalls[1]![0]).toMatchObject({ where: { id: 'log-new' }, data: { conversationId: 'conv-1' } })
  })

  it('Graph โยน error -> คืน SEND_FAILED พร้อม error และไม่สร้าง Conversation/ChatMessage ค้างไว้', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-new' } as never)
    vi.mocked(resolveChannelToken).mockResolvedValue({ token: 'page-token-xyz', pageId: 'page-1' })
    graphSend.mockRejectedValue(new Error('upstream 400: something failed'))

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'SEND_FAILED', error: 'upstream 400: something failed' })
    expect(prisma.externalContact.upsert).not.toHaveBeenCalled()
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()

    // แถวที่จองไว้ (privateReplyStatus:null ตอน create) ถูกอัปเดตเป็น FAILED (ไม่ throw ทิ้งเงียบ ๆ)
    expect(prisma.commentReplyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-new' },
      data: expect.objectContaining({ privateReplyStatus: 'FAILED', privateErrorMessage: 'upstream 400: something failed' }),
    })
  })

  it('[blocker] ทักแชทสำเร็จ ต้องล้างเฉพาะ privateErrorMessage — ห้ามแตะเหตุผลของฝั่ง "ตอบใต้คอมเมนต์"', async () => {
    /**
     * เคสที่ user ชี้เอง 2026-08-10: "reply ไม่ผ่าน อาจจะทักแชทได้ก็ได้"
     *
     * เดิมทั้งสองฝั่งใช้คอลัมน์ `errorMessage` ร่วมกัน และตอนทักแชทสำเร็จโค้ดเขียน
     * `errorMessage: null` ทับ ⇒ เหตุผลของ "ตอบใต้คอมเมนต์" ที่ล้มเหลวไปก่อนหน้า **ถูกล้างทิ้ง
     * ทุกครั้ง** ร้านเห็นป้าย "ไม่สำเร็จ" เปล่า ๆ ไม่มีเหตุผลให้อ่านเลย
     *
     * ความล้มเหลวของกฎนี้เงียบสนิท: ส่งสำเร็จจริง แถวถูกอัปเดตจริง ไม่มี error ที่ไหนเลย
     * มีแต่ข้อมูลของอีกฝั่งที่หายไปโดยไม่มีใครสังเกต
     */
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-new' } as never)
    mockFullSuccessChain()

    await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'สวัสดีครับ', trigger: 'MANUAL', actorUserId: 'u-1' })

    const updates = vi.mocked(prisma.commentReplyLog.update).mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data)
    const sentUpdate = updates.find((d) => d.privateReplyStatus === 'SENT')
    expect(sentUpdate).toBeDefined()
    expect(sentUpdate).toHaveProperty('privateErrorMessage', null)
    // ห้ามมีคีย์ของฝั่งสาธารณะ หรือคอลัมน์เก่าที่ใช้ร่วมกัน โผล่ในคำสั่งนี้เด็ดขาด
    for (const d of updates) {
      expect(d).not.toHaveProperty('publicErrorMessage')
      expect(d).not.toHaveProperty('errorMessage')
    }
  })
})

describe('sendPrivateReplyToCommentById — Fix round 2: dedupe คีย์เดียวกัน + จองก่อนยิง + ไม่ throw', () => {
  it('AUTO คนเดิม โพสต์เดิม คอมเมนต์คนละใบ -> ALREADY_SENT และ Graph ถูกเรียก 0 ครั้ง (C2)', async () => {
    // คอมเมนต์ใบที่สอง (id ต่างจากที่เคยส่งไปแล้ว) ของคนเดิมบนโพสต์เดิม
    findComment.mockResolvedValue(okComment({ id: 'cmt-2', externalCommentId: '123_789' }) as never)
    // มี log ของ AUTO อยู่แล้วจากคอมเมนต์ใบแรก (คีย์ AUTO ไม่ผูกกับ commentId) — สถานะ SENT
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-first-comment', privateReplyStatus: 'SENT' } as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-2', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
    // ด่านต้องหาด้วยคีย์ AUTO (shopChannelId/postId/fromExternalId) ไม่ใช่ commentId ของใบที่สอง
    expect(prisma.commentReplyLog.findFirst).toHaveBeenCalledWith({
      where: { trigger: 'AUTO', shopChannelId: 'ch-1', postId: 'post-1', fromExternalId: 'psid-1' },
    })
  })

  it('AUTO ที่มีแถวเดิมสถานะ FAILED -> ALREADY_SENT (ไม่ลองซ้ำเอง, BR-CR-A6)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-1', privateReplyStatus: 'FAILED' } as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
    // ไม่พยายาม claim ด้วย updateMany เลย — AUTO ไม่มีสิทธิ์ลองซ้ำ
    expect(prisma.commentReplyLog.updateMany).not.toHaveBeenCalled()
  })

  it('MANUAL ที่มีแถวเดิม FAILED -> จองสำเร็จ (updateMany count:1) แล้วยิง Graph ได้ (คนกดลองใหม่)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-1', privateReplyStatus: 'FAILED' } as never,
    )
    vi.mocked(prisma.commentReplyLog.updateMany).mockResolvedValue({ count: 1 } as never)
    mockFullSuccessChain()

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'ลองใหม่', trigger: 'MANUAL', actorUserId: 'u1' })

    expect(r).toMatchObject({ sent: true })
    expect(graphSend).toHaveBeenCalledTimes(1)
    // conditional updateMany ต้องมีเงื่อนไข privateReplyStatus:'FAILED' ใน where เสมอ (claim atomic)
    expect(prisma.commentReplyLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', privateReplyStatus: 'FAILED' },
      data: expect.objectContaining({ privateReplyStatus: null }),
    })
    // ไม่ต้อง create แถวใหม่ — claim แถวเดิมกลับมาใช้
    expect(prisma.commentReplyLog.create).not.toHaveBeenCalled()
  })

  it('MANUAL claim ไม่สำเร็จ (updateMany count:0, อีกเธรดคว้าไปแล้ว) -> ALREADY_SENT และ Graph 0 ครั้ง', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-1', privateReplyStatus: 'FAILED' } as never,
    )
    vi.mocked(prisma.commentReplyLog.updateMany).mockResolvedValue({ count: 0 } as never)

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'ลองใหม่', trigger: 'MANUAL', actorUserId: 'u1' })

    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('create แถวจองใหม่ชน P2002 (สองคำขอพร้อมกัน) -> ALREADY_SENT และ Graph 0 ครั้ง (C3)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.commentReplyLog.create).mockRejectedValue(
      new Error('Unique constraint failed on the fields: (`commentId`) — P2002'),
    )

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  // หนี้ #2 (retro 00038): isUniqueConstraintError ต้องจับได้ทั้ง 2 รูป — รูปหลัก (`.code`, ตรงกับ
  // PrismaClientKnownRequestError จริง) และรูป fallback (message ล้วน, error ถูก wrap/serialize มา)
  it('create แถวจองใหม่ชน P2002 ที่ error object มี `.code` ตรง ๆ (ไม่พึ่ง message) -> ALREADY_SENT', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
    // จำลอง PrismaClientKnownRequestError จริง — มี .code แต่ message ไม่มีคำว่า "P2002"/
    // "Unique constraint" เลย (พิสูจน์ว่า path หลักไม่ได้พึ่ง string matching)
    const prismaLikeError = Object.assign(new Error('Invalid `prisma.commentReplyLog.create()` invocation'), {
      code: 'P2002',
      meta: { target: ['commentId'] },
    })
    vi.mocked(prisma.commentReplyLog.create).mockRejectedValue(prismaLikeError)

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('create แถวจองใหม่ชนกับ error ที่มีแต่ message (ไม่มี `.code`, fallback) -> ALREADY_SENT', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
    // error ที่ถูก serialize/wrap มาจนเหลือแค่ message (ไม่มี .code) — ต้องยังจับได้ผ่าน fallback
    vi.mocked(prisma.commentReplyLog.create).mockRejectedValue('Unique constraint failed — P2002')

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('create แถวจองใหม่ชน error อื่นที่ไม่ใช่ unique constraint -> rethrow เข้า catch นอกสุด (SEND_FAILED) ไม่ตีเป็น ALREADY_SENT', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.commentReplyLog.create).mockRejectedValue(new Error('connection timeout'))

    // ฟังก์ชันห้าม throw ออกไปทุกกรณี (ห่อ try/catch ชั้นนอกสุด) — error อื่นที่ไม่ใช่ unique
    // constraint ต้องหลุดไปเข้า catch นอกสุดแล้วคืน SEND_FAILED ไม่ใช่ ALREADY_SENT
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'SEND_FAILED', error: 'connection timeout' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  // หนี้ #3 (retro 00038): resolveChannelToken คืน null ต้องคืน error ที่เจาะจง
  // ('CHANNEL_TOKEN_UNAVAILABLE') ไปด้วย ไม่ใช่แค่ reason ทั่วไป ('CHANNEL_INACTIVE') — ผู้เรียกฝั่ง
  // AUTO (comment-auto-reply.service.ts) เขียน privateErrorMessage ด้วย `result.error ?? result.reason`
  // ถ้าไม่มี error รายละเอียดจะหายไปกลายเป็น CHANNEL_INACTIVE เฉย ๆ ตอนสืบ
  it('resolveChannelToken คืน null -> reason ยังเป็น CHANNEL_INACTIVE เหมือนเดิม แต่มี error เจาะจง CHANNEL_TOKEN_UNAVAILABLE ด้วย', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-new' } as never)
    vi.mocked(resolveChannelToken).mockResolvedValue(null)

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'CHANNEL_INACTIVE', error: 'CHANNEL_TOKEN_UNAVAILABLE' })
    expect(graphSend).not.toHaveBeenCalled()
    expect(prisma.commentReplyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-new' },
      data: { privateReplyStatus: 'FAILED', privateErrorMessage: 'CHANNEL_TOKEN_UNAVAILABLE' },
    })
  })

  it('Graph สำเร็จแต่ transaction สร้างห้องแชทโยน error -> คืน sent:true, conversationId:null, และ log ถูก update เป็น SENT ไปก่อนแล้ว (C1)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-new' } as never)
    vi.mocked(resolveChannelToken).mockResolvedValue({ token: 'page-token-xyz', pageId: 'page-1' })
    graphSend.mockResolvedValue({ recipientId: 'psid-real-1', messageId: 'mid-999' })
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('DB ล้มระหว่างสร้างห้องแชท'))

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: true, conversationId: null, messageId: 'mid-999' })

    // ต้องเคย update เป็น SENT มาก่อนแล้ว (ไม่ได้แปลว่า "ไม่ได้ส่ง") + เคย update errorMessage ของ
    // ความล้มเหลวตอนสร้างห้องแชทด้วย (คนละคำสั่งกัน)
    const updateCalls = vi.mocked(prisma.commentReplyLog.update).mock.calls
    const sentCallIdx = updateCalls.findIndex((c) => (c[0] as { data: { privateReplyStatus?: string } }).data.privateReplyStatus === 'SENT')
    expect(sentCallIdx).toBeGreaterThanOrEqual(0)
    const roomFailCallIdx = updateCalls.findIndex((c) =>
      String((c[0] as { data: { privateErrorMessage?: string } }).data.privateErrorMessage ?? '').includes('บันทึกห้องแชทไม่สำเร็จ'),
    )
    expect(roomFailCallIdx).toBeGreaterThanOrEqual(0)

    // 🛑 update SENT ต้องเกิดก่อนที่จะเรียก $transaction เสมอ — ข้อเท็จจริง "ส่งสำเร็จแล้ว" ต้อง
    // คงทนก่อนงานที่ยังล้มได้ (สร้างห้องแชท) ไม่ใช่ผูกติดกับความสำเร็จของมัน
    const sentInvocationOrder = vi.mocked(prisma.commentReplyLog.update).mock.invocationCallOrder[sentCallIdx]!
    const txInvocationOrder = vi.mocked(prisma.$transaction).mock.invocationCallOrder[0]!
    expect(sentInvocationOrder).toBeLessThan(txInvocationOrder)
  })

  it('Graph สำเร็จ (เส้นทางปกติ) -> commentReplyLog.update(SENT) ถูกเรียกก่อน $transaction เสมอ (call order)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.create).mockResolvedValue({ id: 'log-new' } as never)
    mockFullSuccessChain()

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: true })
    const updateCalls = vi.mocked(prisma.commentReplyLog.update).mock.calls
    const sentCallIdx = updateCalls.findIndex((c) => (c[0] as { data: { privateReplyStatus?: string } }).data.privateReplyStatus === 'SENT')
    expect(sentCallIdx).toBeGreaterThanOrEqual(0)
    const sentInvocationOrder = vi.mocked(prisma.commentReplyLog.update).mock.invocationCallOrder[sentCallIdx]!
    const txInvocationOrder = vi.mocked(prisma.$transaction).mock.invocationCallOrder[0]!
    expect(sentInvocationOrder).toBeLessThan(txInvocationOrder)
  })
})

// Fix round 1 — reviewer พบ Critical: processCommentAutoReply จองแถว CommentReplyLog(trigger='AUTO')
// ด้วยคีย์เดียวกับที่ dedupeWhere() ของฟังก์ชันนี้ใช้เช็ค ก่อนเรียก sendPrivateReplyToCommentById
// ต่อ — findFirst ของฟังก์ชันนี้เจอแถวที่เพิ่งจองไปเอง แล้ว trigger==='AUTO' → ALREADY_SENT ทันที
// ทุกครั้ง = private auto-reply ไม่ยิง Graph เลยสักครั้ง ทางแก้: reservedLogId param ข้ามด่านกันซ้ำ
// + ขั้นจองทั้งหมดเมื่อผู้เรียกบอกมาว่าจองแถวไว้แล้ว
describe('sendPrivateReplyToCommentById — Fix round 1: reservedLogId ข้ามด่านกันซ้ำทั้งหมด', () => {
  it('reservedLogId มีค่า -> ข้ามด่าน ALREADY_SENT แม้มีแถว AUTO เดิม(ที่จริงคือแถวที่ตัวเองจองไว้)อยู่แล้ว แล้วยิง Graph ได้', async () => {
    findComment.mockResolvedValue(okComment() as never)
    // จำลองสถานการณ์บั๊กเดิมเป๊ะ ๆ: มีแถว AUTO ที่คีย์ตรงกันเจอผ่าน findFirst (สถานะ SENT ด้วยซ้ำ —
    // เงื่อนไขที่เข้มที่สุดของด่าน ALREADY_SENT) ถ้าฟังก์ชันไปเรียก findFirst จริงจะ trip ทันที
    // แต่ reservedLogId ต้องทำให้ข้ามด่านนี้ทั้งก้อนโดยไม่แตะ findFirst เลย
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-existing', privateReplyStatus: 'SENT' } as never,
    )
    mockFullSuccessChain()

    const r = await sendPrivateReplyToCommentById({
      commentId: 'cmt-1',
      text: 'สวัสดีครับ',
      trigger: 'AUTO',
      reservedLogId: 'log-reserved-abc',
    })

    expect(r).toMatchObject({ sent: true })
    expect(graphSend).toHaveBeenCalledTimes(1)
    // ต้องไม่แตะด่านกันซ้ำ/ขั้นจองเลยสักคำสั่ง — พิสูจน์ว่า "ข้าม" จริง ไม่ใช่แค่ผลลัพธ์บังเอิญตรง
    expect(prisma.commentReplyLog.findFirst).not.toHaveBeenCalled()
    expect(prisma.commentReplyLog.create).not.toHaveBeenCalled()
    expect(prisma.commentReplyLog.updateMany).not.toHaveBeenCalled()
    // update SENT ต้องเขียนลงแถวที่ผู้เรียกจองไว้ (reservedLogId) ไม่ใช่แถวอื่นที่ findFirst เจอ
    expect(prisma.commentReplyLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'log-reserved-abc' } }),
    )
  })

  it('reservedLogId ไม่มีค่า -> ยังต้องเจอ ALREADY_SENT ตามปกติ (ปุ่มแมนนวลไม่พัง)', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-existing', privateReplyStatus: 'SENT' } as never,
    )

    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })

    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })
})

// Fix round 1 (ก) — เทสที่สำคัญที่สุดของรอบนี้: ไม่ mock comment-auto-reply.service.ts เอง และไม่
// mock sendPrivateReplyToCommentById (มันคือตัวจริงของไฟล์นี้อยู่แล้ว) ปล่อยให้ processCommentAutoReply
// เรียกมันจริง ๆ แล้วพิสูจน์ว่า Graph (sendPrivateReplyToComment) ถูกเรียกจริง — นี่คือเทสเดียวที่
// จับบั๊กคลาสนี้ได้ (เทส orchestration เดิมของ comment-auto-reply-orchestration.test.ts mock
// comment-private-reply.service ทั้งฟังก์ชัน จึง assert กับค่าที่ตัวเอง mock ไว้เองเท่านั้น)
describe('processCommentAutoReply — integration ไม่ mock comment-private-reply.service (Fix round 1)', () => {
  function autoReplyComment(over: Record<string, unknown> = {}) {
    return {
      id: 'cmt-1',
      externalCommentId: '123_456',
      postId: 'post-1',
      shopChannelId: 'ch-1',
      fromExternalId: 'psid-1',
      isFromPage: false,
      parentExternalId: null,
      isDeleted: false,
      createdTime: new Date(),
      post: {
        id: 'post-1',
        channel: {
          id: 'ch-1',
          shopId: 'shop-1',
          externalId: 'page-1',
          status: 'ACTIVE',
          // ปิด public ไว้ (เทสนี้สนใจแค่เส้นทาง private) — replyToComment ถูก mock เป็น vi.fn()
          // เปล่า ๆ ในไฟล์นี้ ไม่ต้องพึ่งพฤติกรรมจริงของมัน
          commentPublicReplyEnabled: false,
          commentPublicReplyText: null,
          commentPrivateReplyEnabled: true,
          commentPrivateReplyText: 'สวัสดีครับ',
        },
      },
      ...over,
    }
  }

  it('เปิดสวิตช์ทักแชท -> processCommentAutoReply เรียก sendPrivateReplyToCommentById ตัวจริงแล้วยิง Graph จริง 1 ครั้ง', async () => {
    findComment.mockResolvedValue(autoReplyComment() as never)

    // จำลองพฤติกรรมฐานข้อมูลจริง: แถวที่ commentReplyLog.create() เพิ่งสร้าง มองเห็นได้ทันทีผ่าน
    // findFirst ครั้งถัดไปที่คีย์ตรงกัน (คนละคำสั่งบนคอนเนกชันเดียวกัน ไม่มีทรานแซกชันคาบเกี่ยว) —
    // 🛑 ต้อง stateful แบบนี้ ไม่ใช่ mockResolvedValue(null) นิ่ง ๆ ตลอดกาล เพราะ mock นิ่งจะทำให้
    // เทสนี้เขียวได้ทั้งที่บั๊กยังอยู่ (ไม่มีอะไรจำลองว่า sendPrivateReplyToCommentById จะไปเจอแถว
    // ที่ processCommentAutoReply เพิ่งจองไปเองผ่าน findFirst ของมันเอง) — นี่คือกับดักที่ coordinator
    // เตือนไว้ตรง ๆ ("assert กับค่าที่ตัวเอง mock ไว้เอง")
    let reservedRow: { id: string; privateReplyStatus: string | null } | null = null
    vi.mocked(prisma.commentReplyLog.create).mockImplementation((async () => {
      reservedRow = { id: 'log-auto-reserved', privateReplyStatus: null }
      return reservedRow
    }) as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockImplementation((async () => reservedRow) as never)

    mockFullSuccessChain()

    await processCommentAutoReply('cmt-1')

    // นี่คือ assertion ที่พิสูจน์ว่าบั๊กถูกแก้จริง: ถ้า processCommentAutoReply ไม่ส่ง reservedLogId
    // เข้า sendPrivateReplyToCommentById, findFirst ข้างในจะเจอ reservedRow (สถานะ null ก็ trip
    // ได้เพราะ trigger==='AUTO' ไม่สนสถานะ) แล้วคืน ALREADY_SENT โดยไม่มีการเรียก Graph เลย
    expect(graphSend).toHaveBeenCalledTimes(1)
    expect(graphSend).toHaveBeenCalledWith('page-token-xyz', '123_456', 'สวัสดีครับ')
  })

})
