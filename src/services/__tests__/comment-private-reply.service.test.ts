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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pageComment: { findUnique: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    shopChannel: { findUnique: vi.fn() },
    externalContact: { upsert: vi.fn() },
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    chatMessage: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}))
vi.mock('@/lib/facebook/graph', () => ({ sendPrivateReplyToComment: vi.fn() }))

import { prisma } from '@/lib/prisma'
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
})
