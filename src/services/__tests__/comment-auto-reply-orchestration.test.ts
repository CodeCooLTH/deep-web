import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pageComment: { findUnique: vi.fn(), findFirst: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/services/page-comment.service', () => ({ replyToComment: vi.fn() }))
vi.mock('@/services/comment-private-reply.service', () => ({
  sendPrivateReplyToCommentById: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { replyToComment } from '@/services/page-comment.service'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'
import { processCommentAutoReply } from '@/services/comment-auto-reply.service'

const publicReply = vi.mocked(replyToComment)
const privateReply = vi.mocked(sendPrivateReplyToCommentById)
const logCreate = vi.mocked(prisma.commentReplyLog.create)

/** คอมเมนต์ที่ผ่านทุกด่าน เพจเปิดทั้ง 2 สวิตช์ */
function okRow(over: Record<string, unknown> = {}) {
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
        commentPublicReplyEnabled: true,
        commentPublicReplyText: 'ขอบคุณที่สนใจครับ',
        commentPrivateReplyEnabled: true,
        commentPrivateReplyText: 'สวัสดีครับ',
      },
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(okRow() as never)
  vi.mocked(prisma.pageComment.findFirst).mockResolvedValue(null as never) // ไม่มีคนตอบ
  vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never) // ยังไม่เคยตอบ
  logCreate.mockResolvedValue({ id: 'log-1' } as never)
  publicReply.mockResolvedValue({ id: 'reply-1' } as never)
  privateReply.mockResolvedValue({ sent: true, conversationId: 'conv-1', messageId: 'mid-1' } as never)
})

describe('processCommentAutoReply', () => {
  it('เปิดทั้ง 2 สวิตช์ -> ตอบใต้คอมเมนต์ด้วย system actor แล้วทักแชท', async () => {
    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 'cmt-1',
        message: 'ขอบคุณที่สนใจครับ',
        actorUserId: null, // system actor — ไม่ใช่ user จริง
      }),
    )
    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 'cmt-1', text: 'สวัสดีครับ', trigger: 'AUTO' }),
    )
  })

  // Fix round 1 — ต้องส่ง reservedLogId เป็นแถวเดียวกับที่ processCommentAutoReply จองไว้เอง
  // (logCreate mock คืน { id: 'log-1' }) ไม่งั้น sendPrivateReplyToCommentById จะ findFirst เจอแถว
  // นั้นแล้ว trip ALREADY_SENT ทันทีทุกครั้ง = private auto-reply ไม่ยิง Graph เลยสักครั้ง
  it('ส่ง reservedLogId เป็น id ของแถวที่จองไว้เข้า sendPrivateReplyToCommentById เสมอ', async () => {
    logCreate.mockResolvedValue({ id: 'log-reserved-123' } as never)

    await processCommentAutoReply('cmt-1')

    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ reservedLogId: 'log-reserved-123' }),
    )
  })

  it('ตอบใต้คอมเมนต์ล้มเหลว -> ยังทักแชทต่อ (BR-CR-A5 ไม่ผูกกันแบบ all-or-nothing)', async () => {
    publicReply.mockRejectedValue(new Error('(#200) Permissions error'))

    await processCommentAutoReply('cmt-1')

    expect(privateReply).toHaveBeenCalledTimes(1)
    expect(vi.mocked(prisma.commentReplyLog.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicReplyStatus: 'FAILED' }),
      }),
    )
  })

  it('คนในทีมตอบไปแล้ว -> ไม่เรียกตัวส่งเลยสักตัว และบันทึก skipReason', async () => {
    vi.mocked(prisma.pageComment.findFirst).mockResolvedValue({ id: 'human-reply' } as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger: 'AUTO', skipReason: 'HUMAN_ANSWERED' }),
      }),
    )
  })

  it('ตอบคนนี้บนโพสต์นี้ไปแล้ว -> ข้าม ALREADY_HANDLED', async () => {
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue({ id: 'log-old' } as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
  })

  it('จองแถว log แล้วชน P2002 (อีกเธรดชนะ) -> หยุดเงียบ ไม่ยิงซ้ำ', async () => {
    logCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
  })

  it('ตัวส่งโยน error -> ฟังก์ชันนี้ต้องไม่ throw ออกไป (caller คือ webhook after())', async () => {
    privateReply.mockRejectedValue(new Error('boom'))

    await expect(processCommentAutoReply('cmt-1')).resolves.toBeUndefined()
  })

  it('ไม่พบคอมเมนต์ -> ไม่ throw และไม่เรียกอะไร', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(null as never)

    await expect(processCommentAutoReply('missing')).resolves.toBeUndefined()
    expect(logCreate).not.toHaveBeenCalled()
  })
})
